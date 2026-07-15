'use client';

import { useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type StrategyPlanDeleteModalProps = {
  isOpen: boolean;
  clientId: string;
  planId: string;
  planTitle: string;
  onClose: () => void;
  onArchived: () => void;
  onDeleted: () => void;
};

type Mode = 'archive' | 'delete';

/**
 * Archive (default) or permanently delete a strategy plan.
 * Hard delete cascades steps, connections, and expenses.
 */
export default function StrategyPlanDeleteModal({
  isOpen,
  clientId,
  planId,
  planTitle,
  onClose,
  onArchived,
  onDeleted,
}: StrategyPlanDeleteModalProps) {
  const formKey = isOpen ? planId : 'closed';

  return (
    <StrategyPlanDeleteModalForm
      key={formKey}
      isOpen={isOpen}
      clientId={clientId}
      planId={planId}
      planTitle={planTitle}
      onClose={onClose}
      onArchived={onArchived}
      onDeleted={onDeleted}
    />
  );
}

function StrategyPlanDeleteModalForm({
  isOpen,
  clientId,
  planId,
  planTitle,
  onClose,
  onArchived,
  onDeleted,
}: StrategyPlanDeleteModalProps) {
  const [mode, setMode] = useState<Mode>('archive');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) {
    return null;
  }

  async function handleConfirm() {
    setIsSubmitting(true);
    setError(null);

    try {
      const url =
        mode === 'delete'
          ? `/api/clients/${clientId}/strategy-plans/${planId}?hard=true`
          : `/api/clients/${clientId}/strategy-plans/${planId}`;

      const response = await authenticatedFetch(url, { method: 'DELETE' });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : mode === 'delete'
              ? 'Failed to delete strategy plan'
              : 'Failed to archive strategy plan'
        );
      }

      if (mode === 'delete') {
        onDeleted();
      } else {
        onArchived();
      }
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === 'delete'
            ? 'Failed to delete strategy plan'
            : 'Failed to archive strategy plan'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg max-h-[min(90dvh,40rem)] overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            Remove Strategy Plan
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Choose how to remove{' '}
            <span className="font-medium text-gray-900">{planTitle}</span>.
          </p>

          <nav
            className="mt-5 flex gap-4 border-b border-gray-200"
            aria-label="Strategy plan removal options"
          >
            <button
              type="button"
              onClick={() => {
                setMode('archive');
                setError(null);
              }}
              className={`border-b-2 pb-2 text-sm font-medium transition-colors ${
                mode === 'archive'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('delete');
                setError(null);
              }}
              className={`border-b-2 pb-2 text-sm font-medium transition-colors ${
                mode === 'delete'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Permanently Delete
            </button>
          </nav>

          <div className="mt-5 space-y-3 text-sm text-gray-600">
            {mode === 'archive' ? (
              <>
                <p>
                  Archiving marks this plan as <span className="font-medium">Archived</span>.
                  Steps, connections, and expenses are kept and can still be reviewed.
                </p>
                <ul className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-900">
                  <li>• The plan disappears from the active strategy list.</li>
                  <li>• Related steps, connections, and expenses are not deleted.</li>
                </ul>
              </>
            ) : (
              <>
                <p>
                  Permanently deleting removes this plan and{' '}
                  <span className="font-medium text-red-700">
                    all of its steps, connections, and expenses
                  </span>
                  . This cannot be undone.
                </p>
                <ul className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-red-800">
                  <li>• All strategy steps will be deleted.</li>
                  <li>• All deal connections will be deleted.</li>
                  <li>• All expense coverage rows will be deleted.</li>
                </ul>
              </>
            )}
          </div>

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleConfirm()}
              disabled={isSubmitting}
              className={
                mode === 'delete'
                  ? 'rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60'
                  : 'rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60'
              }
            >
              {isSubmitting
                ? 'Working…'
                : mode === 'delete'
                  ? 'Permanently delete'
                  : 'Archive plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
