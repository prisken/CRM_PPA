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
  grossProfit: number
) {
  const existingDeal = await getPrimaryDeal(clientId);

  if (existingDeal) {
    return prisma.deal.update({
      where: { id: existingDeal.id },
      data: {
        dealValue,
        grossProfit,
      },
    });
  }

  return prisma.deal.create({
    data: {
      clientId,
      name: 'Primary Deal',
      dealValue,
      grossProfit,
    },
  });
}

export async function resolveClientGrossProfit(
  clientId: string,
  deals: { grossProfit: { toString(): string } }[]
) {
  const primaryDeal = deals[0];
  if (primaryDeal) {
    return Number(primaryDeal.grossProfit);
  }

  const deal = await getPrimaryDeal(clientId);
  return deal ? Number(deal.grossProfit) : 0;
}
