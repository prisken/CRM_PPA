/**
 * View-model helpers for the read-only Client Strategy Map report.
 *
 * Consumes existing Strategy Plan / Step / Projection Milestone data.
 * Does not generate years, invent projections, or compute growth/ROI/yield.
 * Suggestion math from Projection Journey is not applied here — persisted
 * milestone values only.
 */
import type { StrategyProjectionMilestoneType } from '@prisma/client';
import {
  buildProjectionJourneySummary,
  formatProjectionMilestoneType,
  sortProjectionMilestones,
  type StrategyProjectionMilestone,
  type StrategyProjectionMilestoneStepSummary,
} from '@/lib/clientStrategyProjectionHelpers';

export type ClientStrategyReportStep = {
  id: string;
  title: string;
  stepType?: string | null;
  sortOrder?: number | null;
};

export type ClientStrategyReportPlanInput = {
  id?: string | null;
  title?: string | null;
  clientGoal?: string | null;
  expectedOutcome?: string | null;
  description?: string | null;
  milestones?: readonly StrategyProjectionMilestone[] | null;
  steps?: readonly ClientStrategyReportStep[] | null;
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

export type ClientStrategyMapLinkedStepChip = {
  id: string;
  title: string;
};

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
  benefitText: string | null;
  notesPreview: string | null;
  linkedStepChips: ClientStrategyMapLinkedStepChip[];
  /** Stable display order: Goal=0, milestones=1..n, Outcome=n+1 */
  order: number;
  /** Sort key for milestones (null for goal/outcome). */
  sortKey: string | null;
};

