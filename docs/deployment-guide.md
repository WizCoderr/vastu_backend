# Production Deployment Guide (Ubuntu 24.04)

## Stack
- Bun runtime for API
- PostgreSQL 16
- Redis 7
- Nginx reverse proxy
- PM2 process manager
- Let's Encrypt SSL

## 1. Server setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx postgresql redis-server certbot python3-certbot-nginx
curl -fsSL https://bun.sh/install | bash
```

## 2. Database

```bash
sudo -u postgres createuser vastu --pwprompt
sudo -u postgres createdb vastu -O vastu
```

## 3. Deploy backend

```bash
git clone <repo> /opt/vastu_backend
cd /opt/vastu_backend
bun install
bunx prisma migrate deploy
bun run build
```

Create `/opt/vastu_backend/.env` with production secrets.

## 4. PM2

```bash
npm install -g pm2
pm2 start "bun run src/index.ts" --name vastu-api
pm2 save
pm2 startup
```

## 5. Nginx

```nginx
server {
  listen 443 ssl;
  server_name api.vastuarunsharma.com;

  ssl_certificate /etc/letsencrypt/live/api.vastuarunsharma.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.vastuarunsharma.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3030;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location /storage/invoices {
    alias /opt/vastu_backend/storage/invoices;
  }
}
```

```bash
sudo certbot --nginx -d api.vastuarunsharma.com
sudo nginx -t && sudo systemctl reload nginx
```

## 6. Docker alternative

```bash
docker compose up -d postgres redis backend
```

## 7. Health checks
- `GET /health`
- Redis connectivity for BullMQ workers
- Bank webhook endpoint reachable from bank IP allowlist
