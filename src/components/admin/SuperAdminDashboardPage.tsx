'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminSectionSkeleton from '@/components/admin/AdminSectionSkeleton';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import CompanyEarningsWidget from '@/components/admin/CompanyEarningsWidget';
import KpiBar, { type KpiData } from '@/components/admin/KpiBar';
import CollapsibleActivityWidget from '@/components/dashboard/CollapsibleActivityWidget';
import Logo from '@/components/Logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { SuperAdminDashboardData } from '@/lib/dashboardTypes';
import { supabase } from '@/lib/supabaseClient';

const ConversionFunnelChart = dynamic(
  () => import('@/components/admin/ConversionFunnelChart'),
  { loading: () => <AdminSectionSkeleton /> }
);

const RevenueTrackerChart = dynamic(
  () => import('@/components/admin/RevenueTrackerChart'),
  { loading: () => <AdminSectionSkeleton /> }
);

const Leaderboards = dynamic(() => import('@/components/admin/Leaderboards'), {
  loading: () => <AdminSectionSkeleton className="h-48" />,
});

const MasterPipelineView = dynamic(
  () => import('@/components/admin/MasterPipelineView'),
  { loading: () => <AdminSectionSkeleton className="h-64" /> }
);

const AddClientModal = dynamic(() => import('@/components/admin/AddClientModal'), {
  ssr: false,
});

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const { profile, loading: profileLoading, error: profileError } = useUserProfile();
  const [dashboardData, setDashboardData] = useState<SuperAdminDashboardData | null>(
    null
  );
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

  const loadKpis = useCallback(async () => {
    setKpiLoading(true);
    setKpiError(null);

    try {
      const res = await fetch('/api/admin/dashboard-kpis');

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to load KPIs'
        );
      }

      setKpiData(await res.json());
    } catch (err) {
      setKpiError(err instanceof Error ? err.message : 'Failed to load KPIs');
    } finally {
      setKpiLoading(false);
    }
  }, []);

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
    loadKpis();
  }, [profile, profileLoading, loadDashboard, loadKpis]);

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

  const handleOpenAddClient = useCallback(() => setShowAddClient(true), []);
  const handleCloseAddClient = useCallback(() => setShowAddClient(false), []);
  const handleClientCreated = useCallback(
    () => setPipelineRefreshKey((key) => key + 1),
    []
  );

  if (profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading admin dashboard...</p>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <AuthRequiredMessage
        message={
          profileError ??
          'Please log in to view the admin dashboard.'
        }
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
                Super Admin Dashboard
              </h1>
              <p className="text-sm text-gray-500">
                Welcome, {profile.name ?? profile.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleOpenAddClient}
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
            <a
              href="/admin/reconciliation"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Reconciliation
            </a>
            <a
              href="/admin/users"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              User Management
            </a>
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Account Settings
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

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <KpiBar data={kpiData} loading={kpiLoading} error={kpiError} />
          </div>
          <CompanyEarningsWidget
            companyOverheadEarnings={kpiData?.companyOverheadEarnings ?? null}
            loading={kpiLoading}
            error={kpiError}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ConversionFunnelChart />
          <RevenueTrackerChart />
        </div>

        <Leaderboards />

        {dashboardLoading ? (
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="h-48 animate-pulse rounded-lg bg-gray-100" />
          </section>
        ) : dashboardError ? (
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
          onAddClick={handleOpenAddClient}
        />
      </div>

      {showAddClient && (
        <AddClientModal
          onClose={handleCloseAddClient}
          onCreated={handleClientCreated}
        />
      )}
    </main>
  );
}
