import {
  DealParticipantRole,
  DealStatus,
  DealType,
} from '@prisma/client';
import {
  calculateParticipantAmount,
  getDealCommissionTemplate,
  sumParticipantPercents,
  validateParticipantPercents,
} from '@/lib/dealCommissionTemplates';
import {
  calculateParticipantCommissionAmount,
  roundMoney,
} from '@/lib/dealParticipantCalculations';

export const COMPANY_EXTERNAL_NAME = 'Profit Pulse Ally';
const DEFAULT_EXTERNAL_PARTNER_NAME = 'External Partner';
const MONEY_TOLERANCE = 0.01;

export type DealParticipantInput = {
  userId?: string | null;
  externalName?: string | null;
  role: DealParticipantRole;
  commissionPercent: number;
  commissionAmount?: number | null;
  isCommissionable?: boolean;
  notes?: string | null;
  returnablePercent?: number | null;
  returnableAmount?: number | null;
  isReturnableRequired?: boolean;
};

export type NormalizedDealParticipant = {
  userId: string | null;
  externalName: string | null;
  role: DealParticipantRole;
  commissionPercent: number;
  commissionAmount: number | null;
  isCommissionable: boolean;
  notes: string | null;
  returnablePercent: number | null;
  returnableAmount: number | null;
  isReturnableRequired: boolean;
};

export type NormalizeDealParticipantsContext = {
  totalCommission?: number;
};

export type ValidateDealParticipantsOptions = {
  allowIncomplete?: boolean;
  dealStatus?: DealStatus;
  /** When set, validates fixed commission amounts and returnable caps against the deal total. */
  totalCommission?: number;
};

export type ValidateDealParticipantsResult = {
  ok: boolean;
  errors: string[];
  warnings?: string[];
  effectiveCommissionTotal?: number;
  unallocatedCommission?: number;
  percentTotal?: number;
};

export type ValidateDealParticipantsForStatusInput = {
  status: DealStatus;
  totalCommission: number;
  participants: NormalizedDealParticipant[];
  allowIncomplete?: boolean;
};

export type ValidateDealParticipantsForStatusResult = {
  ok: boolean;
  errors: string[];
  warnings: string[];
  effectiveCommissionTotal: number;
  unallocatedCommission: number;
  percentTotal: number;
};

export type ClientAssignmentRef = {
  userId: string;
};

export type BuildDefaultParticipantsForDealInput = {
  dealType: DealType;
  totalCommission: number;
  currentRelationshipAssignment?: ClientAssignmentRef | null;
  currentFollowUpAssignment?: ClientAssignmentRef | null;
  selectedDoctors?: ClientAssignmentRef[];
  externalPartnerName?: string | null;
};

