import {
  StrategyExpenseCategory,
  StrategyExpenseFrequency,
  StrategyExpensePriority,
  StrategyPlanStatus,
  StrategyStepType,
  type Deal,
  type ClientStrategyConnection,
  type ClientStrategyExpense,
  type ClientStrategyPlan,
  type ClientStrategyStep,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type MoneyValue = { toString(): string } | number | null | undefined;

function toNumberOrNull(value: MoneyValue): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return Number(value);
}

export const strategyLinkedDealSelect = {
  id: true,
  name: true,
  dealValue: true,
  totalCommission: true,
  dealType: true,
  status: true,
} as const;

export const strategyCoveredByStepSelect = {
  id: true,
  title: true,
  stepType: true,
  sortOrder: true,
} as const;

export const strategyStepDetailSelect = {
  id: true,
  strategyPlanId: true,
  linkedDealId: true,
  title: true,
  stepType: true,
  plannedAmount: true,
  amountDescription: true,
  purpose: true,
  expectedAchievement: true,
  expectedIncomeAmount: true,
  expectedIncomeFrequency: true,
  timelineLabel: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  linkedDeal: { select: strategyLinkedDealSelect },
} as const;

export const strategyConnectionDetailSelect = {
  id: true,
  strategyPlanId: true,
  fromStepId: true,
  toStepId: true,
  connectionType: true,
  purpose: true,
  expectedOutcome: true,
  timing: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const strategyExpenseDetailSelect = {
  id: true,
  strategyPlanId: true,
  title: true,
  category: true,
  amount: true,
  frequency: true,
  startTimelineLabel: true,
  endTimelineLabel: true,
  priority: true,
  purpose: true,
  coveredByStepId: true,
  notes: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  coveredByStep: { select: strategyCoveredByStepSelect },
} as const;

export const strategyPlanDetailInclude = {
  steps: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: strategyStepDetailSelect,
  },
  connections: {
    orderBy: { createdAt: 'asc' as const },
    select: strategyConnectionDetailSelect,
  },
  expenses: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: strategyExpenseDetailSelect,
  },
  owner: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
};

export const strategyPlanListSelect = {
  id: true,
  clientId: true,
  title: true,
  description: true,
  clientGoal: true,
  expectedOutcome: true,
  status: true,
  ownerUserId: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  _count: {
    select: {
      steps: true,
      connections: true,
      expenses: true,
    },
  },
} as const;

type LinkedDealRecord = Pick<
  Deal,
  'id' | 'name' | 'dealValue' | 'totalCommission' | 'dealType' | 'status'
>;

type CoveredByStepRecord = Pick<
  ClientStrategyStep,
  'id' | 'title' | 'stepType' | 'sortOrder'
>;

type UserSummary = {
  id: string;
  name: string | null;
  email: string;
};

function formatUserSummary(user: UserSummary | null | undefined) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export function formatLinkedDeal(deal: LinkedDealRecord | null | undefined) {
  if (!deal) {
    return null;
  }

  return {
    id: deal.id,
    name: deal.name,
    dealValue: Number(deal.dealValue),
    totalCommission: Number(deal.totalCommission),
    dealType: deal.dealType,
    status: deal.status,
  };
}

export function formatStrategyStep(
  step: ClientStrategyStep & {
    linkedDeal?: LinkedDealRecord | null;
  }
) {
  return {
    id: step.id,
    strategyPlanId: step.strategyPlanId,
    linkedDealId: step.linkedDealId,
    title: step.title,
    stepType: step.stepType,
    plannedAmount: toNumberOrNull(step.plannedAmount),
    amountDescription: step.amountDescription,
    purpose: step.purpose,
    expectedAchievement: step.expectedAchievement,
    expectedIncomeAmount: toNumberOrNull(step.expectedIncomeAmount),
    expectedIncomeFrequency: step.expectedIncomeFrequency,
    timelineLabel: step.timelineLabel,
    sortOrder: step.sortOrder,
    createdAt: step.createdAt.toISOString(),
    updatedAt: step.updatedAt.toISOString(),
    linkedDeal: formatLinkedDeal(step.linkedDeal),
  };
}

