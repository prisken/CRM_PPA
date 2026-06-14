import { AssignmentRole, DealStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdmin } from '@/lib/authHelpers';
import { buildCsv, csvResponse, getReportFormat, pdfResponse } from '@/lib/reports';

const COMMISSION_RATES: Record<AssignmentRole, number> = {
  RELATIONSHIP: 0.15,
  DOCTOR: 0.1,
  ACCOUNT_SERVICE: 0.1,
};

function getYearStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const format = getReportFormat(new URL(request.url).searchParams);
  if (!format) {
    return NextResponse.json({ error: "format must be 'pdf' or 'csv'" }, { status: 400 });
  }

  const yearStart = getYearStart();
  const [wonDealsYTD, assignments] = await Promise.all([
    prisma.deal.findMany({
      where: { status: DealStatus.WON, updatedAt: { gte: yearStart } },
      select: { clientId: true, dealValue: true, grossProfit: true },
    }),
    prisma.clientAssignment.findMany({
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  const assignmentsByClient = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const list = assignmentsByClient.get(assignment.clientId) ?? [];
    list.push(assignment);
    assignmentsByClient.set(assignment.clientId, list);
  }

  const commissionStats = new Map<
    string,
    { userName: string; totalCommission: number; dealsClosed: number }
  >();
  const relationshipStats = new Map<
    string,
    { userName: string; dealsClosed: number; totalDealValue: number }
  >();

  for (const deal of wonDealsYTD) {
    const clientAssignments = assignmentsByClient.get(deal.clientId) ?? [];
    const dealValue = Number(deal.dealValue);
    const grossProfit = Number(deal.grossProfit);

    for (const assignment of clientAssignments) {
      const userName = assignment.user.name ?? assignment.user.email;
      const commission = grossProfit * COMMISSION_RATES[assignment.role];
      const commissionEntry = commissionStats.get(assignment.userId) ?? {
        userName,
        totalCommission: 0,
        dealsClosed: 0,
      };
      commissionEntry.totalCommission += commission;
      commissionEntry.dealsClosed += 1;
      commissionStats.set(assignment.userId, commissionEntry);

      if (assignment.role === AssignmentRole.RELATIONSHIP) {
        const relEntry = relationshipStats.get(assignment.userId) ?? {
          userName,
          dealsClosed: 0,
          totalDealValue: 0,
        };
        relEntry.dealsClosed += 1;
        relEntry.totalDealValue += dealValue;
        relationshipStats.set(assignment.userId, relEntry);
      }
    }
  }

  const commissionRows = Array.from(commissionStats.values()).sort(
    (a, b) => b.totalCommission - a.totalCommission
  );
  const dealsRows = Array.from(relationshipStats.values()).sort(
    (a, b) => b.dealsClosed - a.dealsClosed
  );

  if (format === 'csv') {
    const csv = [
      'Commission Leaderboard',
      buildCsv(
        ['User', 'Total Commission', 'Deals Closed'],
        commissionRows.map((row) => [
          row.userName,
          String(Math.round(row.totalCommission * 100) / 100),
          String(row.dealsClosed),
        ])
      ),
      '',
      'Deals Closed Leaderboard',
      buildCsv(
        ['User', 'Deals Closed', 'Average Deal Value'],
        dealsRows.map((row) => [
          row.userName,
          String(row.dealsClosed),
          String(
            row.dealsClosed > 0
              ? Math.round((row.totalDealValue / row.dealsClosed) * 100) / 100
              : 0
          ),
        ])
      ),
    ].join('\n');

    return csvResponse('leaderboards.csv', csv);
  }

  const lines = [
    'Commission Leaderboard',
    ...commissionRows.map(
      (row) =>
        `${row.userName}: $${Math.round(row.totalCommission)} commission, ${row.dealsClosed} deals`
    ),
    '',
    'Deals Closed Leaderboard',
    ...dealsRows.map((row) => {
      const avg =
        row.dealsClosed > 0
          ? Math.round((row.totalDealValue / row.dealsClosed) * 100) / 100
          : 0;
      return `${row.userName}: ${row.dealsClosed} deals, avg $${avg}`;
    }),
  ];

  return pdfResponse('leaderboards.pdf', 'Leaderboards Report', lines);
}
