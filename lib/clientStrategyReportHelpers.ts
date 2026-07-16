/**
 * View-model helpers for the read-only Client Strategy Map report.
 *
 * Consumes Strategy Plan / Step / Expense / Projection Milestone data.
 * Does not generate years, invent projections, or compute growth/ROI/yield.
 * Prefers persisted milestone values; timeline helpers only fill gaps when
 * clearly derived from entered step/expense fields.
 */
import type { StrategyProjectionMilestoneType } from '@prisma/client';
import {
  buildProjectionJourneySummary,
  formatProjectionMilestoneType,
  sortProjectionMilestones,
  type StrategyProjectionMilestone,
  type StrategyProjectionMilestoneStepSummary,
} from '@/lib/clientStrategyProjectionHelpers';
import {
  getStrategyExpenseTotal,
  getStrategyStepTotalIncome,
  type StrategyTimelineExpenseInput,
  type StrategyTimelineStepInput,
} from '@/lib/clientStrategyTimelineCalculations';

export type ClientStrategyReportStep = {
  id: string;
  title: string;
  stepType?: string | null;
  sortOrder?: number | null;
  plannedAmount?: number | null;
  investmentAmount?: number | null;
  incomeAmount?: number | null;
  incomeFrequency?: string | null;
  incomeStartYear?: number | null;
  incomeEndYear?: number | null;
  startYear?: number | null;
  endYear?: number | null;
  capitalReturned?: number | null;
  capitalReturnYear?: number | null;
};

export type ClientStrategyReportExpense = {
  id: string;
  title: string;
  amount?: number | null;
  frequency?: string | null;
  startYear?: number | null;
  endYear?: number | null;
};

export type ClientStrategyReportPlanInput = {
  id?: string | null;
  title?: string | null;
  clientGoal?: string | null;
  expectedOutcome?: string | null;
  description?: string | null;
  milestones?: readonly StrategyProjectionMilestone[] | null;
  steps?: readonly ClientStrategyReportStep[] | null;
  expenses?: readonly ClientStrategyReportExpense[] | null;
};

/** Maps a formatted strategy plan detail payload to report helper input. */
export function toClientStrategyReportPlanInput(plan: {
  id: string;
  title: string;
  description?: string | null;
  clientGoal?: string | null;
  expectedOutcome?: string | null;
  steps?: readonly {
    id: string;
    title: string;
    stepType?: string | null;
    sortOrder?: number | null;
    plannedAmount?: number | null;
    investmentAmount?: number | null;
    incomeAmount?: number | null;
    incomeFrequency?: string | null;
    incomeStartYear?: number | null;
    incomeEndYear?: number | null;
    startYear?: number | null;
    endYear?: number | null;
    capitalReturned?: number | null;
    capitalReturnYear?: number | null;
  }[];
  expenses?: readonly {
    id: string;
    title: string;
    amount?: number | null;
    frequency?: string | null;
    startYear?: number | null;
    endYear?: number | null;
  }[];
  projectionMilestones?: readonly StrategyProjectionMilestone[] | null;
}): ClientStrategyReportPlanInput {
  return {
    id: plan.id,
    title: plan.title,
    description: plan.description ?? null,
    clientGoal: plan.clientGoal ?? null,
    expectedOutcome: plan.expectedOutcome ?? null,
    milestones: plan.projectionMilestones ?? [],
    steps: (plan.steps ?? []).map((step) => ({
      id: step.id,
      title: step.title,
      stepType: step.stepType ?? null,
      sortOrder: step.sortOrder ?? null,
      plannedAmount: step.plannedAmount ?? null,
      investmentAmount: step.investmentAmount ?? null,
      incomeAmount: step.incomeAmount ?? null,
      incomeFrequency: step.incomeFrequency ?? null,
      incomeStartYear: step.incomeStartYear ?? null,
      incomeEndYear: step.incomeEndYear ?? null,
      startYear: step.startYear ?? null,
      endYear: step.endYear ?? null,
      capitalReturned: step.capitalReturned ?? null,
      capitalReturnYear: step.capitalReturnYear ?? null,
    })),
    expenses: (plan.expenses ?? []).map((expense) => ({
      id: expense.id,
      title: expense.title,
      amount: expense.amount ?? null,
      frequency: expense.frequency ?? null,
      startYear: expense.startYear ?? null,
      endYear: expense.endYear ?? null,
    })),
  };
}

