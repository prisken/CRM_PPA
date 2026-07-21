import { StrategyPlanStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { resolveClient360Context } from '@/lib/client360RequestContext';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import {
  requireStrategyDeleteAccess,
  requireStrategyManageAccess,
} from '@/lib/clientStrategyPermissions';
import {
  formatStrategyPlanDetail,
  formatStrategyPlanSummary,
  getStrategyPlanForClient,
  loadStrategyPlanDetail,
  strategyPlanListSelect,
} from '@/lib/clientStrategyPlans';
import { updateStrategyPlanSchema } from '@/lib/clientStrategyValidation';
import { timeAsync, timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Phase 2I.3 semantics via Phase 2J context:
 * 403-first; SUPER_ADMIN clientLookup only on plan miss (Client vs Plan 404).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const { id: clientId, planId } = await params;

  const resolved = await resolveClient360Context({
    clientId,
    request,
    capability: 'strategy:view',
    perfPrefix: 'client360:strategyDetail',
  });
  if (!resolved.ok) {
    return resolved.error;
  }
  const { ctx } = resolved;

  const result = await timeRouteHandler(
    `GET /api/clients/${clientId}/strategy-plans/${planId}`,
    async () => {
      const planLoad = await loadStrategyPlanDetail(clientId, planId);
      if (planLoad.error) {
        const missingClient = await ctx.ensureClientExistsForPrivilegedMiss();
        if (missingClient) {
          return { ok: false as const, error: missingClient };
        }
        return { ok: false as const, error: planLoad.error };
      }

      const body = await timeAsync('client360:strategyDetail:map', async () => ({
        plan: formatStrategyPlanDetail(planLoad.plan),
      }));

      return {
        ok: true as const,
        body,
      };
    },
    {
      payloadCategory: 'strategy-planner',
      getMeta: (value) => ({ found: value.ok }),
    }
  );

  if (!result.ok) {
    return result.error;
  }

  return NextResponse.json(result.body);
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
