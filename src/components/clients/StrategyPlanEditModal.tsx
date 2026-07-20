'use client';

import { StrategyPlanStatus } from '@prisma/client';
import { useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

const PLAN_STATUSES = [
  { value: StrategyPlanStatus.DRAFT, label: 'Draft' },
  { value: StrategyPlanStatus.ACTIVE, label: 'Active' },
  { value: StrategyPlanStatus.COMPLETED, label: 'Completed' },
  { value: StrategyPlanStatus.ARCHIVED, label: 'Archived' },
] as const;

export type StrategyPlanEditValues = {
  id: string;
  title: string;
  description: string | null;
  clientGoal: string | null;
  expectedOutcome: string | null;
  status: string;
};

type StrategyPlanEditModalProps = {
  clientId: string;
  plan?: StrategyPlanEditValues | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function StrategyPlanEditModal({
  clientId,
  plan = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyPlanEditModalProps) {
  const formKey = isOpen ? (plan?.id ?? 'new') : 'closed';

  return (
    <StrategyPlanEditModalForm
      key={formKey}
      clientId={clientId}
      plan={plan}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function StrategyPlanEditModalForm({
  clientId,
  plan,
  isOpen,
  onClose,
  onSaved,
}: StrategyPlanEditModalProps) {
  const isEditing = plan !== null;
  const [title, setTitle] = useState(plan?.title ?? '');
  const [clientGoal, setClientGoal] = useState(plan?.clientGoal ?? '');
  const [expectedOutcome, setExpectedOutcome] = useState(
    plan?.expectedOutcome ?? ''
  );
  const [description, setDescription] = useState(plan?.description ?? '');
  const [status, setStatus] = useState<string>(
    plan?.status ?? StrategyPlanStatus.DRAFT
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
      setError('Plan title is required');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      title: trimmedTitle,
      clientGoal: clientGoal.trim() || null,
      expectedOutcome: expectedOutcome.trim() || null,
      description: description.trim() || null,
      status,
    };

    try {
      const url = isEditing
        ? `/api/clients/${clientId}/strategy-plans/${plan!.id}`
        : `/api/clients/${clientId}/strategy-plans`;

      const response = await authenticatedFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to save strategy plan'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to save strategy plan'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg max-h-[min(90dvh,40rem)] overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit strategy plan' : 'New strategy plan'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {isEditing
              ? 'Update the plan name and client goal. Extra details are optional.'
              : 'Give the plan a name and client goal to get started.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="strategy-plan-title"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Plan title
                </label>
                <input
                  id="strategy-plan-title"
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Retirement income plan"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="strategy-plan-goal"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Client goal
                </label>
                <textarea
                  id="strategy-plan-goal"
                  value={clientGoal}
                  onChange={(event) => setClientGoal(event.target.value)}
                  rows={2}
                  placeholder="What does the client want to achieve?"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-gray-500">
                  Start with the client goal. You can add investments, expenses,
                  and projections after saving the plan.
                </p>
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
                <div>
                  <label
                    htmlFor="strategy-plan-description"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Description
                  </label>
                  <textarea
                    id="strategy-plan-description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={3}
                    placeholder="Optional notes about this plan"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="strategy-plan-outcome"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Expected outcome
                  </label>
                  <textarea
                    id="strategy-plan-outcome"
                    value={expectedOutcome}
                    onChange={(event) => setExpectedOutcome(event.target.value)}
                    rows={2}
                    placeholder="What success looks like for the client"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="strategy-plan-status"
                    className="mb-1 block text-sm font-medium text-gray-700"
                  >
                    Status
                  </label>
                  <select
                    id="strategy-plan-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  >
                    {PLAN_STATUSES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500">
                    New plans default to Draft until you are ready to mark them
                    Active.
                  </p>
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
                    : 'Create plan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
