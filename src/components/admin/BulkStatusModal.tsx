'use client';

import { memo, useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { CLIENT_STAGES } from '@/lib/clientStages';

type ClientStageValue = (typeof CLIENT_STAGES)[number]['value'];

type BulkStatusModalProps = {
  clientIds: string[];
  open: boolean;
  onClose: () => void;
  onSaved: (count: number) => void;
};

function BulkStatusModal({
  clientIds,
  open,
  onClose,
  onSaved,
}: BulkStatusModalProps) {
  const [status, setStatus] = useState<ClientStageValue>('CONTACTED');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setStatus('CONTACTED');
    setError(null);
    setIsSubmitting(false);
  }, [open, clientIds]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isSubmitting, onClose]);

  if (!open) {
    return null;
  }

  const selectedLabel = clientIds.length === 1 ? 'client' : 'clients';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (clientIds.length === 0) {
      setError('Select at least one lead');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authenticatedFetch('/api/admin/leads/bulk-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientIds,
          status,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to update status'
        );
      }

      const data = (await response.json()) as { count?: number };
      const count = typeof data.count === 'number' ? data.count : clientIds.length;

      onSaved(count);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to update status'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-status-title"
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <h3 id="bulk-status-title" className="text-lg font-semibold text-gray-900">
            Change status
          </h3>
          <p className="mt-2 text-sm text-gray-700">
            Change status for {clientIds.length} selected {selectedLabel}.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="bulk-status-select"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                New status
              </label>
              <select
                id="bulk-status-select"
                value={status}
                onChange={(event) => setStatus(event.target.value as ClientStageValue)}
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:opacity-60 bg-white placeholder:text-gray-500 caret-gray-900"
              >
                {CLIENT_STAGES.map((stage) => (
                  <option key={stage.value} value={stage.value}>
                    {stage.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default memo(BulkStatusModal);
