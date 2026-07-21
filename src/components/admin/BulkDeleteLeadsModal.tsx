'use client';

import { memo, useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type BulkDeleteMode = 'archive' | 'permanent';

type BulkDeleteLeadsModalProps = {
  clientIds: string[];
  open: boolean;
  onClose: () => void;
  onCompleted: (result: { mode: BulkDeleteMode; count: number }) => void;
};

function BulkDeleteLeadsModal({
  clientIds,
  open,
  onClose,
  onCompleted,
}: BulkDeleteLeadsModalProps) {
  const [mode, setMode] = useState<BulkDeleteMode>('archive');
  const [password, setPassword] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setMode('archive');
    setPassword('');
    setConfirmPhrase('');
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

  const selectedLabel = clientIds.length === 1 ? 'lead' : 'leads';
  const canArchive = clientIds.length > 0 && !isSubmitting;
  const canPermanentlyDelete =
    clientIds.length > 0 &&
    password.length > 0 &&
    confirmPhrase.trim() === 'DELETE' &&
    !isSubmitting;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (clientIds.length === 0) {
      setError('Select at least one lead');
      return;
    }

    if (mode === 'permanent' && !canPermanentlyDelete) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authenticatedFetch('/api/admin/leads/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientIds,
          mode,
          ...(mode === 'permanent'
            ? {
                password,
                confirmPhrase: confirmPhrase.trim(),
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to delete leads'
        );
      }

      const data = (await response.json()) as {
        mode?: BulkDeleteMode;
        count?: number;
      };
      const count = typeof data.count === 'number' ? data.count : clientIds.length;
      const completedMode = data.mode === 'permanent' ? 'permanent' : 'archive';

      onCompleted({ mode: completedMode, count });
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : 'Failed to delete leads'
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
          aria-labelledby="bulk-delete-leads-title"
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <h3 id="bulk-delete-leads-title" className="text-lg font-semibold text-gray-900">
            Delete leads
          </h3>
          <p className="mt-2 text-sm text-gray-700">
            Remove {clientIds.length} selected {selectedLabel} from the Lead Command Center.
          </p>

          <nav className="mt-5 flex gap-4 border-b border-gray-200" aria-label="Delete options">
            <button
              type="button"
              onClick={() => {
                setMode('archive');
                setError(null);
              }}
              className={`border-b-2 pb-2 text-sm font-medium transition-colors ${
                mode === 'archive'
                  ? 'border-amber-600 text-amber-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('permanent');
                setError(null);
              }}
              className={`border-b-2 pb-2 text-sm font-medium transition-colors ${
                mode === 'permanent'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Permanently delete
            </button>
          </nav>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {mode === 'archive' ? (
              <p className="text-sm text-gray-700">
                Archiving sets each lead&apos;s status to <strong>Archived</strong>. Their data
                remains in the system but they are removed from active pipeline views.
              </p>
            ) : (
              <>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-800">
                    This action cannot be undone.
                  </p>
                  <p className="mt-2 text-sm text-red-700">
                    Permanently deleting these leads will remove all associated deals, tasks,
                    documents, activity logs, and assignments from the database.
                  </p>
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  Type DELETE to confirm
                  <input
                    type="text"
                    value={confirmPhrase}
                    onChange={(event) => setConfirmPhrase(event.target.value)}
                    placeholder="DELETE"
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Enter your admin password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="current-password"
                  />
                </label>
              </>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mode === 'archive' ? !canArchive : !canPermanentlyDelete}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                  mode === 'archive'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isSubmitting
                  ? mode === 'archive'
                    ? 'Archiving...'
                    : 'Deleting...'
                  : mode === 'archive'
                    ? 'Archive leads'
                    : 'Permanently delete'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default memo(BulkDeleteLeadsModal);