export function formatStrategyConnection(connection: ClientStrategyConnection) {
  return {
    id: connection.id,
    strategyPlanId: connection.strategyPlanId,
    fromStepId: connection.fromStepId,
    toStepId: connection.toStepId,
    connectionType: connection.connectionType,
    purpose: connection.purpose,
    expectedOutcome: connection.expectedOutcome,
    timing: connection.timing,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export function formatStrategyExpense(
  expense: ClientStrategyExpense & {
    coveredByStep?: CoveredByStepRecord | null;
  }
) {
  return {
    id: expense.id,
    strategyPlanId: expense.strategyPlanId,
    title: expense.title,
    category: expense.category,
    amount: toNumberOrNull(expense.amount),
    frequency: expense.frequency,
    startTimelineLabel: expense.startTimelineLabel,
    endTimelineLabel: expense.endTimelineLabel,
    priority: expense.priority,
    purpose: expense.purpose,
    coveredByStepId: expense.coveredByStepId,
    notes: expense.notes,
    sortOrder: expense.sortOrder,
    createdAt: expense.createdAt.toISOString(),
    updatedAt: expense.updatedAt.toISOString(),
    coveredByStep: expense.coveredByStep
      ? {
          id: expense.coveredByStep.id,
          title: expense.coveredByStep.title,
          stepType: expense.coveredByStep.stepType,
          sortOrder: expense.coveredByStep.sortOrder,
        }
      : null,
  };
}

export function formatStrategyPlanSummary(
  plan: ClientStrategyPlan & {
    owner?: UserSummary | null;
    createdBy?: UserSummary;
    _count?: { steps: number; connections: number; expenses: number };
  }
) {
  return {
    id: plan.id,
    clientId: plan.clientId,
    title: plan.title,
    description: plan.description,
    clientGoal: plan.clientGoal,
    expectedOutcome: plan.expectedOutcome,
    status: plan.status,
    ownerUserId: plan.ownerUserId,
    createdByUserId: plan.createdByUserId,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    owner: formatUserSummary(plan.owner),
    createdBy: formatUserSummary(plan.createdBy),
    counts: plan._count
      ? {
          steps: plan._count.steps,
          connections: plan._count.connections,
          expenses: plan._count.expenses,
        }
      : undefined,
  };
}

export type StrategyPlanDetailRecord = ClientStrategyPlan & {
  owner?: UserSummary | null;
  createdBy?: UserSummary;
  steps: Array<ClientStrategyStep & { linkedDeal?: LinkedDealRecord | null }>;
  connections: ClientStrategyConnection[];
  expenses: Array<
    ClientStrategyExpense & { coveredByStep?: CoveredByStepRecord | null }
  >;
};

export function formatStrategyPlanDetail(plan: StrategyPlanDetailRecord) {
  return {
    ...formatStrategyPlanSummary(plan),
    steps: plan.steps.map(formatStrategyStep),
    connections: plan.connections.map(formatStrategyConnection),
    expenses: plan.expenses.map(formatStrategyExpense),
  };
}

export async function getStrategyPlanForClient(clientId: string, planId: string) {
  const plan = await prisma.clientStrategyPlan.findFirst({
    where: { id: planId, clientId },
    select: { id: true, clientId: true, title: true, status: true },
  });

  if (!plan) {
    return {
      error: NextResponse.json({ error: 'Strategy plan not found' }, { status: 404 }),
    };
  }

  return { plan };
}

export async function loadStrategyPlanDetail(clientId: string, planId: string) {
  const plan = await prisma.clientStrategyPlan.findFirst({
    where: { id: planId, clientId },
    include: strategyPlanDetailInclude,
  });

  if (!plan) {
    return {
      error: NextResponse.json({ error: 'Strategy plan not found' }, { status: 404 }),
    };
  }

  return { plan };
}

export async function assertDealBelongsToClient(
  clientId: string,
  linkedDealId: string | null | undefined
) {
  if (linkedDealId === undefined || linkedDealId === null) {
    return null;
  }

  const deal = await prisma.deal.findFirst({
    where: { id: linkedDealId, clientId },
    select: { id: true },
  });

  if (!deal) {
    return NextResponse.json(
      { error: 'linkedDealId must reference a deal for this client' },
      { status: 400 }
    );
  }

  return null;
}

export async function assertStepsBelongToPlan(
  strategyPlanId: string,
  stepIds: string[]
) {
  const uniqueIds = [...new Set(stepIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    return null;
  }

  const steps = await prisma.clientStrategyStep.findMany({
    where: {
      strategyPlanId,
      id: { in: uniqueIds },
    },
    select: { id: true },
  });

  if (steps.length !== uniqueIds.length) {
    return NextResponse.json(
      {
        error:
          'fromStepId and toStepId must belong to the same strategy plan',
      },
      { status: 400 }
    );
  }

  return null;
}

export async function assertCoveredByStepBelongsToPlan(
  strategyPlanId: string,
  coveredByStepId: string | null | undefined
) {
  if (coveredByStepId === undefined || coveredByStepId === null) {
    return null;
  }

  const step = await prisma.clientStrategyStep.findFirst({
    where: { id: coveredByStepId, strategyPlanId },
    select: { id: true },
  });

  if (!step) {
    return NextResponse.json(
      {
        error: 'coveredByStepId must reference a step on this strategy plan',
      },
      { status: 400 }
    );
  }

  return null;
}

export function parseOrderedIds(body: unknown): string[] | { error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be an object' };
  }

  const orderedIds = (body as { orderedIds?: unknown }).orderedIds;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { error: 'orderedIds must be a non-empty array' };
  }

  const ids: string[] = [];
  for (let index = 0; index < orderedIds.length; index++) {
    const value = orderedIds[index];
    if (typeof value !== 'string' || !value.trim()) {
      return { error: `orderedIds[${index}] must be a non-empty string` };
    }
    ids.push(value.trim());
  }

  if (new Set(ids).size !== ids.length) {
    return { error: 'orderedIds must not contain duplicates' };
  }

  return ids;
}

export async function reorderStrategySteps(
  strategyPlanId: string,
  orderedIds: string[]
) {
  const existing = await prisma.clientStrategyStep.findMany({
    where: { strategyPlanId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((step) => step.id));

  if (
    orderedIds.length !== existingIds.size ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    return {
      error: NextResponse.json(
        {
          error:
            'orderedIds must include every step id for this strategy plan exactly once',
        },
        { status: 400 }
      ),
    };
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.clientStrategyStep.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  const steps = await prisma.clientStrategyStep.findMany({
    where: { strategyPlanId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: strategyStepDetailSelect,
  });

  return { steps };
}

export async function reorderStrategyExpenses(
  strategyPlanId: string,
  orderedIds: string[]
) {
  const existing = await prisma.clientStrategyExpense.findMany({
    where: { strategyPlanId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((expense) => expense.id));

  if (
    orderedIds.length !== existingIds.size ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    return {
      error: NextResponse.json(
        {
          error:
            'orderedIds must include every expense id for this strategy plan exactly once',
        },
        { status: 400 }
      ),
    };
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.clientStrategyExpense.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  const expenses = await prisma.clientStrategyExpense.findMany({
    where: { strategyPlanId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: strategyExpenseDetailSelect,
  });

  return { expenses };
}

export const DEFAULT_STRATEGY_EXPENSE_CATEGORY = StrategyExpenseCategory.OTHER;
export const DEFAULT_STRATEGY_EXPENSE_FREQUENCY =
  StrategyExpenseFrequency.MONTHLY;
export const DEFAULT_STRATEGY_EXPENSE_PRIORITY = StrategyExpensePriority.MEDIUM;
export const DEFAULT_STRATEGY_STEP_TYPE = StrategyStepType.MANUAL;
export const DEFAULT_STRATEGY_PLAN_STATUS = StrategyPlanStatus.DRAFT;

export async function nextStepSortOrder(strategyPlanId: string) {
  const last = await prisma.clientStrategyStep.findFirst({
    where: { strategyPlanId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}

export async function nextExpenseSortOrder(strategyPlanId: string) {
  const last = await prisma.clientStrategyExpense.findFirst({
    where: { strategyPlanId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}
