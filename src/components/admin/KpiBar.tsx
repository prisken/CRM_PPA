'use client';

import { useEffect, useState } from 'react';
import { formatMoneyRequired } from '@/lib/formatMoney';

export type KpiData = {
  totalCommittedRevenue: number;
  totalPotentialRevenue: number;
  totalCommissionYTD: number;
  companyOverheadEarnings: number;
  pipelineVelocity: number;
  activeDeals: number;
};

type KpiBarProps = {
  data?: KpiData | null;
  loading?: boolean;
  error?: string | null;
};

const KPI_CARDS = [
  {
    key: 'totalCommittedRevenue' as const,
    title: 'Total Committed Revenue',
    format: 'currency',
  },
  {
    key: 'totalPotentialRevenue' as const,
    title: 'Total Potential Revenue',
    format: 'currency',
  },
  {
    key: 'totalCommissionYTD' as const,
    title: 'Total Commission YTD',
    format: 'currency',
  },
  { key: 'pipelineVelocity' as const, title: 'Pipeline Velocity', format: 'days' },
  { key: 'activeDeals' as const, title: 'Active Deals', format: 'number' },
];

function formatValue(value: number, format: string) {
  if (format === 'currency') {
    return formatMoneyRequired(value, {
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    });
  }
  if (format === 'days') {
    return `${value} days`;
  }
  return value.toLocaleString();
}

export default function KpiBar({
  data: externalData = null,
  loading: externalLoading,
  error: externalError = null,
}: KpiBarProps) {
  const [internalData, setInternalData] = useState<KpiData | null>(null);
  const [internalLoading, setInternalLoading] = useState(externalLoading === undefined);
  const [internalError, setInternalError] = useState<string | null>(null);

  const usesExternalData = externalLoading !== undefined;

  useEffect(() => {
    if (usesExternalData) {
      return;
    }

    async function fetchKpis() {
      try {
        const res = await fetch('/api/admin/dashboard-kpis');
        if (!res.ok) {
          throw new Error('Failed to load KPIs');
        }
        const json = await res.json();
        setInternalData(json);
      } catch (err) {
        setInternalError(err instanceof Error ? err.message : 'Failed to load KPIs');
      } finally {
        setInternalLoading(false);
      }
    }

    fetchKpis();
  }, [usesExternalData]);

  const data = usesExternalData ? externalData : internalData;
  const loading = usesExternalData ? externalLoading : internalLoading;
  const error = usesExternalData ? externalError : internalError;

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {KPI_CARDS.map((card) => (
          <div
            key={card.key}
            className="h-28 animate-pulse rounded-xl border border-gray-200 bg-white"
          />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? 'Unable to load KPI data'}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {KPI_CARDS.map((card) => (
        <div
          key={card.key}
          className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <p className="text-sm font-medium text-gray-500">{card.title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatValue(data[card.key], card.format)}
          </p>
        </div>
      ))}
    </div>
  );
}
