-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('MARKETING', 'INVESTMENT', 'MEDICAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DealParticipantRole" AS ENUM ('RELATIONSHIP', 'FOLLOW_UP', 'DOCTOR', 'COMPANY', 'EXTERNAL_PARTNER');

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "dealType" "DealType" NOT NULL DEFAULT 'CUSTOM';

-- CreateTable
CREATE TABLE "DealParticipant" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT,
    "externalName" TEXT,
    "role" "DealParticipantRole" NOT NULL,
    "commissionPercent" DECIMAL(5,2) NOT NULL,
    "commissionAmount" DECIMAL(12,2),
    "isCommissionable" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealParticipant_dealId_idx" ON "DealParticipant"("dealId");

-- CreateIndex
CREATE INDEX "DealParticipant_userId_idx" ON "DealParticipant"("userId");

-- CreateIndex
CREATE INDEX "DealParticipant_role_idx" ON "DealParticipant"("role");

-- AddForeignKey
ALTER TABLE "DealParticipant" ADD CONSTRAINT "DealParticipant_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealParticipant" ADD CONSTRAINT "DealParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
