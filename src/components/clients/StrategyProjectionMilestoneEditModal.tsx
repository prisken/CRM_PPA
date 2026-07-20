'use client';

import { useMemo, useState } from 'react';
import {
  toProjectionMilestoneEditValues,
  type StrategyProjectionMilestoneEditValues,
} from '@/components/clients/strategyProjectionMilestoneEditValues';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import {
  STRATEGY_PROJECTION_MILESTONE_TYPE_OPTIONS,
  calculateSuggestedCumulativeIncome,
  calculateSuggestedTotalAssetPosition,
  type StrategyProjectionMilestoneType,
} from '@/lib/clientStrategyProjectionHelpers';
import {
  buildProjectionMilestoneSuggestionFromSources,
  type StrategyTimelineExpenseInput,
  type StrategyTimelineStepInput,
} from '@/lib/clientStrategyTimelineCalculations';
import {
  STRATEGY_PROJECTION_YEAR_MAX,
  STRATEGY_PROJECTION_YEAR_MIN,
} from '@/lib/clientStrategyValidation';
import { displayMoney, formatMoney } from '@/lib/formatMoney';

export type { StrategyProjectionMilestoneEditValues };
export { toProjectionMilestoneEditValues };

export type StrategyProjectionMilestoneStepOption = {
  id: string;
  title: string;
  investmentAmount?: number | null;
  plannedAmount?: number | null;
  incomeAmount?: number | null;
  expectedIncomeAmount?: number | null;
  incomeFrequency?: string | null;
  expectedIncomeFrequency?: string | null;
  startYear?: number | null;
  endYear?: number | null;
  incomeStartYear?: number | null;
  incomeEndYear?: number | null;
  capitalReturned?: number | null;
  capitalReturnYear?: number | null;
};

export type StrategyProjectionMilestoneExpenseOption = {
  id: string;
  title: string;
  amount?: number | null;
  frequency?: string | null;
  startYear?: number | null;
  endYear?: number | null;
};

type StrategyProjectionMilestoneEditModalProps = {
  clientId: string;
  planId: string;
  steps: StrategyProjectionMilestoneStepOption[];
  expenses?: StrategyProjectionMilestoneExpenseOption[];
  milestone?: StrategyProjectionMilestoneEditValues | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function parseOptionalMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return Number.NaN;
  }

  return numericValue;
}

function parseOptionalSignedMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    return Number.NaN;
  }

  return numericValue;
}

function parseOptionalNonNegativeInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  if (
    !Number.isFinite(numericValue) ||
    !Number.isInteger(numericValue) ||
    numericValue < 0
  ) {
    return Number.NaN;
  }

  return numericValue;
}

