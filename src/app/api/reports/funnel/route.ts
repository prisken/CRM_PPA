import { NextResponse } from 'next/server';
import { getCachedAdminFunnelData } from '@/lib/adminAnalyticsCache';
import { requireSuperAdmin } from '@/lib/authHelpers';
import { buildCsv, csvResponse, getReportFormat, pdfResponse } from '@/lib/reports';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const format = getReportFormat(new URL(request.url).searchParams);
  if (!format) {
    return NextResponse.json({ error: "format must be 'pdf' or 'csv'" }, { status: 400 });
  }

  const rows = await getCachedAdminFunnelData();

  if (format === 'csv') {
    const csv = buildCsv(
      ['Stage', 'Count', 'Conversion Rate'],
      rows.map((row) => [
        row.stage,
        String(row.count),
        row.conversionRate?.toString() ?? '',
      ])
    );
    return csvResponse('conversion-funnel.csv', csv);
  }

  return pdfResponse(
    'conversion-funnel.pdf',
    'Conversion Funnel Report',
    rows.map(
      (row) =>
        `${row.stage}: ${row.count} clients${
          row.conversionRate != null ? ` (${row.conversionRate} conversion)` : ''
        }`
    )
  );
}
