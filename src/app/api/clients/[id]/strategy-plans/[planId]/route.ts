import { StrategyPlanStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import {
  requireStrategyDeleteAccess,
  requireStrategyManageAccess,
  requireStrategyViewAccess,
} from '@/lib/clientStrategyPermissions';
import {
  formatStrategyPlanDetail,
  formatStrategyPlanSummary,
  getStrategyPlanForClient,
  loadStrategyPlanDetail,
  strategyPlanListSelect,
} from '@/lib/clientStrategyPlans';
import { updateStrategyPlanSchema } from '@/lib/clientStrategyValidation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const { id: clientId, planId } = await params;
  const auth = await requireStrategyViewAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planLoad = await loadStrategyPlanDetail(clientId, planId);
  if (planLoad.error) {
    return planLoad.error;
  }

  return NextResponse.json({
    plan: formatStrategyPlanDetail(planLoad.plan),
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const { id: clientId, planId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateStrategyPlanSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const plan = await prisma.clientStrategyPlan.update({
    where: { id: planId },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.description !== undefined && {
        description: parsed.data.description,
      }),
      ...(parsed.data.clientGoal !== undefined && {
        clientGoal: parsed.data.clientGoal,
      }),
      ...(parsed.data.expectedOutcome !== undefined && {
        expectedOutcome: parsed.data.expectedOutcome,
      }),
      ...(parsed.data.status !== undefined && { status: parsed.data.status }),
    },
    select: strategyPlanListSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: plan.id,
    entityType: 'strategy_plan',
    action: 'updated',
    label: plan.title,
  });

  return NextResponse.json({ plan: formatStrategyPlanSummary(plan) });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; planId: string }> }
) {
  return PUT(request, context);
}

/**
 * DELETE archives by default (status ARCHIVED).
 * Pass ?hard=true to permanently delete the plan and cascaded children.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const { id: clientId, planId } = await params;
  const auth = await requireStrategyDeleteAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const hardDelete =
    new URL(request.url).searchParams.get('hard') === 'true';

  if (hardDelete) {
    await prisma.clientStrategyPlan.delete({
      where: { id: planId },
    });

    await logClientStrategyEvent({
      clientId,
      userId: auth.user.id,
      strategyPlanId: planId,
      entityType: 'strategy_plan',
      action: 'deleted',
      label: planCheck.plan.title,
    });

    return NextResponse.json({
      planId,
      deleted: true,
      archived: false,
    });
  }

  if (planCheck.plan.status === StrategyPlanStatus.ARCHIVED) {
    return NextResponse.json(
      { error: 'Strategy plan is already archived' },
      { status: 400 }
    );
  }

  const plan = await prisma.clientStrategyPlan.update({
    where: { id: planId },
    data: { status: StrategyPlanStatus.ARCHIVED },
    select: strategyPlanListSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: plan.id,
    entityType: 'strategy_plan',
    action: 'archived',
    label: plan.title,
  });

  return NextResponse.json({
    plan: formatStrategyPlanSummary(plan),
    deleted: false,
    archived: true,
  });
}
