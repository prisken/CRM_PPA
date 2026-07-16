import { NextResponse } from 'next/server';
import { getCachedAdminRevenueTrackerData } from '@/lib/adminAnalyticsCache';
import { requireSuperAdmin } from '@/lib/authHelpers';
import { buildCsv, csvResponse, getReportFormat, pdfResponse } from '@/lib/reports';
import { formatMoneyRequired } from '@/lib/formatMoney';

export const dynamic = 'force-dynamic';

type GroupBy = 'month' | 'quarter' | 'year';

export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const format = getReportFormat(searchParams);
  const groupBy = (searchParams.get('groupBy') ?? 'month') as GroupBy;

  if (!format) {
    return NextResponse.json({ error: "format must be 'pdf' or 'csv'" }, { status: 400 });
  }

  if (!['month', 'quarter', 'year'].includes(groupBy)) {
    return NextResponse.json({ error: 'Invalid groupBy parameter' }, { status: 400 });
  }

  const rows = await getCachedAdminRevenueTrackerData(groupBy);

  if (format === 'csv') {
    const csv = buildCsv(
      ['Period', 'Revenue', 'Profit'],
      rows.map((row) => [row.period, String(row.revenue), String(row.profit)])
    );
    return csvResponse('revenue-tracker.csv', csv);
  }

  return pdfResponse(
    'revenue-tracker.pdf',
    `Revenue Tracker Report (${groupBy})`,
    rows.map(
      (row) =>
        `${row.period}: Revenue ${formatMoneyRequired(row.revenue)}, Profit ${formatMoneyRequired(row.profit)}`
    )
  );
}
