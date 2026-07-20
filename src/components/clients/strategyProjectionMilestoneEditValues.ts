import type { StrategyProjectionMilestone } from '@/lib/clientStrategyProjectionHelpers';

export type StrategyProjectionMilestoneEditValues = {
  id: string;
  year: number;
  title: string;
  type: string;
  stepId: string | null;
  monthlyIncome: number | null;
  monthsOfIncome: number | null;
  annualIncome: number | null;
  capitalInvested: number | null;
  capitalRemaining: number | null;
  incomeThisPeriod: number | null;
  cumulativeIncome: number | null;
  totalAssetPosition: number | null;
  expensesThisYear: number | null;
  cumulativeExpenses: number | null;
  netCashflowThisYear: number | null;
  capitalReturnedThisYear: number | null;
  capitalReturnedToDate: number | null;
  selectedStepIds: string[];
  selectedExpenseIds: string[];
  notes: string | null;
  sortOrder: number;
};

/** Maps API/list milestone DTO into modal edit form values. */
export function toProjectionMilestoneEditValues(
  milestone: StrategyProjectionMilestone
): StrategyProjectionMilestoneEditValues {
  return {
    id: milestone.id,
    year: milestone.year,
    title: milestone.title,
    type: milestone.type,
    stepId: milestone.stepId,
    monthlyIncome: milestone.monthlyIncome,
    monthsOfIncome: milestone.monthsOfIncome,
    annualIncome: milestone.annualIncome,
    capitalInvested: milestone.capitalInvested,
    capitalRemaining: milestone.capitalRemaining,
    incomeThisPeriod: milestone.incomeThisPeriod,
    cumulativeIncome: milestone.cumulativeIncome,
    totalAssetPosition: milestone.totalAssetPosition,
    expensesThisYear: milestone.expensesThisYear ?? null,
    cumulativeExpenses: milestone.cumulativeExpenses ?? null,
    netCashflowThisYear: milestone.netCashflowThisYear ?? null,
    capitalReturnedThisYear: milestone.capitalReturnedThisYear ?? null,
    capitalReturnedToDate: milestone.capitalReturnedToDate ?? null,
    selectedStepIds: milestone.selectedStepIds ?? [],
    selectedExpenseIds: milestone.selectedExpenseIds ?? [],
    notes: milestone.notes,
    sortOrder: milestone.sortOrder,
  };
}