/** Map node kinds for the client-facing Strategy Map. */
export type ClientStrategyMapNodeKind =
  | 'goal'
  | 'initial_investment'
  | 'income_checkpoint'
  | 'maturity_scenario'
  | 'exit_scenario'
  | 'custom_review'
  | 'outcome';

export type ClientStrategyMapLinkedChip = {
  id: string;
  title: string;
};

/** @deprecated Prefer ClientStrategyMapLinkedChip */
export type ClientStrategyMapLinkedStepChip = ClientStrategyMapLinkedChip;

export type ClientStrategyMapNode = {
  id: string;
  kind: ClientStrategyMapNodeKind;
  label: string;
  title: string;
  subtitle: string | null;
  year: number | null;
  primaryMetricLabel: string | null;
  primaryMetricValue: number | null;
  secondaryMetricLabel: string | null;
  secondaryMetricValue: number | null;
  /** Milestone yearly figures (null on goal/outcome). */
  spendingThisYear: number | null;
  earningThisYear: number | null;
  netThisYear: number | null;
  cumulativeIncome: number | null;
  cumulativeExpenses: number | null;
  capitalReturned: number | null;
  illustrativeTotalPosition: number | null;
  benefitText: string | null;
  notesPreview: string | null;
  linkedStepChips: ClientStrategyMapLinkedChip[];
  linkedExpenseChips: ClientStrategyMapLinkedChip[];
  /** Stable display order: Goal=0, milestones=1..n, Outcome=n+1 */
  order: number;
  /** Sort key for milestones (null for goal/outcome). */
  sortKey: string | null;
};

export type ClientStrategyReportSummary = {
  planTitle: string | null;
  clientGoal: string | null;
  expectedOutcome: string | null;
  /** Sum of step investment/planned amounts when present. */
  totalPlannedInvestment: number | null;
  /** Legacy alias used by older UI — same as totalPlannedInvestment when set. */
  initialCapital: number | null;
  /** Persisted incomeThisPeriod for the calendar year, when a matching milestone exists. */
  incomeThisYear: number | null;
  incomeThisYearSourceYear: number | null;
  targetMonthlyIncome: number | null;
  projectedCumulativeIncome: number | null;
  totalPlannedExpenses: number | null;
  capitalExpectedBack: number | null;
  projectedAssetPosition: number | null;
  timelineStartYear: number | null;
  timelineEndYear: number | null;
  milestoneCount: number;
  stepCount: number;
  expenseCount: number;
  /** First milestone title in journey order (no date-based "upcoming" logic). */
  firstMilestoneTitle: string | null;
  nextMilestoneTitle: string | null;
};

export type ClientStrategyPerk = {
  id: string;
  title: string;
  description: string;
};

export type ClientStrategyReportMetric = {
  label: string;
  value: number;
};

const NOTES_PREVIEW_MAX = 140;

const GUARANTEE_LANGUAGE_PATTERN =
  /\b(guaranteed|guarantee|will earn|risk-free|certain return|certain returns)\b/i;

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sumNullable(
  values: Array<number | null | undefined>
): number | null {
  let total = 0;
  let sawValue = false;

  for (const value of values) {
    if (!isFiniteNumber(value)) {
      continue;
    }
    total += value;
    sawValue = true;
  }

  return sawValue ? total : null;
}

