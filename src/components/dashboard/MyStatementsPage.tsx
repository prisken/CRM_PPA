'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import Logo from '@/components/Logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatCommissionReturnablePeriodLabel } from '@/lib/commissionReturnables';
import { supabase } from '@/lib/supabaseClient';

type CommissionReturnableRecord = {
  id: string;
  amount: number;
  status: string;
  period: string;
  deal?: {
    id: string;
    name: string;
    dealValue?: number;
    client?: {
      name: string;
      company: string | null;
    };
  };
};

function formatMoney(value: number) {
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getClientName(record: CommissionReturnableRecord) {
  const client = record.deal?.client;
  if (!client) {
    return 'Unknown client';
  }

  return client.company ?? client.name;
}

function groupReturnablesByPeriod(returnables: CommissionReturnableRecord[]) {
  const groups = new Map<string, CommissionReturnableRecord[]>();

  for (const record of returnables) {
    const existing = groups.get(record.period) ?? [];
    existing.push(record);
    groups.set(record.period, existing);
  }

  return [...groups.entries()].sort(
    (a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()
  );
}

const StatementTableRow = memo(function StatementTableRow({
  record,
  isUpdating,
  onMarkAsPaid,
}: {
  record: CommissionReturnableRecord;
  isUpdating: boolean;
  onMarkAsPaid: (id: string) => void;
}) {
  const isUnpaid = record.status === 'UNPAID';

  return (
    <tr>
      <td className="py-3 pr-3 font-medium text-gray-900">{getClientName(record)}</td>
      <td className="py-3 pr-3 text-gray-700">
        {formatMoney(record.deal?.dealValue ?? 0)}
      </td>
      <td className="py-3 pr-3 text-gray-700">{formatMoney(record.amount)}</td>
      <td className="py-3 pr-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
            record.status === 'PAID'
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {record.status}
        </span>
      </td>
      <td className="py-3 text-right">
        {isUnpaid ? (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={false}
              disabled={isUpdating}
              onChange={() => onMarkAsPaid(record.id)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
            />
            {isUpdating ? 'Saving...' : 'Paid'}
          </label>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
    </tr>
  );
});

export default function MyStatementsPage() {
  const { profile, loading: profileLoading } = useUserProfile();
  const [returnables, setReturnables] = useState<CommissionReturnableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const loadReturnables = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/me/commission-returnable', {
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to load returnable statements'
        );
      }

      const data = await res.json();
      setReturnables(data.returnables ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load returnable statements'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profileLoading && profile) {
      loadReturnables();
    }
  }, [profile, profileLoading, loadReturnables]);

  const groupedReturnables = useMemo(
    () => groupReturnablesByPeriod(returnables),
    [returnables]
  );

  const handleMarkAsPaid = useCallback(async (id: string) => {
    setUpdatingIds((current) => new Set(current).add(id));
    setError(null);

    try {
      const res = await fetch(`/api/commission-returnable/${id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to mark returnable as paid'
        );
      }

      setReturnables((current) =>
        current.map((record) =>
          record.id === id ? { ...record, status: 'PAID' } : record
        )
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to mark returnable as paid'
      );
    } finally {
      setUpdatingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    window.location.href = '/login';
  }

  if (profileLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading statements...</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <AuthRequiredMessage message="Please log in to view your returnable statements." />
    );
  }

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
                Returnable Statements
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Commission returnables for {profile.name ?? profile.email}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to Dashboard
            </Link>
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
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {groupedReturnables.length === 0 ? (
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">No commission returnables yet.</p>
          </section>
        ) : (
          <div className="space-y-6">
            {groupedReturnables.map(([period, records]) => (
              <section
                key={period}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-gray-900">
                  {formatCommissionReturnablePeriodLabel(period)}
                </h2>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                        <th className="py-2 pr-3">Client Name</th>
                        <th className="py-2 pr-3">Deal Value</th>
                        <th className="py-2 pr-3">Returnable Amount</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 text-right">Mark as Paid</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {records.map((record) => (
                        <StatementTableRow
                          key={record.id}
                          record={record}
                          isUpdating={updatingIds.has(record.id)}
                          onMarkAsPaid={handleMarkAsPaid}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
