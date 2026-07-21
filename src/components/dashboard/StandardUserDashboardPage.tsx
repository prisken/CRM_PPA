'use client';

/**
 * Standard `/dashboard` shell + workspace module switcher.
 *
 * Loading boundaries:
 * 1. Shell loads identity (`useUserProfile`) and navigation flags via
 *    `/api/me/assignments` only — not full widgets.
 * 2. Active workspace module owns its fetches (see standardDashboardViews).
 * 3. Inactive modules must not mount: render with `activeView === … ? <Mod/> : null`
 *    and load heavy modules via `next/dynamic` so Home does not pull widget code.
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import DashboardHomeView from '@/components/dashboard/DashboardHomeView';
import WorkspaceShell from '@/components/layout/WorkspaceShell';
import {
  buildWorkspaceNavConfig,
  isStandardDashboardView,
  parseStandardDashboardView,
  standardDashboardHref,
  type StandardDashboardView,
} from '@/components/layout/workspaceNavConfig';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { supabase } from '@/lib/supabaseClient';

type AssignmentSummary = {
  hasDoctorRole: boolean;
  hasRelationshipRole: boolean;
  assignments: Array<{
    assignment_id: string;
    client_id: string;
    clientName: string;
    clientStatus: string;
    role: string;
  }>;
};

const AddLeadModal = dynamic(() => import('@/components/dashboard/AddLeadModal'), {
  ssr: false,
});

/** Lazy section modules — only downloaded/mounted when that view is active. */
const DashboardClientsView = dynamic(
  () =>
    import('@/components/dashboard/standardDashboardViews').then(
      (mod) => mod.DashboardClientsView
    ),
  { ssr: false, loading: () => <SectionLoading label="clients" /> }
);

const DashboardTasksView = dynamic(
  () =>
    import('@/components/dashboard/standardDashboardViews').then(
      (mod) => mod.DashboardTasksView
    ),
  { ssr: false, loading: () => <SectionLoading label="tasks" /> }
);

const DashboardActivityView = dynamic(
  () =>
    import('@/components/dashboard/standardDashboardViews').then(
      (mod) => mod.DashboardActivityView
    ),
  { ssr: false, loading: () => <SectionLoading label="activity" /> }
);

const DashboardCalendarView = dynamic(
  () =>
    import('@/components/dashboard/standardDashboardViews').then(
      (mod) => mod.DashboardCalendarView
    ),
  { ssr: false, loading: () => <SectionLoading label="calendar" /> }
);

const DashboardDealsView = dynamic(
  () =>
    import('@/components/dashboard/standardDashboardViews').then(
      (mod) => mod.DashboardDealsView
    ),
  { ssr: false, loading: () => <SectionLoading label="deals" /> }
);

const DashboardCommissionView = dynamic(
  () =>
    import('@/components/dashboard/standardDashboardViews').then(
      (mod) => mod.DashboardCommissionView
    ),
  { ssr: false, loading: () => <SectionLoading label="commission" /> }
);

const DashboardReturnablesView = dynamic(
  () =>
    import('@/components/dashboard/standardDashboardViews').then(
      (mod) => mod.DashboardReturnablesView
    ),
  { ssr: false, loading: () => <SectionLoading label="returnables" /> }
);

function SectionLoading({ label }: { label: string }) {
  return (
    <p className="text-sm text-gray-500" role="status">
      Loading {label}…
    </p>
  );
}

const VIEW_TITLES: Record<StandardDashboardView, string> = {
  home: 'Home',
  clients: 'My Clients',
  tasks: 'Tasks',
  activity: 'Activity',
  calendar: 'Calendar',
  deals: 'Deals',
  commission: 'Commission',
  returnables: 'Returnables',
};

