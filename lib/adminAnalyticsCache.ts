import { AssignmentRole, ClientStatus, DealStatus, Prisma } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { COMPANY_OVERHEAD_RATE } from '@/lib/constants';
import { timeAsync } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export const ADMIN_ANALYTICS_REVALIDATE_SECONDS = 600;

export type AdminFunnelStage = {
  stage: string;
  count: number;
  conversionRate: number | null;
};

export type AdminRevenuePeriod = {
  period: string;
  revenue: number;
  profit: number;
};

export type AdminLeaderboardsData = {
  commissionLeaderboard: {
    userName: string;
    totalCommission: number;
    dealsClosed: number;
  }[];
  dealsClosedLeaderboard: {
    userName: string;
    dealsClosed: number;
    averageDealValue: number;
  }[];
};

export type AdminDashboardKpis = {
  totalCommittedRevenue: number;
  totalPotentialRevenue: number;
  totalCommissionYTD: number;
  companyOverheadEarnings: number;
  pipelineVelocity: number;
  activeDeals: number;
};

type RevenueGroupBy = 'month' | 'quarter' | 'year';

const FUNNEL_STAGES: { stage: string; status: ClientStatus }[] = [
  { stage: 'New Lead', status: ClientStatus.NEW_LEAD },
  { stage: 'Contacted', status: ClientStatus.CONTACTED },
  { stage: 'Nurturing', status: ClientStatus.NURTURING },
  { stage: 'Strategy Session', status: ClientStatus.STRATEGY_SESSION },
  { stage: 'Active Client', status: ClientStatus.ACTIVE_CLIENT },
];

