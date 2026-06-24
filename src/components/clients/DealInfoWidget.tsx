'use client';

import { memo, useMemo, useState } from 'react';
import DealEditModal from '@/components/clients/DealEditModal';
import {
  calculateCommittedValue,
  calculatePotentialValue,
} from '@/lib/dealCalculations';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

export type ClientDeal = {
  id: string;
  name: string;
  dealValue: number;
  totalCommission: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

type DealInfoWidgetProps = {
  clientId: string;
  deals: ClientDeal[];
  myClientCommissionPercentage?: number;
  canManage?: boolean;
  onMutationSuccess?: () => void;
};

function formatCommissionPercentage(share: number) {
  return `${Math.round(share * 100)}%`;
}

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusBadgeClass(status: string) {
  switch (status) {
    case 'WON':
      return 'bg-green-100 text-green-800';
    case 'PROPOSED':
      return 'bg-blue-100 text-blue-800';
    case 'LOST':
      return 'bg-red-100 text-red-800';
    case 'ON_HOLD':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function MetricField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

export default memo(function DealInfoWidget({
  clientId,
  deals,
  myClientCommissionPercentage = 0,
  canManage = false,
  onMutationSuccess,
}: DealInfoWidgetProps) {
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<ClientDeal | null>(null);
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);

  const committedValue = useMemo(
    () => calculateCommittedValue(deals),
    [deals]
  );
  const potentialValue = useMemo(
    () => calculatePotentialValue(deals),
    [deals]
  );

  function openCreateModal() {
    setEditingDeal(null);
    setModalOpen(true);
  }

  function openEditModal(deal: ClientDeal) {
    setEditingDeal(deal);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingDeal(null);
  }

  async function handleDeleteDeal(dealId: string) {
    if (!window.confirm('Delete this deal? This cannot be undone.')) {
      return;
    }

    setDeletingDealId(dealId);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/deals/${dealId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to delete deal'
        );
      }

      onMutationSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete deal');
    } finally {
      setDeletingDealId(null);
    }
  }

  function handleDealSaved() {
    setModalOpen(false);
    setEditingDeal(null);
    onMutationSuccess?.();
  }

  return (
    <>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-gray-900">Deal Info</h3>
          {canManage && (
            <button
              type="button"
              onClick={openCreateModal}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              + Add Deal
            </button>
          )}
        </div>

        <dl className="mb-5 grid gap-4 sm:grid-cols-2">
          <MetricField
            label="Committed Value"
            value={formatMoney(committedValue)}
          />
          <MetricField
            label="Potential Value"
            value={formatMoney(potentialValue)}
          />
        </dl>

        {myClientCommissionPercentage > 0 && (
          <p className="mb-5 text-sm text-gray-700">
            Your personal commission share for this client is:{' '}
            <span className="font-semibold text-gray-900">
              {formatCommissionPercentage(myClientCommissionPercentage)}
            </span>
          </p>
        )}

        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

        {deals.length === 0 ? (
          <p className="text-sm text-gray-500">No deals yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead>
                <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Value</th>
                  <th className="py-2 pr-3">Status</th>
                  {canManage && <th className="py-2 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {deals.map((deal) => (
                  <tr key={deal.id}>
                    <td className="py-3 pr-3 font-medium text-gray-900">
                      {deal.name}
                    </td>
                    <td className="py-3 pr-3 text-gray-700">
                      {formatMoney(deal.dealValue)}
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(deal.status)}`}
                      >
                        {formatStatusLabel(deal.status)}
                      </span>
                    </td>
                    {canManage && (
                      <td className="py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEditModal(deal)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDeal(deal.id)}
                            disabled={deletingDealId === deal.id}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                          >
                            {deletingDealId === deal.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <DealEditModal
          clientId={clientId}
          deal={editingDeal}
          isOpen
          onClose={closeModal}
          onSaved={handleDealSaved}
        />
      )}
    </>
  );
});
