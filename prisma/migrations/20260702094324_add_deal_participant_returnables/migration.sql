-- AlterTable
ALTER TABLE "DealParticipant" ADD COLUMN     "isReturnableRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "returnableAmount" DECIMAL(12,2),
ADD COLUMN     "returnablePercent" DECIMAL(5,2);
