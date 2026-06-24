'use client';

import { memo, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import WidgetDownloadMenu from '@/components/admin/WidgetDownloadMenu';

type CommissionRow = {
  userName: string;
  totalCommission: number;
  dealsClosed: number;
};

type DealsClosedRow = {
  userName: string;
  dealsClosed: number;
  averageDealValue: number;
};

type LeaderboardData = {
  commissionLeaderboard: CommissionRow[];
  dealsClosedLeaderboard: DealsClosedRow[];
};

const commissionHelper = createColumnHelper<CommissionRow>();
const dealsHelper = createColumnHelper<DealsClosedRow>();

const commissionColumns = [
  commissionHelper.accessor('userName', { header: 'User' }),
  commissionHelper.accessor('totalCommission', {
    header: 'Total Commission',
    cell: (info) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(info.getValue()),
  }),
  commissionHelper.accessor('dealsClosed', { header: 'Deals Closed' }),
] as ColumnDef<CommissionRow>[];

const dealsColumns = [
  dealsHelper.accessor('userName', { header: 'Relationship Specialist' }),
  dealsHelper.accessor('dealsClosed', { header: 'Deals Closed' }),
  dealsHelper.accessor('averageDealValue', {
    header: 'Avg Deal Value',
    cell: (info) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }).format(info.getValue()),
  }),
] as ColumnDef<DealsClosedRow>[];

const LEADERBOARD_DOWNLOAD_LINKS = [
  { label: 'Download as PDF', href: '/api/reports/leaderboards?format=pdf' },
  { label: 'Download as CSV', href: '/api/reports/leaderboards?format=csv' },
];

const DataTable = memo(function DataTable<T>({
  title,
  data,
  columns,
}: {
  title: string;
  data: T[];
  columns: ColumnDef<T>[];
}) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-gray-900">{title}</h3>
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
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-3 py-4 text-gray-500">
                  No data available
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 text-gray-800">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}) as <T>(props: {
  title: string;
  data: T[];
  columns: ColumnDef<T>[];
}) => ReactElement;

export default function Leaderboards() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLeaderboards() {
      try {
        const res = await fetch('/api/admin/leaderboards');
        if (!res.ok) {
          throw new Error('Failed to load leaderboards');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboards');
      } finally {
        setLoading(false);
      }
    }

    fetchLeaderboards();
  }, []);

  const commissionData = useMemo(
    () => data?.commissionLeaderboard ?? [],
    [data]
  );
  const dealsData = useMemo(
    () => data?.dealsClosedLeaderboard ?? [],
    [data]
  );

  if (loading) {
    return <p className="text-sm text-gray-500">Loading leaderboards...</p>;
  }

  if (error || !data) {
    return <p className="text-sm text-red-600">{error ?? 'Unable to load leaderboards'}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Team Leaderboards</h2>
        <WidgetDownloadMenu links={LEADERBOARD_DOWNLOAD_LINKS} />
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <DataTable
        title="Commission Leaderboard (YTD)"
        data={commissionData}
        columns={commissionColumns}
      />
      <DataTable
        title="Deals Closed — Relationship Specialists"
        data={dealsData}
        columns={dealsColumns}
      />
      </div>
    </div>
  );
}
