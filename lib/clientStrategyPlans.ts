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
  type ClientStrategyProjectionMilestone,
  type ClientStrategyStep,
  type StrategyProjectionMilestoneType,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import { timeAsync } from '@/lib/performance';
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
  startYear: true,
  endYear: true,
  investmentAmount: true,
  incomeAmount: true,
  incomeFrequency: true,
  incomeStartYear: true,
  incomeEndYear: true,
  capitalReturned: true,
  capitalReturnYear: true,
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
  startYear: true,
  endYear: true,
  priority: true,
  purpose: true,
  coveredByStepId: true,
  notes: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  coveredByStep: { select: strategyCoveredByStepSelect },
} as const;

export const strategyProjectionMilestoneDetailSelect = {
  id: true,
  strategyPlanId: true,
  stepId: true,
  year: true,
  title: true,
  type: true,
  monthlyIncome: true,
  monthsOfIncome: true,
  annualIncome: true,
  capitalInvested: true,
  capitalRemaining: true,
  incomeThisPeriod: true,
  cumulativeIncome: true,
  totalAssetPosition: true,
  expensesThisYear: true,
  cumulativeExpenses: true,
  netCashflowThisYear: true,
  capitalReturnedThisYear: true,
  capitalReturnedToDate: true,
  notes: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  step: { select: strategyCoveredByStepSelect },
  stepContributions: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      milestoneId: true,
      stepId: true,
      contributionAmount: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      // Journey chips only need title; keep stepType/sortOrder for DTO compatibility.
      step: { select: strategyCoveredByStepSelect },
    },
  },
  expenseContributions: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      milestoneId: true,
      expenseId: true,
      contributionAmount: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
      expense: {
        select: {
          id: true,
          title: true,
          category: true,
          amount: true,
          frequency: true,
          sortOrder: true,
        },
      },
    },
  },
} as const;

/**
 * Intentionally narrow Strategy plan detail select (plan scalars + owners only).
 * Child relations are loaded in parallel timed queries — see {@link loadStrategyPlanDetail}.
 */
export const strategyPlanDetailBaseSelect = {
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
} as const;

