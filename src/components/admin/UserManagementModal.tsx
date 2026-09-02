'use client';

import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type UserManagementModalProps = {
  isOpen: boolean;
  userId: string;
  userName: string;
  initialTab: 'deactivate' | 'delete';
  onClose: () => void;
  onDeactivated: () => void;
  onDeleted: () => void;
};

type TabId = 'deactivate' | 'delete';

export default function UserManagementModal({
  isOpen,
  userId,
  userName,
  initialTab,
  onClose,
  onDeactivated,
  onDeleted,
}: UserManagementModalProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveTab(initialTab);
    setConfirmName('');
    setPassword('');
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, userId, initialTab]);

  const nameMatches = confirmName.trim() === userName;
  const canDeactivate = nameMatches && !isSubmitting;
  const canDelete = nameMatches && password.length > 0 && !isSubmitting;

  async function handleDeactivate() {
    if (!canDeactivate) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/users/${userId}/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmName: confirmName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to deactivate user'
        );
      }

      onDeactivated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user');
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
      const res = await authenticatedFetch(`/api/users/${userId}`, {
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
            : 'Failed to permanently delete user'
        );
      }

      onDeleted();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to permanently delete user'
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
          <h3 className="text-lg font-semibold text-gray-900">Manage User</h3>
          <p className="mt-2 text-sm text-gray-600">
            Manage the account for <span className="font-medium">{userName}</span>.
          </p>

          <nav className="mt-5 flex gap-4 border-b border-gray-200" aria-label="User management options">
            <button
              type="button"
              onClick={() => {
                setActiveTab('deactivate');
                setError(null);
              }}
              className={`border-b-2 pb-2 text-sm font-medium transition-colors ${
                activeTab === 'deactivate'
                  ? 'border-amber-600 text-amber-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Deactivate
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
            {activeTab === 'deactivate' ? (
              <>
                <p className="text-sm text-gray-700">
                  Deactivating sets the user&apos;s status to{' '}
                  <strong>Deactivated</strong>. They will no longer be able to sign
                  in, but their historical data remains in the system.
                </p>
                <label className="block text-sm font-medium text-gray-700">
                  Type the user&apos;s name to confirm
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(event) => setConfirmName(event.target.value)}
                    placeholder={userName}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
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
                    Permanently deleting this user will remove their account from
                    Supabase Auth and delete their profile from the database.
                    Assignments, interactions, and notifications linked to them will
                    also be removed.
                  </p>
                </div>
                <label className="block text-sm font-medium text-gray-700">
                  Type the user&apos;s name to confirm
                  <input
                    type="text"
                    value={confirmName}
                    onChange={(event) => setConfirmName(event.target.value)}
                    placeholder={userName}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-sm font-medium text-gray-700">
                  Enter your admin password
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
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
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-60"
            >
              Cancel
            </button>
            {activeTab === 'deactivate' ? (
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={!canDeactivate}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 active:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Deactivating...' : 'Deactivate User'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePermanentDelete}
                disabled={!canDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
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
