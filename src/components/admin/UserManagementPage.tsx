'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import Logo from '@/components/Logo';
import UserActionsMenu from '@/components/admin/UserActionsMenu';
import UserManagementModal from '@/components/admin/UserManagementModal';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { supabase } from '@/lib/supabaseClient';

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }

  if (profileLoading || (usersLoading && profile?.role === 'SUPER_ADMIN')) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading user management...</p>
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

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                User Management
              </h1>
              <p className="text-sm text-gray-500">
                Deactivate or permanently delete user accounts
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Admin Dashboard
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {usersError ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {usersError}
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
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
                  {users.map((user) => {
                    const isCurrentUser = user.user_id === profile.id;
                    const isDeactivated = user.status === 'DEACTIVATED';

                    return (
                      <tr key={user.user_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {user.userName}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs font-normal text-gray-500">
                              (You)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{user.email}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatRole(user.role)}
                        </td>
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
                            onDeactivate={() =>
                              setModalState({
                                userId: user.user_id,
                                userName: user.userName,
                                tab: 'deactivate',
                              })
                            }
                            onDelete={() =>
                              setModalState({
                                userId: user.user_id,
                                userName: user.userName,
                                tab: 'delete',
                              })
                            }
                          />
                          {isCurrentUser && (
                            <p className="mt-1 text-xs text-gray-400">
                              Cannot manage your own account
                            </p>
                          )}
                          {isDeactivated && !isCurrentUser && (
                            <p className="mt-1 text-xs text-gray-400">
                              Already deactivated
                            </p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

      {modalState && (
        <UserManagementModal
          isOpen
          userId={modalState.userId}
          userName={modalState.userName}
          initialTab={modalState.tab}
          onClose={() => setModalState(null)}
          onDeactivated={loadUsers}
          onDeleted={loadUsers}
        />
      )}
    </main>
  );
}
