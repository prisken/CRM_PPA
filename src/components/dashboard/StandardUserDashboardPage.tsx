'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AddLeadModal from '@/components/dashboard/AddLeadModal';
import CollapsibleActivityWidget from '@/components/dashboard/CollapsibleActivityWidget';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import MyCommissionReturnableWidget from '@/components/dashboard/MyCommissionReturnableWidget';
import MyClientsWidget from '@/components/dashboard/MyClientsWidget';
import MySecuredCommissionWidget from '@/components/dashboard/MySecuredCommissionWidget';
import MyTasksWidget from '@/components/dashboard/MyTasksWidget';
import CollapsibleActivityWidgetSkeleton from '@/components/dashboard/skeletons/CollapsibleActivityWidgetSkeleton';
import MyClientsWidgetSkeleton from '@/components/dashboard/skeletons/MyClientsWidgetSkeleton';
import MySecuredCommissionWidgetSkeleton from '@/components/dashboard/skeletons/MySecuredCommissionWidgetSkeleton';
import MyTasksWidgetSkeleton from '@/components/dashboard/skeletons/MyTasksWidgetSkeleton';
import Logo from '@/components/Logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import type {
  AssignedClientRow,
  GroupedClientActivity,
  OpenTaskRow,
} from '@/lib/dashboardTypes';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { supabase } from '@/lib/supabaseClient';

type AssignmentSummary = {
  hasDoctorRole: boolean;
};

type WidgetRequestState<T> = {
  loading: boolean;
  error: string | null;
  data: T;
};

const emptyClientsState: WidgetRequestState<AssignedClientRow[]> = {
  loading: true,
  error: null,
  data: [],
};

const emptyTasksState: WidgetRequestState<OpenTaskRow[]> = {
  loading: true,
  error: null,
  data: [],
};

const emptyActivityState: WidgetRequestState<GroupedClientActivity[]> = {
  loading: true,
  error: null,
  data: [],
};

type CommissionWidgetState = {
  loading: boolean;
  error: string | null;
  hasAnyAssignment: boolean;
  amount: number;
};

const initialCommissionState: CommissionWidgetState = {
  loading: true,
  error: null,
  hasAnyAssignment: false,
  amount: 0,
};