function truncateNotes(
  notes: string | null | undefined,
  maxLength = NOTES_PREVIEW_MAX
): string | null {
  if (!notes) {
    return null;
  }
  const trimmed = notes.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function normalizeMilestoneType(
  type: StrategyProjectionMilestoneType | string | null | undefined
): StrategyProjectionMilestoneType | 'CUSTOM' {
  switch (type) {
    case 'INITIAL_INVESTMENT':
    case 'INCOME_CHECKPOINT':
    case 'MATURITY_SCENARIO':
    case 'EXIT_SCENARIO':
    case 'CUSTOM':
      return type;
    default:
      return 'CUSTOM';
  }
}

/**
 * Maps a projection milestone type to a Strategy Map node kind.
 */
export function mapMilestoneTypeToNodeKind(
  type: StrategyProjectionMilestoneType | string | null | undefined
): Exclude<ClientStrategyMapNodeKind, 'goal' | 'outcome'> {
  switch (normalizeMilestoneType(type)) {
    case 'INITIAL_INVESTMENT':
      return 'initial_investment';
    case 'INCOME_CHECKPOINT':
      return 'income_checkpoint';
    case 'MATURITY_SCENARIO':
      return 'maturity_scenario';
    case 'EXIT_SCENARIO':
      return 'exit_scenario';
    case 'CUSTOM':
    default:
      return 'custom_review';
  }
}

/**
 * Compliance-safe benefit / perk framing for a milestone type.
 * Uses "potential" / "planned" / "illustrative" language only.
 */
export function getClientBenefitForMilestoneType(
  type: StrategyProjectionMilestoneType | string | null | undefined
): string {
  switch (normalizeMilestoneType(type)) {
    case 'INITIAL_INVESTMENT':
      return 'Illustrates the planned starting capital and helps show where the strategy begins.';
    case 'INCOME_CHECKPOINT':
      return 'Highlights a planned income checkpoint so the client can review potential cash-flow points along the journey.';
    case 'MATURITY_SCENARIO':
      return 'Supports review of a longer-horizon maturity scenario using illustrative assumptions entered by the advisor.';
    case 'EXIT_SCENARIO':
      return 'Helps show a potential exit scenario for discussion — illustrative only, based on manually entered assumptions.';
    case 'CUSTOM':
    default:
      return 'Supports an advisor-guided review point selected for this illustrative strategy map.';
  }
}

function firstAvailableMetric(
  candidates: Array<{ label: string; value: number | null | undefined }>
): ClientStrategyReportMetric | null {
  for (const candidate of candidates) {
    if (isFiniteNumber(candidate.value)) {
      return { label: candidate.label, value: candidate.value };
    }
  }
  return null;
}

/**
 * Picks one primary metric from persisted milestone fields by type.
 * Returns null when no suitable stored value exists (never invents numbers).
 */
export function getPrimaryMetricForMilestone(
  milestone: Pick<
    StrategyProjectionMilestone,
    | 'type'
    | 'capitalInvested'
    | 'capitalRemaining'
    | 'monthlyIncome'
    | 'annualIncome'
    | 'incomeThisPeriod'
    | 'cumulativeIncome'
    | 'totalAssetPosition'
    | 'expensesThisYear'
    | 'netCashflowThisYear'
    | 'capitalReturnedToDate'
  >
): ClientStrategyReportMetric | null {
  const type = normalizeMilestoneType(milestone.type);

  switch (type) {
    case 'INITIAL_INVESTMENT':
      return firstAvailableMetric([
        { label: 'Capital invested', value: milestone.capitalInvested },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        {
          label: 'Illustrative total position',
          value: milestone.totalAssetPosition,
        },
      ]);
    case 'INCOME_CHECKPOINT':
      return firstAvailableMetric([
        { label: 'Income this year', value: milestone.incomeThisPeriod },
        { label: 'Monthly income', value: milestone.monthlyIncome },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        { label: 'Annual income', value: milestone.annualIncome },
      ]);
    case 'MATURITY_SCENARIO':
    case 'EXIT_SCENARIO':
      return firstAvailableMetric([
        {
          label: 'Illustrative total position',
          value: milestone.totalAssetPosition,
        },
        {
          label: 'Capital returned',
          value: milestone.capitalReturnedToDate,
        },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
      ]);
    case 'CUSTOM':
    default:
      return firstAvailableMetric([
        {
          label: 'Illustrative total position',
          value: milestone.totalAssetPosition,
        },
        { label: 'Income this year', value: milestone.incomeThisPeriod },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        { label: 'Net this year', value: milestone.netCashflowThisYear },
        { label: 'Monthly income', value: milestone.monthlyIncome },
        { label: 'Capital invested', value: milestone.capitalInvested },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Annual income', value: milestone.annualIncome },
      ]);
  }
}

/**
 * Optional secondary metric — a second stored field when available and different
 * from the primary. Never invents values.
 */
export function getSecondaryMetricForMilestone(
  milestone: Pick<
    StrategyProjectionMilestone,
    | 'type'
    | 'capitalInvested'
    | 'capitalRemaining'
    | 'monthlyIncome'
    | 'annualIncome'
    | 'incomeThisPeriod'
    | 'cumulativeIncome'
    | 'totalAssetPosition'
    | 'expensesThisYear'
    | 'cumulativeExpenses'
    | 'netCashflowThisYear'
    | 'capitalReturnedToDate'
  >
): ClientStrategyReportMetric | null {
  const primary = getPrimaryMetricForMilestone(milestone);
  const type = normalizeMilestoneType(milestone.type);

  let candidates: Array<{ label: string; value: number | null | undefined }>;

  switch (type) {
    case 'INITIAL_INVESTMENT':
      candidates = [
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Income this year', value: milestone.incomeThisPeriod },
        { label: 'Monthly income', value: milestone.monthlyIncome },
      ];
      break;
    case 'INCOME_CHECKPOINT':
      candidates = [
        { label: 'Expenses this year', value: milestone.expensesThisYear },
        { label: 'Net this year', value: milestone.netCashflowThisYear },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        {
          label: 'Illustrative total position',
          value: milestone.totalAssetPosition,
        },
      ];
      break;
    case 'MATURITY_SCENARIO':
    case 'EXIT_SCENARIO':
      candidates = [
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        {
          label: 'Cumulative expenses',
          value: milestone.cumulativeExpenses,
        },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Monthly income', value: milestone.monthlyIncome },
      ];
      break;
    case 'CUSTOM':
    default:
      candidates = [
        { label: 'Expenses this year', value: milestone.expensesThisYear },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        { label: 'Monthly income', value: milestone.monthlyIncome },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Capital invested', value: milestone.capitalInvested },
      ];
      break;
  }

  for (const candidate of candidates) {
    if (!isFiniteNumber(candidate.value)) {
      continue;
    }
    if (
      primary &&
      candidate.label === primary.label &&
      candidate.value === primary.value
    ) {
      continue;
    }
    return { label: candidate.label, value: candidate.value };
  }

  return null;
}

function toTimelineStepInput(
  step: ClientStrategyReportStep
): StrategyTimelineStepInput {
  return {
    investmentAmount: step.investmentAmount ?? step.plannedAmount ?? null,
    startYear: step.startYear ?? null,
    endYear: step.endYear ?? null,
    incomeAmount: step.incomeAmount ?? null,
    incomeFrequency: step.incomeFrequency ?? null,
    incomeStartYear: step.incomeStartYear ?? null,
    incomeEndYear: step.incomeEndYear ?? null,
    capitalReturned: step.capitalReturned ?? null,
    capitalReturnYear: step.capitalReturnYear ?? null,
  };
}

function toTimelineExpenseInput(
  expense: ClientStrategyReportExpense
): StrategyTimelineExpenseInput {
  return {
    amount: expense.amount ?? null,
    frequency: expense.frequency ?? null,
    startYear: expense.startYear ?? null,
    endYear: expense.endYear ?? null,
  };
}

function getStepInvestmentAmount(
  step: ClientStrategyReportStep
): number | null {
  if (isFiniteNumber(step.investmentAmount)) {
    return step.investmentAmount;
  }
  if (isFiniteNumber(step.plannedAmount)) {
    return step.plannedAmount;
  }
  return null;
}

function pickIncomeThisYearFromMilestones(
  milestones: readonly StrategyProjectionMilestone[],
  referenceYear: number
): { value: number | null; year: number | null } {
  const matches = sortProjectionMilestones(milestones).filter(
    (milestone) => milestone.year === referenceYear
  );

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const milestone = matches[index]!;
    if (isFiniteNumber(milestone.incomeThisPeriod)) {
      return { value: milestone.incomeThisPeriod, year: referenceYear };
    }
  }

  return { value: null, year: null };
}

