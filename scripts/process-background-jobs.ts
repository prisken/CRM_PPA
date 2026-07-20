/**
 * Process pending BackgroundJob rows (local / ops).
 *
 * Run: npx tsx scripts/process-background-jobs.ts
 * Optional: --limit=20
 */
import { processBackgroundJobs } from '../lib/backgroundJobs';
import { prisma } from '../lib/prisma';

async function main() {
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg
    ? Number.parseInt(limitArg.slice('--limit='.length), 10)
    : 20;

  console.log(
    `Processing background jobs (limit=${Number.isFinite(limit) ? limit : 20})...\n`
  );

  const result = await processBackgroundJobs({
    limit: Number.isFinite(limit) ? limit : 20,
  });

  console.log('Summary:');
  console.log(`- Claimed: ${result.claimed}`);
  console.log(`- Succeeded: ${result.succeeded}`);
  console.log(`- Failed (exhausted): ${result.failed}`);
  if (result.jobIds.length > 0) {
    console.log(`- Job ids: ${result.jobIds.join(', ')}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('Background job processing failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
