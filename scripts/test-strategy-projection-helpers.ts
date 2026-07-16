/**
 * Unit tests for Strategy Projection milestone helpers.
 *
 * Run: npm run test:strategy-projection
 */
import { StrategyProjectionMilestoneType } from '@prisma/client';
import {
  buildProjectionJourneySummary,
  buildProjectionMilestoneReorderIds,
  buildStepProjectionBadges,
  calculateSuggestedCumulativeIncome,
  calculateSuggestedTotalAssetPosition,
  formatProjectionMilestoneType,
  getProjectionMilestonePhaseLabel,
  getProjectionMilestoneReorderBounds,
  sortProjectionMilestones,
  type StrategyProjectionMilestone,
} from '../lib/clientStrategyProjectionHelpers';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(
  actual: number | null | string,
  expected: number | null | string,
  message: string
) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function milestone(
  overrides: Partial<StrategyProjectionMilestone> &
    Pick<StrategyProjectionMilestone, 'id' | 'year' | 'sortOrder'>
): StrategyProjectionMilestone {
  return {
    strategyPlanId: 'plan-1',
    stepId: null,
    title: overrides.title ?? 'Milestone',
    type: StrategyProjectionMilestoneType.CUSTOM,
    monthlyIncome: null,
    monthsOfIncome: null,
    annualIncome: null,
    capitalInvested: null,
    capitalRemaining: null,
    incomeThisPeriod: null,
    cumulativeIncome: null,
    totalAssetPosition: null,
    notes: null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    step: null,
    ...overrides,
  };
}

function testSuggestedCumulativeIncome() {
  assertEqual(
    calculateSuggestedCumulativeIncome(1000, 12),
    12000,
    'monthly × months'
  );
  assertEqual(
    calculateSuggestedCumulativeIncome(null, 12),
    null,
    'null monthly → null'
  );
  assertEqual(
    calculateSuggestedCumulativeIncome(1000, null),
    null,
    'null months → null'
  );
  assertEqual(
    calculateSuggestedCumulativeIncome(-1, 12),
    null,
    'negative monthly → null'
  );
  assertEqual(
    calculateSuggestedCumulativeIncome(1000, -1),
    null,
    'negative months → null'
  );
}

function testSuggestedTotalAssetPosition() {
  assertEqual(
    calculateSuggestedTotalAssetPosition(50000, 12000),
    62000,
    'capital + cumulative'
  );
  assertEqual(
    calculateSuggestedTotalAssetPosition(null, 12000),
    null,
    'null capital → null'
  );
  assertEqual(
    calculateSuggestedTotalAssetPosition(50000, null),
    null,
    'null cumulative → null'
  );
}

function testDoesNotMutateMilestone() {
  const original: StrategyProjectionMilestone = milestone({
    id: 'm1',
    year: 2030,
    sortOrder: 0,
    monthlyIncome: 1000,
    monthsOfIncome: 12,
    cumulativeIncome: 9999,
    capitalRemaining: 50000,
    totalAssetPosition: 12345,
  });
  const snapshot = structuredClone(original);

  const suggestedCum = calculateSuggestedCumulativeIncome(
    original.monthlyIncome,
    original.monthsOfIncome
  );
  const suggestedAssets = calculateSuggestedTotalAssetPosition(
    original.capitalRemaining,
    original.cumulativeIncome
  );

  assertEqual(suggestedCum, 12000, 'suggestion is monthly × months');
  assertEqual(
    suggestedAssets,
    59999,
    'asset suggestion uses manual cumulative, not monthly×months'
  );
  assertEqual(
    original.cumulativeIncome,
    9999,
    'manual cumulativeIncome unchanged'
  );
  assertEqual(
    original.totalAssetPosition,
    12345,
    'manual totalAssetPosition unchanged'
  );
  assert(
    JSON.stringify(original) === JSON.stringify(snapshot),
    'milestone object must not be mutated by helpers'
  );
}

