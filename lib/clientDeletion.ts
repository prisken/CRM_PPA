import type { Prisma } from '@prisma/client';

type ClientDeletionDb = Pick<
  Prisma.TransactionClient,
  'deal' | 'commissionReturnable' | 'client'
>;

/**
 * Permanently removes one or more clients after clearing commission returnables
 * that would block deal/client deletion.
 */
export async function permanentlyDeleteClientRecords(
  db: ClientDeletionDb,
  clientIds: string | string[]
) {
  const ids = Array.isArray(clientIds) ? clientIds : [clientIds];
  if (ids.length === 0) {
    return 0;
  }

  const dealIds = (
    await db.deal.findMany({
      where: { clientId: { in: ids } },
      select: { id: true },
    })
  ).map((deal) => deal.id);

  if (dealIds.length > 0) {
    await db.commissionReturnable.deleteMany({
      where: { dealId: { in: dealIds } },
    });
  }

  const result = await db.client.deleteMany({
    where: { id: { in: ids } },
  });

  return result.count;
}
