# PayU setup (sandbox + production)

## Security first

Live merchant key, salt, client ID, and client secret were exposed in a screenshot during integration.
**Before going live:** PayU Dashboard (Live Mode) → Developer → API Keys → **Regenerate Salt**, then activate the new salt.
Treat the old salt and client secret as burned.

`.env` is gitignored. Never commit real salts. The deploy workflow refuses to start if `~/vastu_backend/.env` is missing on the VPS.

## Local / sandbox

1. PayU Dashboard → switch to **Test Mode** → Developer → API Keys.
2. Copy Test Mode `key` and Salt (v1) into your local `.env`:

```bash
PAYMENT_PROVIDER=payu
PAYU_USE_TEST=true
PAYU_MERCHANT_KEY=<test-key>
PAYU_MERCHANT_SALT=<test-salt-v1>
PAYU_PUBLIC_API_URL=http://localhost:3030
PAYU_WEB_RETURN_URL=http://localhost:5173
```

3. Restart the API. Boot fails fast if key/salt are empty while `PAYMENT_PROVIDER=payu`.

Test cards / UPI: see [PayU test integration docs](https://docs.payu.in/docs/test-integration).

## Production (VPS) — paste over SSH

SSH to the server and edit `~/vastu_backend/.env` (this file is **not** overwritten by `git reset --hard`):

```bash
PAYMENT_PROVIDER=payu
PAYU_USE_TEST=false
PAYU_MERCHANT_KEY_PROD=<live-key-after-regenerate>
PAYU_MERCHANT_SALT_PROD=<live-salt-v1-after-regenerate>
# Optional — only if MCP / salt V2 is enabled
# PAYU_MERCHANT_SALT_V2_PROD=
PAYU_PUBLIC_API_URL=https://api.vastuarunsharma.com
PAYU_WEB_RETURN_URL=https://vastuarunsharma.com
```

Then restart:

```bash
cd ~/vastu_backend
docker compose -f deploy/docker-compose.stack.yml up -d --build
# or: docker compose -f docker-compose.prod.yml up -d --build
```

Do **not** put live salt in the git repo, GitHub secrets for this deploy path, or chat logs.

## PayU Dashboard checklist (manual)

| Step | Where | Value |
|------|--------|--------|
| Regenerate + activate Salt | Live Mode → Developer → API Keys | New salt → paste into VPS `.env` |
| Success URL whitelist | Payment Gateway / Website details | `https://api.vastuarunsharma.com/api/payments/payu/callback` |
| Failure URL whitelist | same | same callback URL (backend uses one URL for surl + furl) |
| Webhook | Webhooks / Instant Payment Notification | `https://api.vastuarunsharma.com/api/payments/payu/webhook` |
| Payment modes | Payment tools | Enable UPI, Cards, Netbanking as needed |

## Callback behaviour

- **Web (`udf1=web`)**: PayU POSTs to `/api/payments/payu/callback` → API verifies hash → **302** to `{PAYU_WEB_RETURN_URL}/payment/success|failure`.
- **App (`udf1=app`)**: same callback verifies + fulfills, then returns a plain **200 HTML** ack so CheckoutPro’s WebView can finish and fire `onPaymentSuccess` (Flutter then polls `/api/payments/payu/status/:txnid`).

## Smoke tests

```bash
# Unit hashes (no network)
bun test tests/payu-hash.test.ts

# Integration (needs running API + Test Mode keys + TEST_EMAIL/PASSWORD)
bun run test:payu
```
