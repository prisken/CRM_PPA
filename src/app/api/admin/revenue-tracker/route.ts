import { DealStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

type GroupBy = 'month' | 'quarter' | 'year';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

async function requireSuperAdmin() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true },
  });

  if (!dbUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  if (dbUser.role !== UserRole.SUPER_ADMIN) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user: dbUser };
}

function formatPeriod(date: Date, groupBy: GroupBy): string {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (groupBy === 'year') {
    return String(year);
  }

  if (groupBy === 'quarter') {
    const quarter = Math.floor(month / 3) + 1;
    return `Q${quarter} ${year}`;
  }

  return `${MONTH_NAMES[month]} ${year}`;
}

function sortKey(date: Date, groupBy: GroupBy): number {
  const year = date.getFullYear();
  const month = date.getMonth();

  if (groupBy === 'year') {
    return year;
  }

  if (groupBy === 'quarter') {
    return year * 10 + Math.floor(month / 3);
  }

  return year * 100 + month;
}

export async function GET(request: Request) {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const groupBy = searchParams.get('groupBy') as GroupBy | null;

  if (!groupBy || !['month', 'quarter', 'year'].includes(groupBy)) {
    return NextResponse.json(
      { error: "Invalid groupBy parameter. Use 'month', 'quarter', or 'year'." },
      { status: 400 }
    );
  }

  const wonDeals = await prisma.deal.findMany({
    where: { status: DealStatus.WON },
    select: {
      dealValue: true,
      grossProfit: true,
      updatedAt: true,
    },
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
    const profit = Number(deal.grossProfit);

    const existing = periodMap.get(period);
    if (existing) {
      existing.revenue += revenue;
      existing.profit += profit;
    } else {
      periodMap.set(period, { period, revenue, profit, sortKey: key });
    }
  }

  const results = Array.from(periodMap.values())
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ period, revenue, profit }) => ({ period, revenue, profit }));

  return NextResponse.json(results);
}
