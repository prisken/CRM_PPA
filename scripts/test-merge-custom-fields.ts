/**
 * Smoke test for mergeMultipleClients custom field overrides.
 * Creates temporary clients on the dev DB, merges them, asserts outcomes,
 * and leaves archived records in place for audit.
 *
 * Run: npm run test:merge-custom-fields
 * Or:  npx tsx scripts/test-merge-custom-fields.ts
 */
import {
  ActivityLogType,
  ClientStatus,
  InteractionType,
  LeadSourceType,
  UserRole,
} from '@prisma/client';
import { mergeMultipleClients } from '../lib/clientMerge';
import { prisma } from '../lib/prisma';

type TestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: TestResult[] = [];
const runId = Date.now();

const finalName = `TEST MERGED FINAL ${runId}`;
const finalEmail = `merged-${runId}@example.com`;
const finalCompany = 'Merged Company';
const finalPhone = '5551234567';
const finalPriority = 'HIGH';
const finalNextAction = 'Call merged lead';

let clientAId: string | null = null;
let clientBId: string | null = null;
let clientCId: string | null = null;
let tagId: string | null = null;

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

function assertEqual<T>(actual: T, expected: T) {
  return actual === expected;
}

async function main() {
  console.log(`Merge custom fields smoke test @ ${new Date().toISOString()}`);
  console.log(`Run ID: ${runId}\n`);

  const merger = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN },
    select: { id: true, email: true },
  });

  if (!merger) {
    throw new Error('No SUPER_ADMIN user found. Create one before running this test.');
  }

  console.log(`Using merger user: ${merger.email ?? merger.id}\n`);

  const [clientA, clientB, clientC] = await Promise.all([
    prisma.client.create({
      data: {
        name: `TEST MERGE A ${runId}`,
        email: `test-merge-a-${runId}@example.test`,
        company: 'Company A',
        phone: '5550000001',
        status: ClientStatus.NEW_LEAD,
      },
    }),
    prisma.client.create({
      data: {
        name: `TEST MERGE B ${runId}`,
        email: `test-merge-b-${runId}@example.test`,
        company: 'Company B',
        phone: '5550000002',
        status: ClientStatus.NEW_LEAD,
      },
    }),
    prisma.client.create({
      data: {
        name: `TEST MERGE C ${runId}`,
        email: `test-merge-c-${runId}@example.test`,
        company: 'Company C',
        phone: '5550000003',
        status: ClientStatus.NEW_LEAD,
      },
    }),
  ]);

  clientAId = clientA.id;
  clientBId = clientB.id;
  clientCId = clientC.id;

  console.log('Created test clients:');
  console.log(`  A (canonical): ${clientAId}`);
  console.log(`  B (duplicate): ${clientBId}`);
  console.log(`  C (duplicate): ${clientCId}\n`);

  const tag = await prisma.tag.upsert({
    where: { name: `test-merge-tag-${runId}` },
    update: {},
    create: {
      name: `test-merge-tag-${runId}`,
      color: '#94a3b8',
    },
  });
  tagId = tag.id;

  await prisma.clientTag.createMany({
    data: [
      { clientId: clientB.id, tagId: tag.id },
      { clientId: clientC.id, tagId: tag.id },
    ],
  });

  const [interactionA, interactionB, interactionC] = await Promise.all([
    prisma.interaction.create({
      data: {
        clientId: clientA.id,
        userId: merger.id,
        type: InteractionType.NOTE,
        content: `TEST MERGE interaction A ${runId}`,
      },
    }),
    prisma.interaction.create({
      data: {
        clientId: clientB.id,
        userId: merger.id,
        type: InteractionType.CALL,
        content: `TEST MERGE interaction B ${runId}`,
      },
    }),
    prisma.interaction.create({
      data: {
        clientId: clientC.id,
        userId: merger.id,
        type: InteractionType.EMAIL,
        content: `TEST MERGE interaction C ${runId}`,
      },
    }),
  ]);

  const [activityA, activityB, activityC] = await Promise.all([
    prisma.clientActivityLog.create({
      data: {
        clientId: clientA.id,
        userId: merger.id,
        type: ActivityLogType.NOTE,
        content: `TEST MERGE activity A ${runId}`,
      },
    }),
    prisma.clientActivityLog.create({
      data: {
        clientId: clientB.id,
        userId: merger.id,
        type: ActivityLogType.NOTE,
        content: `TEST MERGE activity B ${runId}`,
      },
    }),
    prisma.clientActivityLog.create({
      data: {
        clientId: clientC.id,
        userId: merger.id,
        type: ActivityLogType.NOTE,
        content: `TEST MERGE activity C ${runId}`,
      },
    }),
  ]);

  const [sourceB, sourceC] = await Promise.all([
    prisma.clientSourceRecord.create({
      data: {
        clientId: clientB.id,
        source: LeadSourceType.GOOGLE_FORMS,
        externalId: `test-merge-b-${runId}`,
        normalizedEmail: clientB.email?.toLowerCase() ?? null,
        payload: { test: true, client: 'B', runId },
      },
    }),
    prisma.clientSourceRecord.create({
      data: {
        clientId: clientC.id,
        source: LeadSourceType.PROFIT_PULSE_ALLY,
        externalId: `test-merge-c-${runId}`,
        normalizedEmail: clientC.email?.toLowerCase() ?? null,
        payload: { test: true, client: 'C', runId },
      },
    }),
  ]);

  record(
    'Test fixtures created',
    true,
    `clients=3, interactions=3, activityLogs=3, sourceRecords=2, tags=2`
  );

  const mergeResult = await mergeMultipleClients({
    canonicalClientId: clientA.id,
    duplicateClientIds: [clientB.id, clientC.id],
    mergedByUserId: merger.id,
    fieldOverrides: {
      name: finalName,
      company: finalCompany,
      email: finalEmail,
      phone: finalPhone,
      priority: finalPriority,
      next_action: finalNextAction,
    },
    reason: `Smoke test merge custom fields ${runId}`,
  });

  record(
    'mergeMultipleClients returns ok',
    mergeResult.ok === true,
    `merged=${mergeResult.mergedClientIds.length}, audits=${mergeResult.auditIds.length}`
  );

  record(
    'Merged duplicate ids match B and C',
    mergeResult.mergedClientIds.includes(clientB.id) &&
      mergeResult.mergedClientIds.includes(clientC.id),
    `mergedClientIds=${mergeResult.mergedClientIds.join(', ')}`
  );

  record(
    'Two merge audits written',
    mergeResult.auditIds.length === 2,
    `auditIds=${mergeResult.auditIds.join(', ')}`
  );

  const canonical = await prisma.client.findUniqueOrThrow({
    where: { id: clientA.id },
  });

  record(
    'Canonical name override applied',
    assertEqual(canonical.name, finalName),
    `expected="${finalName}", actual="${canonical.name}"`
  );
  record(
    'Canonical company override applied',
    assertEqual(canonical.company, finalCompany),
    `expected="${finalCompany}", actual="${canonical.company ?? 'null'}"`
  );
  record(
    'Canonical email override applied',
    assertEqual(canonical.email, finalEmail),
    `expected="${finalEmail}", actual="${canonical.email ?? 'null'}"`
  );
  record(
    'Canonical phone override applied',
    assertEqual(canonical.phone, finalPhone),
    `expected="${finalPhone}", actual="${canonical.phone ?? 'null'}"`
  );
  record(
    'Canonical priority override applied',
    assertEqual(canonical.priority, finalPriority),
    `expected="${finalPriority}", actual="${canonical.priority ?? 'null'}"`
  );
  record(
    'Canonical next_action override applied',
    assertEqual(canonical.nextAction, finalNextAction),
    `expected="${finalNextAction}", actual="${canonical.nextAction ?? 'null'}"`
  );

  const [archivedB, archivedC] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: clientB.id } }),
    prisma.client.findUniqueOrThrow({ where: { id: clientC.id } }),
  ]);

  record(
    'Client B archived',
    archivedB.status === ClientStatus.ARCHIVED,
    `status=${archivedB.status}`
  );
  record(
    'Client C archived',
    archivedC.status === ClientStatus.ARCHIVED,
    `status=${archivedC.status}`
  );

  const canonicalInteractions = await prisma.interaction.findMany({
    where: { clientId: clientA.id },
    select: { id: true },
  });
  record(
    'Interactions moved to canonical',
    canonicalInteractions.length === 3 &&
      canonicalInteractions.some((row) => row.id === interactionA.id) &&
      canonicalInteractions.some((row) => row.id === interactionB.id) &&
      canonicalInteractions.some((row) => row.id === interactionC.id),
    `canonicalInteractionCount=${canonicalInteractions.length}`
  );

  const duplicateInteractionCount = await prisma.interaction.count({
    where: { clientId: { in: [clientB.id, clientC.id] } },
  });
  record(
    'No interactions remain on archived duplicates',
    duplicateInteractionCount === 0,
    `duplicateInteractionCount=${duplicateInteractionCount}`
  );

  const canonicalActivityLogs = await prisma.clientActivityLog.findMany({
    where: { clientId: clientA.id },
    select: { id: true },
  });
  record(
    'Activity logs moved to canonical',
    canonicalActivityLogs.length >= 3 &&
      canonicalActivityLogs.some((row) => row.id === activityA.id) &&
      canonicalActivityLogs.some((row) => row.id === activityB.id) &&
      canonicalActivityLogs.some((row) => row.id === activityC.id),
    `canonicalActivityLogCount=${canonicalActivityLogs.length}`
  );

  const duplicateActivityCount = await prisma.clientActivityLog.count({
    where: { clientId: { in: [clientB.id, clientC.id] } },
  });
  record(
    'No activity logs remain on archived duplicates',
    duplicateActivityCount === 0,
    `duplicateActivityLogCount=${duplicateActivityCount}`
  );

  const canonicalSourceRecords = await prisma.clientSourceRecord.findMany({
    where: { clientId: clientA.id },
    select: { id: true, externalId: true },
  });
  record(
    'Source records moved to canonical',
    canonicalSourceRecords.length === 2 &&
      canonicalSourceRecords.some((row) => row.id === sourceB.id) &&
      canonicalSourceRecords.some((row) => row.id === sourceC.id),
    `canonicalSourceRecordCount=${canonicalSourceRecords.length}`
  );

  const duplicateSourceCount = await prisma.clientSourceRecord.count({
    where: { clientId: { in: [clientB.id, clientC.id] } },
  });
  record(
    'No source records remain on archived duplicates',
    duplicateSourceCount === 0,
    `duplicateSourceRecordCount=${duplicateSourceCount}`
  );

  const canonicalTagCount = await prisma.clientTag.count({
    where: { clientId: clientA.id },
  });
  const archivedTagCounts = await prisma.clientTag.groupBy({
    by: ['clientId'],
    where: { clientId: { in: [clientB.id, clientC.id] } },
    _count: { _all: true },
  });
  record(
    'Tags remain on archived clients (current merge behavior)',
    canonicalTagCount === 0 && archivedTagCounts.length === 2,
    `canonicalTags=${canonicalTagCount}, archivedTagGroups=${archivedTagCounts.length}`
  );

  const overrideFieldChanges = Object.entries(mergeResult.fieldChanges).filter(
    ([, change]) => change.winner === 'override'
  );
  record(
    'Merge summary records override field changes',
    overrideFieldChanges.length >= 6,
    `overrideFieldCount=${overrideFieldChanges.length}`
  );

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  console.log('\nLeft in database for audit:');
  console.log(`  Canonical (active): ${clientAId}`);
  console.log(`  Archived B: ${clientBId}`);
  console.log(`  Archived C: ${clientCId}`);
  console.log(`  Tag: ${tagId}`);

  if (failed > 0) {
    process.exitCode = 1;
    return;
  }

  console.log('\nPASS');
}

main()
  .catch((error) => {
    console.error('Merge custom fields smoke test failed.');
    console.error(error);
    if (clientAId || clientBId || clientCId) {
      console.error('\nPartial test data may remain:');
      console.error(`  A: ${clientAId}`);
      console.error(`  B: ${clientBId}`);
      console.error(`  C: ${clientCId}`);
      console.error(`  Tag: ${tagId}`);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
