'use client';

/**
 * Super-admin Home — lightweight executive summary.
 *
 * Active-workspace-only loading:
 * - Does NOT mount MasterPipelineView, ImportantDatesCalendarWidget,
 *   CollapsibleActivityWidget, ConversionFunnelChart, RevenueTrackerChart,
 *   or Leaderboards.
 * - Intentionally fetches only cached `/api/admin/dashboard-kpis` for a tiny
 *   snapshot (4 numbers). Full KpiBar / funnel live under `?view=analytics`.
 * - Do not import `@/components/admin/adminDashboardViews` from this file.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  adminDashboardHref,
  type AdminDashboardView,
} from '@/components/layout/workspaceNavConfig';

/** Subset of KPI payload used for Home snapshot only — avoids importing KpiBar. */
type HomeKpiSnapshot = {
  totalCommittedRevenue?: number;
  totalPotentialRevenue?: number;
  activeDeals?: number;
  companyOverheadEarnings?: number;
};

const HOME_LINKS: Array<{
  href: string;
  label: string;
  description: string;
  featured?: boolean;
}> = [
  {
    href: '/admin/leads',
    label: 'Lead Command Center',
    description: 'Inbox, duplicates, and bulk lead actions',
    featured: true,
  },
  {
    href: adminDashboardHref('pipeline'),
    label: 'Pipeline',
    description: 'Master pipeline by stage',
  },
  {
    href: adminDashboardHref('calendar'),
    label: 'Calendar',
    description: 'Important dates across clients and leads',
  },
  {
    href: adminDashboardHref('activity'),
    label: 'Activity',
    description: 'Recent updates across all clients',
  },
  {
    href: adminDashboardHref('analytics'),
    label: 'Analytics',
    description: 'KPIs, company earnings, and conversion funnel',
  },
  {
    href: adminDashboardHref('revenue'),
    label: 'Revenue',
    description: 'Revenue tracker over time',
  },
  {
    href: adminDashboardHref('leaderboards'),
    label: 'Leaderboards',
    description: 'Commission and deals rankings',
  },
  {
    href: '/admin/reconciliation',
    label: 'Commission / Returnables',
    description: 'Global returnables reconciliation',
  },
  {
    href: '/admin/users',
    label: 'User Management',
    description: 'Deactivate or permanently delete users',
  },
];

function formatMoney(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AdminHomeView({
  displayName,
  onAddClient,
}: {
  displayName: string;
  onAddClient: () => void;
}) {
  const [kpiData, setKpiData] = useState<HomeKpiSnapshot | null>(null);
  const [kpiLoading, setKpiLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);

  // Home-owned light fetch only. Heavy section APIs must not run here.
  useEffect(() => {
    let cancelled = false;

    async function loadKpis() {
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

        const data = (await res.json()) as HomeKpiSnapshot;
        if (!cancelled) {
          setKpiData(data);
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
    <div className="min-w-0 space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-gray-900">
          Welcome{displayName ? `, ${displayName}` : ''}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Open a workspace section from the sidebar. Heavy charts and lists load only
          when selected.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/admin/leads"
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
          >
            Lead Command Center
          </Link>
          <button
            type="button"
            onClick={onAddClient}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add Lead / Client
          </button>
          <Link
            href="/dashboard"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            User Dashboard
          </Link>
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Account Settings
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Snapshot (cached KPIs)
        </p>
        {kpiLoading ? (
          <p className="mt-2 text-sm text-gray-500">Loading summary…</p>
        ) : kpiError ? (
          <p className="mt-2 text-sm text-red-600">{kpiError}</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Committed revenue
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-gray-900">
                {formatMoney(kpiData?.totalCommittedRevenue)}
              </p>
            </div>
            <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Potential revenue
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-gray-900">
                {formatMoney(kpiData?.totalPotentialRevenue)}
              </p>
            </div>
            <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Active deals
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-gray-900">
                {kpiData?.activeDeals ?? '—'}
              </p>
            </div>
            <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Company overhead
              </p>
              <p className="mt-1 truncate text-lg font-semibold text-gray-900">
                {formatMoney(kpiData?.companyOverheadEarnings)}
              </p>
            </div>
          </div>
        )}
        <Link
          href={adminDashboardHref('analytics' as AdminDashboardView)}
          className="mt-3 inline-flex text-sm font-medium text-blue-600 hover:underline"
        >
          Open full analytics →
        </Link>
      </section>

      <section aria-label="Admin workspace shortcuts">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {HOME_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`min-w-0 rounded-xl border p-4 shadow-sm transition active:bg-blue-50 ${
                link.featured
                  ? 'border-blue-200 bg-blue-50/60 hover:border-blue-300 hover:bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40'
              }`}
            >
              <p
                className={`text-sm font-semibold ${
                  link.featured ? 'text-blue-900' : 'text-gray-900'
                }`}
              >
                {link.label}
              </p>
              <p className="mt-1 text-xs leading-snug text-gray-600">
                {link.description}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
