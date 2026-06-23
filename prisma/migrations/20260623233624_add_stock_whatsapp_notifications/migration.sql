-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ORDER', 'RESTOCK', 'ADJUSTMENT', 'INITIAL');

-- CreateEnum
CREATE TYPE "WhatsAppNotificationType" AS ENUM ('NEW_ORDER', 'LOW_STOCK', 'ORDER_CONFIRMATION', 'ORDER_STATUS');

-- CreateEnum
CREATE TYPE "WhatsAppNotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'FALLBACK_LINK');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "lowStockAlertSentAt" TIMESTAMP(3),
ADD COLUMN     "lowStockThreshold" INTEGER;

-- CreateTable
CREATE TABLE "StockSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "globalLowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppNotification" (
    "id" TEXT NOT NULL,
    "type" "WhatsAppNotificationType" NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "WhatsAppNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "waMeUrl" TEXT,
    "referenceId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_status_idx" ON "WhatsAppNotification"("status");

-- CreateIndex
CREATE INDEX "WhatsAppNotification_createdAt_idx" ON "WhatsAppNotification"("createdAt");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
