import { DealStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ClientDealAggregates = {
  wonCommission: number;
  wonDealValue: number;
  proposedDealValue: number;
};

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

export function getClientDealAggregates(
  aggregates: Map<string, ClientDealAggregates>,
  clientId: string
): ClientDealAggregates {
  return aggregates.get(clientId) ?? emptyAggregates;
}