function testLabels() {
  assertEqual(
    formatProjectionMilestoneType(
      StrategyProjectionMilestoneType.INITIAL_INVESTMENT
    ),
    'Initial Investment',
    'format INITIAL_INVESTMENT'
  );
  assertEqual(
    formatProjectionMilestoneType(
      StrategyProjectionMilestoneType.INCOME_CHECKPOINT
    ),
    'Income Checkpoint',
    'format INCOME_CHECKPOINT'
  );
  assertEqual(
    formatProjectionMilestoneType(StrategyProjectionMilestoneType.EXIT_SCENARIO),
    'Exit Scenario',
    'format EXIT_SCENARIO'
  );
  assertEqual(
    formatProjectionMilestoneType(
      StrategyProjectionMilestoneType.MATURITY_SCENARIO
    ),
    'Maturity Scenario',
    'format MATURITY_SCENARIO'
  );
  assertEqual(
    formatProjectionMilestoneType(StrategyProjectionMilestoneType.CUSTOM),
    'Custom Milestone',
    'format CUSTOM'
  );

  assertEqual(
    getProjectionMilestonePhaseLabel(
      StrategyProjectionMilestoneType.INITIAL_INVESTMENT
    ),
    'Initial',
    'phase INITIAL'
  );
  assertEqual(
    getProjectionMilestonePhaseLabel(
      StrategyProjectionMilestoneType.INCOME_CHECKPOINT
    ),
    'Income',
    'phase INCOME'
  );
  assertEqual(
    getProjectionMilestonePhaseLabel(
      StrategyProjectionMilestoneType.EXIT_SCENARIO
    ),
    'Exit',
    'phase EXIT'
  );
  assertEqual(
    getProjectionMilestonePhaseLabel(
      StrategyProjectionMilestoneType.MATURITY_SCENARIO
    ),
    'Maturity',
    'phase MATURITY'
  );
  assertEqual(
    getProjectionMilestonePhaseLabel(StrategyProjectionMilestoneType.CUSTOM),
    'Custom',
    'phase CUSTOM'
  );
}

