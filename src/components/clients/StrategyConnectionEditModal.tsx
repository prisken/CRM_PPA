'use client';

import { StrategyConnectionType } from '@prisma/client';
import { useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

const CONNECTION_TYPES = [
  { value: StrategyConnectionType.FUNDING_SOURCE, label: 'Funding source' },
  { value: StrategyConnectionType.INTEREST_REDIRECT, label: 'Interest redirect' },
  { value: StrategyConnectionType.INCOME_REDIRECT, label: 'Income redirect' },
  { value: StrategyConnectionType.CAPITAL_GROWTH, label: 'Capital growth' },
  {
    value: StrategyConnectionType.PROTECTION_SUPPORT,
    label: 'Protection support',
  },
  { value: StrategyConnectionType.TAX_PLANNING, label: 'Tax planning' },
  { value: StrategyConnectionType.RISK_MANAGEMENT, label: 'Risk management' },
  { value: StrategyConnectionType.MANUAL, label: 'Manual' },
] as const;

export type StrategyConnectionStepOption = {
  id: string;
  title: string;
};

export type StrategyConnectionEditValues = {
  id: string;
  fromStepId: string;
  toStepId: string;
  connectionType: string;
  purpose: string | null;
  expectedOutcome: string | null;
  timing: string | null;
};

type StrategyConnectionEditModalProps = {
  clientId: string;
  planId: string;
  steps: StrategyConnectionStepOption[];
  connection?: StrategyConnectionEditValues | null;
  /** Prefill From step when creating (ignored when editing). */
  defaultFromStepId?: string | null;
  /** Prefill To step when creating (ignored when editing). */
  defaultToStepId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function StrategyConnectionEditModal({
  clientId,
  planId,
  steps,
  connection = null,
  defaultFromStepId = null,
  defaultToStepId = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyConnectionEditModalProps) {
  const formKey = isOpen
    ? (connection?.id ??
      (defaultFromStepId || defaultToStepId
        ? `new-${defaultFromStepId ?? ''}-${defaultToStepId ?? ''}`
        : 'new'))
    : 'closed';

  return (
    <StrategyConnectionEditModalForm
      key={formKey}
      clientId={clientId}
      planId={planId}
      steps={steps}
      connection={connection}
      defaultFromStepId={defaultFromStepId}
      defaultToStepId={defaultToStepId}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function StrategyConnectionEditModalForm({
  clientId,
  planId,
  steps,
  connection,
  defaultFromStepId = null,
  defaultToStepId = null,
  isOpen,
  onClose,
  onSaved,
}: StrategyConnectionEditModalProps) {
  const isEditing = connection !== null;
  const [fromStepId, setFromStepId] = useState(
    connection?.fromStepId ?? defaultFromStepId ?? ''
  );
  const [toStepId, setToStepId] = useState(
    connection?.toStepId ?? defaultToStepId ?? ''
  );
  const [connectionType, setConnectionType] = useState(
    connection?.connectionType ?? StrategyConnectionType.MANUAL
  );
  const [purpose, setPurpose] = useState(connection?.purpose ?? '');
  const [expectedOutcome, setExpectedOutcome] = useState(
    connection?.expectedOutcome ?? ''
  );
  const [timing, setTiming] = useState(connection?.timing ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!fromStepId) {
      setError('fromStepId is required');
      setIsSubmitting(false);
      return;
    }

    if (!toStepId) {
      setError('toStepId is required');
      setIsSubmitting(false);
      return;
    }

    if (fromStepId === toStepId) {
      setError('fromStepId cannot equal toStepId');
      setIsSubmitting(false);
      return;
    }

    const payload = {
      fromStepId,
      toStepId,
      connectionType,
      purpose: purpose.trim() || null,
      expectedOutcome: expectedOutcome.trim() || null,
      timing: timing.trim() || null,
    };

    try {
      const url = isEditing
        ? `/api/clients/${clientId}/strategy-plans/${planId}/connections/${connection!.id}`
        : `/api/clients/${clientId}/strategy-plans/${planId}/connections`;

      const response = await authenticatedFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to save strategy connection'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save strategy connection'
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
            {isEditing ? 'Edit Connection' : 'Add Connection'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Link two strategy steps to show how capital, income, or protection
            flows.
          </p>

          {steps.length < 2 ? (
            <p className="mt-4 text-sm text-amber-700">
              Add at least two strategy steps before creating a connection.
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="strategy-connection-from"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                From step
              </label>
              <select
                id="strategy-connection-from"
                value={fromStepId}
                onChange={(event) => setFromStepId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Select a step…</option>
                {steps.map((step) => (
                  <option
                    key={step.id}
                    value={step.id}
                    disabled={step.id === toStepId}
                  >
                    {step.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="strategy-connection-to"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                To step
              </label>
              <select
                id="strategy-connection-to"
                value={toStepId}
                onChange={(event) => setToStepId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              >
                <option value="">Select a step…</option>
                {steps.map((step) => (
                  <option
                    key={step.id}
                    value={step.id}
                    disabled={step.id === fromStepId}
                  >
                    {step.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="strategy-connection-type"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Connection type
              </label>
              <select
                id="strategy-connection-type"
                value={connectionType}
                onChange={(event) => setConnectionType(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {CONNECTION_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="strategy-connection-purpose"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Purpose
              </label>
              <textarea
                id="strategy-connection-purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="strategy-connection-outcome"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Expected outcome
              </label>
              <textarea
                id="strategy-connection-outcome"
                value={expectedOutcome}
                onChange={(event) => setExpectedOutcome(event.target.value)}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label
                htmlFor="strategy-connection-timing"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Timing
              </label>
              <input
                id="strategy-connection-timing"
                type="text"
                value={timing}
                onChange={(event) => setTiming(event.target.value)}
                placeholder="e.g. After year 1"
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
                disabled={isSubmitting || steps.length < 2}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting
                  ? 'Saving…'
                  : isEditing
                    ? 'Save changes'
                    : 'Add connection'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
