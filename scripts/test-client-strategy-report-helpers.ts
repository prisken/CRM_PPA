/**
 * Unit tests for Client Strategy Map report helpers.
 *
 * Run: npm run test:strategy-report
 */
import { StrategyProjectionMilestoneType } from '@prisma/client';
import type { StrategyProjectionMilestone } from '../lib/clientStrategyProjectionHelpers';
import {
  benefitsContainGuaranteeLanguage,
  buildClientStrategyMapNodes,
  buildClientStrategyPerks,
  buildClientStrategyReportSummary,
  getClientBenefitForMilestoneType,
  getPrimaryMetricForMilestone,
  mapMilestoneTypeToNodeKind,
} from '../lib/clientStrategyReportHelpers';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(
  actual: number | null | string | undefined,
  expected: number | null | string | undefined,
  message: string
) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${String(expected)}, got ${String(actual)}`
    );
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

function testEmptyMilestonesStillProduceGoalAndOutcome() {
  const nodes = buildClientStrategyMapNodes({
    title: 'Family plan',
    clientGoal: 'Fund retirement lifestyle',
    expectedOutcome: 'Sustainable income review',
    milestones: [],
    steps: [],
  });

  assertEqual(nodes.length, 2, 'goal + outcome only');
  assertEqual(nodes[0]!.kind, 'goal', 'first is goal');
  assertEqual(nodes[0]!.title, 'Fund retirement lifestyle', 'goal title');
  assertEqual(nodes[1]!.kind, 'outcome', 'last is outcome');
  assertEqual(nodes[1]!.title, 'Sustainable income review', 'outcome title');
  assertEqual(nodes[0]!.spendingThisYear, null, 'goal spending null');
  assertEqual(nodes[0]!.linkedExpenseChips.length, 0, 'goal no expense chips');

  const summary = buildClientStrategyReportSummary({
    title: 'Family plan',
    milestones: [],
    steps: [{ id: 's1', title: 'Step A' }],
  });
  assertEqual(summary.milestoneCount, 0, 'milestoneCount 0');
  assertEqual(summary.stepCount, 1, 'stepCount 1');
  assertEqual(summary.expenseCount, 0, 'expenseCount 0');
  assertEqual(summary.timelineStartYear, null, 'no auto years');
  assertEqual(summary.timelineEndYear, null, 'no auto end year');
  assertEqual(summary.initialCapital, null, 'null capital');
  assertEqual(summary.totalPlannedInvestment, null, 'null investment');
  assertEqual(summary.firstMilestoneTitle, null, 'no first title');
  assertEqual(summary.nextMilestoneTitle, null, 'no next title');
}

function testMilestoneSortOrder() {
  const nodes = buildClientStrategyMapNodes({
    clientGoal: 'Goal',
    expectedOutcome: 'Outcome',
    milestones: [
      milestone({
        id: 'b',
        year: 2030,
        sortOrder: 0,
        createdAt: '2026-01-02T00:00:00.000Z',
        title: 'Later same year',
      }),
      milestone({
        id: 'a',
        year: 2030,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        title: 'Earlier same year',
      }),
      milestone({
        id: 'c',
        year: 2028,
        sortOrder: 5,
        title: 'Earlier year',
      }),
      milestone({
        id: 'd',
        year: 2030,
        sortOrder: 1,
        title: 'Higher sort same year',
      }),
    ],
  });

  const mid = nodes.filter((n) => n.kind !== 'goal' && n.kind !== 'outcome');
  assertEqual(mid.length, 4, 'four milestone nodes');
  assertEqual(mid[0]!.id, 'c', 'year ASC first');
  assertEqual(mid[1]!.id, 'a', 'createdAt ASC within year/sort');
  assertEqual(mid[2]!.id, 'b', 'later createdAt');
  assertEqual(mid[3]!.id, 'd', 'higher sortOrder last for year');
  assertEqual(nodes[0]!.kind, 'goal', 'goal first');
  assertEqual(nodes[nodes.length - 1]!.kind, 'outcome', 'outcome last');
  assert(
    mid.every((n) => n.year === 2028 || n.year === 2030),
    'only entered years — no auto-generated gap years'
  );
}

function testNodeTypeMapping() {
  assertEqual(
    mapMilestoneTypeToNodeKind('INITIAL_INVESTMENT'),
    'initial_investment',
    'initial'
  );
  assertEqual(
    mapMilestoneTypeToNodeKind('INCOME_CHECKPOINT'),
    'income_checkpoint',
    'income'
  );
  assertEqual(
    mapMilestoneTypeToNodeKind('MATURITY_SCENARIO'),
    'maturity_scenario',
    'maturity'
  );
  assertEqual(
    mapMilestoneTypeToNodeKind('EXIT_SCENARIO'),
    'exit_scenario',
    'exit'
  );
  assertEqual(mapMilestoneTypeToNodeKind('CUSTOM'), 'custom_review', 'custom');
  assertEqual(
    mapMilestoneTypeToNodeKind('UNKNOWN'),
    'custom_review',
    'unknown → custom'
  );

  const nodes = buildClientStrategyMapNodes({
    milestones: [
      milestone({
        id: '1',
        year: 2026,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.INITIAL_INVESTMENT,
      }),
      milestone({
        id: '2',
        year: 2027,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
      }),
      milestone({
        id: '3',
        year: 2028,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.MATURITY_SCENARIO,
      }),
      milestone({
        id: '4',
        year: 2029,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.EXIT_SCENARIO,
      }),
      milestone({
        id: '5',
        year: 2030,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.CUSTOM,
      }),
    ],
  });

  const kinds = nodes
    .filter((n) => n.kind !== 'goal' && n.kind !== 'outcome')
    .map((n) => n.kind);
  assertEqual(
    kinds.join(','),
    [
      'initial_investment',
      'income_checkpoint',
      'maturity_scenario',
      'exit_scenario',
      'custom_review',
    ].join(','),
    'kinds mapped'
  );
}

function testPrimaryMetricSelection() {
  const initial = getPrimaryMetricForMilestone(
    milestone({
      id: 'i',
      year: 2026,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.INITIAL_INVESTMENT,
      capitalInvested: 100000,
      capitalRemaining: 90000,
    })
  );
  assertEqual(initial?.label ?? null, 'Capital invested', 'initial prefers invested');
  assertEqual(initial?.value ?? null, 100000, 'initial value');

  const income = getPrimaryMetricForMilestone(
    milestone({
      id: 'inc',
      year: 2027,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
      monthlyIncome: 2500,
      cumulativeIncome: 30000,
    })
  );
  assertEqual(income?.label ?? null, 'Monthly income', 'income prefers monthly when no yearly');
  assertEqual(income?.value ?? null, 2500, 'income value');

  const incomeYearly = getPrimaryMetricForMilestone(
    milestone({
      id: 'inc-year',
      year: 2027,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
      incomeThisPeriod: 28000,
      monthlyIncome: 2500,
    })
  );
  assertEqual(
    incomeYearly?.label ?? null,
    'Income this year',
    'income prefers this-year when present'
  );

  const incomeFallback = getPrimaryMetricForMilestone(
    milestone({
      id: 'inc2',
      year: 2027,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
      cumulativeIncome: 30000,
    })
  );
  assertEqual(
    incomeFallback?.label ?? null,
    'Cumulative income',
    'income falls back to cumulative'
  );

  const exit = getPrimaryMetricForMilestone(
    milestone({
      id: 'e',
      year: 2035,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.EXIT_SCENARIO,
      totalAssetPosition: 500000,
      capitalRemaining: 400000,
    })
  );
  assertEqual(
    exit?.label ?? null,
    'Illustrative total position',
    'exit prefers illustrative TAP'
  );

  const maturityFallback = getPrimaryMetricForMilestone(
    milestone({
      id: 'm',
      year: 2034,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.MATURITY_SCENARIO,
      capitalRemaining: 350000,
    })
  );
  assertEqual(
    maturityFallback?.label ?? null,
    'Capital remaining',
    'maturity falls back to capital remaining'
  );

  const missing = getPrimaryMetricForMilestone(
    milestone({
      id: 'x',
      year: 2030,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.CUSTOM,
    })
  );
  assert(missing === null, 'missing stays null');
}

function testMissingValuesRemainNull() {
  const nodes = buildClientStrategyMapNodes({
    milestones: [
      milestone({
        id: 'sparse',
        year: 2030,
        sortOrder: 0,
        title: 'Sparse',
        type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
      }),
    ],
  });
  const mid = nodes.find((n) => n.id === 'sparse')!;
  assertEqual(mid.primaryMetricValue, null, 'primary null');
  assertEqual(mid.primaryMetricLabel, null, 'primary label null');
  assertEqual(mid.secondaryMetricValue, null, 'secondary null');
  assertEqual(mid.spendingThisYear, null, 'spending null');
  assertEqual(mid.earningThisYear, null, 'earning null');
  assertEqual(mid.netThisYear, null, 'net null');
  assertEqual(mid.cumulativeIncome, null, 'cum income null');
  assertEqual(mid.cumulativeExpenses, null, 'cum expenses null');
  assertEqual(mid.capitalReturned, null, 'capital returned null');
  assertEqual(mid.illustrativeTotalPosition, null, 'TAP null');
  assertEqual(mid.year, 2030, 'year preserved');

  const summary = buildClientStrategyReportSummary(
    {
      milestones: [
        milestone({
          id: 'sparse',
          year: 2030,
          sortOrder: 0,
          type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
        }),
      ],
    },
    { referenceYear: 2026 }
  );
  assertEqual(summary.initialCapital, null, 'summary capital null');
  assertEqual(summary.totalPlannedInvestment, null, 'investment null');
  assertEqual(summary.incomeThisYear, null, 'income this year null');
  assertEqual(summary.targetMonthlyIncome, null, 'summary income null');
  assertEqual(summary.projectedCumulativeIncome, null, 'summary cum null');
  assertEqual(summary.totalPlannedExpenses, null, 'expenses null');
  assertEqual(summary.capitalExpectedBack, null, 'capital back null');
  assertEqual(summary.projectedAssetPosition, null, 'summary TAP null');
  assertEqual(summary.timelineStartYear, 2030, 'start year from data');
  assertEqual(summary.timelineEndYear, 2030, 'end year from data');
}

function testNoAutoYearGeneration() {
  const nodes = buildClientStrategyMapNodes({
    milestones: [
      milestone({ id: 'y1', year: 2026, sortOrder: 0, title: 'Start' }),
      milestone({ id: 'y2', year: 2030, sortOrder: 0, title: 'Later' }),
    ],
  });
  const years = nodes
    .filter((n) => n.year !== null)
    .map((n) => n.year as number);
  assertEqual(years.join(','), '2026,2030', 'no interstitial years');
  assertEqual(nodes.length, 4, 'goal + 2 milestones + outcome');
}

function testBenefitTextAvoidsGuaranteeLanguage() {
  const types = [
    'INITIAL_INVESTMENT',
    'INCOME_CHECKPOINT',
    'MATURITY_SCENARIO',
    'EXIT_SCENARIO',
    'CUSTOM',
  ] as const;

  const texts = types.map((type) => getClientBenefitForMilestoneType(type));
  assert(
    !benefitsContainGuaranteeLanguage(texts),
    'benefit copy must avoid guarantee language'
  );

  for (const text of texts) {
    assert(text.length > 0, 'benefit text non-empty');
    const lower = text.toLowerCase();
    assert(
      lower.includes('illustrat') ||
        lower.includes('planned') ||
        lower.includes('potential') ||
        lower.includes('helps show') ||
        lower.includes('supports review') ||
        lower.includes('advisor-guided'),
      `expected compliance framing: ${text}`
    );
  }

  // Sanity: detector catches bad phrases
  assert(
    benefitsContainGuaranteeLanguage(['This will earn a certain return']),
    'detector should flag bad copy'
  );
}

function testPerksBasedOnDataPresence() {
  const empty = buildClientStrategyPerks({ milestones: [], steps: [] });
  assertEqual(empty.length, 0, 'no perks when empty');

  const withMilestonesOnly = buildClientStrategyPerks({
    milestones: [
      milestone({
        id: '1',
        year: 2026,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.CUSTOM,
      }),
    ],
    steps: [],
  });
  const idsOnly = withMilestonesOnly.map((p) => p.id);
  assert(idsOnly.includes('milestone-roadmap'), 'roadmap perk');
  assert(idsOnly.includes('manual-assumptions'), 'manual assumptions perk');
  assert(!idsOnly.includes('income-visibility'), 'no income perk');
  assert(!idsOnly.includes('advisor-guided-steps'), 'no steps perk');
  assert(!idsOnly.includes('expense-visibility'), 'no expense perk');

  const rich = buildClientStrategyPerks({
    milestones: [
      milestone({
        id: '1',
        year: 2026,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.INITIAL_INVESTMENT,
        capitalInvested: 100000,
      }),
      milestone({
        id: '2',
        year: 2028,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
        monthlyIncome: 2000,
        expensesThisYear: 12000,
      }),
      milestone({
        id: '3',
        year: 2035,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.EXIT_SCENARIO,
        totalAssetPosition: 400000,
        stepId: 'step-1',
        step: {
          id: 'step-1',
          title: 'Exit review step',
          stepType: 'MANUAL',
          sortOrder: 0,
        },
      }),
    ],
    steps: [{ id: 'step-1', title: 'Exit review step' }],
    expenses: [{ id: 'exp-1', title: 'Premium', amount: 1000, frequency: 'YEARLY', startYear: 2026, endYear: 2030 }],
  });
  const richIds = rich.map((p) => p.id);
  assert(richIds.includes('income-visibility'), 'income perk');
  assert(richIds.includes('expense-visibility'), 'expense perk');
  assert(richIds.includes('capital-position'), 'capital perk');
  assert(richIds.includes('advisor-guided-steps'), 'steps perk');
  assert(richIds.includes('exit-maturity-planning'), 'exit/maturity perk');
  assert(richIds.includes('manual-assumptions'), 'manual perk');
  assert(
    rich.some((p) =>
      p.description.toLowerCase().includes('illustrative')
    ),
    'manual perk keeps illustrative language'
  );
}

function testSummaryUsesPersistedJourneyLogic() {
  const milestones = [
    milestone({
      id: 'init',
      year: 2026,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.INITIAL_INVESTMENT,
      capitalInvested: 150000,
      title: 'Start',
    }),
    milestone({
      id: 'late',
      year: 2032,
      sortOrder: 0,
      type: StrategyProjectionMilestoneType.EXIT_SCENARIO,
      monthlyIncome: 3000,
      cumulativeIncome: 90000,
      totalAssetPosition: 420000,
      capitalReturnedToDate: 150000,
      title: 'Exit check',
    }),
  ];

  const summary = buildClientStrategyReportSummary(
    {
      title: 'Plan A',
      clientGoal: 'Goal text',
      expectedOutcome: 'Outcome text',
      milestones,
      steps: [
        {
          id: 's1',
          title: 'Step',
          investmentAmount: 80000,
          capitalReturned: 40000,
        },
        {
          id: 's2',
          title: 'Step 2',
          plannedAmount: 20000,
        },
      ],
      expenses: [
        {
          id: 'e1',
          title: 'Premium',
          amount: 1200,
          frequency: 'YEARLY',
          startYear: 2026,
          endYear: 2027,
        },
      ],
    },
    { referenceYear: 2026 }
  );

  assertEqual(summary.initialCapital, 150000, 'initial from INITIAL_INVESTMENT');
  assertEqual(summary.totalPlannedInvestment, 100000, 'sum investment amounts');
  assertEqual(summary.targetMonthlyIncome, 3000, 'monthly from latest');
  assertEqual(summary.projectedCumulativeIncome, 90000, 'cumulative latest');
  assertEqual(summary.projectedAssetPosition, 420000, 'TAP latest');
  assertEqual(summary.capitalExpectedBack, 150000, 'capital from milestone');
  assertEqual(summary.totalPlannedExpenses, 2400, 'expense total over years');
  assertEqual(summary.timelineStartYear, 2026, 'start year');
  assertEqual(summary.timelineEndYear, 2032, 'end year');
  assertEqual(summary.milestoneCount, 2, 'count');
  assertEqual(summary.stepCount, 2, 'steps');
  assertEqual(summary.expenseCount, 1, 'expenses');
  assertEqual(summary.firstMilestoneTitle, 'Start', 'first title');
  assertEqual(summary.nextMilestoneTitle, 'Start', 'next mirrors first');
}

function testSummaryIncludesIncomeThisYearAndEconomics() {
  const summary = buildClientStrategyReportSummary(
    {
      milestones: [
        milestone({
          id: 'y2026',
          year: 2026,
          sortOrder: 0,
          incomeThisPeriod: 24000,
          expensesThisYear: 6000,
          netCashflowThisYear: 18000,
        }),
        milestone({
          id: 'y2030',
          year: 2030,
          sortOrder: 0,
          cumulativeIncome: 100000,
          cumulativeExpenses: 30000,
          totalAssetPosition: 250000,
          capitalReturnedToDate: 50000,
        }),
      ],
      steps: [
        { id: 's1', title: 'Invest A', investmentAmount: 50000 },
      ],
      expenses: [
        {
          id: 'e1',
          title: 'Cost',
          amount: 1000,
          frequency: 'MONTHLY',
          startYear: 2026,
          endYear: 2026,
        },
      ],
    },
    { referenceYear: 2026 }
  );

  assertEqual(summary.incomeThisYear, 24000, 'income this year from matching milestone');
  assertEqual(summary.incomeThisYearSourceYear, 2026, 'source year');
  assertEqual(summary.totalPlannedInvestment, 50000, 'planned investment');
  assertEqual(summary.projectedCumulativeIncome, 100000, 'projected income');
  assertEqual(summary.totalPlannedExpenses, 12000, 'monthly×12 for one year');
  assertEqual(summary.capitalExpectedBack, 50000, 'capital expected back');
  assertEqual(summary.projectedAssetPosition, 250000, 'illustrative position');
}

function testMilestoneNodesIncludeYearlyEconomics() {
  const nodes = buildClientStrategyMapNodes({
    milestones: [
      milestone({
        id: 'm1',
        year: 2028,
        sortOrder: 0,
        title: 'Checkpoint',
        incomeThisPeriod: 18000,
        expensesThisYear: 5000,
        netCashflowThisYear: 13000,
        cumulativeIncome: 54000,
        cumulativeExpenses: 15000,
        capitalReturnedThisYear: 0,
        capitalReturnedToDate: 25000,
        totalAssetPosition: 175000,
      }),
    ],
  });

  const mid = nodes.find((n) => n.id === 'm1')!;
  assertEqual(mid.year, 2028, 'year');
  assertEqual(mid.spendingThisYear, 5000, 'spending');
  assertEqual(mid.earningThisYear, 18000, 'earning');
  assertEqual(mid.netThisYear, 13000, 'net');
  assertEqual(mid.cumulativeIncome, 54000, 'cum income');
  assertEqual(mid.cumulativeExpenses, 15000, 'cum expenses');
  assertEqual(mid.capitalReturned, 25000, 'capital returned prefers to-date');
  assertEqual(mid.illustrativeTotalPosition, 175000, 'TAP');
}

function testLinkedStepChips() {
  const nodes = buildClientStrategyMapNodes({
    milestones: [
      milestone({
        id: 'm1',
        year: 2027,
        sortOrder: 0,
        stepId: 'step-9',
        step: {
          id: 'step-9',
          title: 'Linked step',
          stepType: 'MANUAL',
          sortOrder: 1,
        },
      }),
    ],
    steps: [{ id: 'step-9', title: 'Linked step' }],
  });
  const mid = nodes.find((n) => n.id === 'm1')!;
  assertEqual(mid.linkedStepChips.length, 1, 'one chip');
  assertEqual(mid.linkedStepChips[0]!.title, 'Linked step', 'chip title');
}

function testSelectedSourceChips() {
  const nodes = buildClientStrategyMapNodes({
    milestones: [
      milestone({
        id: 'm1',
        year: 2029,
        sortOrder: 0,
        selectedSteps: [
          {
            stepId: 'step-a',
            step: { id: 'step-a', title: 'Income deal' },
          },
          {
            stepId: 'step-b',
            step: { id: 'step-b', title: 'Growth deal' },
          },
        ],
        selectedExpenses: [
          {
            expenseId: 'exp-1',
            expense: { id: 'exp-1', title: 'Annual premium' },
          },
        ],
      }),
    ],
    steps: [
      { id: 'step-a', title: 'Income deal' },
      { id: 'step-b', title: 'Growth deal' },
    ],
    expenses: [{ id: 'exp-1', title: 'Annual premium', amount: 2000 }],
  });

  const mid = nodes.find((n) => n.id === 'm1')!;
  assertEqual(mid.linkedStepChips.length, 2, 'two strategy chips');
  assertEqual(mid.linkedStepChips[0]!.title, 'Income deal', 'first step chip');
  assertEqual(mid.linkedExpenseChips.length, 1, 'one expense chip');
  assertEqual(
    mid.linkedExpenseChips[0]!.title,
    'Annual premium',
    'expense chip title'
  );
}

function testOlderPlanDataStillWorks() {
  // Legacy-shaped milestones/steps without timeline economics fields.
  const summary = buildClientStrategyReportSummary({
    title: 'Legacy plan',
    milestones: [
      milestone({
        id: 'legacy',
        year: 2027,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
        monthlyIncome: 1500,
        cumulativeIncome: 18000,
        capitalRemaining: 90000,
      }),
    ],
    steps: [
      {
        id: 'legacy-step',
        title: 'Old step',
        plannedAmount: 50000,
        // no investmentAmount / incomeAmount / capitalReturned
      },
    ],
  });

  assertEqual(summary.totalPlannedInvestment, 50000, 'falls back to plannedAmount');
  assertEqual(summary.targetMonthlyIncome, 1500, 'legacy monthly still read');
  assertEqual(summary.projectedCumulativeIncome, 18000, 'legacy cumulative');
  assertEqual(summary.incomeThisYear, null, 'no matching calendar-year income');
  assertEqual(summary.totalPlannedExpenses, null, 'no expenses');
  assertEqual(summary.capitalExpectedBack, null, 'no capital returned fields');

  const nodes = buildClientStrategyMapNodes({
    milestones: [
      milestone({
        id: 'legacy',
        year: 2027,
        sortOrder: 0,
        type: StrategyProjectionMilestoneType.INCOME_CHECKPOINT,
        monthlyIncome: 1500,
      }),
    ],
    steps: [{ id: 'legacy-step', title: 'Old step' }],
  });
  const mid = nodes.find((n) => n.id === 'legacy')!;
  assertEqual(mid.earningThisYear, null, 'no incomeThisPeriod');
  assertEqual(mid.spendingThisYear, null, 'no expensesThisYear');
  assertEqual(mid.primaryMetricLabel, 'Monthly income', 'legacy primary still works');
  assertEqual(mid.primaryMetricValue, 1500, 'legacy primary value');
}

function main() {
  testEmptyMilestonesStillProduceGoalAndOutcome();
  testMilestoneSortOrder();
  testNodeTypeMapping();
  testPrimaryMetricSelection();
  testMissingValuesRemainNull();
  testNoAutoYearGeneration();
  testBenefitTextAvoidsGuaranteeLanguage();
  testPerksBasedOnDataPresence();
  testSummaryUsesPersistedJourneyLogic();
  testSummaryIncludesIncomeThisYearAndEconomics();
  testMilestoneNodesIncludeYearlyEconomics();
  testLinkedStepChips();
  testSelectedSourceChips();
  testOlderPlanDataStillWorks();
  console.log('PASS: client strategy report helpers');
}

main();
