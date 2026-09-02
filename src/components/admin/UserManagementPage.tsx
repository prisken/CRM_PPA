'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import UserActionsMenu from '@/components/admin/UserActionsMenu';
import WorkspaceShell from '@/components/layout/WorkspaceShell';
import { buildWorkspaceNavConfig } from '@/components/layout/workspaceNavConfig';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { supabase } from '@/lib/supabaseClient';

const UserManagementModal = dynamic(
  () => import('@/components/admin/UserManagementModal'),
  { ssr: false }
);

type ManagedUser = {
  user_id: string;
  userName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
};

type ModalState = {
  userId: string;
  userName: string;
  tab: 'deactivate' | 'delete';
};

function formatRole(role: string) {
  return role === 'SUPER_ADMIN' ? 'Super Admin' : 'Standard User';
}

function getStatusBadgeStyles(status: string) {
  if (status === 'DEACTIVATED') {
    return 'bg-gray-100 text-gray-700';
  }

  return 'bg-green-100 text-green-800';
}

const UserTableRow = memo(function UserTableRow({
  user,
  isCurrentUser,
  onDeactivate,
  onDelete,
}: {
  user: ManagedUser;
  isCurrentUser: boolean;
  onDeactivate: (userId: string, userName: string) => void;
  onDelete: (userId: string, userName: string) => void;
}) {
  const isDeactivated = user.status === 'DEACTIVATED';

  return (
    <tr className="hover:bg-gray-50 active:bg-gray-100">
      <td className="px-4 py-3 font-medium text-gray-900">
        {user.userName}
        {isCurrentUser && (
          <span className="ml-2 text-xs font-normal text-gray-500">(You)</span>
        )}
      </td>
      <td className="px-4 py-3 text-gray-600">{user.email}</td>
      <td className="px-4 py-3 text-gray-600">{formatRole(user.role)}</td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadgeStyles(user.status)}`}
        >
          {user.status === 'DEACTIVATED' ? 'Deactivated' : 'Active'}
        </span>
      </td>
      <td className="px-4 py-3 text-gray-600">
        {new Date(user.createdAt).toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <UserActionsMenu
          disabled={isCurrentUser}
          onDeactivate={() => onDeactivate(user.user_id, user.userName)}
          onDelete={() => onDelete(user.user_id, user.userName)}
        />
        {isCurrentUser && (
          <p className="mt-1 text-xs text-gray-400">Cannot manage your own account</p>
        )}
        {isDeactivated && !isCurrentUser && (
          <p className="mt-1 text-xs text-gray-400">Already deactivated</p>
        )}
      </td>
    </tr>
  );
});

export default function UserManagementPage() {
  const router = useRouter();
  const { profile, loading: profileLoading, error: profileError } = useUserProfile();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<ModalState | null>(null);

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);

    try {
      const res = await authenticatedFetch('/api/admin/users');

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to load users'
        );
      }

      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profileLoading && profile && profile.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [profileLoading, profile, router]);

  useEffect(() => {
    if (profileLoading || !profile || profile.role !== 'SUPER_ADMIN') {
      return;
    }

    loadUsers();
  }, [profile, profileLoading, loadUsers]);

  const openDeactivateModal = useCallback((userId: string, userName: string) => {
    setModalState({ userId, userName, tab: 'deactivate' });
  }, []);

  const openDeleteModal = useCallback((userId: string, userName: string) => {
    setModalState({ userId, userName, tab: 'delete' });
  }, []);

  const handleCloseModal = useCallback(() => setModalState(null), []);

  const nav = useMemo(
    () =>
      buildWorkspaceNavConfig({
        shell: 'admin',
        role: 'SUPER_ADMIN',
      }),
    []
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }

  if (profileLoading || (usersLoading && profile?.role === 'SUPER_ADMIN')) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">Loading user management…</p>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <AuthRequiredMessage
        message={profileError ?? 'Please log in to manage users.'}
      />
    );
  }

  if (profile.role !== 'SUPER_ADMIN') {
    return null;
  }

  const displayName = profile.name ?? profile.email;

  const topBarActions = (
    <>
      <Link
        href="/admin"
        className="whitespace-nowrap rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 sm:px-3 sm:text-sm"
      >
        Admin Home
      </Link>
      <Link
        href="/dashboard/settings"
        className="whitespace-nowrap rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 sm:px-3 sm:text-sm"
      >
        Settings
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        className="whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 active:bg-gray-900 sm:px-3 sm:text-sm"
      >
        Sign Out
      </button>
    </>
  );

  return (
    <>
      <WorkspaceShell
        nav={nav}
        userRole={profile.role}
        title="User Management"
        subtitle={displayName}
        brandHref="/admin"
        topBarActions={topBarActions}
        contentLayout="full"
      >
        <div className="min-w-0">
          <p className="mb-4 text-sm text-gray-600">
            Deactivate or permanently delete user accounts
          </p>

          {usersError ? (
            <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {usersError}
            </section>
          ) : (
            <section className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="min-w-0 overflow-x-auto">
                <table className="min-w-full w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Role
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">
                        Joined
                      </th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {users.map((user) => (
                      <UserTableRow
                        key={user.user_id}
                        user={user}
                        isCurrentUser={user.user_id === profile.id}
                        onDeactivate={openDeactivateModal}
                        onDelete={openDeleteModal}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {users.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-gray-500">
                  No users found.
                </p>
              )}
            </section>
          )}
        </div>
      </WorkspaceShell>

      {modalState && (
        <UserManagementModal
          isOpen
          userId={modalState.userId}
          userName={modalState.userName}
          initialTab={modalState.tab}
          onClose={handleCloseModal}
          onDeactivated={loadUsers}
          onDeleted={loadUsers}
        />
      )}
    </>
  );
}