const LEADERBOARD_COMMISSION_RATES: Record<AssignmentRole, number> = {
  RELATIONSHIP: 0.15,
  DOCTOR: 0.1,
  ACCOUNT_SERVICE: 0.1,
};

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function getYearStart() {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

function getUserName(name: string | null, email: string) {
  return name?.trim() || email;
}

function formatRevenuePeriod(year: number, month: number, groupBy: RevenueGroupBy) {
  if (groupBy === 'year') {
    return String(year);
  }

  if (groupBy === 'quarter') {
    const quarter = Math.floor((month - 1) / 3) + 1;
    return `Q${quarter} ${year}`;
  }

  return `${MONTH_NAMES[month - 1]} ${year}`;
}

async function loadAdminFunnelData(): Promise<AdminFunnelStage[]> {
  return timeAsync('cache:admin-funnel-data', async () => {
  const statusCounts = await prisma.client.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  const countByStatus = new Map(
    statusCounts.map((row) => [row.status, row._count.id])
  );

  let previousCount: number | null = null;

  return FUNNEL_STAGES.map(({ stage, status }) => {
    const count = countByStatus.get(status) ?? 0;

    let conversionRate: number | null = null;
    if (previousCount !== null && previousCount > 0) {
      conversionRate = Math.round((count / previousCount) * 100) / 100;
    }

    previousCount = count;

    return { stage, count, conversionRate };
  });
  });
}

async function loadAdminDashboardKpis(): Promise<AdminDashboardKpis> {
  return timeAsync('cache:admin-dashboard-kpis', async () => {
  const yearStart = getYearStart();

  const [
    wonDealsYTD,
    committedRevenue,
    potentialRevenue,
    velocityResult,
    activeDeals,
    wonCommissionTotal,
  ] = await Promise.all([
    prisma.deal.aggregate({
      where: {
        status: DealStatus.WON,
        updatedAt: { gte: yearStart },
      },
      _sum: {
        dealValue: true,
        totalCommission: true,
      },
    }),
    prisma.deal.aggregate({
      where: { status: DealStatus.WON },
      _sum: { dealValue: true },
    }),
    prisma.deal.aggregate({
      where: { status: DealStatus.PROPOSED },
      _sum: { dealValue: true },
    }),
    prisma.$queryRaw<[{ avg_days: number | null }]>(Prisma.sql`
      SELECT AVG(
        EXTRACT(EPOCH FROM (d."updatedAt" - c."createdAt")) / 86400.0
      ) AS avg_days
      FROM "Deal" d
      INNER JOIN "Client" c ON c.id = d."clientId"
      WHERE d.status = ${DealStatus.WON}::"DealStatus"
    `),
    prisma.deal.count({
      where: {
        status: { notIn: [DealStatus.WON, DealStatus.LOST] },
      },
    }),
    prisma.deal.aggregate({
      where: { status: DealStatus.WON },
      _sum: { totalCommission: true },
    }),
  ]);

  const avgDays = velocityResult[0]?.avg_days;
  const pipelineVelocity =
    avgDays !== null && avgDays !== undefined ? Number(avgDays) : 0;

  return {
    totalCommittedRevenue: Number(committedRevenue._sum.dealValue ?? 0),
    totalPotentialRevenue: Number(potentialRevenue._sum.dealValue ?? 0),
    totalCommissionYTD: Number(wonDealsYTD._sum.totalCommission ?? 0),
    companyOverheadEarnings:
      Number(wonCommissionTotal._sum.totalCommission ?? 0) * COMPANY_OVERHEAD_RATE,
    pipelineVelocity: Math.round(pipelineVelocity * 10) / 10,
    activeDeals,
  };
  });
}

async function loadAdminLeaderboardsData(): Promise<AdminLeaderboardsData> {
  return timeAsync('cache:admin-leaderboards', async () => {
  const yearStart = getYearStart();

  const wonDealsYTD = await prisma.deal.findMany({
    where: {
      status: DealStatus.WON,
      updatedAt: { gte: yearStart },
    },
    select: {
      clientId: true,
      dealValue: true,
      totalCommission: true,
    },
  });

  const clientIds = [...new Set(wonDealsYTD.map((deal) => deal.clientId))];

  const assignments =
    clientIds.length === 0
      ? []
      : await prisma.clientAssignment.findMany({
          where: { clientId: { in: clientIds } },
          select: {
            clientId: true,
            role: true,
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        });

  const assignmentsByClient = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const existing = assignmentsByClient.get(assignment.clientId) ?? [];
    existing.push(assignment);
    assignmentsByClient.set(assignment.clientId, existing);
  }

  const userStats = new Map<
    string,
    {
      userName: string;
      totalCommission: number;
      dealsClosed: number;
      totalDealValue: number;
    }
  >();
  const relationshipStats = new Map<
    string,
    { userName: string; dealsClosed: number; totalDealValue: number }
  >();

  for (const deal of wonDealsYTD) {
    const clientAssignments = assignmentsByClient.get(deal.clientId) ?? [];
    const dealValue = Number(deal.dealValue);
    const totalCommission = Number(deal.totalCommission);

    for (const assignment of clientAssignments) {
      const userId = assignment.user.id;
      const userName = getUserName(assignment.user.name, assignment.user.email);

      const existing = userStats.get(userId) ?? {
        userName,
        totalCommission: 0,
        dealsClosed: 0,
        totalDealValue: 0,
      };

      existing.totalCommission +=
        totalCommission * LEADERBOARD_COMMISSION_RATES[assignment.role];
      existing.dealsClosed += 1;
      existing.totalDealValue += dealValue;
      userStats.set(userId, existing);

      if (assignment.role === AssignmentRole.RELATIONSHIP) {
        const relationshipEntry = relationshipStats.get(userId) ?? {
          userName,
          dealsClosed: 0,
          totalDealValue: 0,
        };

        relationshipEntry.dealsClosed += 1;
        relationshipEntry.totalDealValue += dealValue;
        relationshipStats.set(userId, relationshipEntry);
      }
    }
  }

  return {
    commissionLeaderboard: Array.from(userStats.values())
      .map(({ userName, totalCommission, dealsClosed }) => ({
        userName,
        totalCommission: Math.round(totalCommission * 100) / 100,
        dealsClosed,
      }))
      .sort((a, b) => b.totalCommission - a.totalCommission),
    dealsClosedLeaderboard: Array.from(relationshipStats.values())
      .map(({ userName, dealsClosed, totalDealValue }) => ({
        userName,
        dealsClosed,
        averageDealValue:
          dealsClosed > 0
            ? Math.round((totalDealValue / dealsClosed) * 100) / 100
            : 0,
      }))
      .sort((a, b) => b.dealsClosed - a.dealsClosed),
  };
  });
}

type RevenueAggregateRow = {
  year: number;
  month: number;
  revenue: unknown;
  profit: unknown;
};

async function loadAdminRevenueTrackerData(
  groupBy: RevenueGroupBy
): Promise<AdminRevenuePeriod[]> {
  return timeAsync(`cache:admin-revenue-tracker:${groupBy}`, async () => {
  if (groupBy === 'year') {
    const rows = await prisma.$queryRaw<
      { year: number; revenue: unknown; profit: unknown }[]
    >(Prisma.sql`
      SELECT
        EXTRACT(YEAR FROM "updatedAt")::int AS year,
        SUM("dealValue") AS revenue,
        SUM("totalCommission") AS profit
      FROM "Deal"
      WHERE status = ${DealStatus.WON}::"DealStatus"
      GROUP BY year
      ORDER BY year
    `);

    return rows.map((row) => ({
      period: formatRevenuePeriod(row.year, 1, 'year'),
      revenue: Number(row.revenue ?? 0),
      profit: Number(row.profit ?? 0),
    }));
  }

  const rows = await prisma.$queryRaw<RevenueAggregateRow[]>(Prisma.sql`
    SELECT
      EXTRACT(YEAR FROM "updatedAt")::int AS year,
      EXTRACT(MONTH FROM "updatedAt")::int AS month,
      SUM("dealValue") AS revenue,
      SUM("totalCommission") AS profit
    FROM "Deal"
    WHERE status = ${DealStatus.WON}::"DealStatus"
    GROUP BY year, month
    ORDER BY year, month
  `);

  if (groupBy === 'month') {
    return rows.map((row) => ({
      period: formatRevenuePeriod(row.year, row.month, 'month'),
      revenue: Number(row.revenue ?? 0),
      profit: Number(row.profit ?? 0),
    }));
  }

  const periodMap = new Map<string, AdminRevenuePeriod>();

  for (const row of rows) {
    const period = formatRevenuePeriod(row.year, row.month, 'quarter');
    const revenue = Number(row.revenue ?? 0);
    const profit = Number(row.profit ?? 0);

    const existing = periodMap.get(period);
    if (existing) {
      existing.revenue += revenue;
      existing.profit += profit;
      continue;
    }

    periodMap.set(period, { period, revenue, profit });
  }

  return Array.from(periodMap.values()).sort((a, b) => {
    const [aQuarter, aYear] = a.period.split(' ');
    const [bQuarter, bYear] = b.period.split(' ');
    const aKey = Number(aYear) * 10 + Number(aQuarter.replace('Q', ''));
    const bKey = Number(bYear) * 10 + Number(bQuarter.replace('Q', ''));
    return aKey - bKey;
  });
  });
}

const getCachedAdminFunnelDataInternal = unstable_cache(
  loadAdminFunnelData,
  ['admin-analytics-funnel-data'],
  {
    revalidate: ADMIN_ANALYTICS_REVALIDATE_SECONDS,
    tags: ['admin-analytics'],
  }
);

const getCachedAdminDashboardKpisInternal = unstable_cache(
  loadAdminDashboardKpis,
  ['admin-analytics-dashboard-kpis'],
  {
    revalidate: ADMIN_ANALYTICS_REVALIDATE_SECONDS,
    tags: ['admin-analytics'],
  }
);

const getCachedAdminLeaderboardsDataInternal = unstable_cache(
  loadAdminLeaderboardsData,
  ['admin-analytics-leaderboards'],
  {
    revalidate: ADMIN_ANALYTICS_REVALIDATE_SECONDS,
    tags: ['admin-analytics'],
  }
);

const getCachedAdminRevenueTrackerMonth = unstable_cache(
  () => loadAdminRevenueTrackerData('month'),
  ['admin-analytics-revenue-tracker', 'month'],
  {
    revalidate: ADMIN_ANALYTICS_REVALIDATE_SECONDS,
    tags: ['admin-analytics'],
  }
);

const getCachedAdminRevenueTrackerQuarter = unstable_cache(
  () => loadAdminRevenueTrackerData('quarter'),
  ['admin-analytics-revenue-tracker', 'quarter'],
  {
    revalidate: ADMIN_ANALYTICS_REVALIDATE_SECONDS,
    tags: ['admin-analytics'],
  }
);

const getCachedAdminRevenueTrackerYear = unstable_cache(
  () => loadAdminRevenueTrackerData('year'),
  ['admin-analytics-revenue-tracker', 'year'],
  {
    revalidate: ADMIN_ANALYTICS_REVALIDATE_SECONDS,
    tags: ['admin-analytics'],
  }
);

export function getCachedAdminFunnelData() {
  return getCachedAdminFunnelDataInternal();
}

export function getCachedAdminDashboardKpis() {
  return getCachedAdminDashboardKpisInternal();
}

export function getCachedAdminLeaderboardsData() {
  return getCachedAdminLeaderboardsDataInternal();
}

export function getCachedAdminRevenueTrackerData(groupBy: RevenueGroupBy) {
  if (groupBy === 'month') {
    return getCachedAdminRevenueTrackerMonth();
  }

  if (groupBy === 'quarter') {
    return getCachedAdminRevenueTrackerQuarter();
  }

  return getCachedAdminRevenueTrackerYear();
}
