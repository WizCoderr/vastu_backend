# Docker containerization

Production images and compose files for the Vastu stack.

## Repos

| Repo | Image | Compose file |
|------|-------|--------------|
| `vastu_backend` | `vastu-backend` | `docker-compose.prod.yml` |
| `vastuarunsharma.com` | `vastu-website` | `docker-compose.prod.yml` |
| `admin.vastu` | `vastu-admin` | `docker-compose.prod.yml` |
| Full stack | all three | `deploy/docker-compose.stack.yml` |

## Quick start (backend only)

```bash
cd vastu_backend
cp .env.docker.example .env   # merge with your real secrets
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml up -d --scale payment-worker=3
```

With bundled Postgres:

```bash
docker compose -f docker-compose.prod.yml --profile local-db up -d --build
```

With API TLS nginx:

```bash
# Place certs in docker/nginx/certs/{fullchain.pem,privkey.pem}
docker compose -f docker-compose.prod.yml --profile with-nginx up -d --build
```

## Quick start (website / admin)

```bash
cd vastuarunsharma.com
cp .env.production.example .env
docker compose -f docker-compose.prod.yml up -d --build

cd ../admin.vastu
cp .env.production.example .env
docker compose -f docker-compose.prod.yml up -d --build
```

## Full stack (single VPS)

Clone all three repos as siblings, configure `vastu_backend/.env`, then:

```bash
cd vastu_backend/deploy
cp .env.stack.example .env
chmod +x up.sh
./up.sh
```

Scale payment workers:

```bash
docker compose -f docker-compose.stack.yml up -d --scale payment-worker=3
```

## Production checklist

1. Set `DATABASE_URL` to managed Postgres (or use `--profile local-db`).
2. Set `REDIS_ENABLED=true` and run Redis (included in compose).
3. Set `PROCESS_ROLE=api` on API containers, `worker` on worker containers.
4. Set `RUN_PAYMENT_WORKERS=false` on API replicas.
5. Mount TLS certs for nginx (`fullchain.pem`, `privkey.pem`).
6. Do **not** bake `.env` into images — inject via `env_file` / secrets.
7. API entrypoint runs `prisma migrate deploy` once per API start (`RUN_MIGRATIONS=true`).

## Health checks

- API: `GET /health` (503 if Redis down when enabled)
- Website / Admin: nginx serves `index.html`
- All services define Docker `HEALTHCHECK`

## CI / deploy

GitHub Actions deploy workflows use `docker compose -f docker-compose.prod.yml up -d --build`.
