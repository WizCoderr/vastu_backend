-- CreateEnum
CREATE TYPE "WalletPassType" AS ENUM ('ORDER_RECEIPT');

-- CreateEnum
CREATE TYPE "WalletPassStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateTable
CREATE TABLE "WalletPass" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "googleWalletClassId" TEXT,
    "googleWalletObjectId" TEXT,
    "passType" "WalletPassType" NOT NULL DEFAULT 'ORDER_RECEIPT',
    "status" "WalletPassStatus" NOT NULL DEFAULT 'PENDING',
    "passData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WalletPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletEvent" (
    "id" TEXT NOT NULL,
    "walletPassId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletPass_orderId_key" ON "WalletPass"("orderId");

-- CreateIndex
CREATE INDEX "WalletPass_userId_idx" ON "WalletPass"("userId");

-- CreateIndex
CREATE INDEX "WalletPass_status_idx" ON "WalletPass"("status");

-- CreateIndex
CREATE INDEX "WalletPass_googleWalletObjectId_idx" ON "WalletPass"("googleWalletObjectId");

-- CreateIndex
CREATE INDEX "WalletEvent_walletPassId_idx" ON "WalletEvent"("walletPassId");

-- CreateIndex
CREATE INDEX "WalletEvent_createdAt_idx" ON "WalletEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "WalletPass" ADD CONSTRAINT "WalletPass_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletPass" ADD CONSTRAINT "WalletPass_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletEvent" ADD CONSTRAINT "WalletEvent_walletPassId_fkey" FOREIGN KEY ("walletPassId") REFERENCES "WalletPass"("id") ON DELETE CASCADE ON UPDATE CASCADE;
