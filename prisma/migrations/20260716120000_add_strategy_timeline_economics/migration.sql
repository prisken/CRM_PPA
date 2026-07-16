-- AlterTable: ClientStrategyStep timeline economics (legacy plannedAmount / expectedIncome* retained)
ALTER TABLE "ClientStrategyStep" ADD COLUMN     "startYear" INTEGER,
ADD COLUMN     "endYear" INTEGER,
ADD COLUMN     "investmentAmount" DECIMAL(12,2),
ADD COLUMN     "incomeAmount" DECIMAL(12,2),
ADD COLUMN     "incomeFrequency" "StrategyIncomeFrequency",
ADD COLUMN     "incomeStartYear" INTEGER,
ADD COLUMN     "incomeEndYear" INTEGER,
ADD COLUMN     "capitalReturned" DECIMAL(12,2),
ADD COLUMN     "capitalReturnYear" INTEGER;

-- AlterTable: ClientStrategyExpense year bounds
ALTER TABLE "ClientStrategyExpense" ADD COLUMN     "startYear" INTEGER,
ADD COLUMN     "endYear" INTEGER;

-- AlterTable: ClientStrategyProjectionMilestone economics fields
ALTER TABLE "ClientStrategyProjectionMilestone" ADD COLUMN     "expensesThisYear" DECIMAL(12,2),
ADD COLUMN     "cumulativeExpenses" DECIMAL(12,2),
ADD COLUMN     "netCashflowThisYear" DECIMAL(12,2),
ADD COLUMN     "capitalReturnedThisYear" DECIMAL(12,2),
ADD COLUMN     "capitalReturnedToDate" DECIMAL(12,2);

-- CreateTable: milestone ↔ step contributions
CREATE TABLE "ClientStrategyProjectionMilestoneStep" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "contributionAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStrategyProjectionMilestoneStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable: milestone ↔ expense contributions
CREATE TABLE "ClientStrategyProjectionMilestoneExpense" (
    "id" TEXT NOT NULL,
    "milestoneId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "contributionAmount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStrategyProjectionMilestoneExpense_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientStrategyProjectionMilestoneStep_milestoneId_idx" ON "ClientStrategyProjectionMilestoneStep"("milestoneId");

-- CreateIndex
CREATE INDEX "ClientStrategyProjectionMilestoneStep_stepId_idx" ON "ClientStrategyProjectionMilestoneStep"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStrategyProjectionMilestoneStep_milestoneId_stepId_key" ON "ClientStrategyProjectionMilestoneStep"("milestoneId", "stepId");

-- CreateIndex
CREATE INDEX "ClientStrategyProjectionMilestoneExpense_milestoneId_idx" ON "ClientStrategyProjectionMilestoneExpense"("milestoneId");

-- CreateIndex
CREATE INDEX "ClientStrategyProjectionMilestoneExpense_expenseId_idx" ON "ClientStrategyProjectionMilestoneExpense"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStrategyProjectionMilestoneExpense_milestoneId_expenseId_key" ON "ClientStrategyProjectionMilestoneExpense"("milestoneId", "expenseId");

-- AddForeignKey
ALTER TABLE "ClientStrategyProjectionMilestoneStep" ADD CONSTRAINT "ClientStrategyProjectionMilestoneStep_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ClientStrategyProjectionMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyProjectionMilestoneStep" ADD CONSTRAINT "ClientStrategyProjectionMilestoneStep_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "ClientStrategyStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyProjectionMilestoneExpense" ADD CONSTRAINT "ClientStrategyProjectionMilestoneExpense_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "ClientStrategyProjectionMilestone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStrategyProjectionMilestoneExpense" ADD CONSTRAINT "ClientStrategyProjectionMilestoneExpense_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ClientStrategyExpense"("id") ON DELETE CASCADE ON UPDATE CASCADE;
