'use client';

/**
 * Active workspace modules for `/dashboard?view=…`.
 *
 * Loading rule (enforce in StandardUserDashboardPage):
 * - Mount exactly one of these when its view is active.
 * - Inactive modules must not mount — each owns its fetch in useEffect / child widgets.
 * - Home must not import this file (keeps widget code off the Home path).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CollapsibleActivityWidget from '@/components/dashboard/CollapsibleActivityWidget';
import ImportantDatesCalendarWidget from '@/components/dashboard/ImportantDatesCalendarWidget';
import MyClientsWidget from '@/components/dashboard/MyClientsWidget';
import MyCommissionReturnableWidget from '@/components/dashboard/MyCommissionReturnableWidget';
import MyDealParticipationWidget from '@/components/dashboard/MyDealParticipationWidget';
import MySecuredCommissionWidget from '@/components/dashboard/MySecuredCommissionWidget';
import MyTasksWidget from '@/components/dashboard/MyTasksWidget';
import CollapsibleActivityWidgetSkeleton from '@/components/dashboard/skeletons/CollapsibleActivityWidgetSkeleton';
import MyClientsWidgetSkeleton from '@/components/dashboard/skeletons/MyClientsWidgetSkeleton';
import MyDealParticipationWidgetSkeleton from '@/components/dashboard/skeletons/MyDealParticipationWidgetSkeleton';
import MySecuredCommissionWidgetSkeleton from '@/components/dashboard/skeletons/MySecuredCommissionWidgetSkeleton';
import MyTasksWidgetSkeleton from '@/components/dashboard/skeletons/MyTasksWidgetSkeleton';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type {
  AssignedClientRow,
  DealParticipationRow,
  GroupedClientActivity,
  OpenTaskRow,
} from '@/lib/dashboardTypes';

export type AssignmentSummary = {
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

const ACTIVITY_PREVIEW_GROUP_COUNT = 8;

/** Fetches assigned-clients only while mounted (`?view=clients`). */
export function DashboardClientsView({ refreshKey = 0 }: { refreshKey?: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignedClients, setAssignedClients] = useState<AssignedClientRow[]>([]);
  const [legacyDoctorAssignments, setLegacyDoctorAssignments] = useState<
    AssignedClientRow[]
  >([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(
          '/api/dashboard/widgets/assigned-clients'
        );
        if (!response.ok) {
          throw new Error('Failed to load assigned clients');
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setAssignedClients(data.assignedClients ?? []);
        setLegacyDoctorAssignments(data.legacyDoctorAssignments ?? []);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error ? err.message : 'Failed to load assigned clients'
        );
        setAssignedClients([]);
        setLegacyDoctorAssignments([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return <MyClientsWidgetSkeleton />;
  }

  return (
    <MyClientsWidget
      assignedClients={assignedClients}
      legacyDoctorAssignments={legacyDoctorAssignments}
      error={error}
    />
  );
}

/** Fetches open-tasks only while mounted (`?view=tasks`). */
export function DashboardTasksView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openTasks, setOpenTasks] = useState<OpenTaskRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch('/api/dashboard/widgets/open-tasks');
        if (!response.ok) {
          throw new Error('Failed to load open tasks');
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setOpenTasks(data.openTasks ?? []);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(err instanceof Error ? err.message : 'Failed to load open tasks');
        setOpenTasks([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <MyTasksWidgetSkeleton />;
  }

  return <MyTasksWidget openTasks={openTasks} error={error} />;
}

/** Fetches activity-feed only while mounted (`?view=activity`). */
export function DashboardActivityView({ refreshKey = 0 }: { refreshKey?: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recentActivity, setRecentActivity] = useState<GroupedClientActivity[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(
          '/api/dashboard/widgets/activity-feed'
        );
        if (!response.ok) {
          throw new Error('Failed to load recent activity');
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setRecentActivity(data.recentActivity ?? []);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error ? err.message : 'Failed to load recent activity'
        );
        setRecentActivity([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (loading) {
    return <CollapsibleActivityWidgetSkeleton />;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <CollapsibleActivityWidget
      recentActivity={recentActivity}
      title="Recent activity"
      maxVisibleGroups={ACTIVITY_PREVIEW_GROUP_COUNT}
    />
  );
}

/**
 * Mounts ImportantDatesCalendarWidget only for `?view=calendar`.
 * Calendar self-fetches `/api/dashboard/widgets/important-dates-calendar`.
 */
export function DashboardCalendarView({
  assignmentAccess,
}: {
  assignmentAccess?: {
    loading: boolean;
    hasRelationshipRole: boolean;
    assignments: AssignmentSummary['assignments'];
  };
}) {
  return <ImportantDatesCalendarWidget assignmentAccess={assignmentAccess} />;
}

/** Fetches deal-participation only while mounted (`?view=deals`). */
export function DashboardDealsView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deals, setDeals] = useState<DealParticipationRow[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(
          '/api/dashboard/widgets/deal-participation'
        );
        if (!response.ok) {
          throw new Error('Failed to load deal participation');
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setDeals(data.deals ?? []);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error ? err.message : 'Failed to load deal participation'
        );
        setDeals([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <MyDealParticipationWidgetSkeleton />;
  }

  return <MyDealParticipationWidget deals={deals} error={error} />;
}

/** Fetches performance-metrics only while mounted (`?view=commission`). */
export function DashboardCommissionView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasAnyAssignment, setHasAnyAssignment] = useState(false);
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(
          '/api/dashboard/widgets/performance-metrics'
        );
        if (!response.ok) {
          throw new Error('Failed to load secured commission');
        }

        const data = await response.json();
        if (cancelled) {
          return;
        }

        setHasAnyAssignment(data.hasAnyAssignment === true);
        setAmount(data.performanceMetrics?.mySecuredCommission ?? 0);
      } catch (err) {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error ? err.message : 'Failed to load secured commission'
        );
        setHasAnyAssignment(false);
        setAmount(0);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <MySecuredCommissionWidgetSkeleton />;
  }

  if (!hasAnyAssignment && !error) {
    return (
      <p className="text-sm text-gray-500">
        No secured commission yet. Assignments unlock this metric.
      </p>
    );
  }

  return <MySecuredCommissionWidget amount={amount} error={error} />;
}

/**
 * Mounts MyCommissionReturnableWidget only for `?view=returnables`.
 * Widget self-fetches `/api/me/commission-returnable`.
 */
export function DashboardReturnablesView() {
  return (
    <div className="space-y-4">
      <MyCommissionReturnableWidget />
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-700">
          View and mark returnables paid on the full statements page.
        </p>
        <Link
          href="/my-statements"
          className="mt-3 inline-flex rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Open Returnable Statements
        </Link>
      </div>
    </div>
  );
}
