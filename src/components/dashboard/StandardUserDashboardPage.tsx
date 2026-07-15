'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import CollapsibleActivityWidget from '@/components/dashboard/CollapsibleActivityWidget';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import MyCommissionReturnableWidget from '@/components/dashboard/MyCommissionReturnableWidget';
import MyDealParticipationWidget from '@/components/dashboard/MyDealParticipationWidget';
import MyClientsWidget from '@/components/dashboard/MyClientsWidget';
import MySecuredCommissionWidget from '@/components/dashboard/MySecuredCommissionWidget';
import MyTasksWidget from '@/components/dashboard/MyTasksWidget';
import ImportantDatesCalendarWidget from '@/components/dashboard/ImportantDatesCalendarWidget';
import CollapsibleActivityWidgetSkeleton from '@/components/dashboard/skeletons/CollapsibleActivityWidgetSkeleton';
import MyDealParticipationWidgetSkeleton from '@/components/dashboard/skeletons/MyDealParticipationWidgetSkeleton';
import MyClientsWidgetSkeleton from '@/components/dashboard/skeletons/MyClientsWidgetSkeleton';
import MySecuredCommissionWidgetSkeleton from '@/components/dashboard/skeletons/MySecuredCommissionWidgetSkeleton';
import MyTasksWidgetSkeleton from '@/components/dashboard/skeletons/MyTasksWidgetSkeleton';
import Logo from '@/components/Logo';
import SectionCard from '@/components/ui/SectionCard';
import { useUserProfile } from '@/hooks/useUserProfile';
import type {
  AssignedClientRow,
  DealParticipationRow,
  GroupedClientActivity,
  OpenTaskRow,
} from '@/lib/dashboardTypes';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { supabase } from '@/lib/supabaseClient';

const AddLeadModal = dynamic(() => import('@/components/dashboard/AddLeadModal'), {
  ssr: false,
});

type AssignmentSummary = {
  hasDoctorRole: boolean;
};

type WidgetRequestState<T> = {
  loading: boolean;
  error: string | null;
  data: T;
};

const emptyDealParticipationState: WidgetRequestState<DealParticipationRow[]> = {
  loading: true,
  error: null,
  data: [],
};

