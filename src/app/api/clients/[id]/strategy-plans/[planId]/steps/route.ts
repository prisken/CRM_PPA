import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { requireStrategyManageAccess } from '@/lib/clientStrategyPermissions';
import {
  assertDealBelongsToClient,
  DEFAULT_STRATEGY_STEP_TYPE,
  formatStrategyStep,
  getStrategyPlanForClient,
  nextStepSortOrder,
  strategyStepDetailSelect,
} from '@/lib/clientStrategyPlans';
import { createStrategyStepSchema } from '@/lib/clientStrategyValidation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(
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
  const parsed = createStrategyStepSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const dealError = await assertDealBelongsToClient(
    clientId,
    parsed.data.linkedDealId
  );
  if (dealError) {
    return dealError;
  }

  const sortOrder =
    parsed.data.sortOrder ?? (await nextStepSortOrder(planId));

  const step = await prisma.clientStrategyStep.create({
    data: {
      strategyPlanId: planId,
      title: parsed.data.title,
      linkedDealId: parsed.data.linkedDealId ?? null,
      stepType: parsed.data.stepType ?? DEFAULT_STRATEGY_STEP_TYPE,
      plannedAmount: parsed.data.plannedAmount ?? null,
      amountDescription: parsed.data.amountDescription ?? null,
      purpose: parsed.data.purpose ?? null,
      expectedAchievement: parsed.data.expectedAchievement ?? null,
      expectedIncomeAmount: parsed.data.expectedIncomeAmount ?? null,
      expectedIncomeFrequency: parsed.data.expectedIncomeFrequency ?? null,
      timelineLabel: parsed.data.timelineLabel ?? null,
      sortOrder,
    },
    select: strategyStepDetailSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_step',
    action: 'created',
    label: step.title,
  });

  return NextResponse.json(
    { step: formatStrategyStep(step) },
    { status: 201 }
  );
}
