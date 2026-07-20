import {
  BackgroundJobStatus,
  Prisma,
  type BackgroundJob,
} from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const BACKGROUND_JOB_TYPES = {
  RECALCULATE_RETURNABLES_FOR_USER_CLIENT:
    'RECALCULATE_RETURNABLES_FOR_USER_CLIENT',
} as const;

export type BackgroundJobType =
  (typeof BACKGROUND_JOB_TYPES)[keyof typeof BACKGROUND_JOB_TYPES];

export type ReturnableRecalcJobPayload = {
  userId: string;
  clientId: string;
};

export type ProcessBackgroundJobsOptions = {
  limit?: number;
  types?: BackgroundJobType[];
};

export type ProcessBackgroundJobsResult = {
  claimed: number;
  succeeded: number;
  failed: number;
  jobIds: string[];
  /** RUNNING rows older than {@link STUCK_RUNNING_MS} reset to PENDING before claim. */
  reclaimedStuck: number;
};

const DEFAULT_BATCH_LIMIT = 10;
const DEFAULT_MAX_ATTEMPTS = 5;

/** RUNNING jobs with `updatedAt` older than this are treated as stuck (crash/timeout). */
export const STUCK_RUNNING_MS = 15 * 60 * 1000;

function isReturnableRecalcPayload(
  payload: unknown
): payload is ReturnableRecalcJobPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return (
    typeof record.userId === 'string' &&
    record.userId.length > 0 &&
    typeof record.clientId === 'string' &&
    record.clientId.length > 0
  );
}

function backoffMs(attemptsAfterFailure: number): number {
  // 5s, 20s, 80s, 320s… capped at 15 minutes
  const ms = 5_000 * 4 ** Math.max(0, attemptsAfterFailure - 1);
  return Math.min(ms, 15 * 60_000);
}

/**
 * Enqueue returnable recalculation for (userId, clientId).
 * Coalesces with an existing PENDING job for the same payload (dedupe).
 */
export async function enqueueReturnableRecalculationJob(
  userId: string,
  clientId: string
): Promise<BackgroundJob> {
  const payload: ReturnableRecalcJobPayload = { userId, clientId };
  const type = BACKGROUND_JOB_TYPES.RECALCULATE_RETURNABLES_FOR_USER_CLIENT;
  const now = new Date();

  const existingPending = await prisma.backgroundJob.findFirst({
    where: {
      type,
      status: BackgroundJobStatus.PENDING,
      payload: {
        equals: payload,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  if (existingPending) {
    return prisma.backgroundJob.update({
      where: { id: existingPending.id },
      data: {
        runAfter: now,
        lastError: null,
      },
    });
  }

  return prisma.backgroundJob.create({
    data: {
      type,
      status: BackgroundJobStatus.PENDING,
      payload,
      attempts: 0,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
      runAfter: now,
    },
  });
}

/**
 * Atomically claim up to `limit` PENDING jobs that are due.
 * Uses FOR UPDATE SKIP LOCKED so concurrent processors do not double-claim.
 */
export async function claimPendingBackgroundJobs(
  options: ProcessBackgroundJobsOptions = {}
): Promise<BackgroundJob[]> {
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_BATCH_LIMIT, 1), 50);
  const types = options.types;

  const typeFilter =
    types && types.length > 0
      ? Prisma.sql`AND type IN (${Prisma.join(types)})`
      : Prisma.empty;

  return prisma.$queryRaw<BackgroundJob[]>(Prisma.sql`
    UPDATE "background_jobs"
    SET
      status = CAST(${BackgroundJobStatus.RUNNING} AS "BackgroundJobStatus"),
      attempts = attempts + 1,
      "updatedAt" = NOW()
    WHERE id IN (
      SELECT id
      FROM "background_jobs"
      WHERE status = CAST(${BackgroundJobStatus.PENDING} AS "BackgroundJobStatus")
        AND "runAfter" <= NOW()
        ${typeFilter}
      ORDER BY "runAfter" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      id,
      type,
      status,
      payload,
      attempts,
      "maxAttempts",
      "runAfter",
      "lastError",
      "createdAt",
      "updatedAt"
  `);
}

async function executeBackgroundJob(job: BackgroundJob): Promise<void> {
  if (job.type === BACKGROUND_JOB_TYPES.RECALCULATE_RETURNABLES_FOR_USER_CLIENT) {
    if (!isReturnableRecalcPayload(job.payload)) {
      throw new Error('Invalid RECALCULATE_RETURNABLES_FOR_USER_CLIENT payload');
    }
    // Dynamic import avoids circular dep with commissionReturnables scheduling.
    const { recalculateReturnablesForUserOnClient } = await import(
      '@/lib/commissionReturnables'
    );
    await recalculateReturnablesForUserOnClient(
      job.payload.userId,
      job.payload.clientId
    );
    return;
  }

  throw new Error(`Unsupported background job type: ${job.type}`);
}

async function markJobSucceeded(jobId: string): Promise<void> {
  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      status: BackgroundJobStatus.SUCCEEDED,
      lastError: null,
    },
  });
}

async function markJobFailure(
  job: BackgroundJob,
  error: unknown
): Promise<'failed' | 'retry'> {
  const message =
    error instanceof Error ? error.message : 'Unknown background job error';
  const attempts = job.attempts;
  const exhausted = attempts >= job.maxAttempts;

  if (exhausted) {
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: BackgroundJobStatus.FAILED,
        lastError: message.slice(0, 4000),
      },
    });
    return 'failed';
  }

  await prisma.backgroundJob.update({
    where: { id: job.id },
    data: {
      status: BackgroundJobStatus.PENDING,
      runAfter: new Date(Date.now() + backoffMs(attempts)),
      lastError: message.slice(0, 4000),
    },
  });
  return 'retry';
}

/**
 * Reset crash/timeout leftovers: RUNNING with stale `updatedAt` → PENDING.
 * Does not change schema; safe to run on every processor tick.
 */
export async function reclaimStuckRunningJobs(
  olderThanMs: number = STUCK_RUNNING_MS
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const result = await prisma.backgroundJob.updateMany({
    where: {
      status: BackgroundJobStatus.RUNNING,
      updatedAt: { lt: cutoff },
    },
    data: {
      status: BackgroundJobStatus.PENDING,
      runAfter: new Date(),
      lastError: 'Reclaimed stuck RUNNING job (processor crash or timeout)',
    },
  });
  return result.count;
}

/**
 * Claim and run a batch of due background jobs.
 * Reclaims stuck RUNNING rows first, then claims PENDING with `runAfter <= now`.
 */
export async function processBackgroundJobs(
  options: ProcessBackgroundJobsOptions = {}
): Promise<ProcessBackgroundJobsResult> {
  const reclaimedStuck = await reclaimStuckRunningJobs();
  if (reclaimedStuck > 0) {
    console.warn(
      `[background-jobs] Reclaimed ${reclaimedStuck} stuck RUNNING job(s)`
    );
  }

  const claimed = await claimPendingBackgroundJobs(options);
  let succeeded = 0;
  let failed = 0;

  for (const job of claimed) {
    try {
      await executeBackgroundJob(job);
      await markJobSucceeded(job.id);
      succeeded += 1;
    } catch (error) {
      const outcome = await markJobFailure(job, error);
      if (outcome === 'failed') {
        failed += 1;
      }
      console.error(
        `Background job ${job.id} (${job.type}) failed on attempt ${job.attempts}:`,
        error
      );
    }
  }

  return {
    claimed: claimed.length,
    succeeded,
    failed,
    jobIds: claimed.map((job) => job.id),
    reclaimedStuck,
  };
}
