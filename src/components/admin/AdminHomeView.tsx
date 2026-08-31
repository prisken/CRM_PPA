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
    href: adminDashboardHref('analytics'),
    label: 'Reports',
    description: 'KPIs, revenue, funnel, and leaderboards',
  },
];

export default function AdminHomeView({
  displayName,
  onAddClient,
}: {
  displayName: string;
  onAddClient: () => void;
}) {
  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
        <h2 className="text-lg font-semibold text-gray-900">
          Welcome{displayName ? `, ${displayName}` : ''}
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Everything you need, one click away.
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
