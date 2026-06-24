'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useEffect, useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type Row,
} from '@tanstack/react-table';
import Logo from '@/components/Logo';
import { useUserProfile } from '@/hooks/useUserProfile';
import { formatCommissionReturnablePeriodLabel } from '@/lib/commissionReturnables';

type CommissionReturnableRecord = {
  id: string;
  amount: number;
  status: string;
  period: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
  };
  deal?: {
    dealValue?: number;
    client?: {
      name: string;
      company: string | null;
    };
  };
};

type ReconciliationRow = {
  id: string;
  userName: string;
  period: string;
  periodLabel: string;
  clientName: string;
  dealValue: number;
  returnableAmount: number;
  status: string;
};

const columnHelper = createColumnHelper<ReconciliationRow>();

const columns = [
  columnHelper.accessor('userName', { header: 'User Name' }),
  columnHelper.accessor('periodLabel', { header: 'Period' }),
  columnHelper.accessor('clientName', { header: 'Client Name' }),
  columnHelper.accessor('dealValue', {
    header: 'Deal Value',
    cell: (info) => formatMoney(info.getValue()),
  }),
  columnHelper.accessor('returnableAmount', {
    header: 'Returnable Amount',
    cell: (info) => formatMoney(info.getValue()),
  }),
  columnHelper.accessor('status', {
    header: 'Status',
    cell: (info) => {
      const status = info.getValue();
      return (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
            status === 'PAID'
              ? 'bg-green-100 text-green-800'
              : 'bg-amber-100 text-amber-800'
          }`}
        >
          {status}
        </span>
      );
    },
  }),
];

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

function getUserName(record: CommissionReturnableRecord) {
  if (!record.user) {
    return 'Unknown user';
  }

  return record.user.name ?? record.user.email;
}

const ReconciliationTableBody = memo(function ReconciliationTableBody({
  rows,
  columnCount,
}: {
  rows: Row<ReconciliationRow>[];
  columnCount: number;
}) {
  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td colSpan={columnCount} className="px-3 py-4 text-gray-500">
            No commission returnables found.
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <tbody>
      {rows.map((row) => (
        <tr key={row.id} className="border-b border-gray-100 last:border-0">
          {row.getVisibleCells().map((cell) => (
            <td key={cell.id} className="px-3 py-2 text-gray-800">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
});

export default function ReconciliationPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [returnables, setReturnables] = useState<CommissionReturnableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');

  useEffect(() => {
    if (!profileLoading && profile && profile.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [profile, profileLoading, router]);

  useEffect(() => {
    if (profileLoading || !profile || profile.role !== 'SUPER_ADMIN') {
      return;
    }

    async function loadReturnables() {
      setLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/admin/all-commission-returnable', {
          credentials: 'same-origin',
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : `Failed to load commission returnables (HTTP ${res.status})`
          );
        }

        const data = await res.json();
        setReturnables(data.returnables ?? []);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load commission returnables'
        );
      } finally {
        setLoading(false);
      }
    }

    loadReturnables();
  }, [profile, profileLoading]);

  const rows = useMemo<ReconciliationRow[]>(
    () =>
      returnables.map((record) => ({
        id: record.id,
        userName: getUserName(record),
        period: record.period,
        periodLabel: formatCommissionReturnablePeriodLabel(record.period),
        clientName: getClientName(record),
        dealValue: record.deal?.dealValue ?? 0,
        returnableAmount: record.amount,
        status: record.status,
      })),
    [returnables]
  );

  const periodOptions = useMemo(
    () =>
      [...new Set(rows.map((row) => row.period))].sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime()
      ),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const normalizedUserFilter = userFilter.trim().toLowerCase();

    return rows.filter((row) => {
      if (
        normalizedUserFilter &&
        !row.userName.toLowerCase().includes(normalizedUserFilter)
      ) {
        return false;
      }

      if (statusFilter && row.status !== statusFilter) {
        return false;
      }

      if (periodFilter && row.period !== periodFilter) {
        return false;
      }

      return true;
    });
  }, [rows, userFilter, statusFilter, periodFilter]);

  const table = useReactTable({
    data: filteredRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (profileLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading reconciliation dashboard...</p>
      </main>
    );
  }

  if (!profile || profile.role !== 'SUPER_ADMIN') {
    return null;
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
                Global Reconciliation Dashboard
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Audit commission returnables across all users
              </p>
            </div>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to Admin Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 grid gap-4 md:grid-cols-3">
            <div>
              <label
                htmlFor="user-filter"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                User Name
              </label>
              <input
                id="user-filter"
                type="text"
                value={userFilter}
                onChange={(event) => setUserFilter(event.target.value)}
                placeholder="Search by user name"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="status-filter"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Status
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="UNPAID">UNPAID</option>
                <option value="PAID">PAID</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="period-filter"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Period
              </label>
              <select
                id="period-filter"
                value={periodFilter}
                onChange={(event) => setPeriodFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">All periods</option>
                {periodOptions.map((period) => (
                  <option key={period} value={period}>
                    {formatCommissionReturnablePeriodLabel(period)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-gray-500">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} className="px-3 py-2 font-medium">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <ReconciliationTableBody
                rows={table.getRowModel().rows}
                columnCount={columns.length}
              />
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
