'use client';

import { useEffect, useState } from 'react';

type CompanyEarningsWidgetProps = {
  companyOverheadEarnings?: number | null;
  loading?: boolean;
  error?: string | null;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
}

export default function CompanyEarningsWidget({
  companyOverheadEarnings: externalEarnings = null,
  loading: externalLoading,
  error: externalError = null,
}: CompanyEarningsWidgetProps) {
  const [internalEarnings, setInternalEarnings] = useState<number | null>(null);
  const [internalLoading, setInternalLoading] = useState(externalLoading === undefined);
  const [internalError, setInternalError] = useState<string | null>(null);

  const usesExternalData = externalLoading !== undefined;

  useEffect(() => {
    if (usesExternalData) {
      return;
    }

    async function fetchCompanyEarnings() {
      try {
        const res = await fetch('/api/admin/dashboard-kpis');
        if (!res.ok) {
          throw new Error('Failed to load company earnings');
        }

        const data = await res.json();
        setInternalEarnings(data.companyOverheadEarnings);
      } catch (err) {
        setInternalError(
          err instanceof Error ? err.message : 'Failed to load company earnings'
        );
      } finally {
        setInternalLoading(false);
      }
    }

    fetchCompanyEarnings();
  }, [usesExternalData]);

  const companyOverheadEarnings = usesExternalData
    ? externalEarnings
    : internalEarnings;
  const loading = usesExternalData ? externalLoading : internalLoading;
  const error = usesExternalData ? externalError : internalError;

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
