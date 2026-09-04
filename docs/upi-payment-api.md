# UPI Payment API

Base URL: `/api/payments`

## Authentication
All student endpoints require `Authorization: Bearer <access_token>`.

## Endpoints

### POST /create
Create a UPI payment.

```json
{
  "amount": 999,
  "description": "Premium Plan",
  "orderId": "optional-shop-order-id",
  "courseId": "optional-course-id"
}
```

Response:
```json
{
  "orderId": "ORDER123",
  "transactionId": "TXN123",
  "upiUrl": "upi://pay?...",
  "qrCode": "base64",
  "deepLinks": {
    "google_pay": "tez://upi/pay?...",
    "phonepe": "phonepe://pay?...",
    "paytm": "paytmmp://pay?...",
    "bhim": "upi://pay?...",
    "generic": "upi://pay?..."
  }
}
```

### POST /verify
```json
{ "transactionId": "TXN123" }
```

### GET /status/:transactionId

### GET /history

### GET /invoices/:id/download

### POST /webhook/:bank
Bank webhook with `x-signature` header.

## Admin

- `GET /admin/transactions?status=PENDING`
- `POST /admin/reconcile` `{ "paymentId", "utr" }`
- `GET /admin/export` CSV download

## Testing locally (mock provider)

Mock bank (`PAYMENT_BANK_PROVIDER=mock`) auto-marks payments **COMPLETED** after ~15 seconds.

### 1. Start services

```bash
cd vastu_backend
docker compose up -d redis
bun run dev          # terminal 1 — API
bun run worker       # terminal 2 — payment jobs (or use PROCESS_ROLE=all in dev)
```

Ensure `.env` has:
```env
PAYMENT_PROVIDER=upi
PAYMENT_BANK_PROVIDER=mock
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

### 2. Automated API test

```bash
TEST_EMAIL=your@email.com TEST_PASSWORD=secret bun run test:payment
```

### 3. Web checkout (remedies shop)

```bash
cd vastuarunsharma.com
# .env: VITE_API_BASE_URL=http://localhost:3030
bun run dev
```

1. Log in at http://localhost:5173
2. Add items to cart → checkout
3. Payment page shows QR + UPI apps
4. Wait ~15s — mock worker verifies → success page

### 4. Postman

Import `docs/postman/upi-payments.postman_collection.json`.

### 5. Instant complete (webhook)

```bash
curl -X POST http://localhost:3030/api/payments/webhook/mock \
  -H "Content-Type: application/json" \
  -H "x-signature: test" \
  -d '{"merchantTxnRef":"TXN...","utr":"UTR123456"}'
```

## Environment

```env
PAYMENT_PROVIDER=upi
PAYMENT_BANK_PROVIDER=mock|hdfc|icici|axis|sbi|kotak
UPI_MERCHANT_VPA=payments@wizhub
UPI_MERCHANT_NAME=WizHub
BANK_API_KEY=
BANK_API_SECRET=
BANK_MERCHANT_ID=
BANK_BASE_URL=
REDIS_URL=redis://localhost:6379
```