export default function StandardUserDashboardPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [assignmentSummary, setAssignmentSummary] =
    useState<AssignmentSummary | null>(null);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [widgetRefreshKey, setWidgetRefreshKey] = useState(0);
  const [clientsState, setClientsState] =
    useState<WidgetRequestState<AssignedClientRow[]>>(emptyClientsState);
  const [tasksState, setTasksState] =
    useState<WidgetRequestState<OpenTaskRow[]>>(emptyTasksState);
  const [activityState, setActivityState] =
    useState<WidgetRequestState<GroupedClientActivity[]>>(emptyActivityState);
  const [commissionState, setCommissionState] =
    useState<CommissionWidgetState>(initialCommissionState);

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);

    try {
      const res = await authenticatedFetch('/api/me/assignments');

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to load assignment data'
        );
      }

      const assignments = await res.json();
      setAssignmentSummary({
        hasDoctorRole: assignments.hasDoctorRole === true,
      });
    } catch (err) {
      setAssignmentsError(
        err instanceof Error ? err.message : 'Failed to load assignment data'
      );
    } finally {
      setAssignmentsLoading(false);
    }
  }, []);

  const loadWidgetData = useCallback(async () => {
    setClientsState((current) => ({ ...current, loading: true, error: null }));
    setTasksState((current) => ({ ...current, loading: true, error: null }));
    setActivityState((current) => ({ ...current, loading: true, error: null }));
    setCommissionState((current) => ({ ...current, loading: true, error: null }));

    const [clientsResult, tasksResult, activityResult, commissionResult] =
      await Promise.allSettled([
        authenticatedFetch('/api/dashboard/widgets/assigned-clients'),
        authenticatedFetch('/api/dashboard/widgets/open-tasks'),
        authenticatedFetch('/api/dashboard/widgets/activity-feed'),
        authenticatedFetch('/api/dashboard/widgets/performance-metrics'),
      ]);

    if (clientsResult.status === 'fulfilled' && clientsResult.value.ok) {
      const data = await clientsResult.value.json();
      setClientsState({
        loading: false,
        error: null,
        data: data.assignedClients ?? [],
      });
    } else {
      setClientsState({
        loading: false,
        error: 'Failed to load assigned clients',
        data: [],
      });
    }

    if (tasksResult.status === 'fulfilled' && tasksResult.value.ok) {
      const data = await tasksResult.value.json();
      setTasksState({
        loading: false,
        error: null,
        data: data.openTasks ?? [],
      });
    } else {
      setTasksState({
        loading: false,
        error: 'Failed to load open tasks',
        data: [],
      });
    }

    if (activityResult.status === 'fulfilled' && activityResult.value.ok) {
      const data = await activityResult.value.json();
      setActivityState({
        loading: false,
        error: null,
        data: data.recentActivity ?? [],
      });
    } else {
      setActivityState({
        loading: false,
        error: 'Failed to load recent activity',
        data: [],
      });
    }

    if (commissionResult.status === 'fulfilled' && commissionResult.value.ok) {
      const data = await commissionResult.value.json();
      setCommissionState({
        loading: false,
        error: null,
        hasAnyAssignment: data.hasAnyAssignment === true,
        amount: data.performanceMetrics?.mySecuredCommission ?? 0,
      });
    } else {
      setCommissionState({
        loading: false,
        error: 'Failed to load secured commission',
        hasAnyAssignment: false,
        amount: 0,
      });
    }
  }, []);

  useEffect(() => {
    if (profileLoading || !profile) {
      return;
    }

    loadAssignments();
  }, [profile, profileLoading, loadAssignments]);

  useEffect(() => {
    if (profileLoading || !profile) {
      return;
    }

    loadWidgetData();
  }, [profile, profileLoading, widgetRefreshKey, loadWidgetData]);

  function handleLeadCreated() {
    setWidgetRefreshKey((key) => key + 1);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }

  if (profileLoading) {
    return (
      <main className="min-h-screen bg-gray-100">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
            <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-64 animate-pulse rounded bg-gray-200" />
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <MyClientsWidgetSkeleton />
            <MyTasksWidgetSkeleton />
            <CollapsibleActivityWidgetSkeleton title="Recent Activity on My Clients" />
            <MySecuredCommissionWidgetSkeleton />
          </div>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <AuthRequiredMessage message="Please log in to view your dashboard." />
    );
  }

  const displayName = profile.name ?? profile.email;
  const isSuperAdmin = profile.role === 'SUPER_ADMIN';

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                Welcome back, {displayName}!
              </h1>
              <p className="mt-1 text-sm text-gray-500">Your personalized CRM dashboard</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            {!isSuperAdmin && (
              <button
                type="button"
                onClick={() => setShowAddLead(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add Lead
              </button>
            )}
            {!assignmentsLoading && assignmentSummary?.hasDoctorRole && (
              <Link
                href="/my-statements"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Returnable Statements
              </Link>
            )}
            {isSuperAdmin && (
              <Link
                href="/admin"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Admin Dashboard
              </Link>
            )}
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Account Settings
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {assignmentsError && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <p className="text-sm text-red-600">{assignmentsError}</p>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {clientsState.loading ? (
            <MyClientsWidgetSkeleton />
          ) : (
            <MyClientsWidget
              assignedClients={clientsState.data}
              error={clientsState.error}
            />
          )}

          {tasksState.loading ? (
            <MyTasksWidgetSkeleton />
          ) : (
            <MyTasksWidget openTasks={tasksState.data} error={tasksState.error} />
          )}

          {activityState.loading ? (
            <CollapsibleActivityWidgetSkeleton title="Recent Activity on My Clients" />
          ) : (
            <CollapsibleActivityWidget
              recentActivity={activityState.data}
              title="Recent Activity on My Clients"
            />
          )}

          {commissionState.loading ? (
            <MySecuredCommissionWidgetSkeleton />
          ) : commissionState.hasAnyAssignment ? (
            <MySecuredCommissionWidget
              amount={commissionState.amount}
              error={commissionState.error}
            />
          ) : null}

          {!assignmentsLoading && assignmentSummary?.hasDoctorRole && (
            <MyCommissionReturnableWidget />
          )}
        </div>
      </div>

      {showAddLead && (
        <AddLeadModal
          onClose={() => setShowAddLead(false)}
          onCreated={handleLeadCreated}
        />
      )}
    </main>
  );
}
