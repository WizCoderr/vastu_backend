-- AlterEnum
ALTER TYPE "PaymentProvider" ADD VALUE 'CASH';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "shippingCost" DECIMAL(10,2) DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "purchasePrice" DECIMAL(10,2);
