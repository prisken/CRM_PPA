/**
 * Recalculate CommissionReturnable amounts using the role-aware formula.
 * Applies credits when a doctor also holds RELATIONSHIP or ACCOUNT_SERVICE roles.
 *
 * Run: npx tsx scripts/recalculate-commission-returnables.ts
 */
import { backfillCommissionReturnablesForWonDeals } from '../lib/commissionReturnables';
import { prisma } from '../lib/prisma';

async function main() {
  console.log('Recalculating commission returnable amounts (role-aware formula)...\n');

  const result = await backfillCommissionReturnablesForWonDeals();

  console.log('Summary:');
  console.log(`- WON deals processed: ${result.wonDealsProcessed}`);
  console.log(`- Existing records scanned: ${result.recordsProcessed}`);
  console.log(`- Records updated: ${result.recordsUpdated}`);
  console.log(`- Records created (missing): ${result.recordsCreated}`);
  console.log(`- Records skipped (non-WON/missing deal): ${result.recordsSkipped}`);

  if (result.changes.length > 0) {
    console.log('\nChanges applied:');
    for (const change of result.changes) {
      if (change.action === 'updated') {
        console.log(
          `- UPDATED ${change.userEmail} | deal=${change.dealName} | ${change.previousAmount} -> ${change.correctedAmount}`
        );
      } else {
        console.log(
          `- CREATED ${change.userEmail} | deal=${change.dealName} | amount=${change.correctedAmount}`
        );
      }
    }
  } else {
    console.log('\nNo changes were required — all amounts already match the corrected formula.');
  }

  const records = await prisma.commissionReturnable.findMany({
    include: {
      user: { select: { email: true } },
      deal: { select: { name: true, totalCommission: true } },
    },
    orderBy: [{ period: 'desc' }, { createdAt: 'desc' }],
  });

  console.log('\nCurrent records after recalculation:');
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
