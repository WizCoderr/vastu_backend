# Scaling the UPI Payment Platform

## Architecture

```
                    ┌─────────────┐
                    │   Nginx LB  │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌────────────┐  ┌────────────┐  ┌────────────┐
    │ API (api)  │  │ API (api)  │  │ API (api)  │
    │ RUN_WORKERS│  │ RUN_WORKERS│  │ RUN_WORKERS│
    │   =false   │  │   =false   │  │   =false   │
    └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
          │               │               │
          └───────────────┼───────────────┘
                          ▼
                   ┌─────────────┐
                   │    Redis    │  ← BullMQ queues + status cache + locks
                   └──────┬──────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
   ┌────────────┐  ┌────────────┐  ┌────────────┐
   │  Worker 1  │  │  Worker 2  │  │  Worker N  │
   │ PROCESS_   │  │ PROCESS_   │  │ PROCESS_   │
   │ ROLE=worker│  │ ROLE=worker│  │ ROLE=worker│
   └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
         └───────────────┼───────────────┘
                         ▼
                  ┌─────────────┐
                  │ PostgreSQL  │
                  └─────────────┘
```

## Local development (single process)

```env
PROCESS_ROLE=all
RUN_PAYMENT_WORKERS=true
```

```bash
bun run dev
```

## Production (recommended)

### API containers
```env
PROCESS_ROLE=api
RUN_PAYMENT_WORKERS=false
WORKERS=2
```

```bash
bun run start
```

### Worker containers (scale horizontally)
```env
PROCESS_ROLE=worker
RUN_PAYMENT_WORKERS=true
WHATSAPP_ENABLED=false
PAYMENT_VERIFY_CONCURRENCY=10
```

```bash
bun run worker
```

### Docker Compose
```bash
docker compose up -d --scale payment-worker=3
```

## Scalability features

| Feature | Purpose |
|---------|---------|
| Separate API / worker processes | Scale HTTP and job processing independently |
| BullMQ + Redis | Durable async payment verification |
| Distributed locks | Prevent duplicate verification across workers |
| Status cache (Redis) | Reduce DB load from client polling |
| Idempotent payment create | Reuse valid pending UPI session for same order |
| PG connection pool tuning | Handle more concurrent API requests |
| Response compression | Lower bandwidth for API responses |

## Key environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PROCESS_ROLE` | `all` | `api`, `worker`, or `all` |
| `RUN_PAYMENT_WORKERS` | `true` | Run BullMQ workers in this process |
| `PAYMENT_VERIFY_CONCURRENCY` | `10` | Parallel verify jobs per worker |
| `DATABASE_POOL_MAX` | `20` | Max PostgreSQL connections per process |
| `PAYMENT_STATUS_CACHE_TTL_PENDING_SEC` | `3` | Cache TTL while payment pending |

## Health checks

- `GET /health` — returns `200` when Redis is reachable (or disabled)
- Use for load balancer readiness probes

## Monitoring

- `logs/payment.log` — payment lifecycle events
- `logs/audit.log` — auth and payment API access
- Watch BullMQ queue depth in Redis: `payment-verify`, `invoice-generate`
