/**
 * Unit tests for explicit doctor returnable calculations and validation.
 *
 * Run: npm run test:deal-returnables
 */
import { DealParticipantRole, DealStatus } from '@prisma/client';
import {
  calculateParticipantCommissionAmount,
  calculateParticipantReturnableAmount,
} from '../lib/dealParticipantCalculations';
import {
  normalizeDealParticipantsInput,
  validateDealParticipants,
  validateDealParticipantsForStatus,
  validateParticipantReturnableFields,
  type NormalizedDealParticipant,
} from '../lib/dealParticipants';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function doctorParticipant(
  overrides: Partial<NormalizedDealParticipant> = {}
): NormalizedDealParticipant {
  return {
    userId: 'doctor-1',
    externalName: null,
    role: DealParticipantRole.DOCTOR,
    commissionPercent: 30,
    commissionAmount: 3000,
    isCommissionable: true,
    notes: null,
    returnablePercent: null,
    returnableAmount: null,
    isReturnableRequired: false,
    ...overrides,
  };
}

function companyParticipant(
  overrides: Partial<NormalizedDealParticipant> = {}
): NormalizedDealParticipant {
  return {
    userId: null,
    externalName: 'Profit Pulse Ally',
    role: DealParticipantRole.COMPANY,
    commissionPercent: 20,
    commissionAmount: 2000,
    isCommissionable: true,
    notes: null,
    returnablePercent: null,
    returnableAmount: null,
    isReturnableRequired: false,
    ...overrides,
  };
}

