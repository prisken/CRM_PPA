'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import WidgetDownloadMenu from '@/components/admin/WidgetDownloadMenu';

type GroupBy = 'month' | 'quarter' | 'year';

type RevenuePeriod = {
  period: string;
  revenue: number;
  profit: number;
};

const GROUP_OPTIONS: { label: string; value: GroupBy }[] = [
  { label: 'Month', value: 'month' },
  { label: 'Quarter', value: 'quarter' },
  { label: 'Year', value: 'year' },
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function RevenueTrackerChart() {
  const [groupBy, setGroupBy] = useState<GroupBy>('month');
  const [data, setData] = useState<RevenuePeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRevenue() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/admin/revenue-tracker?groupBy=${groupBy}`);
        if (!res.ok) {
          throw new Error('Failed to load revenue data');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load revenue data');
      } finally {
        setLoading(false);
      }
    }

    fetchRevenue();
  }, [groupBy]);

  const downloadLinks = useMemo(
    () => [
      {
        label: 'Download as PDF',
        href: `/api/reports/revenue?format=pdf&groupBy=${groupBy}`,
      },
      {
        label: 'Download as CSV',
        href: `/api/reports/revenue?format=csv&groupBy=${groupBy}`,
      },
    ],
    [groupBy]
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">Revenue Tracker</h2>
        <div className="flex items-center gap-2">
          <WidgetDownloadMenu links={downloadLinks} />
          {GROUP_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setGroupBy(option.value)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                groupBy === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="text-sm text-gray-500">Loading revenue...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value) => {
                  const amount = typeof value === 'number' ? value : 0;
                  return currencyFormatter.format(amount);
                }}
              />
              <Legend />
              <Bar dataKey="revenue" fill="#2563eb" name="Revenue" radius={[4, 4, 0, 0]} />
              <Bar dataKey="profit" fill="#16a34a" name="Profit" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export default memo(RevenueTrackerChart);
