import { DealStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { COMPANY_OVERHEAD_RATE } from '@/lib/constants';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

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

function getYearStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const yearStart = getYearStart();

  const [wonDealsYTD, committedRevenue, potentialRevenue, wonDealsForVelocity, activeDeals, wonDeals] =
    await Promise.all([
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
    prisma.deal.findMany({
      where: { status: DealStatus.WON },
      select: {
        updatedAt: true,
        client: {
          select: { createdAt: true },
        },
      },
    }),
    prisma.deal.count({
      where: {
        status: { notIn: [DealStatus.WON, DealStatus.LOST] },
      },
    }),
    prisma.deal.findMany({
      where: { status: DealStatus.WON },
      select: { totalCommission: true },
    }),
  ]);

  const totalCommissionYTD = Number(wonDealsYTD._sum.totalCommission ?? 0);
  const totalCommittedRevenue = Number(committedRevenue._sum.dealValue ?? 0);
  const totalPotentialRevenue = Number(potentialRevenue._sum.dealValue ?? 0);

  const pipelineVelocity =
    wonDealsForVelocity.length > 0
      ? wonDealsForVelocity.reduce((sum, deal) => {
          const days =
            (deal.updatedAt.getTime() - deal.client.createdAt.getTime()) /
            (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / wonDealsForVelocity.length
      : 0;

  const companyOverheadEarnings = wonDeals.reduce(
    (sum, deal) => sum + Number(deal.totalCommission) * COMPANY_OVERHEAD_RATE,
    0
  );

  return NextResponse.json({
    totalCommittedRevenue,
    totalPotentialRevenue,
    totalCommissionYTD,
    companyOverheadEarnings,
    pipelineVelocity: Math.round(pipelineVelocity * 10) / 10,
    activeDeals,
  });
}
