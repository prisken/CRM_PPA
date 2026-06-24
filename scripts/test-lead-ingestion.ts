/**
 * Integration tests for ingestExternalLead (direct function call, no webhooks).
 *
 * Run: npx tsx scripts/test-lead-ingestion.ts
 */
import { LeadSourceType } from '@prisma/client';
import { ingestExternalLead } from '../lib/leadIngestion';
import { prisma } from '../lib/prisma';

type TestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: TestResult[] = [];
const runId = Date.now();
const testEmail = `lead-ingestion-test-${runId}@example.test`;
const testMemberId = `test-member-${runId}`;
const testSubmissionId = `test-submission-${runId}`;

let testClientId: string | null = null;

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

async function countClientsByEmail(email: string) {
  return prisma.client.count({
    where: {
      email: {
        equals: email,
        mode: 'insensitive',
      },
    },
  });
}

async function countSourceRecords(clientId: string) {
  return prisma.clientSourceRecord.count({
    where: { clientId },
  });
}

async function getSourceRecords(clientId: string) {
  return prisma.clientSourceRecord.findMany({
    where: { clientId },
    select: {
      id: true,
      source: true,
      externalId: true,
      normalizedEmail: true,
    },
    orderBy: { receivedAt: 'asc' },
  });
}

async function cleanup() {
  if (!testClientId) {
    return;
  }

  try {
    await prisma.client.delete({
      where: { id: testClientId },
    });
    console.log(`\nCleaned up test client ${testClientId}`);
  } catch (error) {
    console.error(`\nCleanup warning: failed to delete test client ${testClientId}`);
    console.error(error);
  }
}

async function main() {
  console.log(`Lead ingestion integration tests @ ${new Date().toISOString()}`);
  console.log(`Test email: ${testEmail}`);
  console.log(`Test member ID: ${testMemberId}\n`);

  const googleResult = await ingestExternalLead({
    source: LeadSourceType.GOOGLE_FORMS,
    externalId: testSubmissionId,
    payload: {
      name: 'Lead Ingestion Test',
      email: testEmail,
      submissionId: testSubmissionId,
      company: 'Test Co',
    },
    defaultLeadSource: 'Google Form',
    lead: {
      name: 'Lead Ingestion Test',
      email: testEmail,
      company: 'Test Co',
      leadSource: 'Google Form',
    },
  });

  testClientId = googleResult.clientId;

  record(
    'Google Forms ingest creates client',
    googleResult.action === 'created' && googleResult.matchedBy === 'none',
    `action=${googleResult.action}, matchedBy=${googleResult.matchedBy}, clientId=${googleResult.clientId}`
  );

  const afterGoogleClientCount = await countClientsByEmail(testEmail);
  record(
    'Single client exists after Google Forms ingest',
    afterGoogleClientCount === 1,
    `clientCount=${afterGoogleClientCount}`
  );

  const afterGoogleSourceCount = await countSourceRecords(googleResult.clientId);
  const googleSourceRecords = await getSourceRecords(googleResult.clientId);
  record(
    'Google Forms ingest creates ClientSourceRecord',
    afterGoogleSourceCount === 1 &&
      googleSourceRecords[0]?.source === LeadSourceType.GOOGLE_FORMS &&
      googleSourceRecords[0]?.externalId === testSubmissionId,
    `sourceRecordCount=${afterGoogleSourceCount}, source=${googleSourceRecords[0]?.source ?? 'none'}`
  );

  const ppaResult = await ingestExternalLead({
    source: LeadSourceType.PROFIT_PULSE_ALLY,
    externalId: testMemberId,
    payload: {
      email: testEmail,
      name: 'Lead Ingestion Test Updated',
      memberId: testMemberId,
      provider: 'google',
    },
    defaultLeadSource: 'Profit Pulse Ally Member Signup',
    lead: {
      name: 'Lead Ingestion Test Updated',
      email: testEmail,
      leadSource: 'Profit Pulse Ally Member Signup',
      contactInfo: `Member ID: ${testMemberId}\nProvider: google`,
    },
  });

  record(
    'Profit Pulse Ally ingest updates same client by email',
    ppaResult.action === 'updated' &&
      ppaResult.matchedBy === 'email' &&
      ppaResult.clientId === googleResult.clientId,
    `action=${ppaResult.action}, matchedBy=${ppaResult.matchedBy}, clientId=${ppaResult.clientId}`
  );

  const afterPpaClientCount = await countClientsByEmail(testEmail);
  record(
    'No duplicate client after Profit Pulse Ally ingest',
    afterPpaClientCount === 1,
    `clientCount=${afterPpaClientCount}`
  );

  const afterPpaSourceCount = await countSourceRecords(ppaResult.clientId);
  const afterPpaSourceRecords = await getSourceRecords(ppaResult.clientId);
  record(
    'Profit Pulse Ally ingest adds second ClientSourceRecord',
    afterPpaSourceCount === 2 &&
      afterPpaSourceRecords.some(
        (record) =>
          record.source === LeadSourceType.PROFIT_PULSE_ALLY &&
          record.externalId === testMemberId
      ),
    `sourceRecordCount=${afterPpaSourceCount}`
  );

  const ppaRepeatResult = await ingestExternalLead({
    source: LeadSourceType.PROFIT_PULSE_ALLY,
    externalId: testMemberId,
    payload: {
      email: testEmail,
      name: 'Lead Ingestion Test Updated Again',
      memberId: testMemberId,
      provider: 'google',
      signedUpAt: new Date().toISOString(),
    },
    defaultLeadSource: 'Profit Pulse Ally Member Signup',
    lead: {
      name: 'Lead Ingestion Test Updated Again',
      email: testEmail,
      leadSource: 'Profit Pulse Ally Member Signup',
    },
  });

  record(
    'Repeat Profit Pulse Ally externalId updates same client',
    ppaRepeatResult.action === 'updated' &&
      ppaRepeatResult.matchedBy === 'source_external_id' &&
      ppaRepeatResult.clientId === googleResult.clientId,
    `action=${ppaRepeatResult.action}, matchedBy=${ppaRepeatResult.matchedBy}, clientId=${ppaRepeatResult.clientId}`
  );

  const afterRepeatSourceCount = await countSourceRecords(ppaRepeatResult.clientId);
  const afterRepeatSourceRecords = await getSourceRecords(ppaRepeatResult.clientId);
  record(
    'Repeat externalId does not create duplicate ClientSourceRecord',
    afterRepeatSourceCount === 2 &&
      afterRepeatSourceRecords.filter(
        (record) =>
          record.source === LeadSourceType.PROFIT_PULSE_ALLY &&
          record.externalId === testMemberId
      ).length === 1,
    `sourceRecordCount=${afterRepeatSourceCount}`
  );

  record(
    'Final source record count for client',
    afterRepeatSourceCount === 2,
    `expected=2, actual=${afterRepeatSourceCount}`
  );

  const passed = results.filter((result) => result.ok).length;
  const failed = results.length - passed;

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('Lead ingestion test run failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
