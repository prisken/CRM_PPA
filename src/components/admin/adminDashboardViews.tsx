'use client';

/**
 * Active SUPER_ADMIN workspace modules for `/admin?view=…`.
 *
 * Loading rule (enforced in SuperAdminDashboardPage):
 * - Mount exactly one of these when its view is active.
 * - Inactive modules must not mount — each owns its fetch in useEffect / child widgets.
 * - Home must not import this file (keeps pipeline/calendar/charts off the Home path).
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import CompanyEarningsWidget from '@/components/admin/CompanyEarningsWidget';
import ConversionFunnelChart from '@/components/admin/ConversionFunnelChart';
import KpiBar, { type KpiData } from '@/components/admin/KpiBar';
import Leaderboards from '@/components/admin/Leaderboards';
import MasterPipelineView from '@/components/admin/MasterPipelineView';
import RevenueTrackerChart from '@/components/admin/RevenueTrackerChart';
import CollapsibleActivityWidget from '@/components/dashboard/CollapsibleActivityWidget';
import ImportantDatesCalendarWidget from '@/components/dashboard/ImportantDatesCalendarWidget';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getStackSpacingClass } from '@/components/ui/displayDensity';
import type { SuperAdminDashboardData } from '@/lib/dashboardTypes';

/** Mounts MasterPipelineView only for `?view=pipeline` — self-fetches pipeline API. */
export function AdminPipelineView({
  refreshKey,
  onAddClick,
}: {
  refreshKey: number;
  onAddClick: () => void;
}) {
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">
          Day-to-day lead work lives in Lead Command Center.
        </p>
        <Link
          href="/admin/leads"
          className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-100"
        >
          Open Lead Command Center
        </Link>
      </div>
      {/* Kanban may scroll horizontally inside MasterPipelineView only. */}
      <div className="min-w-0">
        <MasterPipelineView refreshKey={refreshKey} onAddClick={onAddClick} />
      </div>
    </div>
  );
}

/**
 * Mounts ImportantDatesCalendarWidget only for `?view=calendar`.
 * Calendar self-fetches `/api/dashboard/widgets/important-dates-calendar`.
 */
export function AdminCalendarView() {
  const { density } = useDisplayDensity();

  return (
    <div
      className={`min-w-0 ${
        density === 'compact' ? 'min-h-[min(70dvh,52rem)]' : 'min-h-[min(75dvh,56rem)]'
      }`}
    >
      <ImportantDatesCalendarWidget />
    </div>
  );
}

/** Fetches `/api/dashboard/superadmin` only while mounted (`?view=activity`). */
export function AdminActivityView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SuperAdminDashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/dashboard/superadmin', {
          credentials: 'same-origin',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body.error === 'string'
              ? body.error
              : 'Failed to load admin activity feed'
          );
        }

        const json = (await res.json()) as SuperAdminDashboardData;
        if (!cancelled) {
          setData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load admin activity feed'
          );
          setData(null);
        }
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
    return <div className="h-48 animate-pulse rounded-lg bg-gray-100" />;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <div className="min-w-0">
      <CollapsibleActivityWidget
        recentActivity={data?.recentActivity ?? []}
        title="Recent activity"
        showOuterTitle={false}
      />
    </div>
  );
}

/**
 * KPIs + company earnings + conversion funnel (`?view=analytics`).
 * Full-width stacked layout; does not mount revenue tracker or leaderboards.
 */
export function AdminAnalyticsView() {
  const { density } = useDisplayDensity();
  const stackClass = getStackSpacingClass(density);
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadKpis() {
      setKpiLoading(true);
      setKpiError(null);

      try {
        const res = await fetch('/api/admin/dashboard-kpis');
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            typeof body.error === 'string' ? body.error : 'Failed to load KPIs'
          );
        }

        const json = (await res.json()) as KpiData;
        if (!cancelled) {
          setKpiData(json);
        }
      } catch (err) {
        if (!cancelled) {
          setKpiError(err instanceof Error ? err.message : 'Failed to load KPIs');
          setKpiData(null);
        }
      } finally {
        if (!cancelled) {
          setKpiLoading(false);
        }
      }
    }

    void loadKpis();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`min-w-0 ${stackClass}`}>
      <div className="min-w-0 w-full">
        <KpiBar data={kpiData} loading={kpiLoading} error={kpiError} />
      </div>
      <div className="min-w-0 w-full max-w-md">
        <CompanyEarningsWidget
          companyOverheadEarnings={kpiData?.companyOverheadEarnings ?? null}
          loading={kpiLoading}
          error={kpiError}
        />
      </div>
      <div className="min-w-0 w-full">
        <ConversionFunnelChart />
      </div>
    </div>
  );
}

/** Mounts RevenueTrackerChart only for `?view=revenue` — self-fetches revenue API. */
export function AdminRevenueView() {
  return (
    <div className="min-w-0 w-full">
      <RevenueTrackerChart />
    </div>
  );
}

/** Mounts Leaderboards only for `?view=leaderboards` — self-fetches leaderboards API. */
export function AdminLeaderboardsView() {
  return (
    <div className="min-w-0 w-full">
      <Leaderboards />
    </div>
  );
}
