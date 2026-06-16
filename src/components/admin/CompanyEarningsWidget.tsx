'use client';

import { useEffect, useState } from 'react';

type DashboardKpiResponse = {
  companyOverheadEarnings: number;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CompanyEarningsWidget() {
  const [companyOverheadEarnings, setCompanyOverheadEarnings] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCompanyEarnings() {
      try {
        const res = await fetch('/api/admin/dashboard-kpis');
        if (!res.ok) {
          throw new Error('Failed to load company earnings');
        }

        const data = (await res.json()) as DashboardKpiResponse;
        setCompanyOverheadEarnings(data.companyOverheadEarnings);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load company earnings'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchCompanyEarnings();
  }, []);

  if (loading) {
    return (
      <div className="h-28 max-w-sm animate-pulse rounded-xl border border-gray-200 bg-white" />
    );
  }

  if (error || companyOverheadEarnings === null) {
    return (
      <div className="max-w-sm rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? 'Unable to load company earnings'}
      </div>
    );
  }

  return (
    <div className="max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">Company Overhead Earnings</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">
        {formatCurrency(companyOverheadEarnings)}
      </p>
    </div>
  );
}