function normalizeOptionalString(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function parseOptionalMoney(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseOptionalPercent(value: unknown): number | null {
  return parseOptionalMoney(value);
}

function normalizeReturnableFields(
  participant: DealParticipantInput
): Pick<
  NormalizedDealParticipant,
  'returnablePercent' | 'returnableAmount' | 'isReturnableRequired'
> {
  const isReturnableRequired = participant.isReturnableRequired ?? false;

  if (participant.role !== DealParticipantRole.DOCTOR) {
    return {
      isReturnableRequired: false,
      returnablePercent: null,
      returnableAmount: null,
    };
  }

  if (!isReturnableRequired) {
    return {
      isReturnableRequired: false,
      returnablePercent: null,
      returnableAmount: null,
    };
  }

  const returnablePercent = parseOptionalPercent(participant.returnablePercent);
  const returnableAmount = parseOptionalMoney(participant.returnableAmount);

  return {
    isReturnableRequired: true,
    returnablePercent:
      returnablePercent !== null ? roundPercent(returnablePercent) : null,
    returnableAmount:
      returnableAmount !== null ? roundPercent(returnableAmount) : null,
  };
}

export function validateParticipantReturnableFields(
  participant: NormalizedDealParticipant,
  index: number,
  totalCommission?: number
): string[] {
  const errors: string[] = [];
  const prefix = `Participant ${index + 1}`;

  const hasReturnablePercent =
    participant.returnablePercent !== null &&
    participant.returnablePercent !== undefined;
  const hasReturnableAmount =
    participant.returnableAmount !== null &&
    participant.returnableAmount !== undefined;

  if (
    participant.role !== DealParticipantRole.DOCTOR &&
    (participant.isReturnableRequired ||
      hasReturnablePercent ||
      hasReturnableAmount)
  ) {
    errors.push(
      `${prefix}: returnable fields are only supported for DOCTOR participants.`
    );
    return errors;
  }

  if (hasReturnablePercent) {
    if (
      !Number.isFinite(participant.returnablePercent) ||
      participant.returnablePercent! < 0 ||
      participant.returnablePercent! > 100
    ) {
      errors.push(
        `${prefix}: returnablePercent must be a number between 0 and 100.`
      );
    }
  }

  if (hasReturnableAmount) {
    if (
      !Number.isFinite(participant.returnableAmount) ||
      participant.returnableAmount! < 0
    ) {
      errors.push(`${prefix}: returnableAmount must be a number >= 0.`);
    }
  }

  if (!participant.isReturnableRequired) {
    return errors;
  }

  if (participant.role !== DealParticipantRole.DOCTOR) {
    errors.push(
      `${prefix}: isReturnableRequired is only supported for DOCTOR participants.`
    );
  }

  if (!participant.userId) {
    errors.push(
      `${prefix}: userId is required when returnable is required for a doctor.`
    );
  }

  if (participant.isCommissionable === false) {
    errors.push(
      `${prefix}: doctor must be commissionable when returnable is required.`
    );
  }

  const hasPositivePercent =
    hasReturnablePercent && participant.returnablePercent! > 0;
  const hasPositiveAmount =
    hasReturnableAmount && participant.returnableAmount! > 0;

  if (!hasPositivePercent && !hasPositiveAmount) {
    errors.push(
      `${prefix}: returnableAmount or returnablePercent must be greater than 0 when returnable is required.`
    );
  }

  if (
    totalCommission !== undefined &&
    Number.isFinite(totalCommission) &&
    hasPositiveAmount
  ) {
    const doctorCommission = calculateParticipantCommissionAmount(
      totalCommission,
      participant
    );
    if (participant.returnableAmount! > doctorCommission + MONEY_TOLERANCE) {
      errors.push(
        `${prefix}: returnableAmount (${participant.returnableAmount}) cannot exceed the doctor's commission (${doctorCommission}).`
      );
    }
  }

  return errors;
}

function splitPoolPercentEvenly(poolPercent: number, count: number) {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, () =>
    roundPercent(poolPercent / count)
  );
}

function shouldRequireFullPercentTotal(
  dealStatus: DealStatus | undefined,
  allowIncomplete: boolean | undefined
) {
  if (dealStatus === DealStatus.LOST) {
    return false;
  }

  if (dealStatus === DealStatus.WON) {
    return true;
  }

  if (
    dealStatus === DealStatus.PROPOSED ||
    dealStatus === DealStatus.ON_HOLD
  ) {
    return !allowIncomplete;
  }

  return true;
}

function buildNormalizedParticipant({
  role,
  commissionPercent,
  totalCommission,
  userId = null,
  externalName = null,
  isCommissionable = true,
  notes = null,
}: {
  role: DealParticipantRole;
  commissionPercent: number;
  totalCommission: number;
  userId?: string | null;
  externalName?: string | null;
  isCommissionable?: boolean;
  notes?: string | null;
}): NormalizedDealParticipant {
  return normalizeDealParticipantsInput(
    [
      {
        role,
        commissionPercent,
        userId,
        externalName,
        isCommissionable,
        notes,
      },
    ],
    { totalCommission }
  )[0];
}

export function normalizeDealParticipantsInput(
  input: DealParticipantInput[],
  context: NormalizeDealParticipantsContext = {}
): NormalizedDealParticipant[] {
  return input.map((participant) => {
    const userId = normalizeOptionalString(participant.userId ?? null);
    let externalName = normalizeOptionalString(participant.externalName ?? null);
    const commissionPercent = roundPercent(Number(participant.commissionPercent));

    if (participant.role === DealParticipantRole.COMPANY && !userId && !externalName) {
      externalName = COMPANY_EXTERNAL_NAME;
    }

    if (participant.role === DealParticipantRole.DOCTOR && userId) {
      externalName = null;
    }

    let commissionAmount: number | null = null;
    if (
      participant.commissionAmount !== undefined &&
      participant.commissionAmount !== null
    ) {
      commissionAmount = Number(participant.commissionAmount);
    } else if (context.totalCommission !== undefined) {
      commissionAmount = calculateParticipantAmount(
        context.totalCommission,
        commissionPercent
      );
    }

    return {
      userId,
      externalName,
      role: participant.role,
      commissionPercent,
      commissionAmount,
      isCommissionable: participant.isCommissionable ?? true,
      notes: normalizeOptionalString(participant.notes ?? null),
      ...normalizeReturnableFields(participant),
    };
  });
}

export function validateDealParticipants(
  participants: NormalizedDealParticipant[],
  options: ValidateDealParticipantsOptions = {}
): ValidateDealParticipantsResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const totalCommission = options.totalCommission;
  const hasTotalCommission =
    totalCommission !== undefined && Number.isFinite(totalCommission);

  participants.forEach((participant, index) => {
    const prefix = `Participant ${index + 1}`;

    if (!participant.role) {
      errors.push(`${prefix}: role is required.`);
    }

    if (
      !Number.isFinite(participant.commissionPercent) ||
      participant.commissionPercent < 0 ||
      participant.commissionPercent > 100
    ) {
      errors.push(
        `${prefix}: commissionPercent must be a number between 0 and 100.`
      );
    }

    if (
      participant.commissionAmount !== null &&
      participant.commissionAmount !== undefined
    ) {
      if (
        !Number.isFinite(participant.commissionAmount) ||
        participant.commissionAmount < 0
      ) {
        errors.push(`${prefix}: commissionAmount must be a number >= 0.`);
      }
    }

    if (!participant.userId && !participant.externalName) {
      errors.push(
        `${prefix}: at least one of userId or externalName is required.`
      );
    }

    if (
      participant.role === DealParticipantRole.DOCTOR &&
      participant.userId &&
      participant.externalName
    ) {
      warnings.push(
        `${prefix}: doctor participant has both userId and externalName; userId is preferred.`
      );
    }

    errors.push(
      ...validateParticipantReturnableFields(
        participant,
        index,
        hasTotalCommission ? totalCommission : undefined
      )
    );
  });

  if (
    shouldRequireFullPercentTotal(options.dealStatus, options.allowIncomplete) &&
    participants.length > 0
  ) {
    const percentResult = validateParticipantPercents(participants);
    if (!percentResult.ok) {
      errors.push(
        percentResult.message ??
          'Participant commission percentages must total 100%.'
      );
    }
  } else if (
    participants.length > 0 &&
    (options.dealStatus === DealStatus.PROPOSED ||
      options.dealStatus === DealStatus.ON_HOLD)
  ) {
    const percentResult = validateParticipantPercents(participants);
    if (!percentResult.ok) {
      warnings.push(
        percentResult.message ??
          'Participant commission percentages do not total 100% yet.'
      );
    }
  }

  const percentTotal = sumParticipantPercents(participants);
  let effectiveCommissionTotal = 0;
  let unallocatedCommission = 0;

  if (hasTotalCommission) {
    effectiveCommissionTotal = roundMoney(
      participants.reduce(
        (sum, participant) =>
          sum +
          calculateParticipantCommissionAmount(totalCommission!, participant),
        0
      )
    );
    unallocatedCommission = roundMoney(
      totalCommission! - effectiveCommissionTotal
    );

    if (unallocatedCommission < -MONEY_TOLERANCE) {
      errors.push(
        `Participant commission amounts total ${effectiveCommissionTotal}, which exceeds deal totalCommission ${totalCommission}.`
      );
    } else if (unallocatedCommission > MONEY_TOLERANCE) {
      const hasCompanyParticipant = participants.some(
        (participant) => participant.role === DealParticipantRole.COMPANY
      );

      if (hasCompanyParticipant) {
        warnings.push(
          `Unallocated commission of ${unallocatedCommission} remains after participant amounts (deal total ${totalCommission}). COMPANY row is present as residual/share holder.`
        );
      } else {
        warnings.push(
          `Unallocated commission of ${unallocatedCommission} remains after participant amounts (deal total ${totalCommission}). Consider adding a COMPANY participant or adjusting amounts.`
        );
      }
    }

    if (
      options.dealStatus === DealStatus.PROPOSED ||
      options.dealStatus === DealStatus.ON_HOLD
    ) {
      participants.forEach((participant, index) => {
        if (
          participant.role !== DealParticipantRole.DOCTOR ||
          !participant.isReturnableRequired
        ) {
          return;
        }

        if (!participant.userId) {
          warnings.push(
            `Participant ${index + 1}: select a doctor user before marking the deal WON (returnable required).`
          );
        }

        const hasPositivePercent =
          participant.returnablePercent !== null &&
          participant.returnablePercent > 0;
        const hasPositiveAmount =
          participant.returnableAmount !== null &&
          participant.returnableAmount > 0;

        if (!hasPositivePercent && !hasPositiveAmount) {
          warnings.push(
            `Participant ${index + 1}: returnable % or fixed amount is incomplete before WON.`
          );
        }
      });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(hasTotalCommission
      ? { effectiveCommissionTotal, unallocatedCommission }
      : {}),
    percentTotal,
  };
}

/**
 * Central create/update validation for participant-backed deals.
 * Legacy deals with zero participants skip amount checks (caller should not invoke
 * when using assignment-pool fallback without an explicit participant payload).
 */
export function validateDealParticipantsForStatus({
  status,
  totalCommission,
  participants,
  allowIncomplete,
}: ValidateDealParticipantsForStatusInput): ValidateDealParticipantsForStatusResult {
  const allowIncompleteStatus =
    allowIncomplete ??
    (status === DealStatus.PROPOSED || status === DealStatus.ON_HOLD);

  const result = validateDealParticipants(participants, {
    dealStatus: status,
    allowIncomplete: allowIncompleteStatus,
    totalCommission,
  });

  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings ?? [],
    effectiveCommissionTotal: result.effectiveCommissionTotal ?? 0,
    unallocatedCommission: result.unallocatedCommission ?? 0,
    percentTotal: result.percentTotal ?? sumParticipantPercents(participants),
  };
}