function pickCapitalExpectedBack(
  milestones: readonly StrategyProjectionMilestone[],
  steps: readonly ClientStrategyReportStep[]
): number | null {
  const latestFirst = [...milestones].sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year;
    }
    if (a.sortOrder !== b.sortOrder) {
      return b.sortOrder - a.sortOrder;
    }
    return 0;
  });

  for (const milestone of latestFirst) {
    if (isFiniteNumber(milestone.capitalReturnedToDate)) {
      return milestone.capitalReturnedToDate;
    }
  }

  for (const milestone of latestFirst) {
    if (isFiniteNumber(milestone.capitalReturnedThisYear)) {
      return milestone.capitalReturnedThisYear;
    }
  }

  return sumNullable(steps.map((step) => step.capitalReturned ?? null));
}

function resolveLinkedStepChips(
  milestone: StrategyProjectionMilestone,
  stepsById: Map<string, ClientStrategyReportStep>
): ClientStrategyMapLinkedChip[] {
  const chips: ClientStrategyMapLinkedChip[] = [];
  const seen = new Set<string>();

  for (const entry of milestone.selectedSteps ?? []) {
    const id = entry.stepId;
    if (!id || seen.has(id)) {
      continue;
    }
    const title =
      entry.step?.title?.trim() ||
      stepsById.get(id)?.title?.trim() ||
      null;
    if (!title) {
      continue;
    }
    seen.add(id);
    chips.push({ id, title });
  }

  if (milestone.stepId && !seen.has(milestone.stepId)) {
    const fromNested: StrategyProjectionMilestoneStepSummary | null | undefined =
      milestone.step;
    if (fromNested?.id && fromNested.title) {
      seen.add(fromNested.id);
      chips.push({ id: fromNested.id, title: fromNested.title });
    } else {
      const fromPlan = stepsById.get(milestone.stepId);
      if (fromPlan) {
        seen.add(fromPlan.id);
        chips.push({ id: fromPlan.id, title: fromPlan.title });
      }
    }
  }

  return chips;
}