function moneyToInput(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function formatSuggestionMoney(value: number | null) {
  return displayMoney(value);
}

function formatCompactMoney(value: number | null | undefined) {
  return formatMoney(value, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

function formatFrequencyLabel(frequency: string | null | undefined) {
  if (!frequency) {
    return null;
  }
  return frequency
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatYearRange(
  startYear: number | null | undefined,
  endYear: number | null | undefined
) {
  if (startYear == null && endYear == null) {
    return null;
  }
  if (startYear != null && endYear != null) {
    return startYear === endYear
      ? String(startYear)
      : `${startYear}–${endYear}`;
  }
  return String(startYear ?? endYear);
}

function toTimelineStepInput(
  step: StrategyProjectionMilestoneStepOption
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

function toTimelineExpenseInput(
  expense: StrategyProjectionMilestoneExpenseOption
): StrategyTimelineExpenseInput {
  return {
    amount: expense.amount ?? null,
    frequency: expense.frequency ?? null,
    startYear: expense.startYear ?? null,
    endYear: expense.endYear ?? null,
  };
}

function SuggestionRow({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium tabular-nums text-slate-900">
        {formatSuggestionMoney(value)}
      </span>
    </div>
  );
}

export default function StrategyProjectionMilestoneEditModal({
  clientId,
  planId,
  steps,
  expenses = [],
  milestone = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyProjectionMilestoneEditModalProps) {
  const formKey = isOpen ? (milestone?.id ?? 'new') : 'closed';

  return (
    <StrategyProjectionMilestoneEditModalForm
      key={formKey}
      clientId={clientId}
      planId={planId}
      steps={steps}
      expenses={expenses}
      milestone={milestone}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function StrategyProjectionMilestoneEditModalForm({
  clientId,
  planId,
  steps,
  expenses = [],
  milestone = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyProjectionMilestoneEditModalProps) {
  const isEditing = Boolean(milestone?.id);
  const currentYear = new Date().getFullYear();

  const [title, setTitle] = useState(milestone?.title ?? '');
  const [year, setYear] = useState(
    milestone?.year !== null && milestone?.year !== undefined
      ? String(milestone.year)
      : String(currentYear)
  );
  const [type, setType] = useState(
    milestone?.type ?? ('CUSTOM' as StrategyProjectionMilestoneType)
  );
  const [stepId, setStepId] = useState(milestone?.stepId ?? '');
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>(
    milestone?.selectedStepIds ?? []
  );
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>(
    milestone?.selectedExpenseIds ?? []
  );
  const [monthlyIncome, setMonthlyIncome] = useState(
    moneyToInput(milestone?.monthlyIncome)
  );
  const [monthsOfIncome, setMonthsOfIncome] = useState(
    milestone?.monthsOfIncome !== null &&
      milestone?.monthsOfIncome !== undefined
      ? String(milestone.monthsOfIncome)
      : ''
  );
  const [annualIncome, setAnnualIncome] = useState(
    moneyToInput(milestone?.annualIncome)
  );
  const [capitalInvested, setCapitalInvested] = useState(
    moneyToInput(milestone?.capitalInvested)
  );
  const [capitalRemaining, setCapitalRemaining] = useState(
    moneyToInput(milestone?.capitalRemaining)
  );
  const [incomeThisPeriod, setIncomeThisPeriod] = useState(
    moneyToInput(milestone?.incomeThisPeriod)
  );
  const [cumulativeIncome, setCumulativeIncome] = useState(
    moneyToInput(milestone?.cumulativeIncome)
  );
  const [totalAssetPosition, setTotalAssetPosition] = useState(
    moneyToInput(milestone?.totalAssetPosition)
  );
  const [expensesThisYear, setExpensesThisYear] = useState(
    moneyToInput(milestone?.expensesThisYear)
  );
  const [cumulativeExpenses, setCumulativeExpenses] = useState(
    moneyToInput(milestone?.cumulativeExpenses)
  );
  const [netCashflowThisYear, setNetCashflowThisYear] = useState(
    moneyToInput(milestone?.netCashflowThisYear)
  );
  const [capitalReturnedThisYear, setCapitalReturnedThisYear] = useState(
    moneyToInput(milestone?.capitalReturnedThisYear)
  );
  const [capitalReturnedToDate, setCapitalReturnedToDate] = useState(
    moneyToInput(milestone?.capitalReturnedToDate)
  );
  const [notes, setNotes] = useState(milestone?.notes ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearValue = useMemo(() => {
    const numericYear = Number(year);
    if (
      !Number.isFinite(numericYear) ||
      !Number.isInteger(numericYear) ||
      numericYear < STRATEGY_PROJECTION_YEAR_MIN ||
      numericYear > STRATEGY_PROJECTION_YEAR_MAX
    ) {
      return null;
    }
    return numericYear;
  }, [year]);

  const sourceSuggestion = useMemo(() => {
    if (yearValue === null) {
      return null;
    }

    const selectedSteps = steps
      .filter((step) => selectedStepIds.includes(step.id))
      .map(toTimelineStepInput);
    const selectedExpenses = expenses
      .filter((expense) => selectedExpenseIds.includes(expense.id))
      .map(toTimelineExpenseInput);

    if (selectedSteps.length === 0 && selectedExpenses.length === 0) {
      return null;
    }

    return buildProjectionMilestoneSuggestionFromSources({
      year: yearValue,
      steps: selectedSteps,
      expenses: selectedExpenses,
    });
  }, [yearValue, steps, expenses, selectedStepIds, selectedExpenseIds]);

  const hasSourceSuggestion =
    sourceSuggestion !== null &&
    (sourceSuggestion.incomeThisYear !== null ||
      sourceSuggestion.expensesThisYear !== null ||
      sourceSuggestion.cumulativeIncome !== null ||
      sourceSuggestion.cumulativeExpenses !== null ||
      sourceSuggestion.capitalReturnedThisYear !== null ||
      sourceSuggestion.capitalReturnedToDate !== null ||
      sourceSuggestion.totalAssetPosition !== null);

  const suggestedCumulativeIncome = useMemo(() => {
    const monthly = parseOptionalMoney(monthlyIncome);
    const months = parseOptionalNonNegativeInt(monthsOfIncome);
    if (
      monthly === null ||
      months === null ||
      Number.isNaN(monthly) ||
      Number.isNaN(months)
    ) {
      return null;
    }
    return calculateSuggestedCumulativeIncome(monthly, months);
  }, [monthlyIncome, monthsOfIncome]);

  const suggestedTotalAssetPosition = useMemo(() => {
    const capital = parseOptionalMoney(capitalRemaining);
    const cumulative = parseOptionalMoney(cumulativeIncome);
    if (
      capital === null ||
      cumulative === null ||
      Number.isNaN(capital) ||
      Number.isNaN(cumulative)
    ) {
      return null;
    }
    return calculateSuggestedTotalAssetPosition(capital, cumulative);
  }, [capitalRemaining, cumulativeIncome]);

  if (!isOpen) {
    return null;
  }

  function toggleStepId(id: string) {
    setSelectedStepIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );
  }

  function toggleExpenseId(id: string) {
    setSelectedExpenseIds((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id]
    );
  }

  function applySourceSuggestions() {
    if (!sourceSuggestion) {
      return;
    }

    if (sourceSuggestion.incomeThisYear !== null) {
      setIncomeThisPeriod(String(sourceSuggestion.incomeThisYear));
      setAnnualIncome(String(sourceSuggestion.incomeThisYear));
    }
    if (sourceSuggestion.cumulativeIncome !== null) {
      setCumulativeIncome(String(sourceSuggestion.cumulativeIncome));
    }
    if (sourceSuggestion.totalAssetPosition !== null) {
      setTotalAssetPosition(String(sourceSuggestion.totalAssetPosition));
    }
    if (sourceSuggestion.expensesThisYear !== null) {
      setExpensesThisYear(String(sourceSuggestion.expensesThisYear));
    }
    if (sourceSuggestion.cumulativeExpenses !== null) {
      setCumulativeExpenses(String(sourceSuggestion.cumulativeExpenses));
    }
    if (sourceSuggestion.netCashflowThisYear !== null) {
      setNetCashflowThisYear(String(sourceSuggestion.netCashflowThisYear));
    }
    if (sourceSuggestion.capitalReturnedThisYear !== null) {
      setCapitalReturnedThisYear(
        String(sourceSuggestion.capitalReturnedThisYear)
      );
    }
    if (sourceSuggestion.capitalReturnedToDate !== null) {
      setCapitalReturnedToDate(String(sourceSuggestion.capitalReturnedToDate));
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required');
      return;
    }

    if (yearValue === null) {
      setError(
        `Year must be an integer between ${STRATEGY_PROJECTION_YEAR_MIN} and ${STRATEGY_PROJECTION_YEAR_MAX}`
      );
      return;
    }

    const parsedMonthly = parseOptionalMoney(monthlyIncome);
    if (Number.isNaN(parsedMonthly)) {
      setError('Monthly income must be a non-negative number');
      return;
    }

    const parsedMonths = parseOptionalNonNegativeInt(monthsOfIncome);
    if (Number.isNaN(parsedMonths)) {
      setError('Months of income must be a non-negative whole number');
      return;
    }

    const parsedAnnual = parseOptionalMoney(annualIncome);
    if (Number.isNaN(parsedAnnual)) {
      setError('Annual income must be a non-negative number');
      return;
    }

    const parsedInvested = parseOptionalMoney(capitalInvested);
    if (Number.isNaN(parsedInvested)) {
      setError('Capital invested must be a non-negative number');
      return;
    }

    const parsedRemaining = parseOptionalMoney(capitalRemaining);
    if (Number.isNaN(parsedRemaining)) {
      setError('Capital remaining must be a non-negative number');
      return;
    }

    const parsedIncomePeriod = parseOptionalMoney(incomeThisPeriod);
    if (Number.isNaN(parsedIncomePeriod)) {
      setError('Income this period must be a non-negative number');
      return;
    }

    const parsedCumulative = parseOptionalMoney(cumulativeIncome);
    if (Number.isNaN(parsedCumulative)) {
      setError('Cumulative income must be a non-negative number');
      return;
    }

    const parsedTotalAssets = parseOptionalMoney(totalAssetPosition);
    if (Number.isNaN(parsedTotalAssets)) {
      setError('Total asset position must be a non-negative number');
      return;
    }

    const parsedExpensesThisYear = parseOptionalMoney(expensesThisYear);
    if (Number.isNaN(parsedExpensesThisYear)) {
      setError('Expenses this year must be a non-negative number');
      return;
    }

    const parsedCumulativeExpenses = parseOptionalMoney(cumulativeExpenses);
    if (Number.isNaN(parsedCumulativeExpenses)) {
      setError('Cumulative expenses must be a non-negative number');
      return;
    }

    const parsedNetCashflow = parseOptionalSignedMoney(netCashflowThisYear);
    if (Number.isNaN(parsedNetCashflow)) {
      setError('Net cashflow this year must be a number');
      return;
    }

    const parsedCapitalReturnedThisYear = parseOptionalMoney(
      capitalReturnedThisYear
    );
    if (Number.isNaN(parsedCapitalReturnedThisYear)) {
      setError('Capital returned this year must be a non-negative number');
      return;
    }

    const parsedCapitalReturnedToDate = parseOptionalMoney(
      capitalReturnedToDate
    );
    if (Number.isNaN(parsedCapitalReturnedToDate)) {
      setError('Capital returned to date must be a non-negative number');
      return;
    }

    const payload = {
      title: trimmedTitle,
      year: yearValue,
      type,
      stepId: stepId.trim() || null,
      monthlyIncome: parsedMonthly,
      monthsOfIncome: parsedMonths,
      annualIncome: parsedAnnual,
      capitalInvested: parsedInvested,
      capitalRemaining: parsedRemaining,
      incomeThisPeriod: parsedIncomePeriod,
      cumulativeIncome: parsedCumulative,
      totalAssetPosition: parsedTotalAssets,
      expensesThisYear: parsedExpensesThisYear,
      cumulativeExpenses: parsedCumulativeExpenses,
      netCashflowThisYear: parsedNetCashflow,
      capitalReturnedThisYear: parsedCapitalReturnedThisYear,
      capitalReturnedToDate: parsedCapitalReturnedToDate,
      selectedStepIds,
      selectedExpenseIds,
      notes: notes.trim() || null,
    };

    setIsSubmitting(true);

    try {
      const url = isEditing
        ? `/api/clients/${clientId}/strategy-plans/${planId}/projection-milestones/${milestone!.id}`
        : `/api/clients/${clientId}/strategy-plans/${planId}/projection-milestones`;

      const response = await authenticatedFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to save projection milestone'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save projection milestone'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldClassName =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 caret-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-xl max-h-[min(90dvh,48rem)] overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing
              ? 'Edit projection milestone'
              : 'Add projection milestone'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Choose a year, select contributing items, review suggestions, then
            apply only if you want those values.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="strategy-projection-title"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Title
              </label>
              <input
                id="strategy-projection-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={fieldClassName}
                required
                autoFocus
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="strategy-projection-year"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Year
                </label>
                <input
                  id="strategy-projection-year"
                  type="number"
                  step="1"
                  min={STRATEGY_PROJECTION_YEAR_MIN}
                  max={STRATEGY_PROJECTION_YEAR_MAX}
                  value={year}
                  onChange={(event) => setYear(event.target.value)}
                  className={fieldClassName}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="strategy-projection-type"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Milestone type
                </label>
                <select
                  id="strategy-projection-type"
                  value={type}
                  onChange={(event) => setType(event.target.value)}
                  className={fieldClassName}
                  required
                >
                  {STRATEGY_PROJECTION_MILESTONE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="rounded-lg border border-gray-200 px-3 py-3">
              <legend className="px-1 text-sm font-medium text-gray-800">
                Contributing investment items
              </legend>
              {steps.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No investment items on this plan yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {steps.map((step) => {
                    const invest =
                      formatCompactMoney(
                        step.investmentAmount ?? step.plannedAmount
                      ) ?? null;
                    const incomeAmount =
                      step.incomeAmount ?? step.expectedIncomeAmount;
                    const incomeFrequency =
                      step.incomeFrequency ?? step.expectedIncomeFrequency;
                    const incomeLabel =
                      incomeAmount != null
                        ? `${formatCompactMoney(incomeAmount) ?? '—'}${
                            formatFrequencyLabel(incomeFrequency)
                              ? ` ${formatFrequencyLabel(incomeFrequency)}`
                              : ''
                          }`
                        : null;
                    const timeline =
                      formatYearRange(
                        step.incomeStartYear ?? step.startYear,
                        step.incomeEndYear ?? step.endYear
                      ) ?? null;
                    const capitalLabel =
                      step.capitalReturnYear != null
                        ? `Capital return ${step.capitalReturnYear}`
                        : null;
                    const checked = selectedStepIds.includes(step.id);

                    return (
                      <li key={step.id}>
                        <label className="flex cursor-pointer gap-2.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:ring-blue-500"
                            checked={checked}
                            onChange={() => toggleStepId(step.id)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900">
                              {step.title}
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500">
                              {[
                                invest ? `Invest ${invest}` : null,
                                incomeLabel ? `Income ${incomeLabel}` : null,
                                timeline ? `Timeline ${timeline}` : null,
                                capitalLabel,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'No amounts entered yet'}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            <fieldset className="rounded-lg border border-gray-200 px-3 py-3">
              <legend className="px-1 text-sm font-medium text-gray-800">
                Contributing expenses
              </legend>
              {expenses.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No expenses on this plan yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {expenses.map((expense) => {
                    const amountLabel = formatCompactMoney(expense.amount);
                    const frequencyLabel = formatFrequencyLabel(
                      expense.frequency
                    );
                    const timeline = formatYearRange(
                      expense.startYear,
                      expense.endYear
                    );
                    const checked = selectedExpenseIds.includes(expense.id);

                    return (
                      <li key={expense.id}>
                        <label className="flex cursor-pointer gap-2.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 hover:bg-gray-50">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus-visible:ring-blue-500"
                            checked={checked}
                            onChange={() => toggleExpenseId(expense.id)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900">
                              {expense.title}
                            </span>
                            <span className="mt-0.5 block text-xs text-gray-500">
                              {[
                                amountLabel,
                                frequencyLabel,
                                timeline ? `Timeline ${timeline}` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'No amounts entered yet'}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </fieldset>

            <div
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    Suggested values from selected sources
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                    Suggestions are based on selected plans and expenses. Values
                    are illustrative and advisor-controlled.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={applySourceSuggestions}
                  disabled={!hasSourceSuggestion}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Use suggested values
                </button>
              </div>

              {yearValue === null ? (
                <p className="mt-3 text-sm text-slate-500">
                  Enter a valid milestone year to calculate suggestions.
                </p>
              ) : !hasSourceSuggestion ? (
                <p className="mt-3 text-sm text-slate-500">
                  Select one or more investment items or expenses to see
                  suggestions for {yearValue}.
                </p>
              ) : (
                <div className="mt-3 space-y-1.5">
                  <SuggestionRow
                    label="Income this year"
                    value={sourceSuggestion!.incomeThisYear}
                  />
                  <SuggestionRow
                    label="Expenses this year"
                    value={sourceSuggestion!.expensesThisYear}
                  />
                  <SuggestionRow
                    label="Net cashflow this year"
                    value={sourceSuggestion!.netCashflowThisYear}
                  />
                  <SuggestionRow
                    label="Cumulative income"
                    value={sourceSuggestion!.cumulativeIncome}
                  />
                  <SuggestionRow
                    label="Cumulative expenses"
                    value={sourceSuggestion!.cumulativeExpenses}
                  />
                  <SuggestionRow
                    label="Capital returned this year"
                    value={sourceSuggestion!.capitalReturnedThisYear}
                  />
                  <SuggestionRow
                    label="Capital returned to date"
                    value={sourceSuggestion!.capitalReturnedToDate}
                  />
                  <SuggestionRow
                    label="Illustrative total position"
                    value={sourceSuggestion!.totalAssetPosition}
                  />
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-lg border border-gray-200 px-3 py-3">
              <p className="text-sm font-medium text-gray-800">
                Milestone figures
              </p>
              <p className="text-xs text-gray-500">
                These fields save only what you enter or apply. Suggestions never
                overwrite them automatically.
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-projection-income-period"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Income this period / year
                  </label>
                  <input
                    id="strategy-projection-income-period"
                    type="number"
                    min="0"
                    step="0.01"
                    value={incomeThisPeriod}
                    onChange={(event) =>
                      setIncomeThisPeriod(event.target.value)
                    }
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="strategy-projection-expenses-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Expenses this year
                  </label>
                  <input
                    id="strategy-projection-expenses-year"
                    type="number"
                    min="0"
                    step="0.01"
                    value={expensesThisYear}
                    onChange={(event) =>
                      setExpensesThisYear(event.target.value)
                    }
                    className={fieldClassName}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-projection-net-cashflow"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Net cashflow this year
                  </label>
                  <input
                    id="strategy-projection-net-cashflow"
                    type="number"
                    step="0.01"
                    value={netCashflowThisYear}
                    onChange={(event) =>
                      setNetCashflowThisYear(event.target.value)
                    }
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="strategy-projection-cumulative"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Cumulative income
                  </label>
                  <input
                    id="strategy-projection-cumulative"
                    type="number"
                    min="0"
                    step="0.01"
                    value={cumulativeIncome}
                    onChange={(event) =>
                      setCumulativeIncome(event.target.value)
                    }
                    className={fieldClassName}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-projection-cumulative-expenses"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Cumulative expenses
                  </label>
                  <input
                    id="strategy-projection-cumulative-expenses"
                    type="number"
                    min="0"
                    step="0.01"
                    value={cumulativeExpenses}
                    onChange={(event) =>
                      setCumulativeExpenses(event.target.value)
                    }
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="strategy-projection-total-assets"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Illustrative total position
                  </label>
                  <input
                    id="strategy-projection-total-assets"
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalAssetPosition}
                    onChange={(event) =>
                      setTotalAssetPosition(event.target.value)
                    }
                    className={fieldClassName}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-projection-capital-returned-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Capital returned this year
                  </label>
                  <input
                    id="strategy-projection-capital-returned-year"
                    type="number"
                    min="0"
                    step="0.01"
                    value={capitalReturnedThisYear}
                    onChange={(event) =>
                      setCapitalReturnedThisYear(event.target.value)
                    }
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="strategy-projection-capital-returned-date"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Capital returned to date
                  </label>
                  <input
                    id="strategy-projection-capital-returned-date"
                    type="number"
                    min="0"
                    step="0.01"
                    value={capitalReturnedToDate}
                    onChange={(event) =>
                      setCapitalReturnedToDate(event.target.value)
                    }
                    className={fieldClassName}
                  />
                </div>
              </div>
            </div>

            <details className="group rounded-lg border border-gray-200 bg-gray-50/60 open:bg-white">
              <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-gray-800 marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-2">
                  <span>More details</span>
                  <span
                    aria-hidden="true"
                    className="text-xs font-normal text-gray-500 group-open:hidden"
                  >
                    Optional
                  </span>
                  <span
                    aria-hidden="true"
                    className="hidden text-xs font-normal text-gray-500 group-open:inline"
                  >
                    Hide
                  </span>
                </span>
              </summary>

              <div className="space-y-4 border-t border-gray-200 px-3 py-3">
                {steps.length > 0 ? (
                  <div>
                    <label
                      htmlFor="strategy-projection-step"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Primary linked item{' '}
                      <span className="font-normal text-gray-500">
                        (optional)
                      </span>
                    </label>
                    <select
                      id="strategy-projection-step"
                      value={stepId}
                      onChange={(event) => setStepId(event.target.value)}
                      className={`${fieldClassName} bg-white`}
                    >
                      <option value="">No primary link</option>
                      {steps.map((step) => (
                        <option key={step.id} value={step.id}>
                          {step.title}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="strategy-projection-monthly-income"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Monthly income
                    </label>
                    <input
                      id="strategy-projection-monthly-income"
                      type="number"
                      min="0"
                      step="0.01"
                      value={monthlyIncome}
                      onChange={(event) =>
                        setMonthlyIncome(event.target.value)
                      }
                      className={`${fieldClassName} bg-white`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="strategy-projection-months"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Months of income
                    </label>
                    <input
                      id="strategy-projection-months"
                      type="number"
                      min="0"
                      step="1"
                      value={monthsOfIncome}
                      onChange={(event) =>
                        setMonthsOfIncome(event.target.value)
                      }
                      className={`${fieldClassName} bg-white`}
                    />
                  </div>
                </div>

                {suggestedCumulativeIncome !== null ? (
                  <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                    Monthly × months suggestion:{' '}
                    <span className="font-semibold">
                      {formatSuggestionMoney(suggestedCumulativeIncome)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCumulativeIncome(String(suggestedCumulativeIncome))
                      }
                      className="ml-2 font-medium text-blue-700 underline hover:text-blue-900"
                    >
                      Use suggestion
                    </button>
                  </p>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="strategy-projection-annual"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Annual income
                    </label>
                    <input
                      id="strategy-projection-annual"
                      type="number"
                      min="0"
                      step="0.01"
                      value={annualIncome}
                      onChange={(event) => setAnnualIncome(event.target.value)}
                      className={`${fieldClassName} bg-white`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="strategy-projection-capital-invested"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Capital invested
                    </label>
                    <input
                      id="strategy-projection-capital-invested"
                      type="number"
                      min="0"
                      step="0.01"
                      value={capitalInvested}
                      onChange={(event) =>
                        setCapitalInvested(event.target.value)
                      }
                      className={`${fieldClassName} bg-white`}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="strategy-projection-capital-remaining"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Capital remaining
                  </label>
                  <input
                    id="strategy-projection-capital-remaining"
                    type="number"
                    min="0"
                    step="0.01"
                    value={capitalRemaining}
                    onChange={(event) =>
                      setCapitalRemaining(event.target.value)
                    }
                    className={`${fieldClassName} bg-white`}
                  />
                </div>

                {suggestedTotalAssetPosition !== null ? (
                  <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                    Capital remaining + cumulative income:{' '}
                    <span className="font-semibold">
                      {formatSuggestionMoney(suggestedTotalAssetPosition)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setTotalAssetPosition(
                          String(suggestedTotalAssetPosition)
                        )
                      }
                      className="ml-2 font-medium text-blue-700 underline hover:text-blue-900"
                    >
                      Use suggestion
                    </button>
                  </p>
                ) : null}

                <div>
                  <label
                    htmlFor="strategy-projection-notes"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Notes
                  </label>
                  <textarea
                    id="strategy-projection-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    className={`${fieldClassName} bg-white`}
                  />
                </div>
              </div>
            </details>

            {error ? (
              <p
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Saving…'
                  : isEditing
                    ? 'Save changes'
                    : 'Add milestone'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
