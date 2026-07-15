-- CreateEnum
CREATE TYPE "StrategyPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StrategyStepType" AS ENUM ('EXISTING_DEAL', 'PLANNED_DEAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "StrategyConnectionType" AS ENUM ('FUNDING_SOURCE', 'INTEREST_REDIRECT', 'INCOME_REDIRECT', 'CAPITAL_GROWTH', 'PROTECTION_SUPPORT', 'TAX_PLANNING', 'RISK_MANAGEMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "StrategyIncomeFrequency" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StrategyExpenseFrequency" AS ENUM ('MONTHLY', 'YEARLY', 'ONE_TIME', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StrategyExpenseCategory" AS ENUM ('HOUSING', 'EDUCATION', 'HEALTHCARE', 'INSURANCE', 'RETIREMENT', 'LIFESTYLE', 'BUSINESS', 'DEBT', 'FAMILY_SUPPORT', 'EMERGENCY', 'OTHER');

-- CreateEnum
CREATE TYPE "StrategyExpensePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "ClientStrategyPlan" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "clientGoal" TEXT,
    "expectedOutcome" TEXT,
    "status" "StrategyPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStrategyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStrategyStep" (
    "id" TEXT NOT NULL,
    "strategyPlanId" TEXT NOT NULL,
    "linkedDealId" TEXT,
    "title" TEXT NOT NULL,
    "stepType" "StrategyStepType" NOT NULL DEFAULT 'MANUAL',
    "plannedAmount" DECIMAL(12,2),
    "amountDescription" TEXT,
    "purpose" TEXT,
    "expectedAchievement" TEXT,
    "expectedIncomeAmount" DECIMAL(12,2),
    "expectedIncomeFrequency" "StrategyIncomeFrequency",
    "timelineLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStrategyStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStrategyConnection" (
    "id" TEXT NOT NULL,
    "strategyPlanId" TEXT NOT NULL,
    "fromStepId" TEXT NOT NULL,
    "toStepId" TEXT NOT NULL,
    "connectionType" "StrategyConnectionType" NOT NULL DEFAULT 'MANUAL',
    "purpose" TEXT,
    "expectedOutcome" TEXT,
    "timing" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStrategyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStrategyExpense" (
    "id" TEXT NOT NULL,
    "strategyPlanId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "StrategyExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2),
    "frequency" "StrategyExpenseFrequency" NOT NULL,
    "startTimelineLabel" TEXT,
    "endTimelineLabel" TEXT,
    "priority" "StrategyExpensePriority" NOT NULL DEFAULT 'MEDIUM',
    "purpose" TEXT,
    "coveredByStepId" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStrategyExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientStrategyPlan_clientId_idx" ON "ClientStrategyPlan"("clientId");

-- CreateIndex
CREATE INDEX "ClientStrategyPlan_clientId_status_idx" ON "ClientStrategyPlan"("clientId", "status");

-- CreateIndex
CREATE INDEX "ClientStrategyPlan_ownerUserId_idx" ON "ClientStrategyPlan"("ownerUserId");

-- CreateIndex
CREATE INDEX "ClientStrategyPlan_createdByUserId_idx" ON "ClientStrategyPlan"("createdByUserId");

-- CreateIndex
CREATE INDEX "ClientStrategyStep_strategyPlanId_idx" ON "ClientStrategyStep"("strategyPlanId");

-- CreateIndex
CREATE INDEX "ClientStrategyStep_linkedDealId_idx" ON "ClientStrategyStep"("linkedDealId");

-- CreateIndex
CREATE INDEX "ClientStrategyStep_strategyPlanId_sortOrder_idx" ON "ClientStrategyStep"("strategyPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "ClientStrategyConnection_strategyPlanId_idx" ON "ClientStrategyConnection"("strategyPlanId");

-- CreateIndex
CREATE INDEX "ClientStrategyConnection_fromStepId_idx" ON "ClientStrategyConnection"("fromStepId");

-- CreateIndex
CREATE INDEX "ClientStrategyConnection_toStepId_idx" ON "ClientStrategyConnection"("toStepId");

-- CreateIndex
CREATE INDEX "ClientStrategyExpense_strategyPlanId_idx" ON "ClientStrategyExpense"("strategyPlanId");

-- CreateIndex
CREATE INDEX "ClientStrategyExpense_coveredByStepId_idx" ON "ClientStrategyExpense"("coveredByStepId");

-- CreateIndex
CREATE INDEX "ClientStrategyExpense_strategyPlanId_sortOrder_idx" ON "ClientStrategyExpense"("strategyPlanId", "sortOrder");

-- AddForeignKey
ALTER TABLE "ClientStrategyPlan" ADD CONSTRAINT "ClientStrategyPlan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyPlan" ADD CONSTRAINT "ClientStrategyPlan_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyPlan" ADD CONSTRAINT "ClientStrategyPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyStep" ADD CONSTRAINT "ClientStrategyStep_strategyPlanId_fkey" FOREIGN KEY ("strategyPlanId") REFERENCES "ClientStrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyStep" ADD CONSTRAINT "ClientStrategyStep_linkedDealId_fkey" FOREIGN KEY ("linkedDealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyConnection" ADD CONSTRAINT "ClientStrategyConnection_strategyPlanId_fkey" FOREIGN KEY ("strategyPlanId") REFERENCES "ClientStrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyConnection" ADD CONSTRAINT "ClientStrategyConnection_fromStepId_fkey" FOREIGN KEY ("fromStepId") REFERENCES "ClientStrategyStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyConnection" ADD CONSTRAINT "ClientStrategyConnection_toStepId_fkey" FOREIGN KEY ("toStepId") REFERENCES "ClientStrategyStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyExpense" ADD CONSTRAINT "ClientStrategyExpense_strategyPlanId_fkey" FOREIGN KEY ("strategyPlanId") REFERENCES "ClientStrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyExpense" ADD CONSTRAINT "ClientStrategyExpense_coveredByStepId_fkey" FOREIGN KEY ("coveredByStepId") REFERENCES "ClientStrategyStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