function resolveLinkedExpenseChips(
  milestone: StrategyProjectionMilestone,
  expensesById: Map<string, ClientStrategyReportExpense>
): ClientStrategyMapLinkedChip[] {
  const chips: ClientStrategyMapLinkedChip[] = [];
  const seen = new Set<string>();

  for (const entry of milestone.selectedExpenses ?? []) {
    const id = entry.expenseId;
    if (!id || seen.has(id)) {
      continue;
    }
    const title =
      entry.expense?.title?.trim() ||
      expensesById.get(id)?.title?.trim() ||
      null;
    if (!title) {
      continue;
    }
    seen.add(id);
    chips.push({ id, title });
  }

  return chips;
}

function milestoneSortKey(milestone: StrategyProjectionMilestone): string {
  const createdAt = milestone.createdAt
    ? new Date(milestone.createdAt).getTime()
    : 0;
  return `${milestone.year}:${milestone.sortOrder}:${createdAt}:${milestone.id}`;
}

function emptyYearlyFields() {
  return {
    spendingThisYear: null as number | null,
    earningThisYear: null as number | null,
    netThisYear: null as number | null,
    cumulativeIncome: null as number | null,
    cumulativeExpenses: null as number | null,
    capitalReturned: null as number | null,
    illustrativeTotalPosition: null as number | null,
  };
}

/**
 * Snapshot metrics for the Client Strategy Map report.
 * Prefers persisted milestone values; uses step/expense timeline helpers only
 * as safe fallbacks for plan-level totals.
 */
export function buildClientStrategyReportSummary(
  input: ClientStrategyReportPlanInput,
  options?: { referenceYear?: number }
): ClientStrategyReportSummary {
  const milestones = input.milestones ?? [];
  const steps = input.steps ?? [];
  const expenses = input.expenses ?? [];
  const journey = buildProjectionJourneySummary(milestones);
  const sorted = sortProjectionMilestones(milestones);
  const firstMilestoneTitle = sorted[0]?.title?.trim()
    ? sorted[0]!.title.trim()
    : null;

  const totalPlannedInvestment = sumNullable(
    steps.map((step) => getStepInvestmentAmount(step))
  );

  const referenceYear =
    options?.referenceYear ?? new Date().getFullYear();
  const incomeThisYearPick = pickIncomeThisYearFromMilestones(
    milestones,
    referenceYear
  );

  const stepIncomeTotalFallback = sumNullable(
    steps.map((step) => getStrategyStepTotalIncome(toTimelineStepInput(step)))
  );

  const totalPlannedExpenses = sumNullable(
    expenses.map((expense) =>
      getStrategyExpenseTotal(toTimelineExpenseInput(expense))
    )
  );

  const capitalExpectedBack = pickCapitalExpectedBack(milestones, steps);

  const initialCapital =
    journey.initialCapital ?? totalPlannedInvestment ?? null;

  return {
    planTitle: input.title?.trim() ? input.title.trim() : null,
    clientGoal: input.clientGoal?.trim() ? input.clientGoal.trim() : null,
    expectedOutcome: input.expectedOutcome?.trim()
      ? input.expectedOutcome.trim()
      : null,
    totalPlannedInvestment,
    initialCapital,
    incomeThisYear: incomeThisYearPick.value,
    incomeThisYearSourceYear: incomeThisYearPick.year,
    targetMonthlyIncome: journey.monthlyIncome,
    projectedCumulativeIncome:
      journey.cumulativeIncome ?? stepIncomeTotalFallback,
    totalPlannedExpenses,
    capitalExpectedBack,
    projectedAssetPosition: journey.totalAssetPosition,
    timelineStartYear: journey.firstProjectionYear,
    timelineEndYear: journey.latestProjectionYear,
    milestoneCount: milestones.length,
    stepCount: steps.length,
    expenseCount: expenses.length,
    firstMilestoneTitle,
    // No date-based "upcoming" logic — mirrors first title for consumers.
    nextMilestoneTitle: firstMilestoneTitle,
  };
}

