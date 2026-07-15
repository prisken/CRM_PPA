import { NextResponse } from 'next/server';
import {
  requireStrategyManageAccess,
  requireStrategyViewAccess,
} from '@/lib/clientStrategyPermissions';
import {
  DEFAULT_STRATEGY_PLAN_STATUS,
  formatStrategyPlanSummary,
  strategyPlanListSelect,
} from '@/lib/clientStrategyPlans';
import { createStrategyPlanSchema } from '@/lib/clientStrategyValidation';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireStrategyViewAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const plans = await prisma.clientStrategyPlan.findMany({
    where: { clientId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: strategyPlanListSelect,
  });

  return NextResponse.json({
    plans: plans.map(formatStrategyPlanSummary),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = createStrategyPlanSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const plan = await prisma.clientStrategyPlan.create({
    data: {
      clientId,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      clientGoal: parsed.data.clientGoal ?? null,
      expectedOutcome: parsed.data.expectedOutcome ?? null,
      status: parsed.data.status ?? DEFAULT_STRATEGY_PLAN_STATUS,
      createdByUserId: auth.user.id,
      ownerUserId: auth.user.id,
    },
    select: strategyPlanListSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: plan.id,
    entityType: 'strategy_plan',
    action: 'created',
    label: plan.title,
  });

  return NextResponse.json(
    { plan: formatStrategyPlanSummary(plan) },
    { status: 201 }
  );
}
