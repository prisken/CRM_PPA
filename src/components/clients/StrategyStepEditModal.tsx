'use client';

import {
  StrategyIncomeFrequency,
  StrategyStepType,
} from '@prisma/client';
import { useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import {
  getStrategyStepAnnualIncome,
  getStrategyStepIllustrativeTotalPosition,
  getStrategyStepTotalIncome,
  type StrategyTimelineStepInput,
} from '@/lib/clientStrategyTimelineCalculations';
import { displayMoney, formatMoneyRequired } from '@/lib/formatMoney';

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
  startYear: number | null;
  endYear: number | null;
  investmentAmount: number | null;
  incomeAmount: number | null;
  incomeFrequency: string | null;
  incomeStartYear: number | null;
  incomeEndYear: number | null;
  capitalReturned: number | null;
  capitalReturnYear: number | null;
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
  const amount = formatMoneyRequired(deal.dealValue, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });

  return `${deal.name} · ${amount} · ${deal.status.replace(/_/g, ' ')}`;
}

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

function PreviewRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium tabular-nums text-gray-900">{value}</span>
    </div>
  );
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

  const initialInvestmentAmount =
    step?.investmentAmount ?? step?.plannedAmount ?? null;
  const initialIncomeAmount =
    step?.incomeAmount ?? step?.expectedIncomeAmount ?? null;
  const initialIncomeFrequency =
    step?.incomeFrequency ?? step?.expectedIncomeFrequency ?? '';

  const [title, setTitle] = useState(step?.title ?? '');
  const [stepType, setStepType] = useState<string>(
    step?.stepType ?? StrategyStepType.MANUAL
  );
  const [linkedDealId, setLinkedDealId] = useState(step?.linkedDealId ?? '');
  const [investmentAmount, setInvestmentAmount] = useState(
    numberToInput(initialInvestmentAmount)
  );
  const [startYear, setStartYear] = useState(numberToInput(step?.startYear));
  const [endYear, setEndYear] = useState(numberToInput(step?.endYear));
  const [incomeAmount, setIncomeAmount] = useState(
    numberToInput(initialIncomeAmount)
  );
  const [incomeFrequency, setIncomeFrequency] = useState(
    initialIncomeFrequency
  );
  const [incomeStartYear, setIncomeStartYear] = useState(
    numberToInput(step?.incomeStartYear)
  );
  const [incomeEndYear, setIncomeEndYear] = useState(
    numberToInput(step?.incomeEndYear)
  );
  const [capitalReturned, setCapitalReturned] = useState(
    numberToInput(step?.capitalReturned)
  );
  const [capitalReturnYear, setCapitalReturnYear] = useState(
    numberToInput(step?.capitalReturnYear)
  );
  const [plannedAmount, setPlannedAmount] = useState(
    numberToInput(step?.plannedAmount)
  );
  const [amountDescription, setAmountDescription] = useState(
    step?.amountDescription ?? ''
  );
  const [purpose, setPurpose] = useState(step?.purpose ?? '');
  const [expectedAchievement, setExpectedAchievement] = useState(
    step?.expectedAchievement ?? ''
  );
  const [expectedIncomeAmount, setExpectedIncomeAmount] = useState(
    numberToInput(step?.expectedIncomeAmount)
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

  const timelinePreviewInput = useMemo((): StrategyTimelineStepInput => {
    const parsedInvestment = parseOptionalNumber(investmentAmount);
    const parsedIncome = parseOptionalNumber(incomeAmount);
    const parsedIncomeStart = parseOptionalYear(incomeStartYear);
    const parsedIncomeEnd = parseOptionalYear(incomeEndYear);
    const parsedCapitalReturned = parseOptionalNumber(capitalReturned);
    const parsedCapitalReturnYear = parseOptionalYear(capitalReturnYear);

    return {
      investmentAmount: Number.isNaN(parsedInvestment)
        ? null
        : parsedInvestment,
      incomeAmount: Number.isNaN(parsedIncome) ? null : parsedIncome,
      incomeFrequency: incomeFrequency || null,
      incomeStartYear: Number.isNaN(parsedIncomeStart)
        ? null
        : parsedIncomeStart,
      incomeEndYear: Number.isNaN(parsedIncomeEnd) ? null : parsedIncomeEnd,
      capitalReturned: Number.isNaN(parsedCapitalReturned)
        ? null
        : parsedCapitalReturned,
      capitalReturnYear: Number.isNaN(parsedCapitalReturnYear)
        ? null
        : parsedCapitalReturnYear,
    };
  }, [
    investmentAmount,
    incomeAmount,
    incomeFrequency,
    incomeStartYear,
    incomeEndYear,
    capitalReturned,
    capitalReturnYear,
  ]);

  const annualIncome = useMemo(
    () => getStrategyStepAnnualIncome(timelinePreviewInput),
    [timelinePreviewInput]
  );
  const totalIncome = useMemo(
    () => getStrategyStepTotalIncome(timelinePreviewInput),
    [timelinePreviewInput]
  );
  const illustrativeTotal = useMemo(
    () => getStrategyStepIllustrativeTotalPosition(timelinePreviewInput),
    [timelinePreviewInput]
  );
  const previewCapitalReturned = useMemo(() => {
    const value = timelinePreviewInput.capitalReturned;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }, [timelinePreviewInput]);

  const hasPreviewFigures =
    annualIncome !== null ||
    totalIncome !== null ||
    previewCapitalReturned !== null ||
    illustrativeTotal !== null;

  if (!isOpen) {
    return null;
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

    if (!investmentAmount.trim()) {
      setInvestmentAmount(String(deal.dealValue));
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
      setError('Title is required');
      setIsSubmitting(false);
      return;
    }

    if (
      stepType === StrategyStepType.EXISTING_DEAL &&
      !linkedDealId.trim()
    ) {
      setError('Choose a linked deal when the item type is Existing deal');
      setIsSubmitting(false);
      return;
    }

    const parsedInvestmentAmount = parseOptionalNumber(investmentAmount);
    if (Number.isNaN(parsedInvestmentAmount)) {
      setError('Investment amount must be a non-negative number');
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

    const parsedIncomeAmount = parseOptionalNumber(incomeAmount);
    if (Number.isNaN(parsedIncomeAmount)) {
      setError('Income amount must be a non-negative number');
      setIsSubmitting(false);
      return;
    }

    const parsedIncomeStartYear = parseOptionalYear(incomeStartYear);
    if (Number.isNaN(parsedIncomeStartYear)) {
      setError('Income start year must be a whole number');
      setIsSubmitting(false);
      return;
    }

    const parsedIncomeEndYear = parseOptionalYear(incomeEndYear);
    if (Number.isNaN(parsedIncomeEndYear)) {
      setError('Income end year must be a whole number');
      setIsSubmitting(false);
      return;
    }

    const parsedCapitalReturned = parseOptionalNumber(capitalReturned);
    if (Number.isNaN(parsedCapitalReturned)) {
      setError('Capital returned must be a non-negative number');
      setIsSubmitting(false);
      return;
    }

    const parsedCapitalReturnYear = parseOptionalYear(capitalReturnYear);
    if (Number.isNaN(parsedCapitalReturnYear)) {
      setError('Capital return year must be a whole number');
      setIsSubmitting(false);
      return;
    }

    const parsedPlannedAmount = parseOptionalNumber(plannedAmount);
    if (Number.isNaN(parsedPlannedAmount)) {
      setError('Planned amount must be a non-negative number');
      setIsSubmitting(false);
      return;
    }

    const parsedExpectedIncomeAmount = parseOptionalNumber(expectedIncomeAmount);
    if (Number.isNaN(parsedExpectedIncomeAmount)) {
      setError('Legacy expected income amount must be a non-negative number');
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

    // Keep legacy fields populated when advanced inputs are blank so older
    // board/list surfaces that still read plannedAmount / expectedIncome*
    // continue to work for new investment items.
    const resolvedPlannedAmount =
      parsedPlannedAmount ?? parsedInvestmentAmount;
    const resolvedExpectedIncomeAmount =
      parsedExpectedIncomeAmount ?? parsedIncomeAmount;
    const resolvedExpectedIncomeFrequency =
      expectedIncomeFrequency || incomeFrequency || null;

    const payload = {
      title: trimmedTitle,
      stepType,
      linkedDealId: linkedDealId.trim() || null,
      investmentAmount: parsedInvestmentAmount,
      startYear: parsedStartYear,
      endYear: parsedEndYear,
      incomeAmount: parsedIncomeAmount,
      incomeFrequency: incomeFrequency || null,
      incomeStartYear: parsedIncomeStartYear,
      incomeEndYear: parsedIncomeEndYear,
      capitalReturned: parsedCapitalReturned,
      capitalReturnYear: parsedCapitalReturnYear,
      plannedAmount: resolvedPlannedAmount,
      amountDescription: amountDescription.trim() || null,
      purpose: purpose.trim() || null,
      expectedAchievement: expectedAchievement.trim() || null,
      expectedIncomeAmount: resolvedExpectedIncomeAmount,
      expectedIncomeFrequency: resolvedExpectedIncomeFrequency,
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
            : 'Failed to save investment item'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save investment item'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldClassName =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg max-h-[min(90dvh,44rem)] overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit investment item' : 'Add investment item'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Enter the amount invested, income timing, and capital returned.
            Suggested totals update as you type.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-4">
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
                  placeholder="e.g. Bond ladder · Year 1"
                  className={fieldClassName}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="strategy-step-deal"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Linked deal{' '}
                  <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <select
                  id="strategy-step-deal"
                  value={linkedDealId}
                  onChange={(event) => handleDealChange(event.target.value)}
                  className={fieldClassName}
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
                    Selected: {selectedDeal.name}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="strategy-step-investment-amount"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Investment amount
                </label>
                <input
                  id="strategy-step-investment-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={investmentAmount}
                  onChange={(event) => setInvestmentAmount(event.target.value)}
                  placeholder="0.00"
                  className={fieldClassName}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-step-start-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Start year
                  </label>
                  <input
                    id="strategy-step-start-year"
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
                    htmlFor="strategy-step-end-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    End year
                  </label>
                  <input
                    id="strategy-step-end-year"
                    type="number"
                    step="1"
                    value={endYear}
                    onChange={(event) => setEndYear(event.target.value)}
                    placeholder="e.g. 2030"
                    className={fieldClassName}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-step-income-amount"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Income amount
                  </label>
                  <input
                    id="strategy-step-income-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={incomeAmount}
                    onChange={(event) => setIncomeAmount(event.target.value)}
                    placeholder="0.00"
                    className={fieldClassName}
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
                    value={incomeFrequency}
                    onChange={(event) => setIncomeFrequency(event.target.value)}
                    className={fieldClassName}
                  >
                    <option value="">Select frequency</option>
                    {INCOME_FREQUENCIES.map((option) => (
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
                    htmlFor="strategy-step-income-start-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Income start year
                  </label>
                  <input
                    id="strategy-step-income-start-year"
                    type="number"
                    step="1"
                    value={incomeStartYear}
                    onChange={(event) => setIncomeStartYear(event.target.value)}
                    placeholder="e.g. 2026"
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="strategy-step-income-end-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Income end year
                  </label>
                  <input
                    id="strategy-step-income-end-year"
                    type="number"
                    step="1"
                    value={incomeEndYear}
                    onChange={(event) => setIncomeEndYear(event.target.value)}
                    placeholder="e.g. 2030"
                    className={fieldClassName}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="strategy-step-capital-returned"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Capital returned
                  </label>
                  <input
                    id="strategy-step-capital-returned"
                    type="number"
                    min="0"
                    step="0.01"
                    value={capitalReturned}
                    onChange={(event) => setCapitalReturned(event.target.value)}
                    placeholder="0.00"
                    className={fieldClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="strategy-step-capital-return-year"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Capital return year
                  </label>
                  <input
                    id="strategy-step-capital-return-year"
                    type="number"
                    step="1"
                    value={capitalReturnYear}
                    onChange={(event) =>
                      setCapitalReturnYear(event.target.value)
                    }
                    placeholder="e.g. 2030"
                    className={fieldClassName}
                  />
                </div>
              </div>
            </div>

            <div
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3"
              aria-live="polite"
            >
              <p className="text-sm font-medium text-slate-800">
                Suggested calculation
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Suggested calculation based on the values above. For planning
                purposes only.
              </p>
              {hasPreviewFigures ? (
                <div className="mt-3 space-y-1.5">
                  <PreviewRow
                    label="Annual income"
                    value={displayMoney(annualIncome)}
                  />
                  <PreviewRow
                    label="Total income over period"
                    value={displayMoney(totalIncome)}
                  />
                  <PreviewRow
                    label="Capital returned"
                    value={displayMoney(previewCapitalReturned)}
                  />
                  <PreviewRow
                    label="Illustrative total position"
                    value={displayMoney(illustrativeTotal)}
                  />
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  Add income amount, frequency, and years to see suggested
                  totals here.
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
                <div>
                  <label
                    htmlFor="strategy-step-type"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Item type
                  </label>
                  <select
                    id="strategy-step-type"
                    value={stepType}
                    onChange={(event) => setStepType(event.target.value)}
                    className={`${fieldClassName} bg-white`}
                  >
                    {STEP_TYPES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="strategy-step-planned-amount"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Planned amount{' '}
                      <span className="font-normal text-gray-500">
                        (legacy)
                      </span>
                    </label>
                    <input
                      id="strategy-step-planned-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={plannedAmount}
                      onChange={(event) => setPlannedAmount(event.target.value)}
                      className={`${fieldClassName} bg-white`}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Kept for older plans. Defaults to investment amount when
                      blank.
                    </p>
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
                      className={`${fieldClassName} bg-white`}
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
                    onChange={(event) =>
                      setAmountDescription(event.target.value)
                    }
                    className={`${fieldClassName} bg-white`}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="strategy-step-expected-income-amount"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Expected income{' '}
                      <span className="font-normal text-gray-500">
                        (legacy)
                      </span>
                    </label>
                    <input
                      id="strategy-step-expected-income-amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={expectedIncomeAmount}
                      onChange={(event) =>
                        setExpectedIncomeAmount(event.target.value)
                      }
                      className={`${fieldClassName} bg-white`}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="strategy-step-expected-income-frequency"
                      className="mb-1 block text-sm font-medium text-gray-700"
                    >
                      Expected income frequency{' '}
                      <span className="font-normal text-gray-500">
                        (legacy)
                      </span>
                    </label>
                    <select
                      id="strategy-step-expected-income-frequency"
                      value={expectedIncomeFrequency}
                      onChange={(event) =>
                        setExpectedIncomeFrequency(event.target.value)
                      }
                      className={`${fieldClassName} bg-white`}
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
                    className={`${fieldClassName} bg-white`}
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
                    onChange={(event) =>
                      setExpectedAchievement(event.target.value)
                    }
                    rows={2}
                    className={`${fieldClassName} bg-white`}
                  />
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
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Saving…'
                  : isEditing
                    ? 'Save changes'
                    : 'Add investment item'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
