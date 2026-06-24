'use client';

import { AssignmentRole } from '@prisma/client';
import { memo, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  countAssignmentsForRole,
  getRoleOccupancyLimitMessage,
} from '@/lib/constants';

export type AssignedUser = {
  assignment_id: string;
  user_id: string;
  name: string;
  role: string;
};

export type CurrentUserInfo = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

type UserOption = {
  user_id: string;
  userName: string;
};

const ROLE_OPTIONS = [
  { value: 'RELATIONSHIP', label: 'Relationship' },
  { value: 'DOCTOR', label: 'Doctor' },
  { value: 'ACCOUNT_SERVICE', label: 'Account Service' },
];

function formatRole(role: string) {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role;
}

type AssignedTeamWidgetProps = {
  clientId: string;
  assignedUsers: AssignedUser[];
  currentUser: CurrentUserInfo | null;
  onMutationSuccess?: () => void;
};

export default memo(function AssignedTeamWidget({
  clientId,
  assignedUsers,
  currentUser,
  onMutationSuccess,
}: AssignedTeamWidgetProps) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState('RELATIONSHIP');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const selectedRoleCount = useMemo(
    () =>
      countAssignmentsForRole(
        assignedUsers,
        selectedRole as AssignmentRole
      ),
    [assignedUsers, selectedRole]
  );

  const occupancyLimitMessage = useMemo(
    () =>
      getRoleOccupancyLimitMessage(
        selectedRole as AssignmentRole,
        selectedRoleCount
      ),
    [selectedRole, selectedRoleCount]
  );

  const isAssignDisabled =
    isSubmitting || !selectedUserId || occupancyLimitMessage !== null;

  useEffect(() => {
    if (!isSuperAdmin || !isModalOpen || users.length > 0) {
      return;
    }

    let cancelled = false;

    async function fetchUsers() {
      const res = await fetch('/api/admin/users');
      if (!res.ok || cancelled) {
        return;
      }

      const data = await res.json();
      if (!cancelled) {
        setUsers(data);
      }
    }

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, isModalOpen, users.length]);

  async function handleRemove(assignmentId: string) {
    setError(null);

    const res = await fetch(
      `/api/clients/${clientId}/assignments/${assignmentId}`,
      { method: 'DELETE' }
    );

    if (!res.ok) {
      setError('Failed to remove assignment');
      return;
    }

    onMutationSuccess?.();
  }

  async function handleAssign() {
    if (!selectedUserId) {
      setError('Please select a user');
      return;
    }

    if (occupancyLimitMessage) {
      setError(occupancyLimitMessage);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedUserId,
          role: selectedRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to assign user');
      }

      setIsModalOpen(false);
      setSelectedUserId('');
      setSelectedRole('RELATIONSHIP');
      onMutationSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign user');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">Assigned Team</h3>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsModalOpen(true);
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Assign Team Member
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {assignedUsers.length === 0 ? (
        <p className="text-sm text-gray-500">No team members assigned yet.</p>
      ) : (
        <ul className="space-y-2">
          {assignedUsers.map((user) => (
            <li
              key={user.assignment_id}
              className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{formatRole(user.role)}</p>
              </div>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => handleRemove(user.assignment_id)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-red-600"
                  aria-label={`Remove ${user.name}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isModalOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Assign Team Member</h3>

            <div className="mt-4 space-y-4">
              <div>
                <label
                  htmlFor="assign-user"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Select User
                </label>
                <select
                  id="assign-user"
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">Choose a user...</option>
                  {users.map((user) => (
                    <option key={user.user_id} value={user.user_id}>
                      {user.userName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="assign-role"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Select Role
                </label>
                <select
                  id="assign-role"
                  value={selectedRole}
                  onChange={(event) => {
                    setSelectedRole(event.target.value);
                    setError(null);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
                {occupancyLimitMessage && (
                  <p className="mt-2 text-sm text-red-600">{occupancyLimitMessage}</p>
                )}
              </div>
            </div>

            {error && !occupancyLimitMessage && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={isAssignDisabled}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
