'use client';

import type { PerformanceMetrics } from '@/lib/dashboardTypes';

type PerformanceSnapshotWidgetProps = {
  performanceMetrics: PerformanceMetrics;
};

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const KPI_ITEMS = [
  {
    key: 'totalActiveClients' as const,
    label: 'Total Active Clients',
    format: (value: number) => value.toString(),
  },
  {
    key: 'totalPipelineValue' as const,
    label: 'Total Pipeline Value',
    format: formatMoney,
  },
  {
    key: 'mySecuredCommission' as const,
    label: 'My Secured Commission',
    format: formatMoney,
  },
];

export default function PerformanceSnapshotWidget({
  performanceMetrics,
}: PerformanceSnapshotWidgetProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">My Performance Snapshot</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {KPI_ITEMS.map((item) => (
          <div
            key={item.key}
            className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-5 text-center"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {item.label}
            </p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {item.format(performanceMetrics[item.key])}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
