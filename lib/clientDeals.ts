import { prisma } from '@/lib/prisma';

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
