/**
 * Shared types and presentation helpers for Strategy Projection milestones.
 *
 * Suggestion helpers are pure and never mutate milestone records.
 * Callers must copy suggested values into editable fields only when the user
 * chooses (e.g. Apply). Manually entered cumulativeIncome / totalAssetPosition
 * always win over suggestions when persisting.
 */
import type { StrategyProjectionMilestoneType } from '@prisma/client';
import type {
  CreateStrategyProjectionMilestoneInput,
  UpdateStrategyProjectionMilestoneInput,
} from '@/lib/clientStrategyValidation';
import { formatMoneyRequired } from './formatMoney';

export type { StrategyProjectionMilestoneType };
export type {
  CreateStrategyProjectionMilestoneInput,
  UpdateStrategyProjectionMilestoneInput,
};

/** Optional nested step summary returned with plan/milestone payloads. */
export type StrategyProjectionMilestoneStepSummary = {
  id: string;
  title: string;
  stepType: string;
  sortOrder: number;
};

/**
 * API/UI milestone shape (numbers already coerced from Prisma Decimal).
 * Matches `formatStrategyProjectionMilestone` in `lib/clientStrategyPlans.ts`.
 */
export type StrategyProjectionMilestone = {
  id: string;
  strategyPlanId: string;
  stepId: string | null;
  year: number;
  title: string;
  type: StrategyProjectionMilestoneType;
  monthlyIncome: number | null;
  monthsOfIncome: number | null;
  annualIncome: number | null;
  capitalInvested: number | null;
  capitalRemaining: number | null;
  incomeThisPeriod: number | null;
  cumulativeIncome: number | null;
  totalAssetPosition: number | null;
  expensesThisYear?: number | null;
  cumulativeExpenses?: number | null;
  netCashflowThisYear?: number | null;
  capitalReturnedThisYear?: number | null;
  capitalReturnedToDate?: number | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  step?: StrategyProjectionMilestoneStepSummary | null;
  selectedStepIds?: string[];
  selectedExpenseIds?: string[];
  selectedSteps?: Array<{
    id?: string;
    stepId: string;
    step?: { id: string; title: string } | null;
  }>;
  selectedExpenses?: Array<{
    id?: string;
    expenseId: string;
    expense?: { id: string; title: string } | null;
  }>;
};

/** Minimal fields required to sort milestones. */
export type StrategyProjectionMilestoneSortable = {
  sortOrder: number;
  year: number;
  createdAt?: string | Date | null;
  id?: string;
};

/** Stable type list (string literals) so module init does not depend on Prisma enum object presence. */
export const STRATEGY_PROJECTION_MILESTONE_TYPES: StrategyProjectionMilestoneType[] =
  [
    'INITIAL_INVESTMENT',
    'INCOME_CHECKPOINT',
    'EXIT_SCENARIO',
    'MATURITY_SCENARIO',
    'CUSTOM',
  ];

const TYPE_DISPLAY_LABELS: Record<StrategyProjectionMilestoneType, string> = {
  INITIAL_INVESTMENT: 'Initial Investment',
  INCOME_CHECKPOINT: 'Income Checkpoint',
  EXIT_SCENARIO: 'Exit Scenario',
  MATURITY_SCENARIO: 'Maturity Scenario',
  CUSTOM: 'Custom Milestone',
};

/** Short phase labels for timeline / journey chrome. */
const TYPE_PHASE_LABELS: Record<StrategyProjectionMilestoneType, string> = {
  INITIAL_INVESTMENT: 'Initial',
  INCOME_CHECKPOINT: 'Income',
  EXIT_SCENARIO: 'Exit',
  MATURITY_SCENARIO: 'Maturity',
  CUSTOM: 'Custom',
};

export const STRATEGY_PROJECTION_MILESTONE_TYPE_OPTIONS: Array<{
  value: StrategyProjectionMilestoneType;
  label: string;
}> = STRATEGY_PROJECTION_MILESTONE_TYPES.map((value) => ({
  value,
  label: TYPE_DISPLAY_LABELS[value],
}));

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Human-readable type label for badges and forms.
 * Example: INITIAL_INVESTMENT → "Initial Investment"
 */
