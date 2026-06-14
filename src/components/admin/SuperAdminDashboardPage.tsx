'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AddClientModal from '@/components/admin/AddClientModal';
import ConversionFunnelChart from '@/components/admin/ConversionFunnelChart';
import KpiBar from '@/components/admin/KpiBar';
import Leaderboards from '@/components/admin/Leaderboards';
import MasterPipelineView from '@/components/admin/MasterPipelineView';
import RevenueTrackerChart from '@/components/admin/RevenueTrackerChart';
import CollapsibleActivityWidget from '@/components/dashboard/CollapsibleActivityWidget';
import Logo from '@/components/Logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { SuperAdminDashboardData } from '@/lib/dashboardTypes';
import { supabase } from '@/lib/supabaseClient';

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const { profile, loading: profileLoading, error: profileError } = useUserProfile();
  const [dashboardData, setDashboardData] = useState<SuperAdminDashboardData | null>(
    null
  );
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/dashboard/superadmin', {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to load admin activity feed'
        );
      }

      const data = await res.json();
      setDashboardData(data);
    } catch (err) {
      setDashboardError(
        err instanceof Error ? err.message : 'Failed to load admin activity feed'
      );
    } finally {
      setDashboardLoading(false);
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

    loadDashboard();
  }, [profile, profileLoading, loadDashboard]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.location.hash !== '#master-pipeline') {
      return;
    }

    const element = document.getElementById('master-pipeline');
    element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [profileLoading, profile]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }

  if (profileLoading || (dashboardLoading && profile?.role === 'SUPER_ADMIN')) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading admin dashboard...</p>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <p className="text-red-600">{profileError ?? 'Unable to load profile'}</p>
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
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Super Admin Dashboard</h1>
              <p className="text-sm text-gray-500">
                Welcome, {profile.name ?? profile.email}
              </p>
            </div>
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

        {dashboardError ? (
          <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {dashboardError}
          </section>
        ) : (
          <CollapsibleActivityWidget
            recentActivity={dashboardData?.recentActivity ?? []}
            title="Recent Activity (All Clients)"
          />
        )}

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
