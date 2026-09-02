'use client';

import { AssignmentRole } from '@prisma/client';
import { memo, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  countAssignmentsForRole,
  formatAssignmentRoleLabel,
  getRoleOccupancyLimitMessage,
} from '@/lib/constants';
import EmptyMuted from '@/components/ui/EmptyMuted';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getWidgetPaddingClass } from '@/components/ui/displayDensity';

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

const ASSIGNABLE_ROLE_OPTIONS = [
  {
    value: AssignmentRole.RELATIONSHIP,
    label: formatAssignmentRoleLabel(AssignmentRole.RELATIONSHIP),
  },
  {
    value: AssignmentRole.ACCOUNT_SERVICE,
    label: formatAssignmentRoleLabel(AssignmentRole.ACCOUNT_SERVICE),
  },
] as const;

function formatRole(role: string) {
  if (Object.values(AssignmentRole).includes(role as AssignmentRole)) {
    return formatAssignmentRoleLabel(role as AssignmentRole);
  }

  return role;
}

type AssignedTeamWidgetProps = {
  clientId: string;
  assignedUsers: AssignedUser[];
  currentUser: CurrentUserInfo | null;
  onMutationSuccess?: () => void;
};

function AssignmentRow({
  user,
  isSuperAdmin,
  onRemove,
}: {
  user: AssignedUser;
  isSuperAdmin: boolean;
  onRemove: (assignmentId: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5">
      <p className="min-w-0 truncate text-sm text-gray-800">
        <span className="text-gray-500">{formatRole(user.role)}</span>
        <span className="text-gray-300"> · </span>
        <span className="font-medium text-gray-900">{user.name}</span>
      </p>
      {isSuperAdmin && (
        <button
          type="button"
          onClick={() => onRemove(user.assignment_id)}
          className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-200 active:bg-gray-300 hover:text-red-600"
          aria-label={`Remove ${user.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

export default memo(function AssignedTeamWidget({
  clientId,
  assignedUsers,
  currentUser,
  onMutationSuccess,
}: AssignedTeamWidgetProps) {
  const { density } = useDisplayDensity();
  const widgetPaddingClass = getWidgetPaddingClass(density);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<AssignmentRole>(
    AssignmentRole.RELATIONSHIP
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const activeTeamMembers = useMemo(
    () => assignedUsers.filter((user) => user.role !== AssignmentRole.DOCTOR),
    [assignedUsers]
  );

  const legacyDoctorAssignments = useMemo(
    () => assignedUsers.filter((user) => user.role === AssignmentRole.DOCTOR),
    [assignedUsers]
  );

  const selectedRoleCount = useMemo(
    () => countAssignmentsForRole(assignedUsers, selectedRole),
    [assignedUsers, selectedRole]
  );

  const occupancyLimitMessage = useMemo(
    () => getRoleOccupancyLimitMessage(selectedRole, selectedRoleCount),
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
      setSelectedRole(AssignmentRole.RELATIONSHIP);
      onMutationSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign user');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm ${widgetPaddingClass}`}>
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">Assigned Team</h3>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setIsModalOpen(true);
            }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 active:bg-blue-800"
          >
            + Assign
          </button>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      {activeTeamMembers.length === 0 ? (
        <EmptyMuted label="No relationship or follow-up officers assigned yet." />
      ) : (
        <ul className="space-y-1">
          {activeTeamMembers.map((user) => (
            <AssignmentRow
              key={user.assignment_id}
              user={user}
              isSuperAdmin={isSuperAdmin}
              onRemove={handleRemove}
            />
          ))}
        </ul>
      )}

      {legacyDoctorAssignments.length > 0 && (
        <details className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-amber-900">
            Legacy Doctor Assignments ({legacyDoctorAssignments.length})
          </summary>
          <div className="border-t border-amber-100 px-3 py-2">
            <p className="mb-2 text-xs text-amber-800">
              Doctors are now assigned per deal.
            </p>
            <ul className="space-y-1">
              {legacyDoctorAssignments.map((user) => (
                <AssignmentRow
                  key={user.assignment_id}
                  user={user}
                  isSuperAdmin={isSuperAdmin}
                  onRemove={handleRemove}
                />
              ))}
            </ul>
          </div>
        </details>
      )}

      {isModalOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Assign Team Member</h3>
            <p className="mt-1 text-sm text-gray-500">
              Assign relationship or follow-up officers at the client level. Doctors are added per
              deal.
            </p>

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
                    setSelectedRole(event.target.value as AssignmentRole);
                    setError(null);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {ASSIGNABLE_ROLE_OPTIONS.map((role) => (
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
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAssign}
                disabled={isAssignDisabled}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
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
