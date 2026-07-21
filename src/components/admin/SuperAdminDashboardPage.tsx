'use client';

/**
 * Super-admin `/admin` shell + workspace module switcher.
 *
 * Active-workspace-only loading:
 * 1. Shell loads identity (`useUserProfile`) — not full widgets.
 * 2. Home (`AdminHomeView`) may fetch cached KPIs for a tiny snapshot only.
 * 3. Active workspace module owns its fetches (see adminDashboardViews).
 * 4. Inactive modules must not mount: `activeView === … ? <Mod/> : null` plus
 *    `next/dynamic` so Home never downloads pipeline/calendar/charts code.
 *
 * Home must NOT fetch: pipeline, calendar, activity feed, funnel, revenue,
 * or leaderboards.
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AdminHomeView from '@/components/admin/AdminHomeView';
import AdminSectionSkeleton from '@/components/admin/AdminSectionSkeleton';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import WorkspaceShell from '@/components/layout/WorkspaceShell';
import {
  buildWorkspaceNavConfig,
  isAdminDashboardView,
  parseAdminDashboardView,
  adminDashboardHref,
  type AdminDashboardView,
} from '@/components/layout/workspaceNavConfig';
import { useUserProfile } from '@/hooks/useUserProfile';
import { supabase } from '@/lib/supabaseClient';

const AddClientModal = dynamic(() => import('@/components/admin/AddClientModal'), {
  ssr: false,
});

/** Lazy section modules — downloaded/mounted only when that view is active. */
const AdminPipelineView = dynamic(
  () =>
    import('@/components/admin/adminDashboardViews').then(
      (mod) => mod.AdminPipelineView
    ),
  { ssr: false, loading: () => <AdminSectionSkeleton className="h-64" /> }
);

const AdminCalendarView = dynamic(
  () =>
    import('@/components/admin/adminDashboardViews').then(
      (mod) => mod.AdminCalendarView
    ),
  { ssr: false, loading: () => <AdminSectionSkeleton className="h-64" /> }
);

const AdminActivityView = dynamic(
  () =>
    import('@/components/admin/adminDashboardViews').then(
      (mod) => mod.AdminActivityView
    ),
  { ssr: false, loading: () => <AdminSectionSkeleton className="h-48" /> }
);

const AdminAnalyticsView = dynamic(
  () =>
    import('@/components/admin/adminDashboardViews').then(
      (mod) => mod.AdminAnalyticsView
    ),
  { ssr: false, loading: () => <AdminSectionSkeleton /> }
);

const AdminRevenueView = dynamic(
  () =>
    import('@/components/admin/adminDashboardViews').then(
      (mod) => mod.AdminRevenueView
    ),
  { ssr: false, loading: () => <AdminSectionSkeleton /> }
);

const AdminLeaderboardsView = dynamic(
  () =>
    import('@/components/admin/adminDashboardViews').then(
      (mod) => mod.AdminLeaderboardsView
    ),
  { ssr: false, loading: () => <AdminSectionSkeleton className="h-48" /> }
);

const VIEW_TITLES: Record<AdminDashboardView, string> = {
  home: 'Home',
  pipeline: 'Pipeline',
  calendar: 'Calendar',
  activity: 'Activity',
  analytics: 'Analytics',
  revenue: 'Revenue',
  leaderboards: 'Leaderboards',
};

export default function SuperAdminDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading: profileLoading, error: profileError } = useUserProfile();

  const rawView = searchParams.get('view');
  const viewFromQuery = parseAdminDashboardView(rawView);

  // Invalid `?view=` → home (refresh-safe canonical URL).
  useEffect(() => {
    if (rawView == null || rawView === '' || isAdminDashboardView(rawView)) {
      return;
    }

    router.replace(adminDashboardHref('home'));
  }, [rawView, router]);

  // Preserve legacy deep link `/admin#master-pipeline` → `?view=pipeline`.
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (window.location.hash === '#master-pipeline') {
      router.replace(adminDashboardHref('pipeline'));
    }
  }, [router]);

  const activeView = viewFromQuery;

  const [showAddClient, setShowAddClient] = useState(false);
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);

  useEffect(() => {
    if (!profileLoading && profile && profile.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [profileLoading, profile, router]);

  const handleOpenAddClient = useCallback(() => setShowAddClient(true), []);
  const handleCloseAddClient = useCallback(() => setShowAddClient(false), []);
  const handleClientCreated = useCallback(() => {
    setPipelineRefreshKey((key) => key + 1);
  }, []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }, [router]);

  const nav = useMemo(
    () =>
      buildWorkspaceNavConfig({
        shell: 'admin',
        role: 'SUPER_ADMIN',
      }),
    []
  );

  if (profileLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">Loading admin dashboard…</p>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <AuthRequiredMessage
        message={profileError ?? 'Please log in to view the admin dashboard.'}
      />
    );
  }

  if (profile.role !== 'SUPER_ADMIN') {
    return null;
  }

  const displayName = profile.name ?? profile.email;

  const contentLayout =
    activeView === 'pipeline'
      ? 'full'
      : activeView === 'calendar' ||
          activeView === 'analytics' ||
          activeView === 'revenue' ||
          activeView === 'leaderboards'
        ? 'wide'
        : 'default';

  const topBarActions = (
    <>
      <Link
        href="/admin/leads"
        className="whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 sm:px-3 sm:text-sm"
      >
        Lead Command Center
      </Link>
      <button
        type="button"
        onClick={handleOpenAddClient}
        className="whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:px-3 sm:text-sm"
      >
        Add Lead / Client
      </button>
      <Link
        href="/dashboard/settings"
        className="whitespace-nowrap rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 sm:px-3 sm:text-sm"
      >
        Settings
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        className="whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 sm:px-3 sm:text-sm"
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
        title={VIEW_TITLES[activeView]}
        subtitle={displayName}
        brandHref="/admin"
        topBarActions={topBarActions}
        contentLayout={contentLayout}
      >
        {/*
          Inactive modules: render null (do not mount → no useEffect fetches).
          Active module is also code-split via next/dynamic above.
        */}
        {activeView === 'home' ? (
          <AdminHomeView
            displayName={displayName}
            onAddClient={handleOpenAddClient}
          />
        ) : null}

        {activeView === 'pipeline' ? (
          <AdminPipelineView
            refreshKey={pipelineRefreshKey}
            onAddClick={handleOpenAddClient}
          />
        ) : null}

        {activeView === 'calendar' ? <AdminCalendarView /> : null}

        {activeView === 'activity' ? <AdminActivityView /> : null}

        {activeView === 'analytics' ? <AdminAnalyticsView /> : null}

        {activeView === 'revenue' ? <AdminRevenueView /> : null}

        {activeView === 'leaderboards' ? <AdminLeaderboardsView /> : null}
      </WorkspaceShell>

      {showAddClient ? (
        <AddClientModal
          onClose={handleCloseAddClient}
          onCreated={handleClientCreated}
        />
      ) : null}
    </>
  );
}
