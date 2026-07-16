import { NextResponse } from 'next/server';
import { getCachedAdminLeaderboardsData } from '@/lib/adminAnalyticsCache';
import { requireSuperAdmin } from '@/lib/authHelpers';
import { buildCsv, csvResponse, getReportFormat, pdfResponse } from '@/lib/reports';
import { formatMoneyRequired } from '@/lib/formatMoney';

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

  const { commissionLeaderboard, dealsClosedLeaderboard } =
    await getCachedAdminLeaderboardsData();

  if (format === 'csv') {
    const csv = [
      'Commission Leaderboard',
      buildCsv(
        ['User', 'Total Commission', 'Deals Closed'],
        commissionLeaderboard.map((row) => [
          row.userName,
          String(row.totalCommission),
          String(row.dealsClosed),
        ])
      ),
      '',
      'Deals Closed Leaderboard',
      buildCsv(
        ['User', 'Deals Closed', 'Average Deal Value'],
        dealsClosedLeaderboard.map((row) => [
          row.userName,
          String(row.dealsClosed),
          String(row.averageDealValue),
        ])
      ),
    ].join('\n');

    return csvResponse('leaderboards.csv', csv);
  }

  const lines = [
    'Commission Leaderboard',
    ...commissionLeaderboard.map(
      (row) =>
        `${row.userName}: ${formatMoneyRequired(Math.round(row.totalCommission), {
          maximumFractionDigits: 0,
          minimumFractionDigits: 0,
        })} commission, ${row.dealsClosed} deals`
    ),
    '',
    'Deals Closed Leaderboard',
    ...dealsClosedLeaderboard.map(
      (row) =>
        `${row.userName}: ${row.dealsClosed} deals, avg ${formatMoneyRequired(row.averageDealValue, {
          maximumFractionDigits: 0,
          minimumFractionDigits: 0,
        })}`
    ),
  ];

  return pdfResponse('leaderboards.pdf', 'Leaderboards Report', lines);
}