/**
 * Builds ordered Strategy Map nodes: Goal → milestones → Outcome.
 * Sorting matches `sortProjectionMilestones` (year, sortOrder, createdAt).
 * Does not invent years or interpolate gaps.
 */
export function buildClientStrategyMapNodes(
  input: ClientStrategyReportPlanInput
): ClientStrategyMapNode[] {
  const milestones = input.milestones ?? [];
  const steps = input.steps ?? [];
  const expenses = input.expenses ?? [];
  const stepsById = new Map(steps.map((step) => [step.id, step]));
  const expensesById = new Map(
    expenses.map((expense) => [expense.id, expense])
  );
  const sorted = sortProjectionMilestones(milestones);

  const goalTitle = input.clientGoal?.trim()
    ? input.clientGoal.trim()
    : input.title?.trim()
      ? input.title.trim()
      : 'Client goal';

  const nodes: ClientStrategyMapNode[] = [
    {
      id: 'goal',
      kind: 'goal',
      label: 'Goal',
      title: goalTitle,
      subtitle: input.description?.trim() ? input.description.trim() : null,
      year: null,
      primaryMetricLabel: null,
      primaryMetricValue: null,
      secondaryMetricLabel: null,
      secondaryMetricValue: null,
      ...emptyYearlyFields(),
      benefitText:
        'Helps show the planned client goal this illustrative strategy map is designed to support.',
      notesPreview: null,
      linkedStepChips: [],
      linkedExpenseChips: [],
      order: 0,
      sortKey: null,
    },
  ];

  sorted.forEach((milestone, index) => {
    const kind = mapMilestoneTypeToNodeKind(milestone.type);
    const primary = getPrimaryMetricForMilestone(milestone);
    const secondary = getSecondaryMetricForMilestone(milestone);
    const capitalReturned =
      milestone.capitalReturnedToDate ??
      milestone.capitalReturnedThisYear ??
      null;

    nodes.push({
      id: milestone.id,
      kind,
      label: formatProjectionMilestoneType(milestone.type) || 'Milestone',
      title: milestone.title?.trim() ? milestone.title.trim() : 'Milestone',
      subtitle: null,
      year: milestone.year,
      primaryMetricLabel: primary?.label ?? null,
      primaryMetricValue: primary?.value ?? null,
      secondaryMetricLabel: secondary?.label ?? null,
      secondaryMetricValue: secondary?.value ?? null,
      spendingThisYear: milestone.expensesThisYear ?? null,
      earningThisYear: milestone.incomeThisPeriod ?? null,
      netThisYear: milestone.netCashflowThisYear ?? null,
      cumulativeIncome: milestone.cumulativeIncome ?? null,
      cumulativeExpenses: milestone.cumulativeExpenses ?? null,
      capitalReturned,
      illustrativeTotalPosition: milestone.totalAssetPosition ?? null,
      benefitText: getClientBenefitForMilestoneType(milestone.type),
      notesPreview: truncateNotes(milestone.notes),
      linkedStepChips: resolveLinkedStepChips(milestone, stepsById),
      linkedExpenseChips: resolveLinkedExpenseChips(milestone, expensesById),
      order: index + 1,
      sortKey: milestoneSortKey(milestone),
    });
  });

  const outcomeTitle = input.expectedOutcome?.trim()
    ? input.expectedOutcome.trim()
    : 'Expected outcome';

  nodes.push({
    id: 'outcome',
    kind: 'outcome',
    label: 'Outcome',
    title: outcomeTitle,
    subtitle: null,
    year: null,
    primaryMetricLabel: null,
    primaryMetricValue: null,
    secondaryMetricLabel: null,
    secondaryMetricValue: null,
    ...emptyYearlyFields(),
    benefitText:
      'Supports review of the planned expected outcome based on manually entered strategy assumptions.',
    notesPreview: null,
    linkedStepChips: [],
    linkedExpenseChips: [],
    order: sorted.length + 1,
    sortKey: null,
  });

  return nodes;
}

