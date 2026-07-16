import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { requireStrategyManageAccess } from '@/lib/clientStrategyPermissions';
import {
  assertDealBelongsToClient,
  formatStrategyStep,
  getStrategyPlanForClient,
  strategyStepDetailSelect,
} from '@/lib/clientStrategyPlans';
import { updateStrategyStepSchema } from '@/lib/clientStrategyValidation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getStepForPlan(strategyPlanId: string, stepId: string) {
  const step = await prisma.clientStrategyStep.findFirst({
    where: { id: stepId, strategyPlanId },
    select: { id: true, title: true },
  });

  if (!step) {
    return {
      error: NextResponse.json({ error: 'Strategy step not found' }, { status: 404 }),
    };
  }

  return { step };
}

export async function PUT(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; planId: string; stepId: string }> }
) {
  const { id: clientId, planId, stepId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const stepCheck = await getStepForPlan(planId, stepId);
  if (stepCheck.error) {
    return stepCheck.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateStrategyStepSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.data.linkedDealId !== undefined) {
    const dealError = await assertDealBelongsToClient(
      clientId,
      parsed.data.linkedDealId
    );
    if (dealError) {
      return dealError;
    }
  }

  const step = await prisma.clientStrategyStep.update({
    where: { id: stepId },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.linkedDealId !== undefined && {
        linkedDealId: parsed.data.linkedDealId,
      }),
      ...(parsed.data.stepType !== undefined && {
        stepType: parsed.data.stepType,
      }),
      ...(parsed.data.plannedAmount !== undefined && {
        plannedAmount: parsed.data.plannedAmount,
      }),
      ...(parsed.data.amountDescription !== undefined && {
        amountDescription: parsed.data.amountDescription,
      }),
      ...(parsed.data.purpose !== undefined && { purpose: parsed.data.purpose }),
      ...(parsed.data.expectedAchievement !== undefined && {
        expectedAchievement: parsed.data.expectedAchievement,
      }),
      ...(parsed.data.expectedIncomeAmount !== undefined && {
        expectedIncomeAmount: parsed.data.expectedIncomeAmount,
      }),
      ...(parsed.data.expectedIncomeFrequency !== undefined && {
        expectedIncomeFrequency: parsed.data.expectedIncomeFrequency,
      }),
      ...(parsed.data.timelineLabel !== undefined && {
        timelineLabel: parsed.data.timelineLabel,
      }),
      ...(parsed.data.startYear !== undefined && {
        startYear: parsed.data.startYear,
      }),
      ...(parsed.data.endYear !== undefined && { endYear: parsed.data.endYear }),
      ...(parsed.data.investmentAmount !== undefined && {
        investmentAmount: parsed.data.investmentAmount,
      }),
      ...(parsed.data.incomeAmount !== undefined && {
        incomeAmount: parsed.data.incomeAmount,
      }),
      ...(parsed.data.incomeFrequency !== undefined && {
        incomeFrequency: parsed.data.incomeFrequency,
      }),
      ...(parsed.data.incomeStartYear !== undefined && {
        incomeStartYear: parsed.data.incomeStartYear,
      }),
      ...(parsed.data.incomeEndYear !== undefined && {
        incomeEndYear: parsed.data.incomeEndYear,
      }),
      ...(parsed.data.capitalReturned !== undefined && {
        capitalReturned: parsed.data.capitalReturned,
      }),
      ...(parsed.data.capitalReturnYear !== undefined && {
        capitalReturnYear: parsed.data.capitalReturnYear,
      }),
      ...(parsed.data.sortOrder !== undefined && {
        sortOrder: parsed.data.sortOrder,
      }),
    },
    select: strategyStepDetailSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_step',
    action: 'updated',
    label: step.title,
  });

  return NextResponse.json({ step: formatStrategyStep(step) });
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string; planId: string; stepId: string }>;
  }
) {
  return PUT(request, context);
}

export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; planId: string; stepId: string }> }
) {
  const { id: clientId, planId, stepId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const stepCheck = await getStepForPlan(planId, stepId);
  if (stepCheck.error) {
    return stepCheck.error;
  }

  await prisma.$transaction(async (tx) => {
    // Prefer explicit safe cleanup matching schema intent:
    // - unset expense coverage links to this step
    // - remove connections that reference this step
    await tx.clientStrategyExpense.updateMany({
      where: { coveredByStepId: stepId },
      data: { coveredByStepId: null },
    });
    await tx.clientStrategyConnection.deleteMany({
      where: {
        OR: [{ fromStepId: stepId }, { toStepId: stepId }],
      },
    });
    await tx.clientStrategyStep.delete({
      where: { id: stepId },
    });
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_step',
    action: 'deleted',
    label: stepCheck.step.title,
  });

  return NextResponse.json({ stepId, deleted: true });
}
