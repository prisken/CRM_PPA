import { ClientStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

const FUNNEL_STAGES: { stage: string; status: ClientStatus }[] = [
  { stage: 'New Lead', status: ClientStatus.NEW_LEAD },
  { stage: 'Contacted', status: ClientStatus.CONTACTED },
  { stage: 'Nurturing', status: ClientStatus.NURTURING },
  { stage: 'Strategy Session', status: ClientStatus.STRATEGY_SESSION },
  { stage: 'Active Client', status: ClientStatus.ACTIVE_CLIENT },
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

export async function GET() {
  const auth = await requireSuperAdmin();
  if (auth.error) {
    return auth.error;
  }

  const statusCounts = await prisma.client.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  const countByStatus = new Map(
    statusCounts.map((row) => [row.status, row._count.id])
  );

  let previousCount: number | null = null;

  const funnelData = FUNNEL_STAGES.map(({ stage, status }) => {
    const count = countByStatus.get(status) ?? 0;

    let conversionRate: number | null = null;
    if (previousCount !== null && previousCount > 0) {
      conversionRate = Math.round((count / previousCount) * 100) / 100;
    }

    previousCount = count;

    return { stage, count, conversionRate };
  });

  return NextResponse.json(funnelData);
}