function runTests() {
  console.log('Running deal returnable tests...\n');

  const commission = calculateParticipantCommissionAmount(10000, {
    commissionPercent: 30,
    commissionAmount: 3000,
    isCommissionable: true,
  });
  assertEqual(commission, 3000, 'Doctor commission amount');

  const percentReturnable = calculateParticipantReturnableAmount(10000, {
    role: DealParticipantRole.DOCTOR,
    userId: 'doctor-1',
    commissionPercent: 30,
    commissionAmount: 3000,
    isCommissionable: true,
    isReturnableRequired: true,
    returnablePercent: 20,
    returnableAmount: null,
  });
  assertEqual(percentReturnable, 600, 'Case 1: 20% of 3000');

  const fixedReturnable = calculateParticipantReturnableAmount(10000, {
    role: DealParticipantRole.DOCTOR,
    userId: 'doctor-1',
    commissionPercent: 30,
    commissionAmount: 3000,
    isCommissionable: true,
    isReturnableRequired: true,
    returnablePercent: 20,
    returnableAmount: 500,
  });
  assertEqual(fixedReturnable, 500, 'Case 2/3: fixed amount overrides percent');

  const notRequired = calculateParticipantReturnableAmount(10000, {
    role: DealParticipantRole.DOCTOR,
    userId: 'doctor-1',
    commissionPercent: 30,
    commissionAmount: 3000,
    isCommissionable: true,
    isReturnableRequired: false,
    returnablePercent: 20,
    returnableAmount: 500,
  });
  assertEqual(notRequired, null, 'Case 4: not required returns null');

  const nonDoctorErrors = validateParticipantReturnableFields(
    doctorParticipant({
      role: DealParticipantRole.RELATIONSHIP,
      isReturnableRequired: true,
      returnablePercent: 10,
    }),
    0
  );
  assert(nonDoctorErrors.length > 0, 'Case 5: non-doctor validation error');

  const missingUserErrors = validateParticipantReturnableFields(
    doctorParticipant({
      userId: null,
      isReturnableRequired: true,
      returnablePercent: 10,
    }),
    0
  );
  assert(missingUserErrors.length > 0, 'Case 6: missing userId validation error');

  const missingFieldsErrors = validateParticipantReturnableFields(
    doctorParticipant({
      isReturnableRequired: true,
      returnablePercent: null,
      returnableAmount: null,
    }),
    0
  );
  assert(missingFieldsErrors.length > 0, 'Case 7: missing amount/percent validation error');

  const backfilledDoctors = normalizeDealParticipantsInput(
    [
      {
        role: DealParticipantRole.DOCTOR,
        commissionPercent: 30,
        userId: 'doctor-1',
      },
    ],
    { totalCommission: 10000 }
  );
  assertEqual(backfilledDoctors[0].isReturnableRequired, false, 'Case 8: default not required');
  assertEqual(backfilledDoctors[0].returnablePercent, null, 'Case 8: default percent null');
  assertEqual(backfilledDoctors[0].returnableAmount, null, 'Case 8: default amount null');

  const wonValidation = validateDealParticipants(
    [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 6000,
        isReturnableRequired: true,
        returnablePercent: 20,
      }),
      companyParticipant({
        commissionPercent: 40,
        commissionAmount: 4000,
      }),
    ],
    { dealStatus: DealStatus.WON, totalCommission: 10000 }
  );
  assert(
    wonValidation.ok,
    `WON doctor with valid returnable passes validation: ${wonValidation.errors.join(', ')}`
  );

  const overallocated = validateDealParticipantsForStatus({
    status: DealStatus.WON,
    totalCommission: 10000,
    participants: [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 7000,
        isReturnableRequired: true,
        returnablePercent: 10,
      }),
      companyParticipant({
        commissionPercent: 40,
        commissionAmount: 4000,
      }),
    ],
  });
  assert(!overallocated.ok, 'WON with fixed amounts exceeding totalCommission is rejected');
  assert(
    overallocated.errors.some((error) => error.includes('exceeds')),
    `expected exceed error, got: ${overallocated.errors.join(' | ')}`
  );

  const underallocatedNoCompany = validateDealParticipantsForStatus({
    status: DealStatus.WON,
    totalCommission: 10000,
    participants: [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 5000,
        isReturnableRequired: true,
        returnablePercent: 10,
      }),
      doctorParticipant({
        userId: 'relationship-1',
        role: DealParticipantRole.RELATIONSHIP,
        commissionPercent: 40,
        commissionAmount: 3000,
        isReturnableRequired: false,
      }),
    ],
  });
  assert(
    underallocatedNoCompany.ok,
    `Underallocation without COMPANY is allowed with warning: ${underallocatedNoCompany.errors.join(', ')}`
  );
  assert(
    (underallocatedNoCompany.warnings ?? []).some((warning) =>
      warning.includes('Unallocated')
    ),
    'Underallocation without COMPANY should warn'
  );

  const missingReturnableOnWon = validateDealParticipantsForStatus({
    status: DealStatus.WON,
    totalCommission: 10000,
    participants: [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 6000,
        isReturnableRequired: true,
        returnablePercent: null,
        returnableAmount: null,
      }),
      companyParticipant({
        commissionPercent: 40,
        commissionAmount: 4000,
      }),
    ],
  });
  assert(
    !missingReturnableOnWon.ok,
    'WON doctor returnable required without amount/percent is rejected'
  );

  const returnableExceedsCommission = validateDealParticipantsForStatus({
    status: DealStatus.WON,
    totalCommission: 10000,
    participants: [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 6000,
        isReturnableRequired: true,
        returnableAmount: 7000,
      }),
      companyParticipant({
        commissionPercent: 40,
        commissionAmount: 4000,
      }),
    ],
  });
  assert(
    !returnableExceedsCommission.ok,
    'returnableAmount greater than doctor commission is rejected'
  );

  const returnablePercentTooHigh = validateDealParticipantsForStatus({
    status: DealStatus.WON,
    totalCommission: 10000,
    participants: [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 6000,
        isReturnableRequired: true,
        returnablePercent: 150,
      }),
      companyParticipant({
        commissionPercent: 40,
        commissionAmount: 4000,
      }),
    ],
  });
  assert(!returnablePercentTooHigh.ok, 'returnablePercent > 100 is rejected');

  const validFixedReturnable = validateDealParticipantsForStatus({
    status: DealStatus.WON,
    totalCommission: 10000,
    participants: [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 6000,
        isReturnableRequired: true,
        returnableAmount: 500,
      }),
      companyParticipant({
        commissionPercent: 40,
        commissionAmount: 4000,
      }),
    ],
  });
  assert(validFixedReturnable.ok, 'valid doctor fixed returnable passes');

  const validPercentReturnable = validateDealParticipantsForStatus({
    status: DealStatus.WON,
    totalCommission: 10000,
    participants: [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 6000,
        isReturnableRequired: true,
        returnablePercent: 25,
      }),
      companyParticipant({
        commissionPercent: 40,
        commissionAmount: 4000,
      }),
    ],
  });
  assert(validPercentReturnable.ok, 'valid doctor percent returnable passes');

  const nonCommissionableReturnable = validateDealParticipantsForStatus({
    status: DealStatus.WON,
    totalCommission: 10000,
    participants: [
      doctorParticipant({
        commissionPercent: 60,
        commissionAmount: 6000,
        isCommissionable: false,
        isReturnableRequired: true,
        returnablePercent: 20,
      }),
      companyParticipant({
        commissionPercent: 40,
        commissionAmount: 4000,
      }),
    ],
  });
  assert(
    !nonCommissionableReturnable.ok,
    'returnable required on non-commissionable doctor is rejected'
  );

  console.log('All deal returnable tests passed.');
}

runTests();