/**
 * @deprecated Prefer {@link strategyPlanDetailBaseSelect} + parallel relation loads
 * via {@link loadStrategyPlanDetail}. Kept for callers that still want one nested select.
 */
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
  projectionMilestones: {
    orderBy: [
      { sortOrder: 'asc' as const },
      { year: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
    select: strategyProjectionMilestoneDetailSelect,
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
      projectionMilestones: true,
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
    startYear: step.startYear,
    endYear: step.endYear,
    investmentAmount: toNumberOrNull(step.investmentAmount),
    incomeAmount: toNumberOrNull(step.incomeAmount),
    incomeFrequency: step.incomeFrequency,
    incomeStartYear: step.incomeStartYear,
    incomeEndYear: step.incomeEndYear,
    capitalReturned: toNumberOrNull(step.capitalReturned),
    capitalReturnYear: step.capitalReturnYear,
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
    startYear: expense.startYear,
    endYear: expense.endYear,
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

export function formatStrategyProjectionMilestone(
  milestone: ClientStrategyProjectionMilestone & {
    step?: CoveredByStepRecord | null;
    stepContributions?: Array<{
      id: string;
      milestoneId: string;
      stepId: string;
      contributionAmount: { toString(): string } | number | null;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
      step?: CoveredByStepRecord | null;
    }>;
    expenseContributions?: Array<{
      id: string;
      milestoneId: string;
      expenseId: string;
      contributionAmount: { toString(): string } | number | null;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
      expense?: {
        id: string;
        title: string;
        category: string;
        amount: { toString(): string } | number | null;
        frequency: string;
        sortOrder: number;
      } | null;
    }>;
  }
) {
  const selectedSteps = (milestone.stepContributions ?? []).map(
    (contribution) => ({
      id: contribution.id,
      milestoneId: contribution.milestoneId,
      stepId: contribution.stepId,
      contributionAmount: toNumberOrNull(contribution.contributionAmount),
      notes: contribution.notes,
      createdAt: contribution.createdAt.toISOString(),
      updatedAt: contribution.updatedAt.toISOString(),
      step: contribution.step
        ? {
            id: contribution.step.id,
            title: contribution.step.title,
            stepType: contribution.step.stepType,
            sortOrder: contribution.step.sortOrder,
          }
        : null,
    })
  );

  const selectedExpenses = (milestone.expenseContributions ?? []).map(
    (contribution) => ({
      id: contribution.id,
      milestoneId: contribution.milestoneId,
      expenseId: contribution.expenseId,
      contributionAmount: toNumberOrNull(contribution.contributionAmount),
      notes: contribution.notes,
      createdAt: contribution.createdAt.toISOString(),
      updatedAt: contribution.updatedAt.toISOString(),
      expense: contribution.expense
        ? {
            id: contribution.expense.id,
            title: contribution.expense.title,
            category: contribution.expense.category,
            amount: toNumberOrNull(contribution.expense.amount),
            frequency: contribution.expense.frequency,
            sortOrder: contribution.expense.sortOrder,
          }
        : null,
    })
  );

  return {
    id: milestone.id,
    strategyPlanId: milestone.strategyPlanId,
    stepId: milestone.stepId,
    year: milestone.year,
    title: milestone.title,
    type: milestone.type,
    monthlyIncome: toNumberOrNull(milestone.monthlyIncome),
    monthsOfIncome: milestone.monthsOfIncome,
    annualIncome: toNumberOrNull(milestone.annualIncome),
    capitalInvested: toNumberOrNull(milestone.capitalInvested),
    capitalRemaining: toNumberOrNull(milestone.capitalRemaining),
    incomeThisPeriod: toNumberOrNull(milestone.incomeThisPeriod),
    cumulativeIncome: toNumberOrNull(milestone.cumulativeIncome),
    totalAssetPosition: toNumberOrNull(milestone.totalAssetPosition),
    expensesThisYear: toNumberOrNull(milestone.expensesThisYear),
    cumulativeExpenses: toNumberOrNull(milestone.cumulativeExpenses),
    netCashflowThisYear: toNumberOrNull(milestone.netCashflowThisYear),
    capitalReturnedThisYear: toNumberOrNull(milestone.capitalReturnedThisYear),
    capitalReturnedToDate: toNumberOrNull(milestone.capitalReturnedToDate),
    notes: milestone.notes,
    sortOrder: milestone.sortOrder,
    createdAt: milestone.createdAt.toISOString(),
    updatedAt: milestone.updatedAt.toISOString(),
    step: milestone.step
      ? {
          id: milestone.step.id,
          title: milestone.step.title,
          stepType: milestone.step.stepType,
          sortOrder: milestone.step.sortOrder,
        }
      : null,
    selectedSteps,
    selectedExpenses,
    selectedStepIds: selectedSteps.map((entry) => entry.stepId),
    selectedExpenseIds: selectedExpenses.map((entry) => entry.expenseId),
  };
}

export function formatStrategyPlanSummary(
  plan: ClientStrategyPlan & {
    owner?: UserSummary | null;
    createdBy?: UserSummary;
    _count?: {
      steps: number;
      connections: number;
      expenses: number;
      projectionMilestones?: number;
    };
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
          projectionMilestones: plan._count.projectionMilestones ?? 0,
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
  projectionMilestones: Array<
    ClientStrategyProjectionMilestone & {
      step?: CoveredByStepRecord | null;
      stepContributions?: Array<{
        id: string;
        milestoneId: string;
        stepId: string;
        contributionAmount: { toString(): string } | number | null;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        step?: CoveredByStepRecord | null;
      }>;
      expenseContributions?: Array<{
        id: string;
        milestoneId: string;
        expenseId: string;
        contributionAmount: { toString(): string } | number | null;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        expense?: {
          id: string;
          title: string;
          category: string;
          amount: { toString(): string } | number | null;
          frequency: string;
          sortOrder: number;
        } | null;
      }>;
    }
  >;
};

export function formatStrategyPlanDetail(plan: StrategyPlanDetailRecord) {
  return {
    ...formatStrategyPlanSummary(plan),
    steps: plan.steps.map(formatStrategyStep),
    connections: plan.connections.map(formatStrategyConnection),
    expenses: plan.expenses.map(formatStrategyExpense),
    projectionMilestones: plan.projectionMilestones.map(
      formatStrategyProjectionMilestone
    ),
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
  return timeAsync(
    'client360:strategyDetail',
    async () => {
      const base = await timeAsync('client360:strategyDetail:baseQuery', () =>
        prisma.clientStrategyPlan.findFirst({
          where: { id: planId, clientId },
          select: strategyPlanDetailBaseSelect,
        })
      );

      if (!base) {
        return {
          error: NextResponse.json(
            { error: 'Strategy plan not found' },
            { status: 404 }
          ),
        };
      }

      const relations = await timeAsync(
        'client360:strategyDetail:relations',
        async () => {
          const [steps, connections, expenses, projectionMilestones] =
            await Promise.all([
              timeAsync('client360:strategyDetail:steps', () =>
                prisma.clientStrategyStep.findMany({
                  where: { strategyPlanId: planId },
                  orderBy: [
                    { sortOrder: 'asc' },
                    { createdAt: 'asc' },
                  ],
                  select: strategyStepDetailSelect,
                })
              ),
              timeAsync('client360:strategyDetail:connections', () =>
                prisma.clientStrategyConnection.findMany({
                  where: { strategyPlanId: planId },
                  orderBy: { createdAt: 'asc' },
                  select: strategyConnectionDetailSelect,
                })
              ),
              timeAsync('client360:strategyDetail:expenses', () =>
                prisma.clientStrategyExpense.findMany({
                  where: { strategyPlanId: planId },
                  orderBy: [
                    { sortOrder: 'asc' },
                    { createdAt: 'asc' },
                  ],
                  select: strategyExpenseDetailSelect,
                })
              ),
              timeAsync('client360:strategyDetail:projectionMilestones', () =>
                prisma.clientStrategyProjectionMilestone.findMany({
                  where: { strategyPlanId: planId },
                  orderBy: [
                    { sortOrder: 'asc' },
                    { year: 'asc' },
                    { createdAt: 'asc' },
                  ],
                  select: strategyProjectionMilestoneDetailSelect,
                })
              ),
            ]);

          return { steps, connections, expenses, projectionMilestones };
        },
        (result) => ({
          stepCount: result.steps.length,
          connectionCount: result.connections.length,
          expenseCount: result.expenses.length,
          milestoneCount: result.projectionMilestones.length,
          contributionCount: result.projectionMilestones.reduce(
            (sum, milestone) =>
              sum +
              milestone.stepContributions.length +
              milestone.expenseContributions.length,
            0
          ),
        })
      );

      const plan: StrategyPlanDetailRecord = {
        ...base,
        ...relations,
      };

      return { plan };
    },
    (result) => ({
      clientId,
      planId,
      found: !('error' in result && result.error),
    })
  );
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

export async function assertProjectionStepBelongsToPlan(
  strategyPlanId: string,
  stepId: string | null | undefined
) {
  if (stepId === undefined || stepId === null) {
    return null;
  }

  const step = await prisma.clientStrategyStep.findFirst({
    where: { id: stepId, strategyPlanId },
    select: { id: true },
  });

  if (!step) {
    return NextResponse.json(
      {
        error: 'stepId must reference a step on this strategy plan',
      },
      { status: 400 }
    );
  }

  return null;
}

export async function assertMilestoneSourceStepsBelongToPlan(
  strategyPlanId: string,
  stepIds: string[] | undefined
) {
  if (stepIds === undefined) {
    return null;
  }

  if (stepIds.length === 0) {
    return null;
  }

  const steps = await prisma.clientStrategyStep.findMany({
    where: { strategyPlanId, id: { in: stepIds } },
    select: { id: true },
  });

  if (steps.length !== stepIds.length) {
    const found = new Set(steps.map((step) => step.id));
    const missing = stepIds.filter((id) => !found.has(id));
    return NextResponse.json(
      {
        error: `selectedStepIds must reference steps on this strategy plan (invalid: ${missing.join(', ')})`,
      },
      { status: 400 }
    );
  }

  return null;
}

export async function assertMilestoneSourceExpensesBelongToPlan(
  strategyPlanId: string,
  expenseIds: string[] | undefined
) {
  if (expenseIds === undefined) {
    return null;
  }

  if (expenseIds.length === 0) {
    return null;
  }

  const expenses = await prisma.clientStrategyExpense.findMany({
    where: { strategyPlanId, id: { in: expenseIds } },
    select: { id: true },
  });

  if (expenses.length !== expenseIds.length) {
    const found = new Set(expenses.map((expense) => expense.id));
    const missing = expenseIds.filter((id) => !found.has(id));
    return NextResponse.json(
      {
        error: `selectedExpenseIds must reference expenses on this strategy plan (invalid: ${missing.join(', ')})`,
      },
      { status: 400 }
    );
  }

  return null;
}

/**
 * Replace milestone contribution links. Pass undefined to leave unchanged.
 * Empty array clears all links of that kind.
 */
export async function replaceMilestoneSourceLinks(
  milestoneId: string,
  selectedStepIds: string[] | undefined,
  selectedExpenseIds: string[] | undefined
) {
  if (selectedStepIds === undefined && selectedExpenseIds === undefined) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (selectedStepIds !== undefined) {
      await tx.clientStrategyProjectionMilestoneStep.deleteMany({
        where: { milestoneId },
      });
      if (selectedStepIds.length > 0) {
        await tx.clientStrategyProjectionMilestoneStep.createMany({
          data: selectedStepIds.map((stepId) => ({
            milestoneId,
            stepId,
          })),
        });
      }
    }

    if (selectedExpenseIds !== undefined) {
      await tx.clientStrategyProjectionMilestoneExpense.deleteMany({
        where: { milestoneId },
      });
      if (selectedExpenseIds.length > 0) {
        await tx.clientStrategyProjectionMilestoneExpense.createMany({
          data: selectedExpenseIds.map((expenseId) => ({
            milestoneId,
            expenseId,
          })),
        });
      }
    }
  });
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

export async function reorderStrategyProjectionMilestones(
  strategyPlanId: string,
  orderedIds: string[]
) {
  const existing = await prisma.clientStrategyProjectionMilestone.findMany({
    where: { strategyPlanId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((milestone) => milestone.id));

  if (
    orderedIds.length !== existingIds.size ||
    orderedIds.some((id) => !existingIds.has(id))
  ) {
    return {
      error: NextResponse.json(
        {
          error:
            'orderedIds must include every projection milestone id for this strategy plan exactly once',
        },
        { status: 400 }
      ),
    };
  }

  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.clientStrategyProjectionMilestone.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  const projectionMilestones =
    await prisma.clientStrategyProjectionMilestone.findMany({
      where: { strategyPlanId },
      orderBy: [{ sortOrder: 'asc' }, { year: 'asc' }, { createdAt: 'asc' }],
      select: strategyProjectionMilestoneDetailSelect,
    });

  return { projectionMilestones };
}

export const DEFAULT_STRATEGY_EXPENSE_CATEGORY = StrategyExpenseCategory.OTHER;
export const DEFAULT_STRATEGY_EXPENSE_FREQUENCY =
  StrategyExpenseFrequency.MONTHLY;
export const DEFAULT_STRATEGY_EXPENSE_PRIORITY = StrategyExpensePriority.MEDIUM;
export const DEFAULT_STRATEGY_STEP_TYPE = StrategyStepType.MANUAL;
export const DEFAULT_STRATEGY_PLAN_STATUS = StrategyPlanStatus.DRAFT;
/** Literal default — avoids crashing list routes if Prisma enum export is briefly stale in dev HMR. */
export const DEFAULT_STRATEGY_PROJECTION_MILESTONE_TYPE =
  'CUSTOM' as StrategyProjectionMilestoneType;

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

export async function nextProjectionMilestoneSortOrder(strategyPlanId: string) {
  const last = await prisma.clientStrategyProjectionMilestone.findFirst({
    where: { strategyPlanId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  return (last?.sortOrder ?? -1) + 1;
}
