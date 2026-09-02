'use client';

import {
  StrategyExpenseCategory,
  StrategyExpenseFrequency,
  StrategyExpensePriority,
} from '@prisma/client';
import { useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import {
  getStrategyExpenseAnnualAmount,
  getStrategyExpenseTotal,
  type StrategyTimelineExpenseInput,
} from '@/lib/clientStrategyTimelineCalculations';
import { displayMoney } from '@/lib/formatMoney';

const EXPENSE_CATEGORIES = [
  { value: StrategyExpenseCategory.HOUSING, label: 'Housing' },
  { value: StrategyExpenseCategory.EDUCATION, label: 'Education' },
  { value: StrategyExpenseCategory.HEALTHCARE, label: 'Healthcare' },
  { value: StrategyExpenseCategory.INSURANCE, label: 'Insurance' },
  { value: StrategyExpenseCategory.RETIREMENT, label: 'Retirement' },
  { value: StrategyExpenseCategory.LIFESTYLE, label: 'Lifestyle' },
  { value: StrategyExpenseCategory.BUSINESS, label: 'Business' },
  { value: StrategyExpenseCategory.DEBT, label: 'Debt' },
  { value: StrategyExpenseCategory.FAMILY_SUPPORT, label: 'Family support' },
  { value: StrategyExpenseCategory.EMERGENCY, label: 'Emergency' },
  { value: StrategyExpenseCategory.OTHER, label: 'Other' },
] as const;

const EXPENSE_FREQUENCIES = [
  { value: StrategyExpenseFrequency.MONTHLY, label: 'Monthly' },
  { value: StrategyExpenseFrequency.YEARLY, label: 'Yearly' },
  { value: StrategyExpenseFrequency.ONE_TIME, label: 'One time' },
  { value: StrategyExpenseFrequency.CUSTOM, label: 'Custom' },
] as const;

const EXPENSE_PRIORITIES = [
  { value: StrategyExpensePriority.LOW, label: 'Low' },
  { value: StrategyExpensePriority.MEDIUM, label: 'Medium' },
  { value: StrategyExpensePriority.HIGH, label: 'High' },
  { value: StrategyExpensePriority.CRITICAL, label: 'Critical' },
] as const;

export type StrategyExpenseStepOption = {
  id: string;
  title: string;
};

export type StrategyExpenseEditValues = {
  id: string;
  title: string;
  category: string;
  amount: number | null;
  frequency: string;
  startTimelineLabel: string | null;
  endTimelineLabel: string | null;
  startYear: number | null;
  endYear: number | null;
  priority: string;
  purpose: string | null;
  coveredByStepId: string | null;
  notes: string | null;
  sortOrder: number;
};

type StrategyExpenseEditModalProps = {
  clientId: string;
  planId: string;
  steps: StrategyExpenseStepOption[];
  expense?: StrategyExpenseEditValues | null;
  /** Prefill Covered by investment item when creating (ignored when editing). */
  defaultCoveredByStepId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function numberToInput(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

function parseOptionalNumber(value: string): number | null {
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

function parseOptionalYear(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue) || !Number.isInteger(numericValue)) {
    return Number.NaN;
  }

  return numericValue;
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

export default function StrategyExpenseEditModal({
  clientId,
  planId,
  steps,
  expense = null,
  defaultCoveredByStepId = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyExpenseEditModalProps) {
  const formKey = isOpen
    ? (expense?.id ??
      (defaultCoveredByStepId
        ? `new-covered-by-${defaultCoveredByStepId}`
        : 'new'))
    : 'closed';

  return (
    <StrategyExpenseEditModalForm
      key={formKey}
      clientId={clientId}
      planId={planId}
      steps={steps}
      expense={expense}
      defaultCoveredByStepId={defaultCoveredByStepId}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function StrategyExpenseEditModalForm({
  clientId,
  planId,
  steps,
  expense,
  defaultCoveredByStepId = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyExpenseEditModalProps) {
  const isEditing = expense !== null;
  const [title, setTitle] = useState(expense?.title ?? '');
  const [category, setCategory] = useState(
    expense?.category ?? StrategyExpenseCategory.OTHER
  );
  const [amount, setAmount] = useState(numberToInput(expense?.amount));
  const [frequency, setFrequency] = useState(
    expense?.frequency ?? StrategyExpenseFrequency.MONTHLY
  );
  const [startYear, setStartYear] = useState(numberToInput(expense?.startYear));
  const [endYear, setEndYear] = useState(numberToInput(expense?.endYear));
  const [startTimelineLabel, setStartTimelineLabel] = useState(
    expense?.startTimelineLabel ?? ''
  );
  const [endTimelineLabel, setEndTimelineLabel] = useState(
    expense?.endTimelineLabel ?? ''
  );
  const [priority, setPriority] = useState(
    expense?.priority ?? StrategyExpensePriority.MEDIUM
  );
  const [purpose, setPurpose] = useState(expense?.purpose ?? '');
  const [coveredByStepId, setCoveredByStepId] = useState(
    expense?.coveredByStepId ?? defaultCoveredByStepId ?? ''
  );
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [sortOrder, setSortOrder] = useState(
    expense?.sortOrder !== undefined ? String(expense.sortOrder) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timelinePreviewInput = useMemo((): StrategyTimelineExpenseInput => {
    const parsedAmount = parseOptionalNumber(amount);
    const parsedStartYear = parseOptionalYear(startYear);
    const parsedEndYear = parseOptionalYear(endYear);

    return {
      amount: Number.isNaN(parsedAmount) ? null : parsedAmount,
      frequency,
      startYear: Number.isNaN(parsedStartYear) ? null : parsedStartYear,
      endYear: Number.isNaN(parsedEndYear) ? null : parsedEndYear,
    };
  }, [amount, frequency, startYear, endYear]);

  const expensePerYear = useMemo(() => {
    if (frequency === StrategyExpenseFrequency.ONE_TIME) {
      const parsedAmount = parseOptionalNumber(amount);
      if (
        parsedAmount === null ||
        Number.isNaN(parsedAmount) ||
        !startYear.trim()
      ) {
        return null;
      }
      return parsedAmount;
    }

    return getStrategyExpenseAnnualAmount(timelinePreviewInput);
  }, [amount, frequency, startYear, timelinePreviewInput]);

  const totalExpense = useMemo(
    () => getStrategyExpenseTotal(timelinePreviewInput),
    [timelinePreviewInput]
  );

  const timelineRangeLabel = useMemo(() => {
    const parsedStart = parseOptionalYear(startYear);
    const parsedEnd = parseOptionalYear(endYear);
    if (
      parsedStart === null ||
      Number.isNaN(parsedStart) ||
      parsedEnd === null ||
      Number.isNaN(parsedEnd)
    ) {
      return null;
    }
    if (parsedStart === parsedEnd) {
      return `Applies in ${parsedStart}`;
    }
    return `Applies from ${parsedStart} to ${parsedEnd}`;
  }, [startYear, endYear]);

  const hasPreviewFigures =
    expensePerYear !== null || totalExpense !== null || timelineRangeLabel !== null;

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Expense name is required');
      setIsSubmitting(false);
      return;
    }

    const parsedAmount = parseOptionalNumber(amount);
    if (Number.isNaN(parsedAmount)) {
      setError('Amount must be a non-negative number');
      setIsSubmitting(false);
      return;
    }

    const parsedStartYear = parseOptionalYear(startYear);
    if (Number.isNaN(parsedStartYear)) {
      setError('Start year must be a whole number');
      setIsSubmitting(false);
      return;
    }

    const parsedEndYear = parseOptionalYear(endYear);
    if (Number.isNaN(parsedEndYear)) {
      setError('End year must be a whole number');
      setIsSubmitting(false);
      return;
    }

    let parsedSortOrder: number | undefined;
    if (sortOrder.trim()) {
      const numericSort = Number(sortOrder);
      if (!Number.isInteger(numericSort)) {
        setError('Sort order must be a whole number');
        setIsSubmitting(false);
        return;
      }
      parsedSortOrder = numericSort;
    }

    const payload = {
      title: trimmedTitle,
      category,
      amount: parsedAmount,
      frequency,
      startYear: parsedStartYear,
      endYear: parsedEndYear,
      startTimelineLabel: startTimelineLabel.trim() || null,
      endTimelineLabel: endTimelineLabel.trim() || null,
      priority,
      purpose: purpose.trim() || null,
      coveredByStepId: coveredByStepId.trim() || null,
      notes: notes.trim() || null,
      ...(parsedSortOrder !== undefined ? { sortOrder: parsedSortOrder } : {}),
    };

    try {
      const url = isEditing
        ? `/api/clients/${clientId}/strategy-plans/${planId}/expenses/${expense!.id}`
        : `/api/clients/${clientId}/strategy-plans/${planId}/expenses`;

      const response = await authenticatedFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to save expense'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldClassName =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 caret-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg max-h-[min(90dvh,44rem)] overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit expense' : 'Add expense'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Track what the client pays over time — including premiums linked to
            an investment item.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="strategy-expense-title"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Expense name
                </label>
                <input
                  id="strategy-expense-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Annual premium"
                  className={fieldClassName}
                  required
                  autoFocus
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-expense-amount"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Amount
                  </label>
                  <input
                    id="strategy-expense-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0.00"
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="strategy-expense-frequency"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Frequency
                  </label>
                  <select
                    id="strategy-expense-frequency"
                    value={frequency}
                    onChange={(event) => setFrequency(event.target.value)}
                    className={fieldClassName}
                  >
                    {EXPENSE_FREQUENCIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-expense-start-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Start year
                  </label>
                  <input
                    id="strategy-expense-start-year"
                    type="number"
                    step="1"
                    value={startYear}
                    onChange={(event) => setStartYear(event.target.value)}
                    placeholder="e.g. 2026"
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="strategy-expense-end-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    End year
                  </label>
                  <input
                    id="strategy-expense-end-year"
                    type="number"
                    step="1"
                    value={endYear}
                    onChange={(event) => setEndYear(event.target.value)}
                    placeholder="e.g. 2030"
                    className={fieldClassName}
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="strategy-expense-covered-by"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Covered by investment item{' '}
                  <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <select
                  id="strategy-expense-covered-by"
                  value={coveredByStepId}
                  onChange={(event) => setCoveredByStepId(event.target.value)}
                  className={fieldClassName}
                >
                  <option value="">Not linked yet</option>
                  {steps.map((step) => (
                    <option key={step.id} value={step.id}>
                      {step.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
              aria-live="polite"
            >
              <p className="text-sm font-medium text-slate-800">
                Suggested total
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Suggested total based on amount, frequency, and timeline.
              </p>
              {hasPreviewFigures ? (
                <div className="mt-3 space-y-1.5">
                  <PreviewRow
                    label={
                      frequency === StrategyExpenseFrequency.ONE_TIME
                        ? 'Expense in start year'
                        : 'Expense per year'
                    }
                    value={displayMoney(expensePerYear)}
                  />
                  <PreviewRow
                    label="Total over timeline"
                    value={displayMoney(totalExpense)}
                  />
                  <PreviewRow
                    label="Timeline"
                    value={timelineRangeLabel ?? '—'}
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Add an amount, frequency, and start/end years to see the
                  suggested total here.
                </p>
              )}
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
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="strategy-expense-category"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Category
                    </label>
                    <select
                      id="strategy-expense-category"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                      className={`${fieldClassName} bg-white`}
                    >
                      {EXPENSE_CATEGORIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="strategy-expense-priority"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Priority
                    </label>
                    <select
                      id="strategy-expense-priority"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                      className={`${fieldClassName} bg-white`}
                    >
                      {EXPENSE_PRIORITIES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="strategy-expense-start-label"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Start timeline label
                    </label>
                    <input
                      id="strategy-expense-start-label"
                      type="text"
                      value={startTimelineLabel}
                      onChange={(event) =>
                        setStartTimelineLabel(event.target.value)
                      }
                      placeholder="e.g. Year 1"
                      className={`${fieldClassName} bg-white`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="strategy-expense-end-label"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      End timeline label
                    </label>
                    <input
                      id="strategy-expense-end-label"
                      type="text"
                      value={endTimelineLabel}
                      onChange={(event) =>
                        setEndTimelineLabel(event.target.value)
                      }
                      placeholder="e.g. Year 5"
                      className={`${fieldClassName} bg-white`}
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="strategy-expense-purpose"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Purpose
                  </label>
                  <textarea
                    id="strategy-expense-purpose"
                    value={purpose}
                    onChange={(event) => setPurpose(event.target.value)}
                    rows={2}
                    className={`${fieldClassName} bg-white`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="strategy-expense-notes"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Notes
                  </label>
                  <textarea
                    id="strategy-expense-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={2}
                    className={`${fieldClassName} bg-white`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="strategy-expense-sort-order"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Sort order
                  </label>
                  <input
                    id="strategy-expense-sort-order"
                    type="number"
                    step="1"
                    value={sortOrder}
                    onChange={(event) => setSortOrder(event.target.value)}
                    placeholder="Auto"
                    className={`${fieldClassName} bg-white`}
                  />
                </div>
              </div>
            </details>

            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Saving…'
                  : isEditing
                    ? 'Save changes'
                    : 'Add expense'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
