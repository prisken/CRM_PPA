'use client';

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type AdminUserOption = {
  user_id: string;
  userName: string;
  email: string;
  role: string;
  status: string;
};

export type BulkAssignRelationshipResult = {
  assignedCount: number;
  skipped: { clientId: string; reason: string }[];
};

type BulkAssignRelationshipModalProps = {
  clientIds: string[];
  open: boolean;
  onClose: () => void;
  onCompleted: (result: BulkAssignRelationshipResult) => void;
};

function BulkAssignRelationshipModal({
  clientIds,
  open,
  onClose,
  onCompleted,
}: BulkAssignRelationshipModalProps) {
  const [users, setUsers] = useState<AdminUserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkAssignRelationshipResult | null>(null);

  const activeUsers = useMemo(
    () =>
      users
        .filter((user) => user.status === 'ACTIVE')
        .sort((left, right) => left.userName.localeCompare(right.userName)),
    [users]
  );

  const handleDone = useCallback(() => {
    if (!result) {
      onClose();
      return;
    }

    onCompleted(result);
    onClose();
  }, [onClose, onCompleted, result]);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedUserId('');
    setError(null);
    setUsersError(null);
    setIsSubmitting(false);
    setResult(null);
  }, [open, clientIds]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadUsers() {
      setUsersLoading(true);
      setUsersError(null);

      try {
        const response = await authenticatedFetch('/api/admin/users');
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string' ? data.error : 'Failed to load users'
          );
        }

        const data = (await response.json()) as AdminUserOption[];
        if (!cancelled) {
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setUsers([]);
          setUsersError(
            loadError instanceof Error ? loadError.message : 'Failed to load users'
          );
        }
      } finally {
        if (!cancelled) {
          setUsersLoading(false);
        }
      }
    }

    void loadUsers();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        if (result) {
          handleDone();
        } else {
          onClose();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDone, isSubmitting, onClose, open, result]);

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

    if (!selectedUserId) {
      setError('Select a relationship owner');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authenticatedFetch(
        '/api/admin/leads/bulk-assign-relationship',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientIds,
            userId: selectedUserId,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to assign relationship owner'
        );
      }

      const data = (await response.json()) as {
        assignedCount?: number;
        skipped?: { clientId: string; reason: string }[];
      };

      setResult({
        assignedCount:
          typeof data.assignedCount === 'number' ? data.assignedCount : 0,
        skipped: Array.isArray(data.skipped) ? data.skipped : [],
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to assign relationship owner'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    const skippedCount = result.skipped.length;

    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
        <div className="flex min-h-full items-center justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-assign-relationship-summary-title"
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
          >
            <h3
              id="bulk-assign-relationship-summary-title"
              className="text-lg font-semibold text-gray-900"
            >
              Assignment complete
            </h3>
            <p className="mt-2 text-sm text-gray-700">
              Assigned relationship owner to {result.assignedCount} selected lead
              {result.assignedCount === 1 ? '' : 's'}.
            </p>

            {skippedCount > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">
                  {skippedCount} skipped
                </p>
                <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto text-sm text-amber-900">
                  {result.skipped.map((item) => (
                    <li key={item.clientId}>
                      <span className="font-mono text-xs">{item.clientId}</span>
                      <span className="block text-amber-800">{item.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleDone}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-assign-relationship-title"
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <h3
            id="bulk-assign-relationship-title"
            className="text-lg font-semibold text-gray-900"
          >
            Assign relationship owner
          </h3>
          <p className="mt-2 text-sm text-gray-700">
            Assign relationship owner for {clientIds.length} selected {selectedLabel}.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Leads that already have a relationship owner will be skipped.
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="bulk-assign-relationship-user"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Relationship owner
              </label>
              <select
                id="bulk-assign-relationship-user"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                disabled={isSubmitting || usersLoading || activeUsers.length === 0}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:opacity-60 bg-white placeholder:text-gray-500 caret-gray-900"
              >
                <option value="">
                  {usersLoading ? 'Loading users...' : 'Choose a user...'}
                </option>
                {activeUsers.map((user) => (
                  <option key={user.user_id} value={user.user_id}>
                    {user.userName}
                    {user.role === 'SUPER_ADMIN' ? ' (Admin)' : ''}
                  </option>
                ))}
              </select>
              {usersError && (
                <p className="mt-2 text-sm text-red-600">{usersError}</p>
              )}
              {!usersLoading && !usersError && activeUsers.length === 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  No active users are available.
                </p>
              )}
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
                disabled={
                  isSubmitting ||
                  usersLoading ||
                  !selectedUserId ||
                  activeUsers.length === 0
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Assigning...' : 'Confirm'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default memo(BulkAssignRelationshipModal);
