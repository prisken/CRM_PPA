import { NextResponse } from 'next/server';
import { logClientStrategyEvent } from '@/lib/clientStrategyActivity';
import { requireStrategyManageAccess } from '@/lib/clientStrategyPermissions';
import {
  assertCoveredByStepBelongsToPlan,
  formatStrategyExpense,
  getStrategyPlanForClient,
  strategyExpenseDetailSelect,
} from '@/lib/clientStrategyPlans';
import { updateStrategyExpenseSchema } from '@/lib/clientStrategyValidation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getExpenseForPlan(strategyPlanId: string, expenseId: string) {
  const expense = await prisma.clientStrategyExpense.findFirst({
    where: { id: expenseId, strategyPlanId },
    select: { id: true, title: true },
  });

  if (!expense) {
    return {
      error: NextResponse.json(
        { error: 'Strategy expense not found' },
        { status: 404 }
      ),
    };
  }

  return { expense };
}

export async function PUT(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; planId: string; expenseId: string }> }
) {
  const { id: clientId, planId, expenseId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const expenseCheck = await getExpenseForPlan(planId, expenseId);
  if (expenseCheck.error) {
    return expenseCheck.error;
  }

  const body = await request.json().catch(() => null);
  const parsed = updateStrategyExpenseSchema.parse(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.data.coveredByStepId !== undefined) {
    const coveredError = await assertCoveredByStepBelongsToPlan(
      planId,
      parsed.data.coveredByStepId
    );
    if (coveredError) {
      return coveredError;
    }
  }

  const expense = await prisma.clientStrategyExpense.update({
    where: { id: expenseId },
    data: {
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.category !== undefined && {
        category: parsed.data.category,
      }),
      ...(parsed.data.amount !== undefined && { amount: parsed.data.amount }),
      ...(parsed.data.frequency !== undefined && {
        frequency: parsed.data.frequency,
      }),
      ...(parsed.data.startTimelineLabel !== undefined && {
        startTimelineLabel: parsed.data.startTimelineLabel,
      }),
      ...(parsed.data.endTimelineLabel !== undefined && {
        endTimelineLabel: parsed.data.endTimelineLabel,
      }),
      ...(parsed.data.priority !== undefined && {
        priority: parsed.data.priority,
      }),
      ...(parsed.data.purpose !== undefined && {
        purpose: parsed.data.purpose,
      }),
      ...(parsed.data.coveredByStepId !== undefined && {
        coveredByStepId: parsed.data.coveredByStepId,
      }),
      ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
      ...(parsed.data.sortOrder !== undefined && {
        sortOrder: parsed.data.sortOrder,
      }),
    },
    select: strategyExpenseDetailSelect,
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_expense',
    action: 'updated',
    label: expense.title,
  });

  return NextResponse.json({ expense: formatStrategyExpense(expense) });
}

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{ id: string; planId: string; expenseId: string }>;
  }
) {
  return PUT(request, context);
}

export async function DELETE(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; planId: string; expenseId: string }> }
) {
  const { id: clientId, planId, expenseId } = await params;
  const auth = await requireStrategyManageAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const planCheck = await getStrategyPlanForClient(clientId, planId);
  if (planCheck.error) {
    return planCheck.error;
  }

  const expenseCheck = await getExpenseForPlan(planId, expenseId);
  if (expenseCheck.error) {
    return expenseCheck.error;
  }

  await prisma.clientStrategyExpense.delete({
    where: { id: expenseId },
  });

  await logClientStrategyEvent({
    clientId,
    userId: auth.user.id,
    strategyPlanId: planId,
    entityType: 'strategy_expense',
    action: 'deleted',
    label: expenseCheck.expense.title,
  });

  return NextResponse.json({ expenseId, deleted: true });
}
