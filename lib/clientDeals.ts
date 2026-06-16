import { prisma } from '@/lib/prisma';

export async function getPrimaryDeal(clientId: string) {
  return prisma.deal.findFirst({
    where: { clientId },
    orderBy: { createdAt: 'asc' },
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
    });
  }

  return prisma.deal.create({
    data: {
      clientId,
      name: 'Primary Deal',
      dealValue,
      totalCommission,
    },
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
