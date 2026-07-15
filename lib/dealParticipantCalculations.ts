import {
  DealParticipantRole,
  DealStatus,
  AssignmentRole,
} from '@prisma/client';
import { COMPANY_OVERHEAD_RATE } from '@/lib/constants';
import { calculateParticipantAmount } from '@/lib/dealCommissionTemplates';
import {
  calculateIndividualRoleShare,
  getRoleOccupancy,
} from '@/lib/commissionCalculations';

type DecimalLike = number | { toString(): string };

export type DealParticipantCalculationInput = {
  id: string;
  userId?: string | null;
  userName?: string | null;
  externalName?: string | null;
  role: DealParticipantRole;
  commissionPercent: DecimalLike;
  commissionAmount?: DecimalLike | null;
  isCommissionable?: boolean;
};

export type DealParticipantCalculationDeal = {
  id?: string;
  clientId?: string;
  dealValue?: DecimalLike;
  totalCommission: DecimalLike;
  status?: DealStatus | string;
  participants?: DealParticipantCalculationInput[];
};

export type DealParticipantEarnings = {
  participantId: string;
  userId: string | null;
  externalName: string | null;
  role: DealParticipantRole;
  commissionPercent: number;
  commissionAmount: number;
};

export type DealParticipantLeaderboardRow = {
  userId: string;
  userName: string | null;
  roles: DealParticipantRole[];
  totalCommission: number;
  dealsClosed: number;
  totalDealValue: number;
};

export type DealParticipantLeaderboards = {
  userLeaderboard: DealParticipantLeaderboardRow[];
  companyTotal: number;
  externalPartnerTotal: number;
};

export type AdminLeaderboardLegacyAssignment = {
  clientId: string;
  role: AssignmentRole;
  userId: string;
  userName: string;
};

export type AdminLeaderboardsResponse = {
  commissionLeaderboard: {
    userName: string;
    totalCommission: number;
    dealsClosed: number;
  }[];
  dealsClosedLeaderboard: {
    userName: string;
    dealsClosed: number;
    averageDealValue: number;
  }[];
};

function isLeaderboardCommissionParticipant(
  participant: Pick<
    DealParticipantCalculationInput,
    'role' | 'userId' | 'isCommissionable'
  >
) {
  if (!participant.userId || participant.isCommissionable === false) {
    return false;
  }

  if (participant.role === DealParticipantRole.COMPANY) {
    return false;
  }

  if (participant.role === DealParticipantRole.EXTERNAL_PARTNER) {
    return true;
  }

  return (
    participant.role === DealParticipantRole.RELATIONSHIP ||
    participant.role === DealParticipantRole.FOLLOW_UP ||
    participant.role === DealParticipantRole.DOCTOR
  );
}

