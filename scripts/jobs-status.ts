/**
 * Summarize BackgroundJob queue health (read-only).
 *
 * Run: npm run jobs:status
 * See docs/BACKGROUND_JOBS_OPS.md
 */
import { BackgroundJobStatus } from '@prisma/client';
import { STUCK_RUNNING_MS } from '../lib/backgroundJobs';
import { prisma } from '../lib/prisma';

async function main() {
  const stuckCutoff = new Date(Date.now() - STUCK_RUNNING_MS);

  const [grouped, pendingDue, pendingDeferred, stuckRunning, recentFailed, recentPending] =
    await Promise.all([
      prisma.backgroundJob.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      prisma.backgroundJob.count({
        where: {
          status: BackgroundJobStatus.PENDING,
          runAfter: { lte: new Date() },
        },
      }),
      prisma.backgroundJob.count({
        where: {
          status: BackgroundJobStatus.PENDING,
          runAfter: { gt: new Date() },
        },
      }),
      prisma.backgroundJob.count({
        where: {
          status: BackgroundJobStatus.RUNNING,
          updatedAt: { lt: stuckCutoff },
        },
      }),
      prisma.backgroundJob.findMany({
        where: { status: BackgroundJobStatus.FAILED },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          type: true,
          attempts: true,
          maxAttempts: true,
          lastError: true,
          updatedAt: true,
          payload: true,
        },
      }),
      prisma.backgroundJob.findMany({
        where: { status: BackgroundJobStatus.PENDING },
        orderBy: { runAfter: 'asc' },
        take: 10,
        select: {
          id: true,
          type: true,
          attempts: true,
          runAfter: true,
          lastError: true,
          payload: true,
        },
      }),
    ]);

  const byStatus: Record<string, number> = {
    PENDING: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
  };
  for (const row of grouped) {
    byStatus[row.status] = row._count._all;
  }

  console.log('BackgroundJob queue status\n');
  console.log('Counts by status:');
  for (const [status, count] of Object.entries(byStatus)) {
    console.log(`- ${status}: ${count}`);
  }
  console.log(`\nPENDING due now: ${pendingDue}`);
  console.log(`PENDING deferred (backoff): ${pendingDeferred}`);
  console.log(
    `Stuck RUNNING (updatedAt < ${STUCK_RUNNING_MS / 60000}m ago): ${stuckRunning}`
  );

  if (recentPending.length > 0) {
    console.log('\nOldest PENDING (up to 10):');
    for (const job of recentPending) {
      console.log({
        id: job.id,
        type: job.type,
        attempts: job.attempts,
        runAfter: job.runAfter.toISOString(),
        lastError: job.lastError?.slice(0, 120) ?? null,
        payload: job.payload,
      });
    }
  }

  if (recentFailed.length > 0) {
    console.log('\nRecent FAILED (up to 10):');
    for (const job of recentFailed) {
      console.log({
        id: job.id,
        type: job.type,
        attempts: `${job.attempts}/${job.maxAttempts}`,
        updatedAt: job.updatedAt.toISOString(),
        lastError: job.lastError?.slice(0, 200) ?? null,
        payload: job.payload,
      });
    }
  }

  if (stuckRunning > 0) {
    console.log(
      '\nAction: run `npm run jobs:process` — reclaimStuckRunningJobs resets stale RUNNING → PENDING.'
    );
  }
  if (pendingDue > 0) {
    console.log(
      '\nAction: run `npm run jobs:process` or POST /api/tasks/process-background-jobs.'
    );
  }
  if (byStatus.FAILED > 0) {
    console.log(
      '\nFAILED rows need investigation; fix root cause then re-enqueue or use sync recalculate route.'
    );
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error('jobs:status failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
