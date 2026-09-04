-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'UPI';

-- AlterTable User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable RefreshToken
CREATE TABLE IF NOT EXISTS "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- AlterTable StudentPayment
ALTER TABLE "StudentPayment" ADD COLUMN IF NOT EXISTS "merchantTxnRef" TEXT;
ALTER TABLE "StudentPayment" ADD COLUMN IF NOT EXISTS "utr" TEXT;
ALTER TABLE "StudentPayment" ADD COLUMN IF NOT EXISTS "providerPaymentId" TEXT;
ALTER TABLE "StudentPayment" ADD COLUMN IF NOT EXISTS "upiUrl" TEXT;
ALTER TABLE "StudentPayment" ADD COLUMN IF NOT EXISTS "qrCodeBase64" TEXT;
ALTER TABLE "StudentPayment" ADD COLUMN IF NOT EXISTS "providerResponse" JSONB;
ALTER TABLE "StudentPayment" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "StudentPayment" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

-- AlterTable Payment
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "merchantTxnRef" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "utr" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "upiUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "qrCodeBase64" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "providerResponse" JSONB;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMP(3);
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);

-- CreateTable Invoice
CREATE TABLE IF NOT EXISTS "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "publicUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX IF NOT EXISTS "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "StudentPayment_merchantTxnRef_key" ON "StudentPayment"("merchantTxnRef");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentPayment_utr_key" ON "StudentPayment"("utr");

CREATE UNIQUE INDEX IF NOT EXISTS "Payment_merchantTxnRef_key" ON "Payment"("merchantTxnRef");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_utr_key" ON "Payment"("utr");
CREATE INDEX IF NOT EXISTS "Payment_merchantTxnRef_idx" ON "Payment"("merchantTxnRef");
CREATE INDEX IF NOT EXISTS "Payment_utr_idx" ON "Payment"("utr");

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_paymentId_key" ON "Invoice"("paymentId");
CREATE INDEX IF NOT EXISTS "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "RefreshToken" DROP CONSTRAINT IF EXISTS "RefreshToken_userId_fkey";
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_paymentId_fkey";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
