import { DealStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ClientDealAggregates = {
  wonCommission: number;
  wonDealValue: number;
  proposedDealValue: number;
};

/**
 * Fields needed for secured-commission / company-earnings calcs.
 * Omits nested participant.user (not used by those DTO builders).
 */
export const dashboardWonDealCommissionSelect = {
  id: true,
  clientId: true,
  totalCommission: true,
  participants: {
    select: {
      id: true,
      userId: true,
      role: true,
      commissionPercent: true,
      commissionAmount: true,
      isCommissionable: true,
    },
  },
} as const;

/**
 * Leaderboard path: needs dealValue + participant display names.
 */
export const dashboardWonDealSelect = {
  id: true,
  clientId: true,
  dealValue: true,
  totalCommission: true,
  participants: {
    select: {
      id: true,
      userId: true,
      role: true,
      commissionPercent: true,
      commissionAmount: true,
      isCommissionable: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  },
} as const;

export type DashboardWonDealForCommission = Prisma.DealGetPayload<{
  select: typeof dashboardWonDealCommissionSelect;
}>;

export type DashboardWonDealWithParticipants = Prisma.DealGetPayload<{
  select: typeof dashboardWonDealSelect;
}>;

const emptyAggregates: ClientDealAggregates = {
  wonCommission: 0,
  wonDealValue: 0,
  proposedDealValue: 0,
};

/**
 * Single grouped query for WON commission/value and PROPOSED pipeline value per client.
 */
export async function fetchDealAggregatesByClientIds(clientIds: string[]) {
  if (clientIds.length === 0) {
    return new Map<string, ClientDealAggregates>();
  }

  const rows = await prisma.$queryRaw<
    {
      clientId: string;
      won_commission: unknown;
      won_deal_value: unknown;
      proposed_deal_value: unknown;
    }[]
  >(Prisma.sql`
    SELECT
      d."clientId" AS "clientId",
      COALESCE(SUM(
        CASE WHEN d.status = ${DealStatus.WON}::"DealStatus"
        THEN d."totalCommission" ELSE 0 END
      ), 0) AS won_commission,
      COALESCE(SUM(
        CASE WHEN d.status = ${DealStatus.WON}::"DealStatus"
        THEN d."dealValue" ELSE 0 END
      ), 0) AS won_deal_value,
      COALESCE(SUM(
        CASE WHEN d.status = ${DealStatus.PROPOSED}::"DealStatus"
        THEN d."dealValue" ELSE 0 END
      ), 0) AS proposed_deal_value
    FROM "Deal" d
    WHERE d."clientId" IN (${Prisma.join(clientIds)})
    GROUP BY d."clientId"
  `);

  const aggregates = new Map<string, ClientDealAggregates>();

  for (const row of rows) {
    aggregates.set(row.clientId, {
      wonCommission: Number(row.won_commission ?? 0),
      wonDealValue: Number(row.won_deal_value ?? 0),
      proposedDealValue: Number(row.proposed_deal_value ?? 0),
    });
  }

  return aggregates;
}

/**
 * Loads all WON deals (with participants) for the given clients in one query.
 * Used by the standard dashboard secured-commission metric.
 */
export async function fetchWonDealsWithParticipantsByClientIds(
  clientIds: string[]
): Promise<DashboardWonDealForCommission[]> {
  if (clientIds.length === 0) {
    return [];
  }

  return prisma.deal.findMany({
    where: {
      clientId: { in: clientIds },
      status: DealStatus.WON,
    },
    select: dashboardWonDealCommissionSelect,
  });
}

/**
 * All WON deals with participants (admin KPIs / analytics).
 */
export async function fetchAllWonDealsWithParticipants(): Promise<
  DashboardWonDealForCommission[]
> {
  return prisma.deal.findMany({
    where: { status: DealStatus.WON },
    select: dashboardWonDealCommissionSelect,
  });
}

/**
 * WON deals updated on/after `since`, with participants (admin leaderboards YTD).
 */
export async function fetchWonDealsWithParticipantsSince(
  since: Date
): Promise<DashboardWonDealWithParticipants[]> {
  return prisma.deal.findMany({
    where: {
      status: DealStatus.WON,
      updatedAt: { gte: since },
    },
    select: dashboardWonDealSelect,
  });
}

export function getClientDealAggregates(
  aggregates: Map<string, ClientDealAggregates>,
  clientId: string
): ClientDealAggregates {
  return aggregates.get(clientId) ?? emptyAggregates;
}
