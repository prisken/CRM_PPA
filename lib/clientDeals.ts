import { prisma } from '@/lib/prisma';
import { timeAsync } from '@/lib/performance';
import {
  dealListResponseSelect,
  dealResponseSelect,
  formatDealListItem,
  formatDealResponse,
  type DealListItem,
  type DealResponse,
} from '@/lib/dealCalculations';

const primaryDealSelect = {
  id: true,
  dealValue: true,
  totalCommission: true,
} as const;

export async function getPrimaryDeal(clientId: string) {
  return prisma.deal.findFirst({
    where: { clientId },
    orderBy: { createdAt: 'asc' },
    select: primaryDealSelect,
  });
}

export async function upsertPrimaryDeal(
  clientId: string,
  dealValue: number,
  totalCommission: number
) {
  const existingDeal = await getPrimaryDeal(clientId);

  if (existingDeal) {
    return prisma.deal.update({
      where: { id: existingDeal.id },
      data: {
        dealValue,
        totalCommission,
      },
      select: primaryDealSelect,
    });
  }

  return prisma.deal.create({
    data: {
      clientId,
      name: 'Primary Deal',
      dealValue,
      totalCommission,
    },
    select: primaryDealSelect,
  });
}

export async function resolveClientTotalCommission(
  clientId: string,
  deals: { totalCommission: { toString(): string } }[]
) {
  const primaryDeal = deals[0];
  if (primaryDeal) {
    return Number(primaryDeal.totalCommission);
  }

  const deal = await getPrimaryDeal(clientId);
  return deal ? Number(deal.totalCommission) : 0;
}

/** Slim Client 360 / list API deals (no participant notes). */
export async function listClientDealsForClient360(
  clientId: string
): Promise<DealListItem[]> {
  // Intentionally narrow: dealListResponseSelect (no notes; edit loads full detail).
  const deals = await timeAsync('client360:deals:query', () =>
    prisma.deal.findMany({
      where: { clientId },
      orderBy: { createdAt: 'asc' },
      select: dealListResponseSelect,
    })
  );

  return timeAsync('client360:deals:map', async () =>
    deals.map(formatDealListItem)
  );
}

/** Full deal detail for edit modal / mutations. */
export async function getClientDealDetail(
  clientId: string,
  dealId: string
): Promise<DealResponse | null> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, clientId },
    select: dealResponseSelect,
  });

  if (!deal) {
    return null;
  }

  return formatDealResponse(deal);
}