export function toMoneyNumber(value: DecimalLike | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

export function toPercentNumber(value: DecimalLike | null | undefined) {
  return toMoneyNumber(value);
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateDealParticipantAmount(
  totalCommission: DecimalLike,
  participant: Pick<
    DealParticipantCalculationInput,
    'commissionPercent' | 'commissionAmount' | 'isCommissionable'
  >
) {
  if (participant.isCommissionable === false) {
    return 0;
  }

  const numericTotalCommission = toMoneyNumber(totalCommission);

  if (
    participant.commissionAmount !== null &&
    participant.commissionAmount !== undefined
  ) {
    return roundMoney(toMoneyNumber(participant.commissionAmount));
  }

  return calculateParticipantAmount(
    numericTotalCommission,
    toPercentNumber(participant.commissionPercent)
  );
}

export function calculateParticipantCommissionAmount(
  dealTotalCommission: DecimalLike,
  participant: Pick<
    DealParticipantCalculationInput,
    'commissionPercent' | 'commissionAmount' | 'isCommissionable'
  >
) {
  return calculateDealParticipantAmount(dealTotalCommission, participant);
}

export type ParticipantReturnableCalculationInput = {
  role: DealParticipantRole;
  userId?: string | null;
  commissionPercent: DecimalLike;
  commissionAmount?: DecimalLike | null;
  isCommissionable?: boolean;
  returnablePercent?: DecimalLike | null;
  returnableAmount?: DecimalLike | null;
  isReturnableRequired?: boolean;
};

/**
 * Explicit doctor returnable amount. Fixed returnableAmount wins over returnablePercent.
 * Returns null when returnable is not required or cannot be calculated.
 */
export function calculateParticipantReturnableAmount(
  dealTotalCommission: DecimalLike,
  participant: ParticipantReturnableCalculationInput
): number | null {
  if (!participant.isReturnableRequired) {
    return null;
  }

  if (
    participant.returnableAmount !== null &&
    participant.returnableAmount !== undefined
  ) {
    return roundMoney(toMoneyNumber(participant.returnableAmount));
  }

  if (
    participant.returnablePercent !== null &&
    participant.returnablePercent !== undefined
  ) {
    const participantCommission = calculateParticipantCommissionAmount(
      dealTotalCommission,
      participant
    );
    return roundMoney(
      participantCommission * (toPercentNumber(participant.returnablePercent) / 100)
    );
  }

  return null;
}

export function calculateDealParticipantEarnings(
  deal: DealParticipantCalculationDeal
): DealParticipantEarnings[] {
  const participants = deal.participants ?? [];

  return participants.map((participant) => ({
    participantId: participant.id,
    userId: participant.userId ?? null,
    externalName: participant.externalName ?? null,
    role: participant.role,
    commissionPercent: toPercentNumber(participant.commissionPercent),
    commissionAmount: calculateDealParticipantAmount(
      deal.totalCommission,
      participant
    ),
  }));
}

export function calculateUserSecuredCommissionFromDealParticipants(
  userId: string,
  deals: DealParticipantCalculationDeal[]
) {
  return roundMoney(
    deals
      .filter((deal) => deal.status === DealStatus.WON)
      .reduce((total, deal) => {
        const participantTotal = (deal.participants ?? []).reduce(
          (dealTotal, participant) => {
            if (participant.userId !== userId) {
              return dealTotal;
            }

            if (participant.isCommissionable === false) {
              return dealTotal;
            }

            return (
              dealTotal +
              calculateDealParticipantAmount(deal.totalCommission, participant)
            );
          },
          0
        );

        return total + participantTotal;
      }, 0)
  );
}

export type LegacyAssignmentShareInput = {
  clientId: string;
  role: AssignmentRole;
};

/**
 * Standard-dashboard secured commission:
 * - Participant-backed WON deals: sum commissionable rows for `userId`.
 * - Legacy WON deals with no participants: fall back to client-assignment role pools
 *   (COMMISSION_RATE_POOLS + occupancy split) until deal participants are backfilled.
 */
export function calculateMySecuredCommissionWithLegacyFallback(
  userId: string,
  deals: DealParticipantCalculationDeal[],
  legacyAssignments: LegacyAssignmentShareInput[],
  roleOccupancyMap: Map<string, number>
) {
  const assignmentsByClient = new Map<string, LegacyAssignmentShareInput[]>();

  for (const assignment of legacyAssignments) {
    const existing = assignmentsByClient.get(assignment.clientId) ?? [];
    existing.push(assignment);
    assignmentsByClient.set(assignment.clientId, existing);
  }

  let total = 0;

  for (const deal of deals) {
    if (deal.status !== DealStatus.WON) {
      continue;
    }

    const participants = deal.participants ?? [];

    if (participants.length > 0) {
      for (const participant of participants) {
        if (participant.userId !== userId) {
          continue;
        }

        if (participant.isCommissionable === false) {
          continue;
        }

        total += calculateDealParticipantAmount(deal.totalCommission, participant);
      }

      continue;
    }

    if (!deal.clientId) {
      continue;
    }

    const clientAssignments = assignmentsByClient.get(deal.clientId) ?? [];

    for (const assignment of clientAssignments) {
      const roleOccupancy = getRoleOccupancy(
        roleOccupancyMap,
        deal.clientId,
        assignment.role
      );
      const individualShare = calculateIndividualRoleShare(
        assignment.role,
        roleOccupancy
      );

      total += toMoneyNumber(deal.totalCommission) * individualShare;
    }
  }

  return roundMoney(total);
}

export function calculateCompanyEarningsFromDealParticipants(
  deals: DealParticipantCalculationDeal[]
) {
  return roundMoney(
    deals
      .filter((deal) => deal.status === DealStatus.WON)
      .reduce((total, deal) => {
        const participants = deal.participants ?? [];

        if (participants.length === 0) {
          return (
            total +
            roundMoney(
              toMoneyNumber(deal.totalCommission) * COMPANY_OVERHEAD_RATE
            )
          );
        }

        const companyTotal = participants
          .filter((participant) => participant.role === DealParticipantRole.COMPANY)
          .reduce(
            (dealTotal, participant) =>
              dealTotal +
              calculateDealParticipantAmount(deal.totalCommission, participant),
            0
          );

        return total + companyTotal;
      }, 0)
  );
}

export function calculateLeaderboardsFromDealParticipants(
  deals: DealParticipantCalculationDeal[]
): DealParticipantLeaderboards {
  const userStats = new Map<
    string,
    {
      userName: string | null;
      roles: Set<DealParticipantRole>;
      totalCommission: number;
      dealIds: Set<string>;
      totalDealValue: number;
    }
  >();

  let companyTotal = 0;
  let externalPartnerTotal = 0;

  let anonymousDealCounter = 0;

  for (const deal of deals) {
    if (deal.status !== DealStatus.WON) {
      continue;
    }

    const dealId = deal.id ?? `anonymous-deal-${anonymousDealCounter++}`;
    const dealValue = toMoneyNumber(deal.dealValue);
    const participants = deal.participants ?? [];
    const usersInDeal = new Set<string>();

    for (const participant of participants) {
      const amount = calculateDealParticipantAmount(
        deal.totalCommission,
        participant
      );

      if (participant.role === DealParticipantRole.COMPANY) {
        companyTotal += amount;
        continue;
      }

      if (
        participant.role === DealParticipantRole.EXTERNAL_PARTNER &&
        (!participant.userId || participant.isCommissionable === false)
      ) {
        externalPartnerTotal += amount;
        continue;
      }

      if (!isLeaderboardCommissionParticipant(participant)) {
        continue;
      }

      const userId = participant.userId as string;
      const existing = userStats.get(userId) ?? {
        userName: participant.userName ?? null,
        roles: new Set<DealParticipantRole>(),
        totalCommission: 0,
        dealIds: new Set<string>(),
        totalDealValue: 0,
      };

      existing.userName = existing.userName ?? participant.userName ?? null;
      existing.roles.add(participant.role);
      existing.totalCommission += amount;

      if (!usersInDeal.has(userId)) {
        existing.dealIds.add(dealId);
        existing.totalDealValue += dealValue;
        usersInDeal.add(userId);
      }

      userStats.set(userId, existing);
    }
  }

  const userLeaderboard = Array.from(userStats.entries())
    .map(([userId, stats]) => ({
      userId,
      userName: stats.userName,
      roles: Array.from(stats.roles).sort(),
      totalCommission: roundMoney(stats.totalCommission),
      dealsClosed: stats.dealIds.size,
      totalDealValue: roundMoney(stats.totalDealValue),
    }))
    .sort((a, b) => b.totalCommission - a.totalCommission);

  return {
    userLeaderboard,
    companyTotal: roundMoney(companyTotal),
    externalPartnerTotal: roundMoney(externalPartnerTotal),
  };
}

/**
 * Admin leaderboards (YTD): participant earnings with legacy assignment-pool fallback
 * for WON deals that have not been backfilled with DealParticipant rows.
 */
export function calculateAdminLeaderboardsWithLegacyFallback(
  deals: DealParticipantCalculationDeal[],
  legacyAssignments: AdminLeaderboardLegacyAssignment[],
  legacyCommissionRates: Record<AssignmentRole, number>
): AdminLeaderboardsResponse {
  const assignmentsByClient = new Map<string, AdminLeaderboardLegacyAssignment[]>();

  for (const assignment of legacyAssignments) {
    const existing = assignmentsByClient.get(assignment.clientId) ?? [];
    existing.push(assignment);
    assignmentsByClient.set(assignment.clientId, existing);
  }

  const userStats = new Map<
    string,
    {
      userName: string;
      totalCommission: number;
      dealsClosed: number;
      totalDealValue: number;
    }
  >();
  const relationshipStats = new Map<
    string,
    { userName: string; dealsClosed: number; totalDealValue: number }
  >();

  let anonymousDealCounter = 0;

  for (const deal of deals) {
    if (deal.status !== DealStatus.WON) {
      continue;
    }

    const dealId = deal.id ?? `anonymous-deal-${anonymousDealCounter++}`;
    const dealValue = toMoneyNumber(deal.dealValue);
    const participants = deal.participants ?? [];

    if (participants.length > 0) {
      const usersInDeal = new Set<string>();
      const relationshipUsersInDeal = new Set<string>();

      for (const participant of participants) {
        if (!isLeaderboardCommissionParticipant(participant)) {
          continue;
        }

        const userId = participant.userId as string;
        const userName = participant.userName?.trim() || userId;
        const amount = calculateDealParticipantAmount(
          deal.totalCommission,
          participant
        );

        const existing = userStats.get(userId) ?? {
          userName,
          totalCommission: 0,
          dealsClosed: 0,
          totalDealValue: 0,
        };

        existing.userName = existing.userName || userName;
        existing.totalCommission += amount;

        if (!usersInDeal.has(userId)) {
          existing.dealsClosed += 1;
          existing.totalDealValue += dealValue;
          usersInDeal.add(userId);
        }

        userStats.set(userId, existing);

        if (participant.role === DealParticipantRole.RELATIONSHIP) {
          const relationshipEntry = relationshipStats.get(userId) ?? {
            userName,
            dealsClosed: 0,
            totalDealValue: 0,
          };

          relationshipEntry.userName = relationshipEntry.userName || userName;

          if (!relationshipUsersInDeal.has(userId)) {
            relationshipEntry.dealsClosed += 1;
            relationshipEntry.totalDealValue += dealValue;
            relationshipUsersInDeal.add(userId);
          }

          relationshipStats.set(userId, relationshipEntry);
        }
      }

      continue;
    }

    if (!deal.clientId) {
      continue;
    }

    const clientAssignments = assignmentsByClient.get(deal.clientId) ?? [];
    const totalCommission = toMoneyNumber(deal.totalCommission);

    for (const assignment of clientAssignments) {
      const commissionRate = legacyCommissionRates[assignment.role] ?? 0;
      const existing = userStats.get(assignment.userId) ?? {
        userName: assignment.userName,
        totalCommission: 0,
        dealsClosed: 0,
        totalDealValue: 0,
      };

      existing.userName = existing.userName || assignment.userName;
      existing.totalCommission += totalCommission * commissionRate;
      existing.dealsClosed += 1;
      existing.totalDealValue += dealValue;
      userStats.set(assignment.userId, existing);

      if (assignment.role === AssignmentRole.RELATIONSHIP) {
        const relationshipEntry = relationshipStats.get(assignment.userId) ?? {
          userName: assignment.userName,
          dealsClosed: 0,
          totalDealValue: 0,
        };

        relationshipEntry.userName =
          relationshipEntry.userName || assignment.userName;
        relationshipEntry.dealsClosed += 1;
        relationshipEntry.totalDealValue += dealValue;
        relationshipStats.set(assignment.userId, relationshipEntry);
      }
    }
  }

  return {
    commissionLeaderboard: Array.from(userStats.values())
      .map(({ userName, totalCommission, dealsClosed }) => ({
        userName,
        totalCommission: roundMoney(totalCommission),
        dealsClosed,
      }))
      .sort((a, b) => b.totalCommission - a.totalCommission),
    dealsClosedLeaderboard: Array.from(relationshipStats.values())
      .map(({ userName, dealsClosed, totalDealValue }) => ({
        userName,
        dealsClosed,
        averageDealValue:
          dealsClosed > 0
            ? roundMoney(totalDealValue / dealsClosed)
            : 0,
      }))
      .sort((a, b) => b.dealsClosed - a.dealsClosed),
  };
}

function getLeaderboardExcludedRoles() {
  return new Set<DealParticipantRole>([
    DealParticipantRole.COMPANY,
    DealParticipantRole.EXTERNAL_PARTNER,
  ]);
}

export function isLeaderboardParticipantRole(role: DealParticipantRole) {
  return !getLeaderboardExcludedRoles().has(role);
}
