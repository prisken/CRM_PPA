'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AddLeadModal from '@/components/dashboard/AddLeadModal';
import CollapsibleActivityWidget from '@/components/dashboard/CollapsibleActivityWidget';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import MyClientsWidget from '@/components/dashboard/MyClientsWidget';
import MyTasksWidget from '@/components/dashboard/MyTasksWidget';
import PerformanceSnapshotWidget from '@/components/dashboard/PerformanceSnapshotWidget';
import Logo from '@/components/Logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { StandardDashboardData } from '@/lib/dashboardTypes';
import { supabase } from '@/lib/supabaseClient';

export default function StandardUserDashboardPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [dashboardData, setDashboardData] = useState<StandardDashboardData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/dashboard/standard', {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to load dashboard data'
        );
      }

      const data = await res.json();
      setDashboardData(data);
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

    if (profile.role === 'SUPER_ADMIN') {
      router.replace('/admin');
      return;
    }

    loadDashboard();
  }, [profile, profileLoading, router, loadDashboard]);

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

  if (profileLoading || (loading && profile?.role !== 'SUPER_ADMIN')) {
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

  if (profile.role === 'SUPER_ADMIN') {
    return null;
  }

  if (error || !dashboardData) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
        <p className="text-red-600">{error ?? 'Failed to load dashboard'}</p>
      </main>
    );
  }

  const displayName = profile.name ?? profile.email;

  return (
    <main className="min-h-screen bg-gray-100">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Welcome back, {displayName}!
              </h1>
              <p className="mt-1 text-sm text-gray-500">Your personalized CRM dashboard</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setShowAddLead(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add Lead
            </button>
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
          <PerformanceSnapshotWidget
            performanceMetrics={dashboardData.performanceMetrics}
          />
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
