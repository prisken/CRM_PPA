/**
 * Process pending BackgroundJob rows (local / ops / CI).
 *
 * One batch then exit (does not loop):
 *   npm run jobs:process
 *   npm run jobs:process:once
 *   npx tsx scripts/process-background-jobs.ts --limit=20
 *
 * See docs/BACKGROUND_JOBS_OPS.md
 */
import { processBackgroundJobs } from '../lib/backgroundJobs';
import { prisma } from '../lib/prisma';

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg
    ? Number.parseInt(limitArg.slice('--limit='.length), 10)
    : 20;
  const resolvedLimit = Number.isFinite(limit) ? limit : 20;

  console.log(`Processing background jobs (one batch, limit=${resolvedLimit})...\n`);

  const result = await processBackgroundJobs({
    limit: resolvedLimit,
  });

  console.log('Summary:');
  if (result.reclaimedStuck > 0) {
    console.log(`- Reclaimed stuck RUNNING: ${result.reclaimedStuck}`);
  }
  console.log(`- Claimed: ${result.claimed}`);
  console.log(`- Succeeded: ${result.succeeded}`);
  console.log(`- Failed (exhausted): ${result.failed}`);
  if (result.jobIds.length > 0) {
    console.log(`- Job ids: ${result.jobIds.join(', ')}`);
  }
  if (result.claimed === 0 && result.reclaimedStuck === 0) {
    console.log('- No due PENDING jobs.');
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Background job processing failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
