import { DealParticipantRole, DealStatus, DealType } from '@prisma/client';
import {
  DEAL_PARTICIPANT_ROLE_LABELS,
  DEAL_TYPE_LABELS,
} from '@/lib/dealCommissionTemplates';

type DealValueInput = {
  dealValue: { toString(): string } | number;
  status: DealStatus | string;
};

type DealTotalCommissionInput = DealValueInput & {
  totalCommission: { toString(): string } | number;
};

export function calculateCommittedValue(deals: DealValueInput[]) {
  return deals
    .filter((deal) => deal.status === DealStatus.WON)
    .reduce((total, deal) => total + Number(deal.dealValue), 0);
}

export function calculatePotentialValue(deals: DealValueInput[]) {
  return deals
    .filter((deal) => deal.status === DealStatus.PROPOSED)
    .reduce((total, deal) => total + Number(deal.dealValue), 0);
}

export function calculateWonTotalCommission(deals: DealTotalCommissionInput[]) {
  return deals
    .filter((deal) => deal.status === DealStatus.WON)
    .reduce((total, deal) => total + Number(deal.totalCommission), 0);
}

export type DealCommissionModel = 'PARTICIPANT' | 'LEGACY_FALLBACK';

export type DealParticipantResponse = {
  id: string;
  dealId: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  externalName: string | null;
  role: DealParticipantRole;
  roleLabel: string;
  commissionPercent: number;
  commissionAmount: number | null;
  isCommissionable: boolean;
  notes: string | null;
  returnablePercent: number | null;
  returnableAmount: number | null;
  isReturnableRequired: boolean;
};

/**
 * List/card participant row — omits `notes` and redundant `dealId` to slim
 * Client 360 / GET deals payloads while preserving commission UI.
 */
export type DealListParticipant = Omit<
  DealParticipantResponse,
  'dealId' | 'notes'
>;

export type DealResponse = {
  id: string;
  name: string;
  dealValue: number;
  totalCommission: number;
  dealType: DealType;
  dealTypeLabel: string;
  status: DealStatus;
  createdAt: string;
  updatedAt: string;
  participants: DealParticipantResponse[];
  /** Derived: PARTICIPANT when rows exist; LEGACY_FALLBACK when empty (client-assignment pools). */
  commissionModel: DealCommissionModel;
  usesLegacyCommissionFallback: boolean;
};

/** Slim deal row for Client 360 list + GET /deals (edit fetches full detail). */
export type DealListItem = Omit<DealResponse, 'participants'> & {
  participantCount: number;
  participants: DealListParticipant[];
};

export function resolveDealCommissionModel(
  participants: { length: number } | null | undefined
): DealCommissionModel {
  return (participants?.length ?? 0) > 0 ? 'PARTICIPANT' : 'LEGACY_FALLBACK';
}

type DealParticipantRecord = {
  id: string;
  dealId: string;
  userId: string | null;
  externalName: string | null;
  role: DealParticipantRole;
  commissionPercent: { toString(): string };
  commissionAmount: { toString(): string } | null;
  isCommissionable: boolean;
  notes: string | null;
  returnablePercent: { toString(): string } | null;
  returnableAmount: { toString(): string } | null;
  isReturnableRequired: boolean;
  user?: {
    name: string | null;
    email: string;
  } | null;
};

export const dealParticipantResponseSelect = {
  id: true,
  dealId: true,
  userId: true,
  externalName: true,
  role: true,
  commissionPercent: true,
  commissionAmount: true,
  isCommissionable: true,
  notes: true,
  returnablePercent: true,
  returnableAmount: true,
  isReturnableRequired: true,
  user: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

/** List select — same commission fields, no `notes` (edit modal loads full detail). */
export const dealListParticipantSelect = {
  id: true,
  userId: true,
  externalName: true,
  role: true,
  commissionPercent: true,
  commissionAmount: true,
  isCommissionable: true,
  returnablePercent: true,
  returnableAmount: true,
  isReturnableRequired: true,
  user: {
    select: {
      name: true,
      email: true,
    },
  },
} as const;

export const dealResponseSelect = {
  id: true,
  name: true,
  dealValue: true,
  totalCommission: true,
  dealType: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    orderBy: { createdAt: 'asc' as const },
    select: dealParticipantResponseSelect,
  },
} as const;

/**
 * Intentionally narrow Client 360 deals list select (Phase 2G).
 * Omits participant notes; edit modal loads {@link dealResponseSelect}.
 * Includes commission/returnable fields the DealInfoWidget list renders.
 */
export const dealListResponseSelect = {
  id: true,
  name: true,
  dealValue: true,
  totalCommission: true,
  dealType: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  participants: {
    orderBy: { createdAt: 'asc' as const },
    select: dealListParticipantSelect,
  },
} as const;

