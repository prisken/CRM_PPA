import { DealParticipantRole, DealType } from '@prisma/client';

export const DEAL_TYPE_LABELS: Record<DealType, string> = {
  MARKETING: 'Marketing',
  INVESTMENT: 'Investment',
  MEDICAL: 'Medical',
  CUSTOM: 'Custom',
};

export const DEAL_PARTICIPANT_ROLE_LABELS: Record<DealParticipantRole, string> = {
  RELATIONSHIP: 'Relationship Officer',
  FOLLOW_UP: 'Follow-up Officer',
  DOCTOR: 'Doctor / Specialist',
  COMPANY: 'PPA',
  EXTERNAL_PARTNER: 'External Partner',
};

export type DealCommissionTemplateLine = {
  role: DealParticipantRole;
  commissionPercent: number;
};

let defaultDealCommissionTemplatesCache:
  | Record<DealType, DealCommissionTemplateLine[]>
  | undefined;

/** Lazy init avoids Turbopack circular-import crashes on `DealParticipantRole.*` at module load. */
export function getDefaultDealCommissionTemplates(): Record<
  DealType,
  DealCommissionTemplateLine[]
> {
  if (!defaultDealCommissionTemplatesCache) {
    defaultDealCommissionTemplatesCache = {
      MARKETING: [
        { role: DealParticipantRole.COMPANY, commissionPercent: 15 },
        { role: DealParticipantRole.RELATIONSHIP, commissionPercent: 5 },
        { role: DealParticipantRole.FOLLOW_UP, commissionPercent: 0 },
        { role: DealParticipantRole.EXTERNAL_PARTNER, commissionPercent: 80 },
      ],
      INVESTMENT: [
        { role: DealParticipantRole.COMPANY, commissionPercent: 20 },
        { role: DealParticipantRole.RELATIONSHIP, commissionPercent: 10 },
        { role: DealParticipantRole.FOLLOW_UP, commissionPercent: 10 },
        { role: DealParticipantRole.DOCTOR, commissionPercent: 60 },
      ],
      MEDICAL: [
        { role: DealParticipantRole.COMPANY, commissionPercent: 20 },
        { role: DealParticipantRole.RELATIONSHIP, commissionPercent: 10 },
        { role: DealParticipantRole.FOLLOW_UP, commissionPercent: 10 },
        { role: DealParticipantRole.DOCTOR, commissionPercent: 60 },
      ],
      CUSTOM: [
        { role: DealParticipantRole.COMPANY, commissionPercent: 20 },
        { role: DealParticipantRole.RELATIONSHIP, commissionPercent: 10 },
        { role: DealParticipantRole.FOLLOW_UP, commissionPercent: 10 },
        { role: DealParticipantRole.DOCTOR, commissionPercent: 60 },
      ],
    };
  }

  return defaultDealCommissionTemplatesCache;
}

export type ParticipantPercentInput = {
  commissionPercent: number | { toString(): string };
};

export type ValidateParticipantPercentsOptions = {
  expectedTotal?: number;
  tolerance?: number;
};

export type ValidateParticipantPercentsResult = {
  ok: boolean;
  total: number;
  message?: string;
};

const DEFAULT_EXPECTED_TOTAL_PERCENT = 100;
const DEFAULT_PERCENT_TOLERANCE = 0.01;

export function getDealCommissionTemplate(
  dealType: DealType
): DealCommissionTemplateLine[] {
  return getDefaultDealCommissionTemplates()[dealType].map((line) => ({
    role: line.role,
    commissionPercent: line.commissionPercent,
  }));
}

export function calculateParticipantAmount(
  totalCommission: number,
  commissionPercent: number
) {
  return (
    Math.round(totalCommission * (commissionPercent / 100) * 100) / 100
  );
}

function toPercentNumber(value: number | { toString(): string }) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function sumParticipantPercents(participants: ParticipantPercentInput[]) {
  const total = participants.reduce(
    (sum, participant) =>
      sum + toPercentNumber(participant.commissionPercent),
    0
  );

  return Math.round(total * 100) / 100;
}

export function validateParticipantPercents(
  participants: ParticipantPercentInput[],
  options: ValidateParticipantPercentsOptions = {}
): ValidateParticipantPercentsResult {
  const expectedTotal = options.expectedTotal ?? DEFAULT_EXPECTED_TOTAL_PERCENT;
  const tolerance = options.tolerance ?? DEFAULT_PERCENT_TOLERANCE;
  const total = sumParticipantPercents(participants);
  const delta = Math.abs(total - expectedTotal);

  if (delta <= tolerance) {
    return { ok: true, total };
  }

  return {
    ok: false,
    total,
    message: `Participant commission percentages must total ${expectedTotal}% (currently ${total}%).`,
  };
}
