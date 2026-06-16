import { DealStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/authHelpers';
import { buildCsv, csvResponse, getReportFormat, pdfResponse } from '@/lib/reports';

type GroupBy = 'month' | 'quarter' | 'year';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatPeriod(date: Date, groupBy: GroupBy): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (groupBy === 'year') return String(year);
  if (groupBy === 'quarter') return `Q${Math.floor(month / 3) + 1} ${year}`;
  return `${MONTH_NAMES[month]} ${year}`;
}

function sortKey(date: Date, groupBy: GroupBy): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (groupBy === 'year') return year;
  if (groupBy === 'quarter') return year * 10 + Math.floor(month / 3);
  return year * 100 + month;
}

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

  const wonDeals = await prisma.deal.findMany({
    where: { status: DealStatus.WON },
    select: { dealValue: true, totalCommission: true, updatedAt: true },
    orderBy: { updatedAt: 'asc' },
  });

  const periodMap = new Map<
    string,
    { period: string; revenue: number; profit: number; sortKey: number }
  >();

  for (const deal of wonDeals) {
    const period = formatPeriod(deal.updatedAt, groupBy);
    const key = sortKey(deal.updatedAt, groupBy);
    const revenue = Number(deal.dealValue);
    const commission = Number(deal.totalCommission);
    const existing = periodMap.get(period);

    if (existing) {
      existing.revenue += revenue;
      existing.profit += commission;
    } else {
      periodMap.set(period, { period, revenue, profit: commission, sortKey: key });
    }
  }

  const rows = Array.from(periodMap.values()).sort((a, b) => a.sortKey - b.sortKey);

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
    rows.map((row) => `${row.period}: Revenue $${row.revenue}, Profit $${row.profit}`)
  );
}
