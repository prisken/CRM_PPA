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
import Logo from '@/components/Logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { StandardDashboardData } from '@/lib/dashboardTypes';
import { supabase } from '@/lib/supabaseClient';

type AssignmentSummary = {
  hasAnyAssignment: boolean;
  hasDoctorRole: boolean;
};

export default function StandardUserDashboardPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [dashboardData, setDashboardData] = useState<StandardDashboardData | null>(
    null
  );
  const [assignmentSummary, setAssignmentSummary] =
    useState<AssignmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;

      const [dashboardRes, assignmentsRes] = await Promise.all([
        fetch('/api/dashboard/standard', {
          credentials: 'same-origin',
          headers: authHeaders,
        }),
        fetch('/api/me/assignments', {
          credentials: 'same-origin',
          headers: authHeaders,
        }),
      ]);

      if (!dashboardRes.ok) {
        const data = await dashboardRes.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to load dashboard data'
        );
      }

      if (!assignmentsRes.ok) {
        const data = await assignmentsRes.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to load assignment data'
        );
      }

      const [dashboard, assignments] = await Promise.all([
        dashboardRes.json(),
        assignmentsRes.json(),
      ]);

      setDashboardData(dashboard);
      setAssignmentSummary({
        hasAnyAssignment: assignments.hasAnyAssignment === true,
        hasDoctorRole: assignments.hasDoctorRole === true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileLoading) {
      return;
    }

    if (!profile) {
      setLoading(false);
      return;
    }

    loadDashboard();
  }, [profile, profileLoading, loadDashboard]);

  function handleTaskCompleted(taskId: string) {
    setDashboardData((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        openTasks: current.openTasks.filter((task) => task.taskId !== taskId),
      };
    });
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }

  if (profileLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading dashboard...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <AuthRequiredMessage message="Please log in to view your dashboard." />
    );
  }

  if (error || !dashboardData || !assignmentSummary) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <p className="text-red-600">{error ?? 'Failed to load dashboard'}</p>
      </main>
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
            {assignmentSummary.hasDoctorRole && (
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

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <MyClientsWidget assignedClients={dashboardData.assignedClients} />
          <MyTasksWidget
            openTasks={dashboardData.openTasks}
            onTaskCompleted={handleTaskCompleted}
          />
          <CollapsibleActivityWidget
            recentActivity={dashboardData.recentActivity}
            title="Recent Activity on My Clients"
          />
          {assignmentSummary.hasAnyAssignment && (
            <MySecuredCommissionWidget
              amount={dashboardData.performanceMetrics.mySecuredCommission}
            />
          )}
          {assignmentSummary.hasDoctorRole && <MyCommissionReturnableWidget />}
        </div>
      </div>

      {showAddLead && (
        <AddLeadModal
          onClose={() => setShowAddLead(false)}
          onCreated={loadDashboard}
        />
      )}
    </main>
  );
}
