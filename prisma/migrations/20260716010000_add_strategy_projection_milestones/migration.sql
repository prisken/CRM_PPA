-- CreateEnum
CREATE TYPE "StrategyProjectionMilestoneType" AS ENUM (
  'INITIAL_INVESTMENT',
  'INCOME_CHECKPOINT',
  'EXIT_SCENARIO',
  'MATURITY_SCENARIO',
  'CUSTOM'
);

-- CreateTable
CREATE TABLE "ClientStrategyProjectionMilestone" (
    "id" TEXT NOT NULL,
    "strategyPlanId" TEXT NOT NULL,
    "stepId" TEXT,
    "year" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" "StrategyProjectionMilestoneType" NOT NULL DEFAULT 'CUSTOM',
    "monthlyIncome" DECIMAL(12,2),
    "monthsOfIncome" INTEGER,
    "annualIncome" DECIMAL(12,2),
    "capitalInvested" DECIMAL(12,2),
    "capitalRemaining" DECIMAL(12,2),
    "incomeThisPeriod" DECIMAL(12,2),
    "cumulativeIncome" DECIMAL(12,2),
    "totalAssetPosition" DECIMAL(12,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStrategyProjectionMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientStrategyProjectionMilestone_strategyPlanId_idx" ON "ClientStrategyProjectionMilestone"("strategyPlanId");

-- CreateIndex
CREATE INDEX "ClientStrategyProjectionMilestone_stepId_idx" ON "ClientStrategyProjectionMilestone"("stepId");

-- CreateIndex
CREATE INDEX "ClientStrategyProjectionMilestone_strategyPlanId_sortOrder_idx" ON "ClientStrategyProjectionMilestone"("strategyPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "ClientStrategyProjectionMilestone_strategyPlanId_year_idx" ON "ClientStrategyProjectionMilestone"("strategyPlanId", "year");

-- AddForeignKey
ALTER TABLE "ClientStrategyProjectionMilestone" ADD CONSTRAINT "ClientStrategyProjectionMilestone_strategyPlanId_fkey" FOREIGN KEY ("strategyPlanId") REFERENCES "ClientStrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyProjectionMilestone" ADD CONSTRAINT "ClientStrategyProjectionMilestone_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ClientStrategyStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;
