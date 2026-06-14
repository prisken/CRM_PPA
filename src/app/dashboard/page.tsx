'use client';

import { useRouter } from 'next/navigation';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabaseClient';

export default function DashboardPage() {
  const router = useRouter();
  const { profile, loading } = useUserProfile();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading profile...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-900">Welcome</h1>
          <p className="mt-2 text-gray-600">You are signed in.</p>
          <button
            type="button"
            onClick={handleSignOut}
            className="mt-6 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Sign Out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">
          Welcome, {profile.name ?? profile.email}
        </h1>
        <p className="mt-2 text-sm text-gray-500">Role: {profile.role}</p>

        <div className="mt-6 flex flex-col gap-3">
          {profile.role === 'SUPER_ADMIN' && (
            <a
              href="/admin"
              className="rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Admin Panel
            </a>
          )}

          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Sign Out
          </button>
        </div>
      </div>
    </main>
  );
}
