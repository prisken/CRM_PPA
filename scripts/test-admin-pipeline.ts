/**
 * Smoke test for fetchAdminPipelinePage (direct lib call, no HTTP auth).
 * Read-only — does not modify the database.
 *
 * Run: npx tsx scripts/test-admin-pipeline.ts
 */
import {
  ADMIN_PIPELINE_PER_STATUS_LIMIT,
  fetchAdminPipelinePage,
  type AdminPipelineClient,
} from '../lib/adminPipeline';
import { CLIENT_STAGES } from '../lib/clientStages';
import { prisma } from '../lib/prisma';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertCardShape(client: AdminPipelineClient) {
  assert(typeof client.client_id === 'string', 'client_id');
  assert(typeof client.name === 'string', 'name');
  assert(client.company === null || typeof client.company === 'string', 'company');
  assert(typeof client.status === 'string', 'status');
  assert(Array.isArray(client.assignedUsers), 'assignedUsers');
  for (const user of client.assignedUsers) {
    assert(typeof user.user_id === 'string', 'user_id');
    assert(typeof user.userName === 'string', 'userName');
  }
  assert(!('email' in client), 'card must not expose email');
  assert(!('createdAt' in client), 'card must not expose createdAt');
}

async function main() {
  console.log('Admin pipeline smoke test\n');

  const bounded = await fetchAdminPipelinePage({});
  console.log('Default bounded page', {
    returned: bounded.meta.returned,
    total: bounded.meta.total,
    hasMore: bounded.meta.hasMore,
    dbBounded: bounded.meta.dbBounded,
    perStatusLimit: bounded.meta.perStatusLimit,
    limitMode: bounded.meta.limitMode,
  });

  assert(bounded.meta.dbBounded === true, 'default path should be dbBounded');
  assert(bounded.meta.limitMode === 'perStatus', 'limitMode perStatus');
  assert(
    bounded.meta.perStatusLimit === ADMIN_PIPELINE_PER_STATUS_LIMIT,
    'default perStatusLimit'
  );
  assert(bounded.meta.returned === bounded.clients.length, 'returned matches array');
  assert(
    bounded.meta.returned <= bounded.meta.total,
    'returned should not exceed total'
  );
  assert(
    typeof bounded.meta.hasMore === 'boolean',
    'hasMore present'
  );

  for (const stage of CLIENT_STAGES) {
    assert(
      typeof bounded.meta.perStatusCounts[stage.value] === 'number',
      `perStatusCounts.${stage.value}`
    );
    const inColumn = bounded.clients.filter((c) => c.status === stage.value);
    assert(
      inColumn.length <= ADMIN_PIPELINE_PER_STATUS_LIMIT,
      `${stage.value} must respect per-status cap`
    );
  }

  for (const client of bounded.clients.slice(0, 5)) {
    assertCardShape(client);
  }

  const legacy = await fetchAdminPipelinePage({ mode: 'legacy' });
  console.log('Legacy unbounded page', {
    returned: legacy.meta.returned,
    total: legacy.meta.total,
    hasMore: legacy.meta.hasMore,
    dbBounded: legacy.meta.dbBounded,
    fallbackReason: legacy.meta.fallbackReason,
  });

  assert(legacy.meta.dbBounded === false, 'legacy should not be dbBounded');
  assert(legacy.meta.fallbackReason === 'mode=legacy', 'fallbackReason');
  assert(legacy.meta.hasMore === false, 'legacy hasMore false');
  assert(legacy.meta.perStatusLimit === null, 'legacy perStatusLimit null');
  assert(legacy.meta.returned === legacy.meta.total, 'legacy returns all matching');

  if (bounded.meta.hasMore) {
    assert(
      legacy.meta.returned > bounded.meta.returned,
      'legacy should return more than bounded when hasMore'
    );
  }

  const sampleStatus = CLIENT_STAGES.find(
    (stage) => (bounded.meta.perStatusCounts[stage.value] ?? 0) > 0
  )?.value;

  if (sampleStatus) {
    const filtered = await fetchAdminPipelinePage({ status: sampleStatus });
    assert(filtered.meta.statusFilter === sampleStatus, 'statusFilter echoed');
    assert(
      filtered.clients.every((c) => c.status === sampleStatus),
      'status filter applied'
    );
    console.log('Status filter ok', {
      status: sampleStatus,
      returned: filtered.meta.returned,
      total: filtered.meta.total,
    });
  }

  console.log('\nAdmin pipeline smoke test passed.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
