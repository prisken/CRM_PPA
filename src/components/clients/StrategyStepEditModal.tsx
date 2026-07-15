'use client';

import {
  StrategyIncomeFrequency,
  StrategyStepType,
} from '@prisma/client';
import { useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

const STEP_TYPES = [
  { value: StrategyStepType.EXISTING_DEAL, label: 'Existing deal' },
  { value: StrategyStepType.PLANNED_DEAL, label: 'Planned deal' },
  { value: StrategyStepType.MANUAL, label: 'Manual' },
] as const;

const INCOME_FREQUENCIES = [
  { value: StrategyIncomeFrequency.MONTHLY, label: 'Monthly' },
  { value: StrategyIncomeFrequency.YEARLY, label: 'Yearly' },
  { value: StrategyIncomeFrequency.ONE_TIME, label: 'One time' },
  { value: StrategyIncomeFrequency.CUSTOM, label: 'Custom' },
] as const;

type ClientDealOption = {
  id: string;
  name: string;
  dealValue: number;
  totalCommission: number;
  status: string;
};

export type StrategyStepEditValues = {
  id: string;
  title: string;
  stepType: string;
  linkedDealId: string | null;
  plannedAmount: number | null;
  amountDescription: string | null;
  purpose: string | null;
  expectedAchievement: string | null;
  expectedIncomeAmount: number | null;
  expectedIncomeFrequency: string | null;
  timelineLabel: string | null;
  sortOrder: number;
};

type StrategyStepEditModalProps = {
  clientId: string;
  planId: string;
  step?: StrategyStepEditValues | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function formatDealOptionLabel(deal: ClientDealOption) {
  const amount = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(deal.dealValue);

  return `${deal.name} · ${amount} · ${deal.status.replace(/_/g, ' ')}`;
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

export default function StrategyStepEditModal({
  clientId,
  planId,
  step = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyStepEditModalProps) {
  const formKey = isOpen ? (step?.id ?? 'new') : 'closed';

  return (
    <StrategyStepEditModalForm
      key={formKey}
      clientId={clientId}
      planId={planId}
      step={step}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function StrategyStepEditModalForm({
  clientId,
  planId,
  step,
  isOpen,
  onClose,
  onSaved,
}: StrategyStepEditModalProps) {
  const isEditing = step !== null;
  const [title, setTitle] = useState(step?.title ?? '');
  const [stepType, setStepType] = useState<string>(
    step?.stepType ?? StrategyStepType.MANUAL
  );
  const [linkedDealId, setLinkedDealId] = useState(step?.linkedDealId ?? '');
  const [plannedAmount, setPlannedAmount] = useState(
    step?.plannedAmount !== null && step?.plannedAmount !== undefined
      ? String(step.plannedAmount)
      : ''
  );
  const [amountDescription, setAmountDescription] = useState(
    step?.amountDescription ?? ''
  );
  const [purpose, setPurpose] = useState(step?.purpose ?? '');
  const [expectedAchievement, setExpectedAchievement] = useState(
    step?.expectedAchievement ?? ''
  );
  const [expectedIncomeAmount, setExpectedIncomeAmount] = useState(
    step?.expectedIncomeAmount !== null &&
      step?.expectedIncomeAmount !== undefined
      ? String(step.expectedIncomeAmount)
      : ''
  );
  const [expectedIncomeFrequency, setExpectedIncomeFrequency] = useState(
    step?.expectedIncomeFrequency ?? ''
  );
  const [timelineLabel, setTimelineLabel] = useState(step?.timelineLabel ?? '');
  const [sortOrder, setSortOrder] = useState(
    step?.sortOrder !== undefined ? String(step.sortOrder) : ''
  );
  const [deals, setDeals] = useState<ClientDealOption[]>([]);
  const [dealsError, setDealsError] = useState<string | null>(null);
  const [isLoadingDeals, setIsLoadingDeals] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    async function loadDeals() {
      setIsLoadingDeals(true);
      setDealsError(null);

      try {
        const response = await authenticatedFetch(
          `/api/clients/${clientId}/deals`
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body.error === 'string'
              ? body.error
              : 'Failed to load client deals'
          );
        }

        const body = (await response.json()) as {
          deals?: ClientDealOption[];
        };

        if (!cancelled) {
          setDeals(body.deals ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setDeals([]);
          setDealsError(
            err instanceof Error ? err.message : 'Failed to load client deals'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDeals(false);
        }
      }
    }

    void loadDeals();

    return () => {
      cancelled = true;
    };
  }, [clientId, isOpen]);

  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.id === linkedDealId) ?? null,
    [deals, linkedDealId]
  );

  if (!isOpen) {
    return null;
  }

  function handleStepTypeChange(nextType: string) {
    setStepType(nextType);
  }

  function handleDealChange(dealId: string) {
    setLinkedDealId(dealId);

    if (!dealId) {
      return;
    }

    const deal = deals.find((entry) => entry.id === dealId);
    if (!deal) {
      return;
    }

    if (stepType === StrategyStepType.MANUAL) {
      setStepType(StrategyStepType.EXISTING_DEAL);
    }

    if (!title.trim()) {
      setTitle(deal.name);
    }

    if (!plannedAmount.trim()) {
      setPlannedAmount(String(deal.dealValue));
    }
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

    if (
      stepType === StrategyStepType.EXISTING_DEAL &&
      !linkedDealId.trim()
    ) {
      setError('linkedDealId is required when stepType is EXISTING_DEAL');
      setIsSubmitting(false);
      return;
    }

    const parsedPlannedAmount = parseOptionalNumber(plannedAmount);
    if (Number.isNaN(parsedPlannedAmount)) {
      setError('plannedAmount must be a non-negative number');
      setIsSubmitting(false);
      return;
    }

    const parsedIncomeAmount = parseOptionalNumber(expectedIncomeAmount);
    if (Number.isNaN(parsedIncomeAmount)) {
      setError('expectedIncomeAmount must be a non-negative number');
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
      stepType,
      linkedDealId: linkedDealId.trim() || null,
      plannedAmount: parsedPlannedAmount,
      amountDescription: amountDescription.trim() || null,
      purpose: purpose.trim() || null,
      expectedAchievement: expectedAchievement.trim() || null,
      expectedIncomeAmount: parsedIncomeAmount,
      expectedIncomeFrequency: expectedIncomeFrequency || null,
      timelineLabel: timelineLabel.trim() || null,
      ...(parsedSortOrder !== undefined ? { sortOrder: parsedSortOrder } : {}),
    };

    try {
      const url = isEditing
        ? `/api/clients/${clientId}/strategy-plans/${planId}/steps/${step!.id}`
        : `/api/clients/${clientId}/strategy-plans/${planId}/steps`;

      const response = await authenticatedFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to save strategy step'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save strategy step'
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
            {isEditing ? 'Edit Strategy Step' : 'Add Strategy Step'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Link an existing deal or define a planned/manual step for this
            strategy.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="strategy-step-title"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Title
              </label>
              <input
                id="strategy-step-title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label
                htmlFor="strategy-step-type"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Step type
              </label>
              <select
                id="strategy-step-type"
                value={stepType}
                onChange={(event) => handleStepTypeChange(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {STEP_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="strategy-step-deal"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Linked deal
                {stepType === StrategyStepType.EXISTING_DEAL
                  ? ' (required)'
                  : ' (optional)'}
              </label>
              <select
                id="strategy-step-deal"
                value={linkedDealId}
                onChange={(event) => handleDealChange(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                disabled={isLoadingDeals}
              >
                <option value="">
                  {isLoadingDeals ? 'Loading deals…' : 'No linked deal'}
                </option>
                {deals.map((deal) => (
                  <option key={deal.id} value={deal.id}>
                    {formatDealOptionLabel(deal)}
                  </option>
                ))}
              </select>
              {dealsError ? (
                <p className="mt-1 text-xs text-amber-700">{dealsError}</p>
              ) : null}
              {selectedDeal ? (
                <p className="mt-1 text-xs text-gray-500">
                  Selected: {selectedDeal.name} ·{' '}
                  {new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: 'USD',
                  }).format(selectedDeal.dealValue)}
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="strategy-step-planned-amount"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Planned amount
                </label>
                <input
                  id="strategy-step-planned-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={plannedAmount}
                  onChange={(event) => setPlannedAmount(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="strategy-step-sort-order"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Sort order
                </label>
                <input
                  id="strategy-step-sort-order"
                  type="number"
                  step="1"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value)}
                  placeholder="Auto"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="strategy-step-amount-description"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Amount description
              </label>
              <input
                id="strategy-step-amount-description"
                type="text"
                value={amountDescription}
                onChange={(event) => setAmountDescription(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="strategy-step-purpose"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Purpose
              </label>
              <textarea
                id="strategy-step-purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="strategy-step-achievement"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Expected achievement
              </label>
              <textarea
                id="strategy-step-achievement"
                value={expectedAchievement}
                onChange={(event) => setExpectedAchievement(event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="strategy-step-income-amount"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Expected income amount
                </label>
                <input
                  id="strategy-step-income-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={expectedIncomeAmount}
                  onChange={(event) =>
                    setExpectedIncomeAmount(event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label
                  htmlFor="strategy-step-income-frequency"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Income frequency
                </label>
                <select
                  id="strategy-step-income-frequency"
                  value={expectedIncomeFrequency}
                  onChange={(event) =>
                    setExpectedIncomeFrequency(event.target.value)
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {INCOME_FREQUENCIES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="strategy-step-timeline"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Timeline label
              </label>
              <input
                id="strategy-step-timeline"
                type="text"
                value={timelineLabel}
                onChange={(event) => setTimelineLabel(event.target.value)}
                placeholder="e.g. Year 1 · Q3"
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
                    : 'Add step'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