export function buildDefaultParticipantsForDeal({
  dealType,
  totalCommission,
  currentRelationshipAssignment,
  currentFollowUpAssignment,
  selectedDoctors = [],
  externalPartnerName,
}: BuildDefaultParticipantsForDealInput): NormalizedDealParticipant[] {
  const template = getDealCommissionTemplate(dealType);
  const participants: NormalizedDealParticipant[] = [];

  const doctorPoolPercent = template
    .filter(
      (line) =>
        line.role === DealParticipantRole.DOCTOR && line.commissionPercent > 0
    )
    .reduce((sum, line) => sum + line.commissionPercent, 0);

  for (const line of template) {
    if (line.commissionPercent <= 0) {
      continue;
    }

    if (line.role === DealParticipantRole.DOCTOR) {
      continue;
    }

    switch (line.role) {
      case DealParticipantRole.COMPANY:
        participants.push(
          buildNormalizedParticipant({
            role: line.role,
            commissionPercent: line.commissionPercent,
            totalCommission,
            externalName: COMPANY_EXTERNAL_NAME,
          })
        );
        break;
      case DealParticipantRole.RELATIONSHIP:
        participants.push(
          buildNormalizedParticipant({
            role: line.role,
            commissionPercent: line.commissionPercent,
            totalCommission,
            userId: currentRelationshipAssignment?.userId ?? null,
          })
        );
        break;
      case DealParticipantRole.FOLLOW_UP:
        participants.push(
          buildNormalizedParticipant({
            role: line.role,
            commissionPercent: line.commissionPercent,
            totalCommission,
            userId: currentFollowUpAssignment?.userId ?? null,
          })
        );
        break;
      case DealParticipantRole.EXTERNAL_PARTNER:
        participants.push(
          buildNormalizedParticipant({
            role: line.role,
            commissionPercent: line.commissionPercent,
            totalCommission,
            externalName:
              normalizeOptionalString(externalPartnerName) ??
              DEFAULT_EXTERNAL_PARTNER_NAME,
          })
        );
        break;
      default:
        break;
    }
  }

  if (doctorPoolPercent > 0 && selectedDoctors.length > 0) {
    const doctorPercents = splitPoolPercentEvenly(
      doctorPoolPercent,
      selectedDoctors.length
    );

    selectedDoctors.forEach((doctor, index) => {
      participants.push(
        buildNormalizedParticipant({
          role: DealParticipantRole.DOCTOR,
          commissionPercent: doctorPercents[index],
          totalCommission,
          userId: doctor.userId,
        })
      );
    });
  }

  return participants;
}

