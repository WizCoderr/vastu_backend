# Traefik reverse proxy for Vastu apps

Traefik terminates HTTPS, obtains Let's Encrypt certificates, and routes traffic to:

| Domain | Service |
|--------|---------|
| `vastuarunsharma.com` / `www.vastuarunsharma.com` | Website (`vastu_website`) |
| `api.vastuarunsharma.com` | Backend API (`vastu_backend`) |
| `admin.vastuarunsharma.com` | Admin panel (`admin_vastu_panel`) |

## Architecture

```
Internet → Traefik (:80/:443) → app containers on traefik-public network
```

Each app repo's `docker-compose.yml` carries Traefik labels. Traefik discovers routes via the Docker socket.

## One-time VPS setup

### 1. DNS

Confirm A records point to the VPS IP:

- `vastuarunsharma.com`
- `www.vastuarunsharma.com`
- `api.vastuarunsharma.com`
- `admin.vastuarunsharma.com`

### 2. Stop existing host proxy

Traefik needs ports 80 and 443. Stop whatever currently binds them:

```bash
# If host nginx is running:
sudo systemctl stop nginx
sudo systemctl disable nginx

# Verify nothing else is on 80/443:
sudo ss -tlnp | grep -E ':80|:443'
```

### 3. Start Traefik

```bash
cd ~/vastu_backend/deploy/traefik
cp .env.traefik.example .env
# Edit .env and set ACME_EMAIL
docker compose -f docker-compose.traefik.yml up -d
```

This creates the `traefik-public` Docker network used by all apps.

### 4. Redeploy all apps

Pull latest and restart each app so they join `traefik-public` with Traefik labels:

```bash
cd ~/vastuarunsharma.com && git pull && docker compose up -d --build
cd ~/vastu_backend && git pull && docker compose up -d --build
cd ~/admin-vastu && git pull && docker compose up -d --build
```

### 5. Verify

```bash
curl -I https://vastuarunsharma.com
curl -I https://api.vastuarunsharma.com
curl -I https://admin.vastuarunsharma.com
docker logs traefik --tail 50
```

## Ongoing operations

```bash
# Restart Traefik (after config changes)
cd ~/vastu_backend/deploy/traefik
docker compose -f docker-compose.traefik.yml up -d

# View logs
docker logs traefik -f

# Check certificate storage
docker volume inspect traefik-certs
```

Traefik is also restarted idempotently by the backend GitHub Actions deploy workflow.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| 404 from Traefik | Check container labels and that the service is on `traefik-public` |
| Certificate not issued | Confirm DNS resolves to VPS; check `docker logs traefik` for ACME errors |
| Port 80/443 in use | Stop host nginx or other proxy before starting Traefik |
| API upload fails | `api-upload` middleware in `dynamic.yml` allows 50 MB bodies |