export function formatProjectionMilestoneType(
  type: StrategyProjectionMilestoneType | string | null | undefined
): string {
  if (!type) {
    return '';
  }

  if (type in TYPE_DISPLAY_LABELS) {
    return TYPE_DISPLAY_LABELS[type as StrategyProjectionMilestoneType];
  }

  return String(type)
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Short journey-phase label (Initial / Income / Exit / Maturity / Custom).
 */
export function getProjectionMilestonePhaseLabel(
  type: StrategyProjectionMilestoneType | string | null | undefined
): string {
  if (!type) {
    return '';
  }

  if (type in TYPE_PHASE_LABELS) {
    return TYPE_PHASE_LABELS[type as StrategyProjectionMilestoneType];
  }

  return formatProjectionMilestoneType(type);
}

/**
 * Suggestion only: monthlyIncome × monthsOfIncome.
 * Returns null when either input is missing/invalid. Does not read or write
 * milestone.cumulativeIncome.
 */
export function calculateSuggestedCumulativeIncome(
  monthlyIncome: number | null | undefined,
  monthsOfIncome: number | null | undefined
): number | null {
  if (!isFiniteNumber(monthlyIncome) || !isFiniteNumber(monthsOfIncome)) {
    return null;
  }

  if (monthlyIncome < 0 || monthsOfIncome < 0) {
    return null;
  }

  return monthlyIncome * monthsOfIncome;
}

/**
 * Suggestion only: capitalRemaining + cumulativeIncome.
 * Pass the value the user currently has for cumulativeIncome (manual or
 * previously saved) — never silently replace it with a suggestion here.
 * Returns null when either input is missing/invalid.
 */
export function calculateSuggestedTotalAssetPosition(
  capitalRemaining: number | null | undefined,
  cumulativeIncome: number | null | undefined
): number | null {
  if (
    !isFiniteNumber(capitalRemaining) ||
    !isFiniteNumber(cumulativeIncome)
  ) {
    return null;
  }

  return capitalRemaining + cumulativeIncome;
}

/**
 * Returns a new array ordered by year, then sortOrder, then createdAt, then id.
 * Journey display order — does not generate missing years.
 * Does not mutate the input array or milestone objects.
 */
export function sortProjectionMilestones<
  T extends StrategyProjectionMilestoneSortable,
>(milestones: readonly T[]): T[] {
  return [...milestones].sort((a, b) => {
    if (a.year !== b.year) {
      return a.year - b.year;
    }

    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }

    const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (aCreated !== bCreated) {
      return aCreated - bCreated;
    }

    const aId = a.id ?? '';
    const bId = b.id ?? '';
    return aId.localeCompare(bId);
  });
}

/** Summary figures derived only from stored milestone values (no forecasting). */
export type ProjectionJourneySummary = {
  initialCapital: number | null;
  monthlyIncome: number | null;
  firstProjectionYear: number | null;
  latestProjectionYear: number | null;
  cumulativeIncome: number | null;
  totalAssetPosition: number | null;
};

function pickLatestNonNullField(
  milestones: readonly StrategyProjectionMilestone[],
  field: 'cumulativeIncome' | 'totalAssetPosition' | 'monthlyIncome'
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
    const value = milestone[field];
    if (isFiniteNumber(value)) {
      return value;
    }
  }

  return null;
}

/**
 * Builds journey header metrics from manually saved milestones only.
 * Missing fields stay null (UI shows "—"). Prefer latest year/sortOrder for
 * cumulativeIncome and totalAssetPosition.
 */
export function buildProjectionJourneySummary(
  milestones: readonly StrategyProjectionMilestone[]
): ProjectionJourneySummary {
  if (milestones.length === 0) {
    return {
      initialCapital: null,
      monthlyIncome: null,
      firstProjectionYear: null,
      latestProjectionYear: null,
      cumulativeIncome: null,
      totalAssetPosition: null,
    };
  }

  const sorted = sortProjectionMilestones(milestones);
  const firstProjectionYear = sorted[0]?.year ?? null;
  const latestProjectionYear = sorted[sorted.length - 1]?.year ?? null;

  let initialCapital: number | null = null;
  const initialType = sorted.find(
    (milestone) =>
      milestone.type === 'INITIAL_INVESTMENT' &&
      (isFiniteNumber(milestone.capitalInvested) ||
        isFiniteNumber(milestone.capitalRemaining))
  );
  if (initialType) {
    initialCapital = isFiniteNumber(initialType.capitalInvested)
      ? initialType.capitalInvested
      : (initialType.capitalRemaining as number);
  } else {
    for (const milestone of sorted) {
      if (isFiniteNumber(milestone.capitalInvested)) {
        initialCapital = milestone.capitalInvested;
        break;
      }
      if (isFiniteNumber(milestone.capitalRemaining)) {
        initialCapital = milestone.capitalRemaining;
        break;
      }
    }
  }

  return {
    initialCapital,
    monthlyIncome: pickLatestNonNullField(milestones, 'monthlyIncome'),
    firstProjectionYear,
    latestProjectionYear,
    cumulativeIncome: pickLatestNonNullField(milestones, 'cumulativeIncome'),
    totalAssetPosition: pickLatestNonNullField(
      milestones,
      'totalAssetPosition'
    ),
  };
}