export function parseDealType(
  value: unknown,
  defaultType?: DealType
): DealType | null {
  const dealType = (
    value !== undefined && value !== null ? value : defaultType
  ) as DealType;

  if (dealType === undefined || dealType === null) {
    return null;
  }

  if (!Object.values(DealType).includes(dealType)) {
    return null;
  }

  return dealType;
}

export function parseParticipantInputs(
  rawParticipants: unknown
): DealParticipantInput[] | { error: string } {
  if (!Array.isArray(rawParticipants)) {
    return { error: 'participants must be an array' };
  }

  const participants: DealParticipantInput[] = [];

  for (let index = 0; index < rawParticipants.length; index++) {
    const entry = rawParticipants[index];
    if (typeof entry !== 'object' || entry === null) {
      return { error: `Participant ${index + 1} must be an object` };
    }

    const role = entry.role;
    if (!role || !Object.values(DealParticipantRole).includes(role)) {
      return { error: `Participant ${index + 1}: invalid role` };
    }

    if (entry.commissionPercent === undefined || entry.commissionPercent === null) {
      return { error: `Participant ${index + 1}: commissionPercent is required` };
    }

    const rawReturnableRequired =
      entry.isReturnableRequired ?? entry.is_returnable_required ?? false;
    const rawReturnablePercent =
      entry.returnablePercent ?? entry.returnable_percent ?? null;
    const rawReturnableAmount =
      entry.returnableAmount ?? entry.returnable_amount ?? null;

    if (
      role !== DealParticipantRole.DOCTOR &&
      (rawReturnableRequired ||
        rawReturnablePercent !== null ||
        rawReturnableAmount !== null)
    ) {
      return {
        error: `Participant ${index + 1}: returnable fields are only supported for DOCTOR participants.`,
      };
    }

    participants.push({
      userId: entry.userId ?? entry.user_id ?? null,
      externalName: entry.externalName ?? entry.external_name ?? null,
      role,
      commissionPercent: Number(entry.commissionPercent ?? entry.commission_percent),
      commissionAmount:
        entry.commissionAmount !== undefined
          ? entry.commissionAmount
          : entry.commission_amount,
      isCommissionable: entry.isCommissionable ?? entry.is_commissionable,
      notes: entry.notes ?? null,
      returnablePercent:
        entry.returnablePercent !== undefined
          ? entry.returnablePercent
          : entry.returnable_percent,
      returnableAmount:
        entry.returnableAmount !== undefined
          ? entry.returnableAmount
          : entry.returnable_amount,
      isReturnableRequired:
        entry.isReturnableRequired ?? entry.is_returnable_required,
    });
  }

  return participants;
}

