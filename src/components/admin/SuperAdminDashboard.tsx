'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AddClientModal from '@/components/admin/AddClientModal';
import ConversionFunnelChart from '@/components/admin/ConversionFunnelChart';
import KpiBar from '@/components/admin/KpiBar';
import Leaderboards from '@/components/admin/Leaderboards';
import MasterPipelineView from '@/components/admin/MasterPipelineView';
import RevenueTrackerChart from '@/components/admin/RevenueTrackerChart';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabaseClient';

export default function SuperAdminDashboard() {
  const router = useRouter();
  const { profile, loading, error } = useUserProfile();
  const [showAddClient, setShowAddClient] = useState(false);
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

  useEffect(() => {
    if (!loading && profile && profile.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [loading, profile, router]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#master-pipeline') {
      return;
    }

    const element = document.getElementById('master-pipeline');
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, profile]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading admin dashboard...</p>
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <p className="text-red-600">{error ?? 'Unable to load profile'}</p>
      </main>
    );
  }

  if (profile.role !== 'SUPER_ADMIN') {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
            <p className="text-sm text-gray-500">
              Welcome, {profile.name ?? profile.email}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowAddClient(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              + Add Lead / Client
            </button>
            <a
              href="/dashboard"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              User Dashboard
            </a>
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

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <KpiBar />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ConversionFunnelChart />
          <RevenueTrackerChart />
        </div>

        <Leaderboards />
        <MasterPipelineView
          refreshKey={pipelineRefreshKey}
          onAddClick={() => setShowAddClient(true)}
        />
      </div>

      {showAddClient && (
        <AddClientModal
          onClose={() => setShowAddClient(false)}
          onCreated={() => setPipelineRefreshKey((key) => key + 1)}
        />
      )}
    </main>
  );
}
