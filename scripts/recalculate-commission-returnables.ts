/**
 * Recalculate CommissionReturnable amounts.
 * - WON deals with participants: explicit DealParticipant returnable fields.
 * - WON deals without participants: legacy client-assignment formula fallback.
 *
 * Run: npx tsx scripts/recalculate-commission-returnables.ts
 */
import { recalculateAllCommissionReturnablesForWonDeals } from '../lib/commissionReturnables';
import { prisma } from '../lib/prisma';

async function main() {
  console.log('Recalculating commission returnable amounts...\n');

  const result = await recalculateAllCommissionReturnablesForWonDeals();

  console.log('Summary:');
  console.log(`- WON deals processed: ${result.wonDealsProcessed}`);
  console.log(`- Deals processed with participants: ${result.dealsWithParticipants}`);
  console.log(`- Deals processed with legacy fallback: ${result.dealsWithLegacyFallback}`);
  console.log(`- Participant returnables created: ${result.participantReturnablesCreated}`);
  console.log(`- Participant returnables updated: ${result.participantReturnablesUpdated}`);
  console.log(
    `- Participant returnables skipped (isReturnableRequired false): ${result.participantReturnablesSkippedNotRequired}`
  );
  console.log(
    `- Participant returnables skipped (invalid config): ${result.participantReturnablesSkippedInvalid}`
  );
  console.log(`- Paid records preserved: ${result.paidRecordsPreserved}`);
  console.log(`- Unpaid records zeroed (no longer required): ${result.unpaidRecordsZeroed}`);
  console.log(`- Legacy records updated: ${result.legacyRecordsUpdated}`);
  console.log(`- Legacy records created: ${result.legacyRecordsCreated}`);

  if (result.changes.length > 0) {
    console.log('\nLegacy changes applied:');
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