function hasAnyIncomeField(
  milestones: readonly StrategyProjectionMilestone[]
): boolean {
  return milestones.some(
    (m) =>
      isFiniteNumber(m.monthlyIncome) ||
      isFiniteNumber(m.annualIncome) ||
      isFiniteNumber(m.incomeThisPeriod) ||
      isFiniteNumber(m.cumulativeIncome)
  );
}

function hasAnyCapitalField(
  milestones: readonly StrategyProjectionMilestone[]
): boolean {
  return milestones.some(
    (m) =>
      isFiniteNumber(m.capitalInvested) ||
      isFiniteNumber(m.capitalRemaining) ||
      isFiniteNumber(m.totalAssetPosition) ||
      isFiniteNumber(m.capitalReturnedToDate) ||
      isFiniteNumber(m.capitalReturnedThisYear)
  );
}

function hasAnyExpenseField(
  milestones: readonly StrategyProjectionMilestone[],
  expenses: readonly ClientStrategyReportExpense[]
): boolean {
  if (expenses.length > 0) {
    return true;
  }
  return milestones.some(
    (m) =>
      isFiniteNumber(m.expensesThisYear) ||
      isFiniteNumber(m.cumulativeExpenses)
  );
}

function hasExitOrMaturity(
  milestones: readonly StrategyProjectionMilestone[]
): boolean {
  return milestones.some(
    (m) => m.type === 'EXIT_SCENARIO' || m.type === 'MATURITY_SCENARIO'
  );
}

function hasSelectedSources(
  milestones: readonly StrategyProjectionMilestone[]
): boolean {
  return milestones.some(
    (m) =>
      (m.selectedSteps?.length ?? 0) > 0 ||
      (m.selectedExpenses?.length ?? 0) > 0 ||
      Boolean(m.stepId)
  );
}

/**
 * Deterministic client-facing perks based on data presence.
 * Always includes a manual-assumptions perk when milestones exist.
 */
export function buildClientStrategyPerks(
  input: ClientStrategyReportPlanInput
): ClientStrategyPerk[] {
  const milestones = input.milestones ?? [];
  const steps = input.steps ?? [];
  const expenses = input.expenses ?? [];
  const perks: ClientStrategyPerk[] = [];

  if (milestones.length > 0) {
    perks.push({
      id: 'milestone-roadmap',
      title: 'Milestone roadmap',
      description:
        'Presents advisor-selected years and scenarios as an illustrative roadmap — not an auto-generated year-by-year forecast.',
    });
  }

  if (hasAnyIncomeField(milestones)) {
    perks.push({
      id: 'income-visibility',
      title: 'Income visibility',
      description:
        'Helps show planned income checkpoints using values the advisor entered for discussion.',
    });
  }

  if (hasAnyExpenseField(milestones, expenses)) {
    perks.push({
      id: 'expense-visibility',
      title: 'Expense & premium visibility',
      description:
        'Helps show planned expenses or premiums alongside income so spending and earning can be reviewed together.',
    });
  }

  if (hasAnyCapitalField(milestones)) {
    perks.push({
      id: 'capital-position',
      title: 'Capital position visibility',
      description:
        'Supports review of planned capital, returned capital, and illustrative asset-position checkpoints where those figures were entered.',
    });
  }

  if (steps.length > 0 || hasSelectedSources(milestones)) {
    perks.push({
      id: 'advisor-guided-steps',
      title: 'Advisor-guided contributions',
      description:
        'Links selected strategy items and expenses to milestones so the client can see what contributes to each checkpoint.',
    });
  }

  if (hasExitOrMaturity(milestones)) {
    perks.push({
      id: 'exit-maturity-planning',
      title: 'Exit & maturity planning',
      description:
        'Includes potential exit or maturity scenarios to support longer-horizon review conversations.',
    });
  }

  if (milestones.length > 0) {
    perks.push({
      id: 'manual-assumptions',
      title: 'Manually controlled assumptions',
      description:
        'Values are illustrative and based on advisor-entered assumptions. Helper suggestions are optional and are never forced into this report.',
    });
  }

  return perks;
}

/** Test/helper: detect disallowed guarantee-style phrasing in generated copy. */
export function benefitsContainGuaranteeLanguage(
  texts: readonly string[]
): boolean {
  return texts.some((text) => GUARANTEE_LANGUAGE_PATTERN.test(text));
}
