import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import {
  requireStrategyManageAccess,
  requireStrategyViewAccess,
} from '@/lib/clientStrategyPermissions';
import {
  assertMilestoneSourceExpensesBelongToPlan,
  assertMilestoneSourceStepsBelongToPlan,
  assertProjectionStepBelongsToPlan,
  formatStrategyProjectionMilestone,
  getStrategyPlanForClient,
  nextProjectionMilestoneSortOrder,
  replaceMilestoneSourceLinks,
  strategyProjectionMilestoneDetailSelect,
} from '@/lib/clientStrategyPlans';
import { createStrategyProjectionMilestoneSchema } from '@/lib/clientStrategyValidation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET — list projection milestones for a plan.
 * POST — create a milestone (manual only; no auto-generation or helper overwrite).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; planId: string }> }
) {
  const { id: clientId, planId } = await params;
  const auth = await requireStrategyViewAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const projectionMilestones =
    await prisma.clientStrategyProjectionMilestone.findMany({
      where: { strategyPlanId: planId },
      orderBy: [{ sortOrder: 'asc' }, { year: 'asc' }, { createdAt: 'asc' }],
      select: strategyProjectionMilestoneDetailSelect,
    });

  return NextResponse.json({
    projectionMilestones: projectionMilestones.map(
      formatStrategyProjectionMilestone
    ),
  });
}

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
  const parsed = createStrategyProjectionMilestoneSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const stepError = await assertProjectionStepBelongsToPlan(
    planId,
    parsed.data.stepId
  );
  if (stepError) {
    return stepError;
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

  const sortOrder =
    parsed.data.sortOrder ?? (await nextProjectionMilestoneSortOrder(planId));

  const created = await prisma.clientStrategyProjectionMilestone.create({
    data: {
      strategyPlanId: planId,
      stepId: parsed.data.stepId ?? null,
      year: parsed.data.year,
      title: parsed.data.title,
      type: parsed.data.type,
      monthlyIncome: parsed.data.monthlyIncome ?? null,
      monthsOfIncome: parsed.data.monthsOfIncome ?? null,
      annualIncome: parsed.data.annualIncome ?? null,
      capitalInvested: parsed.data.capitalInvested ?? null,
      capitalRemaining: parsed.data.capitalRemaining ?? null,
      incomeThisPeriod: parsed.data.incomeThisPeriod ?? null,
      cumulativeIncome: parsed.data.cumulativeIncome ?? null,
      totalAssetPosition: parsed.data.totalAssetPosition ?? null,
      expensesThisYear: parsed.data.expensesThisYear ?? null,
      cumulativeExpenses: parsed.data.cumulativeExpenses ?? null,
      netCashflowThisYear: parsed.data.netCashflowThisYear ?? null,
      capitalReturnedThisYear: parsed.data.capitalReturnedThisYear ?? null,
      capitalReturnedToDate: parsed.data.capitalReturnedToDate ?? null,
      notes: parsed.data.notes ?? null,
      sortOrder,
    },
    select: { id: true, title: true },
  });

  await replaceMilestoneSourceLinks(
    created.id,
    parsed.data.selectedStepIds ?? [],
    parsed.data.selectedExpenseIds ?? []
  );

  const projectionMilestone =
    await prisma.clientStrategyProjectionMilestone.findUniqueOrThrow({
      where: { id: created.id },
      select: strategyProjectionMilestoneDetailSelect,
    });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_projection_milestone',
    action: 'created',
    label: projectionMilestone.title,
  });

  return NextResponse.json(
    {
      projectionMilestone: formatStrategyProjectionMilestone(
        projectionMilestone
      ),
    },
    { status: 201 }
  );
}
