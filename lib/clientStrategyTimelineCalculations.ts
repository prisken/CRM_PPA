/**
 * Pure Strategy Planner timeline calculation helpers.
 *
 * Planning arithmetic only — no compounding, growth, IRR, ROI, yield, or
 * guaranteed-return concepts. Callers treat results as optional suggestions;
 * never overwrite advisor-entered saved values unless the user applies them.
 */

export type StrategyIncomeFrequencyInput =
  | 'MONTHLY'
  | 'YEARLY'
  | 'ONE_TIME'
  | 'CUSTOM'
  | string
  | null
  | undefined;

export type StrategyExpenseFrequencyInput = StrategyIncomeFrequencyInput;

/** Lightweight step / investment item — not a full Prisma record. */
export type StrategyTimelineStepInput = {
  investmentAmount?: number | null;
  /** Inclusive investment window (optional; unused by income helpers). */
  startYear?: number | null;
  endYear?: number | null;
  incomeAmount?: number | null;
  incomeFrequency?: StrategyIncomeFrequencyInput;
  incomeStartYear?: number | null;
  incomeEndYear?: number | null;
  capitalReturned?: number | null;
  capitalReturnYear?: number | null;
};

/** Lightweight expense — not a full Prisma record. */
export type StrategyTimelineExpenseInput = {
  amount?: number | null;
  frequency?: StrategyExpenseFrequencyInput;
  startYear?: number | null;
  endYear?: number | null;
};

