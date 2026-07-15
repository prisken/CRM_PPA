/**
 * Backfill DealParticipant rows for existing deals using client-level assignments.
 *
 * Run:
 *   npm run backfill:deal-participants
 *   npm run backfill:deal-participants:dry
 *   npx tsx scripts/backfill-deal-participants.ts --limit=50
 */
import { backfillDealParticipantsForExistingDeals } from '../lib/dealParticipantsBackfill';
import { prisma } from '../lib/prisma';

type ParsedArgs = {
  dryRun: boolean;
  limit?: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  let dryRun = false;
  let limit: number | undefined;

  for (const arg of argv) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg.startsWith('--limit=')) {
      const value = arg.slice('--limit='.length).trim();
      const parsed = Number(value);

      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new Error(`Invalid --limit value: ${value}`);
      }

      limit = parsed;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: tsx scripts/backfill-deal-participants.ts [options]

Options:
  --dry-run       Preview changes without writing to the database
  --limit=number  Process at most this many deals without participants
  --help, -h      Show this help message
`);
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, limit };
}

function printSummary(
  result: Awaited<ReturnType<typeof backfillDealParticipantsForExistingDeals>>,
  dryRun: boolean
) {
  console.log('Summary:');
  console.log(`- Mode: ${dryRun ? 'dry run' : 'write'}`);
  console.log(`- Deals scanned: ${result.scannedDeals}`);
  console.log(
    `- Deals skipped (already had participants): ${result.skippedDealsWithParticipants}`
  );
  console.log(`- Deals updated: ${result.updatedDeals}`);
  console.log(`- Participants created: ${result.createdParticipants}`);

  if (result.warnings.length === 0) {
    console.log('\nWarnings: none');
    return;
  }

  console.log(`\nWarnings (${result.warnings.length}):`);
  for (const warning of result.warnings) {
    console.log(`- ${warning}`);
  }
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  console.log('Backfilling deal participants from client-level assignments...\n');
  if (dryRun) {
    console.log('Dry run enabled — no database writes will be performed.\n');
  }
  if (limit !== undefined) {
    console.log(`Limit: ${limit} deal(s)\n`);
  }

  const result = await backfillDealParticipantsForExistingDeals({
    dryRun,
    limit,
  });

  printSummary(result, dryRun);

  if (result.scannedDeals === 0) {
    console.log('\nNo deals without participants were found to process.');
  } else if (result.updatedDeals === 0) {
    console.log('\nNo deals were updated.');
  } else if (dryRun) {
    console.log('\nDry run complete. Re-run without --dry-run to apply changes.');
  } else {
    console.log('\nBackfill complete.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Deal participant backfill failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