export function formatDealParticipantResponse(
  participant: DealParticipantRecord
): DealParticipantResponse {
  return {
    id: participant.id,
    dealId: participant.dealId,
    userId: participant.userId,
    userName: participant.user?.name ?? null,
    userEmail: participant.user?.email ?? null,
    externalName: participant.externalName,
    role: participant.role,
    roleLabel: DEAL_PARTICIPANT_ROLE_LABELS[participant.role],
    commissionPercent: Number(participant.commissionPercent),
    commissionAmount:
      participant.commissionAmount !== null &&
      participant.commissionAmount !== undefined
        ? Number(participant.commissionAmount)
        : null,
    isCommissionable: participant.isCommissionable,
    notes: participant.notes,
    returnablePercent:
      participant.returnablePercent !== null &&
      participant.returnablePercent !== undefined
        ? Number(participant.returnablePercent)
        : null,
    returnableAmount:
      participant.returnableAmount !== null &&
      participant.returnableAmount !== undefined
        ? Number(participant.returnableAmount)
        : null,
    isReturnableRequired: participant.isReturnableRequired,
  };
}

type DealListParticipantRecord = {
  id: string;
  userId: string | null;
  externalName: string | null;
  role: DealParticipantRole;
  commissionPercent: { toString(): string };
  commissionAmount: { toString(): string } | null;
  isCommissionable: boolean;
  returnablePercent: { toString(): string } | null;
  returnableAmount: { toString(): string } | null;
  isReturnableRequired: boolean;
  user?: {
    name: string | null;
    email: string;
  } | null;
};

export function formatDealListParticipant(
  participant: DealListParticipantRecord
): DealListParticipant {
  return {
    id: participant.id,
    userId: participant.userId,
    userName: participant.user?.name ?? null,
    userEmail: participant.user?.email ?? null,
    externalName: participant.externalName,
    role: participant.role,
    roleLabel: DEAL_PARTICIPANT_ROLE_LABELS[participant.role],
    commissionPercent: Number(participant.commissionPercent),
    commissionAmount:
      participant.commissionAmount !== null &&
      participant.commissionAmount !== undefined
        ? Number(participant.commissionAmount)
        : null,
    isCommissionable: participant.isCommissionable,
    returnablePercent:
      participant.returnablePercent !== null &&
      participant.returnablePercent !== undefined
        ? Number(participant.returnablePercent)
        : null,
    returnableAmount:
      participant.returnableAmount !== null &&
      participant.returnableAmount !== undefined
        ? Number(participant.returnableAmount)
        : null,
    isReturnableRequired: participant.isReturnableRequired,
  };
}

export function formatDealResponse(deal: {
  id: string;
  name: string;
  dealValue: { toString(): string };
  totalCommission: { toString(): string };
  dealType: DealType;
  status: DealStatus;
  createdAt: Date;
  updatedAt: Date;
  participants?: DealParticipantRecord[];
}): DealResponse {
  const participants = (deal.participants ?? []).map(
    formatDealParticipantResponse
  );
  const commissionModel = resolveDealCommissionModel(participants);

  return {
    id: deal.id,
    name: deal.name,
    dealValue: Number(deal.dealValue),
    totalCommission: Number(deal.totalCommission),
    dealType: deal.dealType,
    dealTypeLabel: DEAL_TYPE_LABELS[deal.dealType],
    status: deal.status,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
    participants,
    commissionModel,
    usesLegacyCommissionFallback: commissionModel === 'LEGACY_FALLBACK',
  };
}

export function formatDealListItem(deal: {
  id: string;
  name: string;
  dealValue: { toString(): string };
  totalCommission: { toString(): string };
  dealType: DealType;
  status: DealStatus;
  createdAt: Date;
  updatedAt: Date;
  participants?: DealListParticipantRecord[];
}): DealListItem {
  const participants = (deal.participants ?? []).map(formatDealListParticipant);
  const commissionModel = resolveDealCommissionModel(participants);

  return {
    id: deal.id,
    name: deal.name,
    dealValue: Number(deal.dealValue),
    totalCommission: Number(deal.totalCommission),
    dealType: deal.dealType,
    dealTypeLabel: DEAL_TYPE_LABELS[deal.dealType],
    status: deal.status,
    createdAt: deal.createdAt.toISOString(),
    updatedAt: deal.updatedAt.toISOString(),
    participantCount: participants.length,
    participants,
    commissionModel,
    usesLegacyCommissionFallback: commissionModel === 'LEGACY_FALLBACK',
  };
}

export function parseMoneyValue(value: unknown, fieldName: string) {
  if (value === undefined || value === null || value === '') {
    return { error: `${fieldName} is required` };
  }

  const numericValue = Number(value);
  if (Number.isNaN(numericValue) || numericValue < 0) {
    return { error: `${fieldName} must be a non-negative number` };
  }

  return { value: numericValue };
}
