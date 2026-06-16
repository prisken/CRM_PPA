'use client';

import { useEffect, useState } from 'react';
import type { ClientDeal } from '@/components/clients/DealInfoWidget';

const DEAL_STATUSES = [
  { value: 'PROPOSED', label: 'Proposed' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
  { value: 'ON_HOLD', label: 'On Hold' },
] as const;

type DealEditModalProps = {
  clientId: string;
  deal?: ClientDeal | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
};

export default function DealEditModal({
  clientId,
  deal = null,
  isOpen,
  onClose,
  onSaved,
}: DealEditModalProps) {
  const formKey = isOpen ? (deal?.id ?? 'new') : 'closed';

  return (
    <DealEditModalForm
      key={formKey}
      clientId={clientId}
      deal={deal}
      isOpen={isOpen}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function DealEditModalForm({
  clientId,
  deal,
  isOpen,
  onClose,
  onSaved,
}: DealEditModalProps) {
  const isEditing = deal !== null;
  const [name, setName] = useState(deal?.name ?? '');
  const [dealValue, setDealValue] = useState(
    deal !== null && deal !== undefined ? String(deal.dealValue) : ''
  );
  const [totalCommission, setTotalCommission] = useState(
    deal !== null && deal !== undefined ? String(deal.totalCommission) : ''
  );
  const [status, setStatus] = useState(deal?.status ?? 'PROPOSED');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setName(deal?.name ?? '');
    setDealValue(deal !== null && deal !== undefined ? String(deal.dealValue) : '');
    setTotalCommission(
      deal !== null && deal !== undefined ? String(deal.totalCommission) : ''
    );
    setStatus(deal?.status ?? 'PROPOSED');
    setError(null);
  }, [isOpen, deal]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const payload = {
      name: name.trim(),
      dealValue: Number(dealValue),
      totalCommission: Number(totalCommission),
      status,
    };

    try {
      const url = isEditing
        ? `/api/clients/${clientId}/deals/${deal!.id}`
        : `/api/clients/${clientId}/deals`;
      const res = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to save deal'
        );
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save deal');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Deal' : 'Add Deal'}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {isEditing
              ? 'Update deal details and status.'
              : 'Create a new deal for this client.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="deal-name"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Name
              </label>
              <input
                id="deal-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="e.g. Annual retainer"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="deal-value"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Deal Value
                </label>
                <input
                  id="deal-value"
                  type="number"
                  min={0}
                  step="0.01"
                  value={dealValue}
                  onChange={(event) => setDealValue(event.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="deal-total-commission"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Total Commission
                </label>
                <input
                  id="deal-total-commission"
                  type="number"
                  min={0}
                  step="0.01"
                  value={totalCommission}
                  onChange={(event) => setTotalCommission(event.target.value)}
                  required
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="deal-status"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Status
              </label>
              <select
                id="deal-status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {DEAL_STATUSES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

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
                {isSubmitting ? 'Saving...' : isEditing ? 'Save Deal' : 'Add Deal'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
