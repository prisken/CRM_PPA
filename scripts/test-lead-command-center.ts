/**
 * Smoke test for fetchLeadCommandCenterRows / preview (direct lib call, no HTTP auth).
 * Read-only — does not modify the database.
 *
 * Run: npx tsx scripts/test-lead-command-center.ts
 */
import {
  fetchLeadCommandCenterPreview,
  fetchLeadCommandCenterRows,
  type LeadCommandCenterRow,
} from '../lib/leadCommandCenter';
import { prisma } from '../lib/prisma';

function printRowSummary(row: LeadCommandCenterRow) {
  console.log({
    clientId: row.clientId,
    name: row.name,
    status: row.status,
    sourceLabels: row.sourceLabels,
    attentionScore: row.attentionScore,
    attentionReasons: row.attentionReasons,
    dataQualityWarnings: row.dataQualityWarnings,
    duplicateWarnings: row.duplicateWarnings,
    hasSourcesField: 'sources' in row,
    hasTagsField: 'tags' in row,
    hasLastActivitySummary: 'lastActivitySummary' in row,
  });
}

function printSection(title: string, rows: LeadCommandCenterRow[]) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(title);
  console.log('='.repeat(72));
  console.log(`Rows returned: ${rows.length}`);
}

async function main() {
  console.log('Lead Command Center smoke test\n');

  const defaultRows = await fetchLeadCommandCenterRows({ limit: 10 });

  console.log(`${'='.repeat(72)}`);
  console.log('Default fetch (limit 10)');
  console.log('='.repeat(72));
  console.log(`Total rows returned: ${defaultRows.length}`);
  console.log('\nFirst 5 rows:');
  for (const row of defaultRows.slice(0, 5)) {
    printRowSummary(row);
    if ('sources' in row || 'tags' in row || 'lastActivitySummary' in row) {
      throw new Error(
        `Inbox row ${row.clientId} unexpectedly includes preview-only fields`
      );
    }
  }

  if (defaultRows[0]) {
    const preview = await fetchLeadCommandCenterPreview(defaultRows[0].clientId);
    if (!preview) {
      throw new Error(`Preview not found for ${defaultRows[0].clientId}`);
    }

    console.log(`\n${'='.repeat(72)}`);
    console.log('Preview fetch');
    console.log('='.repeat(72));
    console.log({
      clientId: preview.clientId,
      sourceRecordCount: preview.sourceRecordCount,
      sourcesReturned: preview.sources.length,
      tagsReturned: preview.tags.length,
      lastActivitySummary: preview.lastActivitySummary,
      roleInCompany: preview.roleInCompany,
    });
  }

  const filterCases = [
    { title: 'needsAttention=true', filters: { needsAttention: true, limit: 10 } },
    { title: 'missingPhone=true', filters: { missingPhone: true, limit: 10 } },
    { title: 'duplicateEmail=true', filters: { duplicateEmail: true, limit: 10 } },
    { title: 'duplicatePhone=true', filters: { duplicatePhone: true, limit: 10 } },
  ] as const;

  for (const testCase of filterCases) {
    const rows = await fetchLeadCommandCenterRows(testCase.filters);
    printSection(testCase.title, rows);
  }

  console.log(`\n${'='.repeat(72)}`);
  console.log('PASS');
  console.log('='.repeat(72));
}

main()
  .catch((error) => {
    console.error('Lead Command Center smoke test failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