export type ClientStrategyReportSummary = {
  planTitle: string | null;
  clientGoal: string | null;
  expectedOutcome: string | null;
  initialCapital: number | null;
  targetMonthlyIncome: number | null;
  projectedCumulativeIncome: number | null;
  projectedAssetPosition: number | null;
  timelineStartYear: number | null;
  timelineEndYear: number | null;
  milestoneCount: number;
  stepCount: number;
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
  >
): ClientStrategyReportMetric | null {
  const type = normalizeMilestoneType(milestone.type);

  switch (type) {
    case 'INITIAL_INVESTMENT':
      return firstAvailableMetric([
        { label: 'Capital invested', value: milestone.capitalInvested },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
      ]);
    case 'INCOME_CHECKPOINT':
      return firstAvailableMetric([
        { label: 'Monthly income', value: milestone.monthlyIncome },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        { label: 'Annual income', value: milestone.annualIncome },
        { label: 'Income this period', value: milestone.incomeThisPeriod },
      ]);
    case 'MATURITY_SCENARIO':
    case 'EXIT_SCENARIO':
      return firstAvailableMetric([
        { label: 'Total asset position', value: milestone.totalAssetPosition },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
      ]);
    case 'CUSTOM':
    default:
      return firstAvailableMetric([
        { label: 'Total asset position', value: milestone.totalAssetPosition },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        { label: 'Monthly income', value: milestone.monthlyIncome },
        { label: 'Capital invested', value: milestone.capitalInvested },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Annual income', value: milestone.annualIncome },
        { label: 'Income this period', value: milestone.incomeThisPeriod },
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
  >
): ClientStrategyReportMetric | null {
  const primary = getPrimaryMetricForMilestone(milestone);
  const type = normalizeMilestoneType(milestone.type);

  let candidates: Array<{ label: string; value: number | null | undefined }>;

  switch (type) {
    case 'INITIAL_INVESTMENT':
      candidates = [
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Monthly income', value: milestone.monthlyIncome },
      ];
      break;
    case 'INCOME_CHECKPOINT':
      candidates = [
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Total asset position', value: milestone.totalAssetPosition },
      ];
      break;
    case 'MATURITY_SCENARIO':
    case 'EXIT_SCENARIO':
      candidates = [
        { label: 'Capital remaining', value: milestone.capitalRemaining },
        { label: 'Cumulative income', value: milestone.cumulativeIncome },
        { label: 'Monthly income', value: milestone.monthlyIncome },
      ];
      break;
    case 'CUSTOM':
    default:
      candidates = [
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

function resolveLinkedStepChips(
  milestone: StrategyProjectionMilestone,
  stepsById: Map<string, ClientStrategyReportStep>
): ClientStrategyMapLinkedStepChip[] {
  if (!milestone.stepId) {
    return [];
  }

  const fromNested: StrategyProjectionMilestoneStepSummary | null | undefined =
    milestone.step;
  if (fromNested?.id && fromNested.title) {
    return [{ id: fromNested.id, title: fromNested.title }];
  }

  const fromPlan = stepsById.get(milestone.stepId);
  if (fromPlan) {
    return [{ id: fromPlan.id, title: fromPlan.title }];
  }

  return [];
}

function milestoneSortKey(milestone: StrategyProjectionMilestone): string {
  const createdAt = milestone.createdAt
    ? new Date(milestone.createdAt).getTime()
    : 0;
  return `${milestone.year}:${milestone.sortOrder}:${createdAt}:${milestone.id}`;
}

/**
 * Snapshot metrics for the Client Strategy Map report.
 * Reuses Projection Journey summary selection for money/year fields.
 */
export function buildClientStrategyReportSummary(
  input: ClientStrategyReportPlanInput
): ClientStrategyReportSummary {
  const milestones = input.milestones ?? [];
  const steps = input.steps ?? [];
  const journey = buildProjectionJourneySummary(milestones);
  const sorted = sortProjectionMilestones(milestones);
  const firstMilestoneTitle = sorted[0]?.title?.trim()
    ? sorted[0]!.title.trim()
    : null;

  return {
    planTitle: input.title?.trim() ? input.title.trim() : null,
    clientGoal: input.clientGoal?.trim() ? input.clientGoal.trim() : null,
    expectedOutcome: input.expectedOutcome?.trim()
      ? input.expectedOutcome.trim()
      : null,
    initialCapital: journey.initialCapital,
    targetMonthlyIncome: journey.monthlyIncome,
    projectedCumulativeIncome: journey.cumulativeIncome,
    projectedAssetPosition: journey.totalAssetPosition,
    timelineStartYear: journey.firstProjectionYear,
    timelineEndYear: journey.latestProjectionYear,
    milestoneCount: milestones.length,
    stepCount: steps.length,
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
  const stepsById = new Map(steps.map((step) => [step.id, step]));
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
      benefitText:
        'Helps show the planned client goal this illustrative strategy map is designed to support.',
      notesPreview: null,
      linkedStepChips: [],
      order: 0,
      sortKey: null,
    },
  ];

  sorted.forEach((milestone, index) => {
    const kind = mapMilestoneTypeToNodeKind(milestone.type);
    const primary = getPrimaryMetricForMilestone(milestone);
    const secondary = getSecondaryMetricForMilestone(milestone);

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
      benefitText: getClientBenefitForMilestoneType(milestone.type),
      notesPreview: truncateNotes(milestone.notes),
      linkedStepChips: resolveLinkedStepChips(milestone, stepsById),
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
    benefitText:
      'Supports review of the planned expected outcome based on manually entered strategy assumptions.',
    notesPreview: null,
    linkedStepChips: [],
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
      isFiniteNumber(m.totalAssetPosition)
  );
}

function hasExitOrMaturity(
  milestones: readonly StrategyProjectionMilestone[]
): boolean {
  return milestones.some(
    (m) => m.type === 'EXIT_SCENARIO' || m.type === 'MATURITY_SCENARIO'
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

  if (hasAnyCapitalField(milestones)) {
    perks.push({
      id: 'capital-position',
      title: 'Capital position visibility',
      description:
        'Supports review of planned capital and asset-position checkpoints where those figures were entered.',
    });
  }

  if (steps.length > 0) {
    perks.push({
      id: 'advisor-guided-steps',
      title: 'Advisor-guided steps',
      description:
        'Links selected strategy steps to milestones so the client can see how plan actions relate to the journey.',
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
        'Saved figures remain under advisor control. Helper suggestions are optional and are never forced into this report.',
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
