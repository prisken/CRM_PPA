'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getCurrentCommissionReturnablePeriodParam } from '@/lib/commissionReturnables';

type CommissionReturnableRecord = {
  id: string;
  amount: number;
  status: string;
};

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function MyCommissionReturnableWidget() {
  const [returnables, setReturnables] = useState<CommissionReturnableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCurrentMonthReturnables() {
      try {
        const period = getCurrentCommissionReturnablePeriodParam();
        const token = localStorage.getItem('token');
        const res = await fetch(
          `/api/me/commission-returnable?status=UNPAID&period=${period}`,
          {
            credentials: 'same-origin',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Failed to load commission returnables'
          );
        }

        const data = await res.json();
        setReturnables(data.returnables ?? []);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to load commission returnables'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchCurrentMonthReturnables();
  }, []);

  const totalAmount = useMemo(
    () => returnables.reduce((sum, record) => sum + record.amount, 0),
    [returnables]
  );

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Current Month Commission Returnable
        </h2>
        <Link
          href="/my-statements"
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          View Statements
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 h-16 animate-pulse rounded-lg bg-gray-100" />
      ) : error ? (
        <p className="mt-4 text-sm text-red-600">{error}</p>
      ) : (
        <p className="mt-4 text-4xl font-bold text-gray-900">
          {formatMoney(totalAmount)}
        </p>
      )}
    </section>
  );
}
