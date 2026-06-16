/**
 * Recalculate CommissionReturnable amounts using the corrected formula.
 * Run: npx tsx scripts/recalculate-commission-returnables.ts
 */
import { backfillCommissionReturnablesForWonDeals } from '../lib/commissionReturnables';
import { prisma } from '../lib/prisma';

async function main() {
  console.log('Recalculating commission returnable amounts...\n');

  const result = await backfillCommissionReturnablesForWonDeals();

  console.log('Result:', result);

  const records = await prisma.commissionReturnable.findMany({
    include: {
      user: { select: { email: true } },
      deal: { select: { name: true, totalCommission: true } },
    },
  });

  console.log('\nCurrent records:');
  for (const record of records) {
    console.log(
      `- ${record.user.email} | deal=${record.deal?.name ?? 'unknown'} | amount=${Number(record.amount)} | status=${record.status}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Recalculation failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
