-- AlterEnum
ALTER TYPE "ActionKind" ADD VALUE 'REFUND_CAPTURE';

-- AlterEnum
ALTER TYPE "CaseType" ADD VALUE 'CAPTURE_ON_CANCELED_ORDER';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "canceled_at" TIMESTAMPTZ(3);
