/**
 * Compact Board/List labels for strategy timeline economics.
 * Uses timeline calculation helpers; missing values render as "—".
 */

import {
  getStrategyExpenseTotal,
  getStrategyStepIllustrativeTotalPosition,
  getStrategyStepTotalIncome,
  type StrategyTimelineExpenseInput,
  type StrategyTimelineStepInput,
} from '@/lib/clientStrategyTimelineCalculations';
import { displayMoney } from '@/lib/formatMoney';

export type StepEconomicsSource = {
  plannedAmount?: number | null;
  amountDescription?: string | null;
  expectedIncomeAmount?: number | null;
  expectedIncomeFrequency?: string | null;
  timelineLabel?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  investmentAmount?: number | null;
  incomeAmount?: number | null;
  incomeFrequency?: string | null;
  incomeStartYear?: number | null;
  incomeEndYear?: number | null;
  capitalReturned?: number | null;
  capitalReturnYear?: number | null;
  linkedDeal?: { dealValue?: number | null } | null;
};

export type ExpenseEconomicsSource = {
  amount?: number | null;
  frequency?: string | null;
  startTimelineLabel?: string | null;
  endTimelineLabel?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  coveredByStep?: { id: string; title: string } | null;
};

export type StepEconomicsLabels = {
  invest: string;
  income: string;
  timeline: string;
  totalIncome: string;
  capitalBack: string;
  illustrativePosition: string;
};

export type ExpenseEconomicsLabels = {
  amount: string;
  timeline: string;
  totalExpense: string;
  coveredBy: string | null;
};

function humanizeEnum(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

export function formatDisplayMoney(value: number | null | undefined): string {
  return displayMoney(value);
}

export function formatYearRange(
  startYear: number | null | undefined,
  endYear: number | null | undefined
): string | null {
  const hasStart =
    typeof startYear === 'number' && Number.isFinite(startYear);
  const hasEnd = typeof endYear === 'number' && Number.isFinite(endYear);

  if (hasStart && hasEnd) {
    return `${startYear}–${endYear}`;
  }
  if (hasStart) {
    return `${startYear}–`;
  }
  if (hasEnd) {
    return `–${endYear}`;
  }
  return null;
}

function formatAmountFrequency(
  amount: number | null | undefined,
  frequency: string | null | undefined
): string | null {
  const money =
    amount === null || amount === undefined || Number.isNaN(amount)
      ? null
      : formatDisplayMoney(amount);
  const freq = humanizeEnum(frequency);
  if (!money && !freq) {
    return null;
  }
  return [money, freq].filter(Boolean).join(' · ');
}

/** Map UI step fields into timeline helper input (legacy income as fallback). */
export function toTimelineStepInput(
  step: StepEconomicsSource
): StrategyTimelineStepInput {
  return {
    investmentAmount: step.investmentAmount ?? step.plannedAmount ?? null,
    startYear: step.startYear ?? null,
    endYear: step.endYear ?? null,
    incomeAmount: step.incomeAmount ?? step.expectedIncomeAmount ?? null,
    incomeFrequency:
      step.incomeFrequency ?? step.expectedIncomeFrequency ?? null,
    incomeStartYear: step.incomeStartYear ?? null,
    incomeEndYear: step.incomeEndYear ?? null,
    capitalReturned: step.capitalReturned ?? null,
    capitalReturnYear: step.capitalReturnYear ?? null,
  };
}

export function toTimelineExpenseInput(
  expense: ExpenseEconomicsSource
): StrategyTimelineExpenseInput {
  return {
    amount: expense.amount ?? null,
    frequency: expense.frequency ?? null,
    startYear: expense.startYear ?? null,
    endYear: expense.endYear ?? null,
  };
}

export function getStepEconomicsLabels(
  step: StepEconomicsSource
): StepEconomicsLabels {
  const input = toTimelineStepInput(step);

  const investFromAmount = formatDisplayMoney(
    step.investmentAmount ??
      step.plannedAmount ??
      step.linkedDeal?.dealValue ??
      null
  );
  const invest =
    investFromAmount !== '—'
      ? investFromAmount
      : step.amountDescription?.trim() || '—';

  const incomeFromNew = formatAmountFrequency(
    step.incomeAmount,
    step.incomeFrequency
  );
  const incomeFromLegacy = formatAmountFrequency(
    step.expectedIncomeAmount,
    step.expectedIncomeFrequency
  );
  const income = incomeFromNew || incomeFromLegacy || '—';

  const timeline =
    formatYearRange(step.startYear, step.endYear) ||
    step.timelineLabel?.trim() ||
    '—';

  const totalIncome = formatDisplayMoney(getStrategyStepTotalIncome(input));

  let capitalBack = formatDisplayMoney(step.capitalReturned ?? null);
  if (
    capitalBack !== '—' &&
    typeof step.capitalReturnYear === 'number' &&
    Number.isFinite(step.capitalReturnYear)
  ) {
    capitalBack = `${capitalBack} · ${step.capitalReturnYear}`;
  }

  const illustrativePosition = formatDisplayMoney(
    getStrategyStepIllustrativeTotalPosition(input)
  );

  return {
    invest,
    income,
    timeline,
    totalIncome,
    capitalBack,
    illustrativePosition,
  };
}

export function getExpenseEconomicsLabels(
  expense: ExpenseEconomicsSource
): ExpenseEconomicsLabels {
  const input = toTimelineExpenseInput(expense);

  const amount =
    formatAmountFrequency(expense.amount, expense.frequency) || '—';

  const timeline =
    formatYearRange(expense.startYear, expense.endYear) ||
    (expense.startTimelineLabel || expense.endTimelineLabel
      ? [expense.startTimelineLabel, expense.endTimelineLabel]
          .filter(Boolean)
          .join(' → ')
      : null) ||
    '—';

  const totalExpense = formatDisplayMoney(getStrategyExpenseTotal(input));
  const coveredBy = expense.coveredByStep?.title?.trim() || null;

  return {
    amount,
    timeline,
    totalExpense,
    coveredBy,
  };
}
