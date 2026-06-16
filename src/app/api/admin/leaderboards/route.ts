import { AssignmentRole, DealStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

const COMMISSION_RATES: Record<AssignmentRole, number> = {
  RELATIONSHIP: 0.15,
  DOCTOR: 0.1,
  ACCOUNT_SERVICE: 0.1,
};

type UserStats = {
  userName: string;
  totalCommission: number;
  dealsClosed: number;
  totalDealValue: number;
};

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

function getUserName(name: string | null, email: string): string {
  return name?.trim() || email;
}

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const yearStart = getYearStart();

  const [wonDealsYTD, assignments] = await Promise.all([
    prisma.deal.findMany({
      where: {
        status: DealStatus.WON,
        updatedAt: { gte: yearStart },
      },
      select: {
        clientId: true,
        dealValue: true,
        totalCommission: true,
      },
    }),
    prisma.clientAssignment.findMany({
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  const assignmentsByClient = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    const existing = assignmentsByClient.get(assignment.clientId) ?? [];
    existing.push(assignment);
    assignmentsByClient.set(assignment.clientId, existing);
  }

  const userStats = new Map<string, UserStats>();

  for (const deal of wonDealsYTD) {
    const clientAssignments = assignmentsByClient.get(deal.clientId) ?? [];
    const dealValue = Number(deal.dealValue);
    const totalCommission = Number(deal.totalCommission);

    for (const assignment of clientAssignments) {
      const userId = assignment.user.id;
      const userName = getUserName(assignment.user.name, assignment.user.email);
      const commission = totalCommission * COMMISSION_RATES[assignment.role];

      const existing = userStats.get(userId) ?? {
        userName,
        totalCommission: 0,
        dealsClosed: 0,
        totalDealValue: 0,
      };

      existing.totalCommission += commission;
      existing.dealsClosed += 1;
      existing.totalDealValue += dealValue;

      userStats.set(userId, existing);
    }
  }

  const relationshipStats = new Map<
    string,
    { userName: string; dealsClosed: number; totalDealValue: number }
  >();

  for (const deal of wonDealsYTD) {
    const clientAssignments = assignmentsByClient.get(deal.clientId) ?? [];
    const dealValue = Number(deal.dealValue);

    for (const assignment of clientAssignments) {
      if (assignment.role !== AssignmentRole.RELATIONSHIP) {
        continue;
      }

      const userId = assignment.user.id;
      const userName = getUserName(assignment.user.name, assignment.user.email);

      const existing = relationshipStats.get(userId) ?? {
        userName,
        dealsClosed: 0,
        totalDealValue: 0,
      };

      existing.dealsClosed += 1;
      existing.totalDealValue += dealValue;

      relationshipStats.set(userId, existing);
    }
  }

  const commissionLeaderboard = Array.from(userStats.values())
    .map(({ userName, totalCommission, dealsClosed }) => ({
      userName,
      totalCommission: Math.round(totalCommission * 100) / 100,
      dealsClosed,
    }))
    .sort((a, b) => b.totalCommission - a.totalCommission);

  const dealsClosedLeaderboard = Array.from(relationshipStats.values())
    .map(({ userName, dealsClosed, totalDealValue }) => ({
      userName,
      dealsClosed,
      averageDealValue:
        dealsClosed > 0
          ? Math.round((totalDealValue / dealsClosed) * 100) / 100
          : 0,
    }))
    .sort((a, b) => b.dealsClosed - a.dealsClosed);

  return NextResponse.json({
    commissionLeaderboard,
    dealsClosedLeaderboard,
  });
}
