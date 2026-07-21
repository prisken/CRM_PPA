import { NextResponse } from 'next/server';
import { resolveClient360Context } from '@/lib/client360RequestContext';
import {
  requireStrategyManageAccess,
} from '@/lib/clientStrategyPermissions';
import {
  DEFAULT_STRATEGY_PLAN_STATUS,
  formatStrategyPlanSummary,
  strategyPlanListSelect,
} from '@/lib/clientStrategyPlans';
import { createStrategyPlanSchema } from '@/lib/clientStrategyValidation';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { timeAsync, timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Phase 2I.3 semantics via Phase 2J context:
 * 403-first; SUPER_ADMIN clientLookup only when the plan list is empty.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const resolved = await resolveClient360Context({
    clientId,
    request,
    capability: 'strategy:view',
    perfPrefix: 'client360:strategyList',
  });
  if (!resolved.ok) {
    return resolved.error;
  }
  const { ctx } = resolved;

  const payload = await timeRouteHandler(
    `GET /api/clients/${clientId}/strategy-plans`,
    async () => {
      return timeAsync(
        'client360:strategyList',
        async () => {
          const plans = await timeAsync('client360:strategyList:query', () =>
            prisma.clientStrategyPlan.findMany({
              where: { clientId },
              orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
              select: strategyPlanListSelect,
            })
          );

          if (plans.length === 0) {
            const missing = await ctx.ensureClientExistsForPrivilegedMiss();
            if (missing) {
              return null;
            }
          }

          return timeAsync('client360:strategyList:map', async () => ({
            plans: plans.map(formatStrategyPlanSummary),
          }));
        },
        (result) => ({
          found: result !== null,
          planCount: result?.plans.length ?? 0,
        })
      );
    },
    {
      payloadCategory: 'strategy-planner',
      getMeta: (result) => ({
        found: result !== null,
        planCount: result?.plans.length ?? 0,
      }),
    }
  );

  if (!payload) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
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