/**
 * Builds a full-plan orderedIds list after moving a milestone up/down among
 * siblings that share the same year. Year groups stay contiguous; other years
 * are unchanged. Returns null when the move is not possible.
 */
export function buildProjectionMilestoneReorderIds(
  milestones: readonly StrategyProjectionMilestone[],
  milestoneId: string,
  direction: 'earlier' | 'later'
): string[] | null {
  const sorted = sortProjectionMilestones(milestones);
  const index = sorted.findIndex((milestone) => milestone.id === milestoneId);
  if (index < 0) {
    return null;
  }

  const current = sorted[index]!;
  const targetIndex = direction === 'earlier' ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) {
    return null;
  }

  const neighbor = sorted[targetIndex]!;
  if (neighbor.year !== current.year) {
    return null;
  }

  const next = [...sorted];
  next[index] = neighbor;
  next[targetIndex] = current;
  return next.map((milestone) => milestone.id);
}

/** Whether a milestone can move earlier/later within its year group. */
export function getProjectionMilestoneReorderBounds(
  milestones: readonly StrategyProjectionMilestone[],
  milestoneId: string
): { canMoveEarlier: boolean; canMoveLater: boolean } {
  const sorted = sortProjectionMilestones(milestones);
  const index = sorted.findIndex((milestone) => milestone.id === milestoneId);
  if (index < 0) {
    return { canMoveEarlier: false, canMoveLater: false };
  }

  const year = sorted[index]!.year;
  return {
    canMoveEarlier: index > 0 && sorted[index - 1]!.year === year,
    canMoveLater:
      index < sorted.length - 1 && sorted[index + 1]!.year === year,
  };
}

export type StepProjectionBadge = {
  /** Stable key for React lists (`income` | `exit` | `position`). */
  kind: 'income' | 'exit' | 'position';
  label: string;
};

function formatBadgeMoney(value: number): string {
  return formatMoneyRequired(value, {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}

/**
 * Compact Board badges for milestones linked to a step (`stepId`).
 * At most `maxBadges` (default 3). Empty when nothing is linked.
 *
 * Preference order:
 * 1. Latest linked monthlyIncome → "Projected income: X/mo"
 * 2. Latest EXIT_SCENARIO year → "Exit Scenario: YYYY"
 * 3. Latest linked totalAssetPosition → "Total Asset Position: X"
 */
export function buildStepProjectionBadges(
  milestones: readonly StrategyProjectionMilestone[],
  stepId: string,
  maxBadges = 3
): StepProjectionBadge[] {
  const linked = milestones.filter(
    (milestone) => milestone.stepId === stepId
  );
  if (linked.length === 0 || maxBadges <= 0) {
    return [];
  }

  const latestFirst = [...linked].sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year;
    }
    if (a.sortOrder !== b.sortOrder) {
      return b.sortOrder - a.sortOrder;
    }
    return 0;
  });

  const badges: StepProjectionBadge[] = [];

  const incomeMilestone = latestFirst.find((milestone) =>
    isFiniteNumber(milestone.monthlyIncome)
  );
  if (incomeMilestone && badges.length < maxBadges) {
    badges.push({
      kind: 'income',
      label: `Projected income: ${formatBadgeMoney(incomeMilestone.monthlyIncome!)}/mo`,
    });
  }

  const exitMilestone = latestFirst.find(
    (milestone) =>
      milestone.type === 'EXIT_SCENARIO'
  );
  if (exitMilestone && badges.length < maxBadges) {
    badges.push({
      kind: 'exit',
      label: `Exit Scenario: ${exitMilestone.year}`,
    });
  }

  const positionMilestone = latestFirst.find((milestone) =>
    isFiniteNumber(milestone.totalAssetPosition)
  );
  if (positionMilestone && badges.length < maxBadges) {
    badges.push({
      kind: 'position',
      label: `Total Asset Position: ${formatBadgeMoney(
        positionMilestone.totalAssetPosition!
      )}`,
    });
  }

  return badges;
}
