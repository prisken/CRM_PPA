import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { requireStrategyManageAccess } from '@/lib/clientStrategyPermissions';
import {
  formatStrategyStep,
  getStrategyPlanForClient,
  parseOrderedIds,
  reorderStrategySteps,
} from '@/lib/clientStrategyPlans';

export const dynamic = 'force-dynamic';

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
  const orderedIds = parseOrderedIds(body);
  if ('error' in orderedIds) {
    return NextResponse.json({ error: orderedIds.error }, { status: 400 });
  }

  const result = await reorderStrategySteps(planId, orderedIds);
  if (result.error) {
    return result.error;
  }

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_step',
    action: 'updated',
    label: `Reordered steps on ${planCheck.plan.title}`,
  });

  return NextResponse.json({
    steps: result.steps.map(formatStrategyStep),
  });
}