function testSortProjectionMilestones() {
  const input = [
    milestone({
      id: 'c',
      year: 2030,
      sortOrder: 1,
      createdAt: '2026-01-03T00:00:00.000Z',
    }),
    milestone({
      id: 'a',
      year: 2040,
      sortOrder: 0,
      createdAt: '2026-01-02T00:00:00.000Z',
    }),
    milestone({
      id: 'b',
      year: 2030,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  ];
  const before = input.map((m) => m.id);
  const sorted = sortProjectionMilestones(input);

  // year asc, then sortOrder asc → 2030/0, 2030/1, 2040/0
  assertEqual(sorted.map((m) => m.id).join(','), 'b,c,a', 'sort by year then sortOrder');
  assertEqual(input.map((m) => m.id).join(','), before.join(','), 'input not mutated');
}

function testBuildProjectionJourneySummary() {
  const empty = buildProjectionJourneySummary([]);
  assertEqual(empty.initialCapital, null, 'empty initialCapital');
  assertEqual(empty.firstProjectionYear, null, 'empty first year');

  const milestones = [
    milestone({
      id: 'early',
      year: 2025,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.INITIAL_INVESTMENT,
      capitalInvested: 100000,
      monthlyIncome: 500,
      cumulativeIncome: 1000,
      totalAssetPosition: 101000,
    }),
    milestone({
      id: 'mid',
      year: 2030,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
      monthlyIncome: 1200,
      cumulativeIncome: 50000,
      totalAssetPosition: null,
    }),
    milestone({
      id: 'late',
      year: 2035,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.EXIT_SCENARIO,
      cumulativeIncome: 90000,
      totalAssetPosition: 175000,
    }),
  ];

  const summary = buildProjectionJourneySummary(milestones);
  assertEqual(summary.initialCapital, 100000, 'initial from INITIAL_INVESTMENT');
  assertEqual(summary.monthlyIncome, 1200, 'monthly from latest with value');
  assertEqual(summary.firstProjectionYear, 2025, 'first year');
  assertEqual(summary.latestProjectionYear, 2035, 'latest year');
  assertEqual(summary.cumulativeIncome, 90000, 'cumulative from latest');
  assertEqual(summary.totalAssetPosition, 175000, 'assets from latest');
}

function testSameYearReorder() {
  const milestones = [
    milestone({ id: 'a', year: 2030, sortOrder: 0, title: 'A' }),
    milestone({ id: 'b', year: 2030, sortOrder: 1, title: 'B' }),
    milestone({ id: 'c', year: 2035, sortOrder: 0, title: 'C' }),
  ];

  const movedDown = buildProjectionMilestoneReorderIds(
    milestones,
    'a',
    'later'
  );
  assert(movedDown !== null, 'move a down returns ids');
  assertEqual(movedDown!.join(','), 'b,a,c', 'move a down within 2030');

  const blockedAcrossYear = buildProjectionMilestoneReorderIds(
    milestones,
    'b',
    'later'
  );
  assert(blockedAcrossYear === null, 'cannot move across years');

  const boundsA = getProjectionMilestoneReorderBounds(milestones, 'a');
  assert(!boundsA.canMoveEarlier && boundsA.canMoveLater, 'bounds for a');
  const boundsB = getProjectionMilestoneReorderBounds(milestones, 'b');
  assert(boundsB.canMoveEarlier && !boundsB.canMoveLater, 'bounds for b');
  const boundsC = getProjectionMilestoneReorderBounds(milestones, 'c');
  assert(!boundsC.canMoveEarlier && !boundsC.canMoveLater, 'bounds for solo year');
}

function testStepProjectionBadges() {
  const stepId = 'step-1';
  assertEqual(
    buildStepProjectionBadges([], stepId).length,
    0,
    'no milestones → no badges'
  );
  assertEqual(
    buildStepProjectionBadges(
      [
        milestone({
          id: 'other',
          year: 2030,
          sortOrder: 0,
          stepId: 'other-step',
          monthlyIncome: 999,
        }),
      ],
      stepId
    ).length,
    0,
    'unlinked → no badges'
  );

  const badges = buildStepProjectionBadges(
    [
      milestone({
        id: 'old',
        year: 2028,
        sortOrder: 0,
        stepId,
        monthlyIncome: 500,
        totalAssetPosition: 10000,
      }),
      milestone({
        id: 'exit',
        year: 2031,
        sortOrder: 0,
        stepId,
        type: StrategyProjectionMilestoneType.EXIT_SCENARIO,
        monthlyIncome: 1000,
        totalAssetPosition: 160000,
      }),
    ],
    stepId,
    3
  );

  assertEqual(badges.length, 3, 'up to 3 badges');
  assertEqual(badges[0]?.kind, 'income', 'income first');
  assert(
    Boolean(
      badges[0]?.label.includes('Projected income') &&
        (badges[0]?.label.includes('1,000') || badges[0]?.label.includes('1000'))
    ),
    `income uses latest monthly: ${badges[0]?.label}`
  );
  assertEqual(badges[1]?.kind, 'exit', 'exit second');
  assertEqual(badges[1]?.label, 'Exit Scenario: 2031', 'exit year label');
  assertEqual(badges[2]?.kind, 'position', 'position third');
  assert(
    Boolean(
      badges[2]?.label.includes('Total Asset Position') &&
        (badges[2]?.label.includes('160,000') ||
          badges[2]?.label.includes('160000'))
    ),
    `position uses latest total: ${badges[2]?.label}`
  );

  const limited = buildStepProjectionBadges(
    [
      milestone({
        id: 'exit',
        year: 2031,
        sortOrder: 0,
        stepId,
        type: StrategyProjectionMilestoneType.EXIT_SCENARIO,
        monthlyIncome: 1000,
        totalAssetPosition: 160000,
      }),
    ],
    stepId,
    2
  );
  assertEqual(limited.length, 2, 'respects maxBadges');
}

function main() {
  testSuggestedCumulativeIncome();
  testSuggestedTotalAssetPosition();
  testDoesNotMutateMilestone();
  testLabels();
  testSortProjectionMilestones();
  testBuildProjectionJourneySummary();
  testSameYearReorder();
  testStepProjectionBadges();
  console.log('PASS: strategy projection helpers');
}

main();
