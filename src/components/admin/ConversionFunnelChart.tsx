'use client';

import { useEffect, useState } from 'react';
import {
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import WidgetDownloadMenu from '@/components/admin/WidgetDownloadMenu';

type FunnelStage = {
  stage: string;
  count: number;
  conversionRate: number | null;
};

export default function ConversionFunnelChart() {
  const [data, setData] = useState<FunnelStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFunnel() {
      try {
        const res = await fetch('/api/admin/funnel-data');
        if (!res.ok) {
          throw new Error('Failed to load funnel data');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load funnel data');
      } finally {
        setLoading(false);
      }
    }

    fetchFunnel();
  }, []);

  const chartData = data.map((item) => ({
    name: item.stage,
    value: item.count,
    conversionRate: item.conversionRate,
  }));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Conversion Funnel</h2>
        <WidgetDownloadMenu
          links={[
            { label: 'Download as PDF', href: '/api/reports/funnel?format=pdf' },
            { label: 'Download as CSV', href: '/api/reports/funnel?format=csv' },
          ]}
        />
      </div>

      {loading && <p className="text-sm text-gray-500">Loading funnel...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart>
              <Tooltip
                formatter={(value) => {
                  const count = typeof value === 'number' ? value : 0;
                  return [count, 'Clients'];
                }}
              />
              <Funnel dataKey="value" data={chartData} isAnimationActive>
                <LabelList position="right" fill="#374151" stroke="none" dataKey="name" />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
