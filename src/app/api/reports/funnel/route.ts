import { ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/authHelpers';
import { buildCsv, csvResponse, getReportFormat, pdfResponse } from '@/lib/reports';

const FUNNEL_STAGES = [
  { stage: 'New Lead', status: ClientStatus.NEW_LEAD },
  { stage: 'Contacted', status: ClientStatus.CONTACTED },
  { stage: 'Nurturing', status: ClientStatus.NURTURING },
  { stage: 'Strategy Session', status: ClientStatus.STRATEGY_SESSION },
  { stage: 'Active Client', status: ClientStatus.ACTIVE_CLIENT },
];

export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const format = getReportFormat(new URL(request.url).searchParams);
  if (!format) {
    return NextResponse.json({ error: "format must be 'pdf' or 'csv'" }, { status: 400 });
  }

  const statusCounts = await prisma.client.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  const countByStatus = new Map(
    statusCounts.map((row) => [row.status, row._count.id])
  );

  let previousCount: number | null = null;
  const rows = FUNNEL_STAGES.map(({ stage, status }) => {
    const count = countByStatus.get(status) ?? 0;
    const conversionRate =
      previousCount !== null && previousCount > 0
        ? Math.round((count / previousCount) * 100) / 100
        : null;
    previousCount = count;
    return { stage, count, conversionRate };
  });

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