const emptyClientsState: WidgetRequestState<{
  assignedClients: AssignedClientRow[];
  legacyDoctorAssignments: AssignedClientRow[];
}> = {
  loading: true,
  error: null,
  data: { assignedClients: [], legacyDoctorAssignments: [] },
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

const ACTIVITY_PREVIEW_GROUP_COUNT = 4;

function QuickActionsRow({
  onAddLead,
  showAddLead,
  showStatements,
  showAdmin,
}: {
  onAddLead: () => void;
  showAddLead: boolean;
  showStatements: boolean;
  showAdmin: boolean;
}) {
  return (
    <section
      aria-label="Quick actions"
      className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Quick actions</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {showAddLead && (
          <button
            type="button"
            onClick={onAddLead}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Lead
          </button>
        )}
        {showStatements && (
          <Link
            href="/my-statements"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Returnable Statements
          </Link>
        )}
        {showAdmin && (
          <Link
            href="/admin"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Admin Dashboard
          </Link>
        )}
      </div>
    </section>
  );
}

function MyWorkSection({
  clientsState,
  tasksState,
  dealParticipationState,
  activityState,
}: {
  clientsState: WidgetRequestState<{
    assignedClients: AssignedClientRow[];
    legacyDoctorAssignments: AssignedClientRow[];
  }>;
  tasksState: WidgetRequestState<OpenTaskRow[]>;
  dealParticipationState: WidgetRequestState<DealParticipationRow[]>;
  activityState: WidgetRequestState<GroupedClientActivity[]>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {clientsState.loading ? (
          <MyClientsWidgetSkeleton />
        ) : (
          <MyClientsWidget
            assignedClients={clientsState.data.assignedClients}
            legacyDoctorAssignments={clientsState.data.legacyDoctorAssignments}
            error={clientsState.error}
          />
        )}

        {tasksState.loading ? (
          <MyTasksWidgetSkeleton />
        ) : (
          <MyTasksWidget openTasks={tasksState.data} error={tasksState.error} />
        )}
      </div>

      {dealParticipationState.loading ? (
        <MyDealParticipationWidgetSkeleton />
      ) : (
        <MyDealParticipationWidget
          deals={dealParticipationState.data}
          error={dealParticipationState.error}
        />
      )}

      {activityState.loading ? (
        <CollapsibleActivityWidgetSkeleton />
      ) : (
        <CollapsibleActivityWidget
          recentActivity={activityState.data}
          title="Recent activity"
          maxVisibleGroups={ACTIVITY_PREVIEW_GROUP_COUNT}
        />
      )}
    </div>
  );
}

function PerformanceSection({
  commissionState,
  showReturnable,
  widgetRefreshKey,
}: {
  commissionState: CommissionWidgetState;
  showReturnable: boolean;
  widgetRefreshKey: number;
}) {
  const showSecuredCommission =
    commissionState.loading || commissionState.hasAnyAssignment;

  if (!showSecuredCommission && !showReturnable) {
    return (
      <p className="text-sm text-gray-500">No performance metrics available yet.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {commissionState.loading ? (
        <MySecuredCommissionWidgetSkeleton />
      ) : showSecuredCommission ? (
        <MySecuredCommissionWidget
          amount={commissionState.amount}
          error={commissionState.error}
        />
      ) : null}

      {showReturnable && (
        <MyCommissionReturnableWidget refreshKey={widgetRefreshKey} />
      )}
    </div>
  );
}

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
    useState<
      WidgetRequestState<{
        assignedClients: AssignedClientRow[];
        legacyDoctorAssignments: AssignedClientRow[];
      }>
    >(emptyClientsState);
  const [dealParticipationState, setDealParticipationState] =
    useState<WidgetRequestState<DealParticipationRow[]>>(emptyDealParticipationState);
  const [tasksState, setTasksState] =
    useState<WidgetRequestState<OpenTaskRow[]>>(emptyTasksState);
  const [activityState, setActivityState] =
    useState<WidgetRequestState<GroupedClientActivity[]>>(emptyActivityState);
  const [commissionState, setCommissionState] =
    useState<CommissionWidgetState>(initialCommissionState);

  const loadDashboardData = useCallback(async () => {
    setAssignmentsLoading(true);
    setAssignmentsError(null);
    setClientsState((current) => ({ ...current, loading: true, error: null }));
    setDealParticipationState((current) => ({ ...current, loading: true, error: null }));
    setTasksState((current) => ({ ...current, loading: true, error: null }));
    setActivityState((current) => ({ ...current, loading: true, error: null }));
    setCommissionState((current) => ({ ...current, loading: true, error: null }));

    const [
      assignmentsResult,
      clientsResult,
      dealParticipationResult,
      tasksResult,
      activityResult,
      commissionResult,
    ] = await Promise.allSettled([
      authenticatedFetch('/api/me/assignments'),
      authenticatedFetch('/api/dashboard/widgets/assigned-clients'),
      authenticatedFetch('/api/dashboard/widgets/deal-participation'),
      authenticatedFetch('/api/dashboard/widgets/open-tasks'),
      authenticatedFetch('/api/dashboard/widgets/activity-feed'),
      authenticatedFetch('/api/dashboard/widgets/performance-metrics'),
    ]);

    if (assignmentsResult.status === 'fulfilled' && assignmentsResult.value.ok) {
      const assignments = await assignmentsResult.value.json();
      setAssignmentSummary({
        hasDoctorRole: assignments.hasDoctorRole === true,
      });
      setAssignmentsError(null);
    } else {
      setAssignmentsError('Failed to load assignment data');
    }
    setAssignmentsLoading(false);

    if (clientsResult.status === 'fulfilled' && clientsResult.value.ok) {
      const data = await clientsResult.value.json();
      setClientsState({
        loading: false,
        error: null,
        data: {
          assignedClients: data.assignedClients ?? [],
          legacyDoctorAssignments: data.legacyDoctorAssignments ?? [],
        },
      });
    } else {
      setClientsState({
        loading: false,
        error: 'Failed to load assigned clients',
        data: { assignedClients: [], legacyDoctorAssignments: [] },
      });
    }

    if (dealParticipationResult.status === 'fulfilled' && dealParticipationResult.value.ok) {
      const data = await dealParticipationResult.value.json();
      setDealParticipationState({
        loading: false,
        error: null,
        data: data.deals ?? [],
      });
    } else {
      setDealParticipationState({
        loading: false,
        error: 'Failed to load deal participation',
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

    loadDashboardData();
  }, [profile, profileLoading, widgetRefreshKey, loadDashboardData]);

  const handleLeadCreated = useCallback(() => {
    setWidgetRefreshKey((key) => key + 1);
  }, []);

  const handleOpenAddLead = useCallback(() => setShowAddLead(true), []);
  const handleCloseAddLead = useCallback(() => setShowAddLead(false), []);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }, [router]);

  if (profileLoading) {
    return (
      <main className="min-h-screen bg-gray-100">
        <header className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
            <div className="h-8 w-32 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-6 w-48 animate-pulse rounded bg-gray-200" />
          </div>
        </header>
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
          <div className="h-16 animate-pulse rounded-xl bg-gray-200" />
          <SectionCard title="My Work" collapsible>
            <MyWorkSection
              clientsState={emptyClientsState}
              tasksState={emptyTasksState}
              dealParticipationState={emptyDealParticipationState}
              activityState={emptyActivityState}
            />
          </SectionCard>
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
  const showStatements = !assignmentsLoading && assignmentSummary?.hasDoctorRole === true;

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <h1 className="text-lg font-bold text-gray-900 sm:text-xl">
              Welcome, {displayName}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Account Settings
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {assignmentsError && (
        <div className="mx-auto max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
          <p className="text-sm text-red-600">{assignmentsError}</p>
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <QuickActionsRow
          onAddLead={handleOpenAddLead}
          showAddLead={!isSuperAdmin}
          showStatements={showStatements}
          showAdmin={isSuperAdmin}
        />

        <SectionCard
          title="My Work"
          description="Assigned clients, deal participation, tasks, and recent updates"
          collapsible
        >
          <MyWorkSection
            clientsState={clientsState}
            tasksState={tasksState}
            dealParticipationState={dealParticipationState}
            activityState={activityState}
          />
        </SectionCard>

        <SectionCard
          title="Schedule"
          description="Important dates for your clients and leads this month"
          collapsible
        >
          <ImportantDatesCalendarWidget refreshKey={widgetRefreshKey} />
        </SectionCard>

        <SectionCard
          title="Performance"
          description="Secured commission and returnables"
          collapsible
          defaultCollapsed
        >
          <PerformanceSection
            commissionState={commissionState}
            showReturnable={showStatements}
            widgetRefreshKey={widgetRefreshKey}
          />
        </SectionCard>
      </div>

      {showAddLead && (
        <AddLeadModal
          onClose={handleCloseAddLead}
          onCreated={handleLeadCreated}
        />
      )}
    </main>
  );
}
