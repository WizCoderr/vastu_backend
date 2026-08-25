-- CreateEnum
CREATE TYPE "CouponGrantStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'REVOKED');

-- AlterEnum
ALTER TYPE "WhatsAppNotificationType" ADD VALUE 'COUPON_GRANT';

-- AlterTable
ALTER TABLE "Coupon" ADD COLUMN "requiresGrant" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CouponGrant" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CouponGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "orderId" TEXT,

    CONSTRAINT "CouponGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CouponGrant_couponId_userId_status_idx" ON "CouponGrant"("couponId", "userId", "status");

-- CreateIndex
CREATE INDEX "CouponGrant_userId_status_idx" ON "CouponGrant"("userId", "status");

-- CreateIndex
CREATE INDEX "CouponGrant_orderId_idx" ON "CouponGrant"("orderId");

-- AddForeignKey
ALTER TABLE "CouponGrant" ADD CONSTRAINT "CouponGrant_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CouponGrant" ADD CONSTRAINT "CouponGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
