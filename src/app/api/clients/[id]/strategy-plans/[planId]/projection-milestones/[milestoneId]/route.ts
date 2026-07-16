import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { requireStrategyManageAccess } from '@/lib/clientStrategyPermissions';
import {
  assertMilestoneSourceExpensesBelongToPlan,
  assertMilestoneSourceStepsBelongToPlan,
  assertProjectionStepBelongsToPlan,
  formatStrategyProjectionMilestone,
  getStrategyPlanForClient,
  replaceMilestoneSourceLinks,
  strategyProjectionMilestoneDetailSelect,
} from '@/lib/clientStrategyPlans';
import { updateStrategyProjectionMilestoneSchema } from '@/lib/clientStrategyValidation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getMilestoneForPlan(
  strategyPlanId: string,
  milestoneId: string
) {
  const projectionMilestone =
    await prisma.clientStrategyProjectionMilestone.findFirst({
      where: { id: milestoneId, strategyPlanId },
      select: { id: true, title: true },
    });

  if (!projectionMilestone) {
    return {
      error: NextResponse.json(
        { error: 'Strategy projection milestone not found' },
        { status: 404 }
      ),
    };
  }

  return { projectionMilestone };
}

/**
 * Update stores submitted values as-is.
 * Does not recompute cumulativeIncome, expenses, or asset position from helpers.
 * selectedStepIds / selectedExpenseIds replace links when provided; omitted preserves.
 */
export async function PUT(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; planId: string; milestoneId: string }>;
  }
) {
  const { id: clientId, planId, milestoneId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const milestoneCheck = await getMilestoneForPlan(planId, milestoneId);
  if (milestoneCheck.error) {
    return milestoneCheck.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateStrategyProjectionMilestoneSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.data.stepId !== undefined) {
    const stepError = await assertProjectionStepBelongsToPlan(
      planId,
      parsed.data.stepId
    );
    if (stepError) {
      return stepError;
    }
  }

  const sourceStepsError = await assertMilestoneSourceStepsBelongToPlan(
    planId,
    parsed.data.selectedStepIds
  );
  if (sourceStepsError) {
    return sourceStepsError;
  }

  const sourceExpensesError = await assertMilestoneSourceExpensesBelongToPlan(
    planId,
    parsed.data.selectedExpenseIds
  );
  if (sourceExpensesError) {
    return sourceExpensesError;
  }

  await prisma.clientStrategyProjectionMilestone.update({
    where: { id: milestoneId },
    data: {
      ...(parsed.data.year !== undefined && { year: parsed.data.year }),
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.type !== undefined && { type: parsed.data.type }),
      ...(parsed.data.stepId !== undefined && { stepId: parsed.data.stepId }),
      ...(parsed.data.monthlyIncome !== undefined && {
        monthlyIncome: parsed.data.monthlyIncome,
      }),
      ...(parsed.data.monthsOfIncome !== undefined && {
        monthsOfIncome: parsed.data.monthsOfIncome,
      }),
      ...(parsed.data.annualIncome !== undefined && {
        annualIncome: parsed.data.annualIncome,
      }),
      ...(parsed.data.capitalInvested !== undefined && {
        capitalInvested: parsed.data.capitalInvested,
      }),
      ...(parsed.data.capitalRemaining !== undefined && {
        capitalRemaining: parsed.data.capitalRemaining,
      }),
      ...(parsed.data.incomeThisPeriod !== undefined && {
        incomeThisPeriod: parsed.data.incomeThisPeriod,
      }),
      ...(parsed.data.cumulativeIncome !== undefined && {
        cumulativeIncome: parsed.data.cumulativeIncome,
      }),
      ...(parsed.data.totalAssetPosition !== undefined && {
        totalAssetPosition: parsed.data.totalAssetPosition,
      }),
      ...(parsed.data.expensesThisYear !== undefined && {
        expensesThisYear: parsed.data.expensesThisYear,
      }),
      ...(parsed.data.cumulativeExpenses !== undefined && {
        cumulativeExpenses: parsed.data.cumulativeExpenses,
      }),
      ...(parsed.data.netCashflowThisYear !== undefined && {
        netCashflowThisYear: parsed.data.netCashflowThisYear,
      }),
      ...(parsed.data.capitalReturnedThisYear !== undefined && {
        capitalReturnedThisYear: parsed.data.capitalReturnedThisYear,
      }),
      ...(parsed.data.capitalReturnedToDate !== undefined && {
        capitalReturnedToDate: parsed.data.capitalReturnedToDate,
      }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      ...(parsed.data.sortOrder !== undefined && {
        sortOrder: parsed.data.sortOrder,
      }),
    },
  });

  await replaceMilestoneSourceLinks(
    milestoneId,
    parsed.data.selectedStepIds,
    parsed.data.selectedExpenseIds
  );

  const projectionMilestone =
    await prisma.clientStrategyProjectionMilestone.findUniqueOrThrow({
      where: { id: milestoneId },
      select: strategyProjectionMilestoneDetailSelect,
    });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_projection_milestone',
    action: 'updated',
    label: projectionMilestone.title,
  });

  return NextResponse.json({
    projectionMilestone: formatStrategyProjectionMilestone(projectionMilestone),
  });
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string; planId: string; milestoneId: string }>;
  }
) {
  return PUT(request, context);
}

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ id: string; planId: string; milestoneId: string }>;
  }
) {
  const { id: clientId, planId, milestoneId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const milestoneCheck = await getMilestoneForPlan(planId, milestoneId);
  if (milestoneCheck.error) {
    return milestoneCheck.error;
  }

  await prisma.clientStrategyProjectionMilestone.delete({
    where: { id: milestoneId },
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_projection_milestone',
    action: 'deleted',
    label: milestoneCheck.projectionMilestone.title,
  });

  return NextResponse.json({ milestoneId, deleted: true });
}