export type ProjectionMilestoneSuggestion = {
  incomeThisYear: number | null;
  expensesThisYear: number | null;
  netCashflowThisYear: number | null;
  cumulativeIncome: number | null;
  cumulativeExpenses: number | null;
  capitalReturnedThisYear: number | null;
  capitalReturnedToDate: number | null;
  totalAssetPosition: number | null;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeFrequency(
  frequency: StrategyIncomeFrequencyInput
): 'MONTHLY' | 'YEARLY' | 'ONE_TIME' | 'CUSTOM' | null {
  if (frequency == null) {
    return null;
  }

  const normalized = String(frequency).trim().toUpperCase();
  if (
    normalized === 'MONTHLY' ||
    normalized === 'YEARLY' ||
    normalized === 'ONE_TIME' ||
    normalized === 'CUSTOM'
  ) {
    return normalized;
  }

  return null;
}

function isValidYear(year: number | null | undefined): year is number {
  return isFiniteNumber(year) && Number.isInteger(year);
}

/**
 * Returns whether `year` falls in [startYear, endYear] inclusive.
 * null when the range cannot be evaluated.
 */
export function isYearInInclusiveRange(
  year: number | null | undefined,
  startYear: number | null | undefined,
  endYear: number | null | undefined
): boolean | null {
  if (!isValidYear(year) || !isValidYear(startYear) || !isValidYear(endYear)) {
    return null;
  }

  if (startYear > endYear) {
    return null;
  }

  return year >= startYear && year <= endYear;
}

/**
 * Inclusive year count. null when range is incomplete or invalid.
 */
export function countInclusiveYears(
  startYear: number | null | undefined,
  endYear: number | null | undefined
): number | null {
  if (!isValidYear(startYear) || !isValidYear(endYear) || startYear > endYear) {
    return null;
  }

  return endYear - startYear + 1;
}

/**
 * Amount recognized in a single calendar year for a recurring/one-time item.
 * - MONTHLY → amount × 12
 * - YEARLY → amount
 * - ONE_TIME → amount (caller decides which year it applies)
 * - CUSTOM → null
 */
function annualizedAmountForFrequency(
  amount: number | null | undefined,
  frequency: StrategyIncomeFrequencyInput
): number | null {
  if (!isFiniteNumber(amount) || amount < 0) {
    return null;
  }

  const freq = normalizeFrequency(frequency);
  if (!freq || freq === 'CUSTOM') {
    return null;
  }

  if (freq === 'MONTHLY') {
    return amount * 12;
  }

  if (freq === 'YEARLY' || freq === 'ONE_TIME') {
    return amount;
  }

  return null;
}

/**
 * Amount for a specific year given frequency + inclusive start/end.
 * Outside an evaluable active range → 0. Missing inputs → null.
 */
function amountInYear(params: {
  amount: number | null | undefined;
  frequency: StrategyIncomeFrequencyInput;
  startYear: number | null | undefined;
  endYear: number | null | undefined;
  year: number | null | undefined;
}): number | null {
  const { amount, frequency, startYear, endYear, year } = params;
  const freq = normalizeFrequency(frequency);

  if (!isFiniteNumber(amount) || amount < 0 || !freq || freq === 'CUSTOM') {
    return null;
  }

  if (!isValidYear(year)) {
    return null;
  }

  if (freq === 'ONE_TIME') {
    if (!isValidYear(startYear)) {
      return null;
    }
    // ONE_TIME applies only in startYear (endYear optional; ignored for timing).
    return year === startYear ? amount : 0;
  }

  const inRange = isYearInInclusiveRange(year, startYear, endYear);
  if (inRange === null) {
    return null;
  }

  if (!inRange) {
    return 0;
  }

  return annualizedAmountForFrequency(amount, freq);
}

/**
 * Cumulative amount from startYear through min(year, endYear), inclusive.
 * year before start → 0 when range is valid.
 */
function cumulativeAmountToYear(params: {
  amount: number | null | undefined;
  frequency: StrategyIncomeFrequencyInput;
  startYear: number | null | undefined;
  endYear: number | null | undefined;
  year: number | null | undefined;
}): number | null {
  const { amount, frequency, startYear, endYear, year } = params;
  const freq = normalizeFrequency(frequency);

  if (!isFiniteNumber(amount) || amount < 0 || !freq || freq === 'CUSTOM') {
    return null;
  }

  if (!isValidYear(year)) {
    return null;
  }

  if (freq === 'ONE_TIME') {
    if (!isValidYear(startYear)) {
      return null;
    }
    return year >= startYear ? amount : 0;
  }

  if (!isValidYear(startYear) || !isValidYear(endYear) || startYear > endYear) {
    return null;
  }

  if (year < startYear) {
    return 0;
  }

  const lastYear = Math.min(year, endYear);
  const years = countInclusiveYears(startYear, lastYear);
  if (years === null) {
    return null;
  }

  const perYear = annualizedAmountForFrequency(amount, freq);
  if (perYear === null) {
    return null;
  }

  return perYear * years;
}

function totalAmountOverRange(params: {
  amount: number | null | undefined;
  frequency: StrategyIncomeFrequencyInput;
  startYear: number | null | undefined;
  endYear: number | null | undefined;
}): number | null {
  const { amount, frequency, startYear, endYear } = params;
  const freq = normalizeFrequency(frequency);

  if (!isFiniteNumber(amount) || amount < 0 || !freq || freq === 'CUSTOM') {
    return null;
  }

  if (freq === 'ONE_TIME') {
    if (!isValidYear(startYear)) {
      return null;
    }
    return amount;
  }

  if (!isValidYear(endYear)) {
    return null;
  }

  return cumulativeAmountToYear({
    amount,
    frequency,
    startYear,
    endYear,
    year: endYear,
  });
}

function sumNumbers(values: Array<number | null>): number | null {
  let total = 0;
  let sawValue = false;

  for (const value of values) {
    if (value === null) {
      continue;
    }
    sawValue = true;
    total += value;
  }

  return sawValue ? total : null;
}

// --- Strategy step / investment helpers ------------------------------------

/**
 * Recurring annual income for the step (MONTHLY × 12 or YEARLY).
 * ONE_TIME / CUSTOM / missing → null.
 */
export function getStrategyStepAnnualIncome(
  step: StrategyTimelineStepInput
): number | null {
  const freq = normalizeFrequency(step.incomeFrequency);
  if (!freq || freq === 'ONE_TIME' || freq === 'CUSTOM') {
    return null;
  }

  return annualizedAmountForFrequency(step.incomeAmount, freq);
}

export function getStrategyStepIncomeInYear(
  step: StrategyTimelineStepInput,
  year: number
): number | null {
  return amountInYear({
    amount: step.incomeAmount,
    frequency: step.incomeFrequency,
    startYear: step.incomeStartYear,
    endYear: step.incomeEndYear,
    year,
  });
}

export function getStrategyStepCumulativeIncomeToYear(
  step: StrategyTimelineStepInput,
  year: number
): number | null {
  return cumulativeAmountToYear({
    amount: step.incomeAmount,
    frequency: step.incomeFrequency,
    startYear: step.incomeStartYear,
    endYear: step.incomeEndYear,
    year,
  });
}

export function getStrategyStepTotalIncome(
  step: StrategyTimelineStepInput
): number | null {
  return totalAmountOverRange({
    amount: step.incomeAmount,
    frequency: step.incomeFrequency,
    startYear: step.incomeStartYear,
    endYear: step.incomeEndYear,
  });
}

export function getStrategyStepCapitalReturnedInYear(
  step: StrategyTimelineStepInput,
  year: number
): number | null {
  if (
    !isFiniteNumber(step.capitalReturned) ||
    step.capitalReturned < 0 ||
    !isValidYear(step.capitalReturnYear) ||
    !isValidYear(year)
  ) {
    return null;
  }

  return year === step.capitalReturnYear ? step.capitalReturned : 0;
}

export function getStrategyStepCapitalReturnedToYear(
  step: StrategyTimelineStepInput,
  year: number
): number | null {
  if (
    !isFiniteNumber(step.capitalReturned) ||
    step.capitalReturned < 0 ||
    !isValidYear(step.capitalReturnYear) ||
    !isValidYear(year)
  ) {
    return null;
  }

  return year >= step.capitalReturnYear ? step.capitalReturned : 0;
}

/**
 * Illustrative position before expenses: total income + capital returned.
 * Uses full income window and capitalReturned when both are computable.
 */
export function getStrategyStepIllustrativeTotalPosition(
  step: StrategyTimelineStepInput
): number | null {
  const totalIncome = getStrategyStepTotalIncome(step);
  if (
    totalIncome === null ||
    !isFiniteNumber(step.capitalReturned) ||
    step.capitalReturned < 0
  ) {
    return null;
  }

  return totalIncome + step.capitalReturned;
}

// --- Expense helpers -------------------------------------------------------

export function getStrategyExpenseAnnualAmount(
  expense: StrategyTimelineExpenseInput
): number | null {
  const freq = normalizeFrequency(expense.frequency);
  if (!freq || freq === 'ONE_TIME' || freq === 'CUSTOM') {
    return null;
  }

  return annualizedAmountForFrequency(expense.amount, freq);
}

export function getStrategyExpenseAmountInYear(
  expense: StrategyTimelineExpenseInput,
  year: number
): number | null {
  return amountInYear({
    amount: expense.amount,
    frequency: expense.frequency,
    startYear: expense.startYear,
    endYear: expense.endYear,
    year,
  });
}

export function getStrategyExpenseCumulativeToYear(
  expense: StrategyTimelineExpenseInput,
  year: number
): number | null {
  return cumulativeAmountToYear({
    amount: expense.amount,
    frequency: expense.frequency,
    startYear: expense.startYear,
    endYear: expense.endYear,
    year,
  });
}

export function getStrategyExpenseTotal(
  expense: StrategyTimelineExpenseInput
): number | null {
  return totalAmountOverRange({
    amount: expense.amount,
    frequency: expense.frequency,
    startYear: expense.startYear,
    endYear: expense.endYear,
  });
}

// --- Milestone suggestion --------------------------------------------------

/**
 * Builds a milestone suggestion from selected steps and expenses for a year.
 * Pure view-model helper — does not persist or overwrite saved milestones.
 *
 * totalAssetPosition =
 *   cumulativeIncome - cumulativeExpenses + capitalReturnedToDate
 * when all three parts are available.
 */
export function buildProjectionMilestoneSuggestionFromSources(params: {
  year: number;
  steps?: readonly StrategyTimelineStepInput[] | null;
  expenses?: readonly StrategyTimelineExpenseInput[] | null;
}): ProjectionMilestoneSuggestion {
  const year = params.year;
  const steps = params.steps ?? [];
  const expenses = params.expenses ?? [];

  const incomeThisYear = sumNumbers(
    steps.map((step) => getStrategyStepIncomeInYear(step, year))
  );
  const cumulativeIncome = sumNumbers(
    steps.map((step) => getStrategyStepCumulativeIncomeToYear(step, year))
  );
  const capitalReturnedThisYear = sumNumbers(
    steps.map((step) => getStrategyStepCapitalReturnedInYear(step, year))
  );
  const capitalReturnedToDate = sumNumbers(
    steps.map((step) => getStrategyStepCapitalReturnedToYear(step, year))
  );

  const expensesThisYear = sumNumbers(
    expenses.map((expense) => getStrategyExpenseAmountInYear(expense, year))
  );
  const cumulativeExpenses = sumNumbers(
    expenses.map((expense) => getStrategyExpenseCumulativeToYear(expense, year))
  );

  let netCashflowThisYear: number | null = null;
  if (incomeThisYear !== null && expensesThisYear !== null) {
    netCashflowThisYear = incomeThisYear - expensesThisYear;
  } else if (incomeThisYear !== null && expenses.length === 0) {
    netCashflowThisYear = incomeThisYear;
  } else if (expensesThisYear !== null && steps.length === 0) {
    netCashflowThisYear = -expensesThisYear;
  }

  let totalAssetPosition: number | null = null;
  if (
    cumulativeIncome !== null &&
    cumulativeExpenses !== null &&
    capitalReturnedToDate !== null
  ) {
    totalAssetPosition =
      cumulativeIncome - cumulativeExpenses + capitalReturnedToDate;
  } else if (
    cumulativeIncome !== null &&
    capitalReturnedToDate !== null &&
    expenses.length === 0
  ) {
    totalAssetPosition = cumulativeIncome + capitalReturnedToDate;
  }

  return {
    incomeThisYear,
    expensesThisYear,
    netCashflowThisYear,
    cumulativeIncome,
    cumulativeExpenses,
    capitalReturnedThisYear,
    capitalReturnedToDate,
    totalAssetPosition,
  };
}