export default function StandardUserDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading: profileLoading } = useUserProfile();

  const rawView = searchParams.get('view');
  const view = parseStandardDashboardView(rawView);

  // Invalid `?view=` → home (refresh-safe canonical URL).
  useEffect(() => {
    if (rawView == null || rawView === '' || isStandardDashboardView(rawView)) {
      return;
    }

    router.replace(standardDashboardHref('home'));
  }, [rawView, router]);

  const [assignmentSummary, setAssignmentSummary] =
    useState<AssignmentSummary | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [clientsRefreshKey, setClientsRefreshKey] = useState(0);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  // Shell-owned light fetch only (nav Returnables flag + Home count + calendar bootstrap).
  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);

    try {
      const response = await authenticatedFetch('/api/me/assignments');
      if (!response.ok) {
        throw new Error('Failed to load assignment data');
      }

      const assignments = await response.json();
      setAssignmentSummary({
        hasDoctorRole: assignments.hasDoctorRole === true,
        hasRelationshipRole: assignments.hasRelationshipRole === true,
        assignments: Array.isArray(assignments.assignments)
          ? assignments.assignments
          : [],
      });
    } catch (err) {
      setAssignmentSummary(null);
      setAssignmentsError(
        err instanceof Error ? err.message : 'Failed to load assignment data'
      );
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileLoading || !profile) {
      return;
    }

    void loadAssignments();
  }, [profile, profileLoading, loadAssignments]);

  const handleLeadCreated = useCallback(() => {
    // Bump keys so Clients/Activity refetch if those modules remount later.
    setClientsRefreshKey((key) => key + 1);
    setActivityRefreshKey((key) => key + 1);
    void loadAssignments();
  }, [loadAssignments]);

  const handleOpenAddLead = useCallback(() => setShowAddLead(true), []);
  const handleCloseAddLead = useCallback(() => setShowAddLead(false), []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }, [router]);

  const isSuperAdmin = profile?.role === 'SUPER_ADMIN';
  const showStatements =
    !assignmentsLoading && assignmentSummary?.hasDoctorRole === true;

  // Doctor-gated: `?view=returnables` without access → home URL (refresh-safe).
  useEffect(() => {
    if (assignmentsLoading) {
      return;
    }

    if (view === 'returnables' && !showStatements) {
      router.replace(standardDashboardHref('home'));
    }
  }, [assignmentsLoading, view, showStatements, router]);

  const nav = useMemo(
    () =>
      buildWorkspaceNavConfig({
        shell: 'standard',
        role: profile?.role ?? 'STANDARD_USER',
        flags: { showReturnableStatements: showStatements },
      }),
    [profile?.role, showStatements]
  );

  if (profileLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">Loading dashboard…</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <AuthRequiredMessage message="Please log in to view your dashboard." />
    );
  }

  // Doctor-only view: fall back to home if returnables are not applicable.
  const activeView =
    view === 'returnables' && !showStatements && !assignmentsLoading
      ? 'home'
      : view;

  const displayName = profile.name ?? profile.email;

  const topBarActions = (
    <>
      {!isSuperAdmin ? (
        <button
          type="button"
          onClick={handleOpenAddLead}
          className="whitespace-nowrap rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 sm:px-3 sm:text-sm"
        >
          Add Lead
        </button>
      ) : null}
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
        brandHref={isSuperAdmin ? '/admin' : '/dashboard'}
        topBarActions={topBarActions}
      >
        {assignmentsError ? (
          <p className="mb-4 text-sm text-red-600">{assignmentsError}</p>
        ) : null}

        {/* Inactive modules: do not mount (null). Active module owns its fetches. */}
        {activeView === 'home' ? (
          <DashboardHomeView
            displayName={displayName}
            showReturnables={showStatements}
            showAdmin={isSuperAdmin}
            onAddLead={handleOpenAddLead}
            showAddLead={!isSuperAdmin}
            assignmentCount={
              assignmentSummary ? assignmentSummary.assignments.length : null
            }
            assignmentsLoading={assignmentsLoading}
          />
        ) : null}

        {activeView === 'clients' ? (
          <DashboardClientsView refreshKey={clientsRefreshKey} />
        ) : null}

        {activeView === 'tasks' ? <DashboardTasksView /> : null}

        {activeView === 'activity' ? (
          <DashboardActivityView refreshKey={activityRefreshKey} />
        ) : null}

        {activeView === 'calendar' ? (
          <DashboardCalendarView
            assignmentAccess={
              isSuperAdmin
                ? undefined
                : {
                    loading: assignmentsLoading,
                    hasRelationshipRole:
                      assignmentSummary?.hasRelationshipRole === true,
                    assignments: assignmentSummary?.assignments ?? [],
                  }
            }
          />
        ) : null}

        {activeView === 'deals' ? <DashboardDealsView /> : null}

        {activeView === 'commission' ? <DashboardCommissionView /> : null}

        {activeView === 'returnables' && showStatements ? (
          <DashboardReturnablesView />
        ) : null}
      </WorkspaceShell>

      {showAddLead ? (
        <AddLeadModal onClose={handleCloseAddLead} onCreated={handleLeadCreated} />
      ) : null}
    </>
  );
}
