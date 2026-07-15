/**
 * Unit tests for deal participant commission calculations and validation.
 *
 * Run: npm run test:deal-participants
 */
import { DealParticipantRole, DealStatus, DealType } from '@prisma/client';
import { COMPANY_OVERHEAD_RATE } from '../lib/constants';
import {
  formatDealResponse,
  resolveDealCommissionModel,
} from '../lib/dealCalculations';
import {
  calculateCompanyEarningsFromDealParticipants,
  calculateDealParticipantEarnings,
  calculateUserSecuredCommissionFromDealParticipants,
  type DealParticipantCalculationDeal,
  type DealParticipantCalculationInput,
} from '../lib/dealParticipantCalculations';
import {
  normalizeDealParticipantsInput,
  validateDealParticipants,
} from '../lib/dealParticipants';

const TOTAL_COMMISSION = 10000;

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual: number, expected: number, message: string) {
  if (Math.abs(actual - expected) > 0.01) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function participant(
  id: string,
  role: DealParticipantRole,
  commissionPercent: number,
  overrides: Partial<DealParticipantCalculationInput> = {}
): DealParticipantCalculationInput {
  return {
    id,
    role,
    commissionPercent,
    isCommissionable: true,
    ...overrides,
  };
}

function wonDeal(
  participants: DealParticipantCalculationInput[],
  overrides: Partial<DealParticipantCalculationDeal> = {}
): DealParticipantCalculationDeal {
  return {
    id: overrides.id ?? 'deal-1',
    totalCommission: TOTAL_COMMISSION,
    status: DealStatus.WON,
    participants,
    ...overrides,
  };
}

function testMarketingDealAmounts() {
  const deal = wonDeal([
    participant('p-company', DealParticipantRole.COMPANY, 15, {
      externalName: 'Profit Pulse Ally',
    }),
    participant('p-relationship', DealParticipantRole.RELATIONSHIP, 5, {
      userId: 'user-relationship',
    }),
    participant('p-external', DealParticipantRole.EXTERNAL_PARTNER, 80, {
      externalName: 'Marketing Partner',
    }),
    participant('p-follow-up', DealParticipantRole.FOLLOW_UP, 0, {
      userId: 'user-follow-up',
    }),
  ]);

  const earnings = calculateDealParticipantEarnings(deal);
  const amountByRole = (role: DealParticipantRole) =>
    earnings.find((entry) => entry.role === role)?.commissionAmount ?? -1;

  assertEqual(amountByRole(DealParticipantRole.COMPANY), 1500, 'Marketing COMPANY');
  assertEqual(
    amountByRole(DealParticipantRole.RELATIONSHIP),
    500,
    'Marketing RELATIONSHIP'
  );
  assertEqual(
    amountByRole(DealParticipantRole.EXTERNAL_PARTNER),
    8000,
    'Marketing EXTERNAL_PARTNER'
  );
  assertEqual(amountByRole(DealParticipantRole.FOLLOW_UP), 0, 'Marketing FOLLOW_UP');

  console.log('PASS Marketing deal participant amounts');
}

function testInvestmentDealAmounts() {
  const deal = wonDeal([
    participant('p-relationship', DealParticipantRole.RELATIONSHIP, 10, {
      userId: 'user-relationship',
    }),
    participant('p-follow-up', DealParticipantRole.FOLLOW_UP, 10, {
      userId: 'user-follow-up',
    }),
    participant('p-company', DealParticipantRole.COMPANY, 20, {
      externalName: 'Profit Pulse Ally',
    }),
    participant('p-doctor-a', DealParticipantRole.DOCTOR, 30, {
      userId: 'doctor-a',
    }),
    participant('p-doctor-b', DealParticipantRole.DOCTOR, 30, {
      userId: 'doctor-b',
    }),
  ]);

  const earnings = calculateDealParticipantEarnings(deal);
  const amountFor = (participantId: string) =>
    earnings.find((entry) => entry.participantId === participantId)
      ?.commissionAmount ?? -1;

  assertEqual(
    amountFor('p-relationship'),
    1000,
    'Investment RELATIONSHIP'
  );
  assertEqual(amountFor('p-follow-up'), 1000, 'Investment FOLLOW_UP');
  assertEqual(amountFor('p-company'), 2000, 'Investment COMPANY');
  assertEqual(amountFor('p-doctor-a'), 3000, 'Investment DOCTOR A');
  assertEqual(amountFor('p-doctor-b'), 3000, 'Investment DOCTOR B');

  console.log('PASS Investment deal participant amounts');
}

function testMedicalDealAmounts() {
  const deal = wonDeal([
    participant('p-relationship', DealParticipantRole.RELATIONSHIP, 10, {
      userId: 'user-relationship',
    }),
    participant('p-follow-up', DealParticipantRole.FOLLOW_UP, 10, {
      userId: 'user-follow-up',
    }),
    participant('p-company', DealParticipantRole.COMPANY, 20, {
      externalName: 'Profit Pulse Ally',
    }),
    participant('p-doctor-c', DealParticipantRole.DOCTOR, 60, {
      userId: 'doctor-c',
    }),
  ]);

  const earnings = calculateDealParticipantEarnings(deal);
  const amountFor = (participantId: string) =>
    earnings.find((entry) => entry.participantId === participantId)
      ?.commissionAmount ?? -1;

  assertEqual(amountFor('p-relationship'), 1000, 'Medical RELATIONSHIP');
  assertEqual(amountFor('p-follow-up'), 1000, 'Medical FOLLOW_UP');
  assertEqual(amountFor('p-company'), 2000, 'Medical COMPANY');
  assertEqual(amountFor('p-doctor-c'), 6000, 'Medical DOCTOR C');

  console.log('PASS Medical deal participant amounts');
}

function testUserSecuredCommissionSumsOnlyUserRowsOnWonDeals() {
  const deals: DealParticipantCalculationDeal[] = [
    wonDeal(
      [
        participant('p-1', DealParticipantRole.DOCTOR, 30, {
          userId: 'user-a',
        }),
        participant('p-2', DealParticipantRole.RELATIONSHIP, 5, {
          userId: 'user-a',
        }),
        participant('p-3', DealParticipantRole.DOCTOR, 30, {
          userId: 'user-b',
        }),
      ],
      { id: 'deal-won-1' }
    ),
    {
      id: 'deal-proposed-1',
      totalCommission: TOTAL_COMMISSION,
      status: DealStatus.PROPOSED,
      participants: [
        participant('p-4', DealParticipantRole.DOCTOR, 60, {
          userId: 'user-a',
        }),
      ],
    },
    wonDeal(
      [
        participant('p-5', DealParticipantRole.FOLLOW_UP, 10, {
          userId: 'user-a',
        }),
        participant('p-6', DealParticipantRole.COMPANY, 20, {
          externalName: 'Profit Pulse Ally',
        }),
      ],
      { id: 'deal-won-2' }
    ),
  ];

  const securedForA = calculateUserSecuredCommissionFromDealParticipants(
    'user-a',
    deals
  );
  const securedForB = calculateUserSecuredCommissionFromDealParticipants(
    'user-b',
    deals
  );

  // user-a: 3000 (doctor) + 500 (relationship) + 1000 (follow-up) = 4500
  assertEqual(
    securedForA,
    4500,
    'User secured commission sums only user rows on WON deals'
  );
  assertEqual(securedForB, 3000, 'Other users are not included');

  console.log('PASS User secured commission (WON deals, own rows only)');
}

function testCompanyEarningsSumsCompanyRowsNotHardcodedTwentyPercent() {
  const marketingDeal = wonDeal(
    [
      participant('p-company', DealParticipantRole.COMPANY, 15, {
        externalName: 'Profit Pulse Ally',
      }),
      participant('p-relationship', DealParticipantRole.RELATIONSHIP, 5, {
        userId: 'user-relationship',
      }),
      participant('p-external', DealParticipantRole.EXTERNAL_PARTNER, 80, {
        externalName: 'Marketing Partner',
      }),
    ],
    { id: 'deal-marketing' }
  );

  const companyEarnings = calculateCompanyEarningsFromDealParticipants([
    marketingDeal,
  ]);
  const hardcodedTwentyPercent = TOTAL_COMMISSION * COMPANY_OVERHEAD_RATE;

  assertEqual(
    companyEarnings,
    1500,
    'Company earnings uses COMPANY participant row (15%)'
  );
  assert(
    companyEarnings !== hardcodedTwentyPercent,
    'Company earnings must not use hardcoded 20% when participant rows exist'
  );

  const legacyDeal: DealParticipantCalculationDeal = {
    id: 'deal-legacy',
    totalCommission: TOTAL_COMMISSION,
    status: DealStatus.WON,
    participants: [],
  };
  const legacyCompanyEarnings = calculateCompanyEarningsFromDealParticipants([
    legacyDeal,
  ]);
  assertEqual(
    legacyCompanyEarnings,
    hardcodedTwentyPercent,
    'Legacy deals without participants still use overhead fallback'
  );

  console.log('PASS Company earnings sums COMPANY rows');
}

function testPercentValidationRejectsWonDealsNotTotalingOneHundred() {
  const incompleteParticipants = normalizeDealParticipantsInput(
    [
      {
        role: DealParticipantRole.COMPANY,
        commissionPercent: 20,
        externalName: 'Profit Pulse Ally',
      },
      {
        role: DealParticipantRole.RELATIONSHIP,
        commissionPercent: 10,
        userId: 'user-relationship',
      },
    ],
    { totalCommission: TOTAL_COMMISSION }
  );

  const wonValidation = validateDealParticipants(incompleteParticipants, {
    dealStatus: DealStatus.WON,
  });
  assert(
    !wonValidation.ok,
    'WON deals with total not equal to 100% must fail validation'
  );
  assert(
    wonValidation.errors.some((error) => error.includes('100')),
    'Validation error should mention 100% total'
  );

  const proposedValidation = validateDealParticipants(incompleteParticipants, {
    dealStatus: DealStatus.PROPOSED,
    allowIncomplete: true,
  });
  assert(
    proposedValidation.ok,
    `PROPOSED deals may allow incomplete totals: ${proposedValidation.errors.join(', ')}`
  );

  const validParticipants = normalizeDealParticipantsInput(
    [
      {
        role: DealParticipantRole.COMPANY,
        commissionPercent: 15,
        externalName: 'Profit Pulse Ally',
      },
      {
        role: DealParticipantRole.RELATIONSHIP,
        commissionPercent: 5,
        userId: 'user-relationship',
      },
      {
        role: DealParticipantRole.EXTERNAL_PARTNER,
        commissionPercent: 80,
        externalName: 'Marketing Partner',
      },
    ],
    { totalCommission: TOTAL_COMMISSION }
  );
  const validWonValidation = validateDealParticipants(validParticipants, {
    dealStatus: DealStatus.WON,
  });
  assert(
    validWonValidation.ok,
    `Valid 100% WON deal should pass: ${validWonValidation.errors.join(', ')}`
  );

  console.log('PASS Percent validation for WON deals');
}

function testDealResponseCommissionModelMetadata() {
  const now = new Date('2026-07-02T10:00:00.000Z');

  const legacy = formatDealResponse({
    id: 'deal-legacy',
    name: 'Legacy deal',
    dealValue: 10000,
    totalCommission: 2000,
    dealType: DealType.CUSTOM,
    status: DealStatus.PROPOSED,
    createdAt: now,
    updatedAt: now,
    participants: [],
  });

  assertEqual(
    resolveDealCommissionModel([]) === 'LEGACY_FALLBACK' ? 1 : 0,
    1,
    'Empty participants resolve to LEGACY_FALLBACK'
  );
  assert(
    legacy.commissionModel === 'LEGACY_FALLBACK',
    `expected LEGACY_FALLBACK, got ${legacy.commissionModel}`
  );
  assert(
    legacy.usesLegacyCommissionFallback === true,
    'usesLegacyCommissionFallback should be true for empty participants'
  );

  const participantBacked = formatDealResponse({
    id: 'deal-participant',
    name: 'Participant deal',
    dealValue: 10000,
    totalCommission: 2000,
    dealType: DealType.INVESTMENT,
    status: DealStatus.WON,
    createdAt: now,
    updatedAt: now,
    participants: [
      {
        id: 'p1',
        dealId: 'deal-participant',
        userId: null,
        externalName: 'Profit Pulse Ally',
        role: DealParticipantRole.COMPANY,
        commissionPercent: 20,
        commissionAmount: 400,
        isCommissionable: true,
        notes: null,
        returnablePercent: null,
        returnableAmount: null,
        isReturnableRequired: false,
      },
    ],
  });

  assert(
    participantBacked.commissionModel === 'PARTICIPANT',
    `expected PARTICIPANT, got ${participantBacked.commissionModel}`
  );
  assert(
    participantBacked.usesLegacyCommissionFallback === false,
    'usesLegacyCommissionFallback should be false when participants exist'
  );

  console.log('PASS Deal response commission model metadata');
}

function runTests() {
  console.log('Running deal participant calculation tests...\n');

  testMarketingDealAmounts();
  testInvestmentDealAmounts();
  testMedicalDealAmounts();
  testUserSecuredCommissionSumsOnlyUserRowsOnWonDeals();
  testCompanyEarningsSumsCompanyRowsNotHardcodedTwentyPercent();
  testPercentValidationRejectsWonDealsNotTotalingOneHundred();
  testDealResponseCommissionModelMetadata();

  console.log('\nAll deal participant calculation tests passed.');
}

runTests();