export function toParticipantCreateInput(participants: NormalizedDealParticipant[]) {
  return participants.map((participant) => ({
    userId: participant.userId,
    externalName: participant.externalName,
    role: participant.role,
    commissionPercent: participant.commissionPercent,
    commissionAmount: participant.commissionAmount,
    isCommissionable: participant.isCommissionable,
    notes: participant.notes,
    returnablePercent: participant.returnablePercent,
    returnableAmount: participant.returnableAmount,
    isReturnableRequired: participant.isReturnableRequired,
  }));
}

export function resolveExplicitDealParticipants({
  rawParticipants,
  totalCommission,
  status,
}: {
  rawParticipants: unknown;
  totalCommission: number;
  status: DealStatus;
}):
  | { participants: NormalizedDealParticipant[] }
  | { error: string; details?: string[] } {
  const parsed = parseParticipantInputs(rawParticipants);
  if ('error' in parsed) {
    return { error: parsed.error };
  }

  if (status === DealStatus.WON && parsed.length === 0) {
    return {
      error: 'Validation failed',
      details: ['WON deals require participants totaling 100%.'],
    };
  }

  const participants = normalizeDealParticipantsInput(parsed, {
    totalCommission,
  });
  const validation = validateDealParticipantsForStatus({
    status,
    totalCommission,
    participants,
    allowIncomplete:
      status === DealStatus.PROPOSED || status === DealStatus.ON_HOLD,
  });

  if (!validation.ok) {
    return {
      error: 'Validation failed',
      details: validation.errors,
    };
  }

  return { participants };
}
