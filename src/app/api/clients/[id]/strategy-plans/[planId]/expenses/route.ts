import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { requireStrategyManageAccess } from '@/lib/clientStrategyPermissions';
import {
  assertCoveredByStepBelongsToPlan,
  DEFAULT_STRATEGY_EXPENSE_CATEGORY,
  DEFAULT_STRATEGY_EXPENSE_FREQUENCY,
  DEFAULT_STRATEGY_EXPENSE_PRIORITY,
  formatStrategyExpense,
  getStrategyPlanForClient,
  nextExpenseSortOrder,
  strategyExpenseDetailSelect,
} from '@/lib/clientStrategyPlans';
import { createStrategyExpenseSchema } from '@/lib/clientStrategyValidation';
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
  const parsed = createStrategyExpenseSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const coveredError = await assertCoveredByStepBelongsToPlan(
    planId,
    parsed.data.coveredByStepId
  );
  if (coveredError) {
    return coveredError;
  }

  const sortOrder =
    parsed.data.sortOrder ?? (await nextExpenseSortOrder(planId));

  const expense = await prisma.clientStrategyExpense.create({
    data: {
      strategyPlanId: planId,
      title: parsed.data.title,
      category: parsed.data.category ?? DEFAULT_STRATEGY_EXPENSE_CATEGORY,
      amount: parsed.data.amount ?? null,
      frequency: parsed.data.frequency ?? DEFAULT_STRATEGY_EXPENSE_FREQUENCY,
      startTimelineLabel: parsed.data.startTimelineLabel ?? null,
      endTimelineLabel: parsed.data.endTimelineLabel ?? null,
      startYear: parsed.data.startYear ?? null,
      endYear: parsed.data.endYear ?? null,
      priority: parsed.data.priority ?? DEFAULT_STRATEGY_EXPENSE_PRIORITY,
      purpose: parsed.data.purpose ?? null,
      coveredByStepId: parsed.data.coveredByStepId ?? null,
      notes: parsed.data.notes ?? null,
      sortOrder,
    },
    select: strategyExpenseDetailSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_expense',
    action: 'created',
    label: expense.title,
  });

  return NextResponse.json(
    { expense: formatStrategyExpense(expense) },
    { status: 201 }
  );
}
