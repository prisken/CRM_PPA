'use client';

import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type ClientDeletionModalProps = {
  isOpen: boolean;
  clientId: string;
  clientName: string;
  onClose: () => void;
  onArchived: () => void;
  onDeleted: () => void;
};

type TabId = 'archive' | 'delete';

export default function ClientDeletionModal({
  isOpen,
  clientId,
  clientName,
  onClose,
  onArchived,
  onDeleted,
}: ClientDeletionModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>('archive');
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab('archive');
    setConfirmName('');
    setPassword('');
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, clientId]);

  const nameMatches = confirmName.trim() === clientName;
  const canArchive = nameMatches && !isSubmitting;
  const canDelete = nameMatches && password.length > 0 && !isSubmitting;

  async function handleArchive() {
    if (!canArchive) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: confirmName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to archive client'
        );
      }

      onArchived();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive client');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePermanentDelete() {
    if (!canDelete) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          confirmName: confirmName.trim(),
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to permanently delete client'
        );
      }

      onDeleted();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to permanently delete client'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg rounded-xl bg-white p-4 shadow-xl sm:p-6">
          <h3 className="text-lg font-semibold text-gray-900">Archive Client</h3>
          <p className="mt-2 text-sm text-gray-600">
            Manage the lifecycle of <span className="font-medium">{clientName}</span>.
          </p>

          <nav className="mt-5 flex gap-4 border-b border-gray-200" aria-label="Deletion options">
            <button
              type="button"
              onClick={() => {
                setActiveTab('archive');
                setError(null);
              }}
              className={`border-b-2 pb-2 text-sm font-medium transition-colors ${
                activeTab === 'archive'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('delete');
                setError(null);
              }}
              className={`border-b-2 pb-2 text-sm font-medium transition-colors ${
                activeTab === 'delete'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Permanently Delete
            </button>
          </nav>

          <div className="mt-5 space-y-4">
            {activeTab === 'archive' ? (
              <>
                <p className="text-sm text-gray-700">
                  Archiving sets the client status to <strong>Archived</strong>. Their
                  data remains in the system but they are removed from active pipeline
                  views.
                </p>
                <label className="block text-sm font-medium text-gray-700">
                  Type the client name to confirm
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(event) => setConfirmName(event.target.value)}
                    placeholder={clientName}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="off"
                  />
                </label>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                  <p className="text-sm font-semibold text-red-800">
                    This action cannot be undone.
                  </p>
                  <p className="mt-2 text-sm text-red-700">
                    Permanently deleting this client will remove all associated deals,
                    tasks, documents, activity logs, and assignments from the database.
                  </p>
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  Type the client name to confirm
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(event) => setConfirmName(event.target.value)}
                    placeholder={clientName}
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
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>
            {activeTab === 'archive' ? (
              <button
                type="button"
                onClick={handleArchive}
                disabled={!canArchive}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Archiving...' : 'Archive Client'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePermanentDelete}
                disabled={!canDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
