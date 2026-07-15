'use client';

import {
  StrategyExpenseCategory,
  StrategyExpenseFrequency,
  StrategyExpensePriority,
} from '@prisma/client';
import { useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

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
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

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

export default function StrategyExpenseEditModal({
  clientId,
  planId,
  steps,
  expense = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyExpenseEditModalProps) {
  const formKey = isOpen ? (expense?.id ?? 'new') : 'closed';

  return (
    <StrategyExpenseEditModalForm
      key={formKey}
      clientId={clientId}
      planId={planId}
      steps={steps}
      expense={expense}
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
  isOpen,
  onClose,
  onSaved,
}: StrategyExpenseEditModalProps) {
  const isEditing = expense !== null;
  const [title, setTitle] = useState(expense?.title ?? '');
  const [category, setCategory] = useState(
    expense?.category ?? StrategyExpenseCategory.OTHER
  );
  const [amount, setAmount] = useState(
    expense?.amount !== null && expense?.amount !== undefined
      ? String(expense.amount)
      : ''
  );
  const [frequency, setFrequency] = useState(
    expense?.frequency ?? StrategyExpenseFrequency.MONTHLY
  );
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
    expense?.coveredByStepId ?? ''
  );
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [sortOrder, setSortOrder] = useState(
    expense?.sortOrder !== undefined ? String(expense.sortOrder) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('title is required');
      setIsSubmitting(false);
      return;
    }

    const parsedAmount = parseOptionalNumber(amount);
    if (Number.isNaN(parsedAmount)) {
      setError('amount must be a non-negative number');
      setIsSubmitting(false);
      return;
    }

    let parsedSortOrder: number | undefined;
    if (sortOrder.trim()) {
      const numericSort = Number(sortOrder);
      if (!Number.isInteger(numericSort)) {
        setError('sortOrder must be an integer');
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
            : 'Failed to save strategy expense'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save strategy expense'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Expense' : 'Add Expense'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Track a client expense and optionally link it to a covering strategy
            step.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="strategy-expense-title"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Title
              </label>
              <input
                id="strategy-expense-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>

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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                  htmlFor="strategy-expense-start"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Start timeline
                </label>
                <input
                  id="strategy-expense-start"
                  type="text"
                  value={startTimelineLabel}
                  onChange={(event) => setStartTimelineLabel(event.target.value)}
                  placeholder="e.g. Year 1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="strategy-expense-end"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  End timeline
                </label>
                <input
                  id="strategy-expense-end"
                  type="text"
                  value={endTimelineLabel}
                  onChange={(event) => setEndTimelineLabel(event.target.value)}
                  placeholder="e.g. Year 5"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="strategy-expense-covered-by"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Covered by step (optional)
              </label>
              <select
                id="strategy-expense-covered-by"
                value={coveredByStepId}
                onChange={(event) => setCoveredByStepId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Not covered yet</option>
                {steps.map((step) => (
                  <option key={step.id} value={step.id}>
                    {step.title}
                  </option>
                ))}
              </select>
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
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
