'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import Logo from '@/components/Logo';
import {
  DisplayDensityToggle,
  useDisplayDensity,
} from '@/components/ui/DisplayDensityProvider';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { supabase } from '@/lib/supabaseClient';

type ProfileUser = {
  id: string;
  name: string | null;
  email: string;
};

export default function UserProfileSettingsPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      return;
    }

    const nextUser = {
      id: profile.id,
      name: profile.name,
      email: profile.email,
    };

    setUser(nextUser);
    setName(profile.name ?? '');
  }, [profile]);

  async function handleSave() {
    if (!user) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await authenticatedFetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to update name.'
        );
      }

      const updatedUser = {
        id: data.id as string,
        name: (data.name as string | null) ?? null,
        email: data.email as string,
      };

      setUser(updatedUser);
      setName(updatedUser.name ?? '');
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update name.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancel() {
    if (user) {
      setName(user.name ?? '');
    }
    setIsEditing(false);
    setError(null);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }

  if (profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading account settings...</p>
      </main>
    );
  }

  if (!profile || !user) {
    return (
      <AuthRequiredMessage message="Please log in to view your account settings." />
    );
  }

  const homeHref = profile.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard';

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href={homeHref} aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                Account Settings
              </h1>
              <p className="mt-1 text-sm text-gray-500">Manage your profile</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={homeHref}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {profile.role === 'SUPER_ADMIN' ? 'Admin Home' : 'Back to Dashboard'}
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

      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm sm:p-8">
          <div className="rounded-lg border border-gray-200 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="profile-name"
                  className="text-sm font-medium text-gray-500"
                >
                  Name
                </label>
                {!isEditing ? (
                  <p className="mt-1 text-lg text-gray-900">
                    {user.name?.trim() || 'Not set'}
                  </p>
                ) : (
                  <input
                    id="profile-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    autoComplete="name"
                  />
                )}
              </div>

              {!isEditing ? (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
              ) : (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || name.trim() === ''}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>

          <div className="rounded-lg border border-gray-200 p-6">
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p className="mt-1 text-lg text-gray-900">{user.email}</p>
            <p className="mt-2 text-sm text-gray-500">
              Email cannot be changed here. Contact an administrator if you need
              to update it.
            </p>
          </div>

          <DisplayDensityPreferenceSection />
        </div>
      </div>
    </main>
  );
}

function DisplayDensityPreferenceSection() {
  const { density } = useDisplayDensity();

  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-gray-500">Display density</h2>
          <p className="mt-1 text-sm text-gray-700">
            Choose how tightly information is spaced across CRM lists and side
            panels.
          </p>
          <p className="mt-2 text-xs text-gray-500">
            Current setting: {density === 'compact' ? 'Compact' : 'Comfortable'}
          </p>
        </div>
        <DisplayDensityToggle showOnMobile className="self-start" />
      </div>
    </div>
  );
}
