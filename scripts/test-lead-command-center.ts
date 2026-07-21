/**
 * Smoke test for fetchLeadCommandCenterRows / page / preview (direct lib call, no HTTP auth).
 * Read-only — does not modify the database.
 *
 * Run: npx tsx scripts/test-lead-command-center.ts
 */
import {
  decideLeadCommandCenterSqlPagination,
  fetchLeadCommandCenterPage,
  fetchLeadCommandCenterPreview,
  fetchLeadCommandCenterRows,
  LEAD_COMMAND_CENTER_DEFAULT_LIMIT,
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

  const defaultRows = await fetchLeadCommandCenterRows({
    limit: LEAD_COMMAND_CENTER_DEFAULT_LIMIT,
  });

  console.log(`${'='.repeat(72)}`);
  console.log(`Default fetch (limit ${LEAD_COMMAND_CENTER_DEFAULT_LIMIT})`);
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

  const page = await fetchLeadCommandCenterPage({
    limit: 10,
    offset: 0,
  });
  console.log(`\n${'='.repeat(72)}`);
  console.log('Page meta (limit 10, offset 0)');
  console.log('='.repeat(72));
  console.log(page.meta);
  if (page.meta.count !== page.leads.length) {
    throw new Error('meta.count does not match leads.length');
  }
  if (page.meta.hasMore !== page.meta.offset + page.meta.count < page.meta.total) {
    throw new Error('meta.hasMore is inconsistent with total/offset/count');
  }

  const sqlDecision = decideLeadCommandCenterSqlPagination({ limit: 10, offset: 0 });
  if (sqlDecision.dbPaginated) {
    if (page.meta.dbPaginated !== true) {
      throw new Error('Expected dbPaginated=true for default Prisma-native filters');
    }
    if (page.meta.sortMode !== 'lastModified') {
      throw new Error('Expected sortMode=lastModified on DB-paginated path');
    }
    if (page.meta.fallbackReason) {
      throw new Error('DB-paginated path should not set fallbackReason');
    }
  } else if (page.meta.dbPaginated !== false) {
    throw new Error(
      `Expected dbPaginated=false when SQL pagination disabled (${sqlDecision.fallbackReason})`
    );
  }

  if (page.meta.hasMore) {
    const page2 = await fetchLeadCommandCenterPage({
      limit: 10,
      offset: 10,
    });
    console.log('Page 2 meta:', page2.meta);
    if (
      page2.leads[0] &&
      page.leads[0] &&
      page2.leads[0].clientId === page.leads[0].clientId
    ) {
      throw new Error('Offset pagination returned overlapping first rows');
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
      sourcesHasMore: preview.sourcesHasMore,
      tagsReturned: preview.tags.length,
      lastActivitySummary: preview.lastActivitySummary,
      roleInCompany: preview.roleInCompany,
      duplicateWarnings: preview.duplicateWarnings,
    });

    if (!Array.isArray(preview.duplicateWarnings)) {
      throw new Error('Preview missing duplicateWarnings array');
    }
    if (typeof preview.sourcesHasMore !== 'boolean') {
      throw new Error('Preview missing sourcesHasMore boolean');
    }
    if (preview.sources.length > 20) {
      throw new Error(
        `Preview returned ${preview.sources.length} sources (cap is 20)`
      );
    }
    const expectedHasMore =
      preview.sourceRecordCount > preview.sources.length;
    if (preview.sourcesHasMore !== expectedHasMore) {
      throw new Error(
        `sourcesHasMore=${preview.sourcesHasMore} inconsistent with count=${preview.sourceRecordCount} returned=${preview.sources.length}`
      );
    }
  }

  const filterCases = [
    { title: 'needsAttention=true', filters: { needsAttention: true, limit: 10 } },
    { title: 'missingPhone=true', filters: { missingPhone: true, limit: 10 } },
    { title: 'duplicateEmail=true', filters: { duplicateEmail: true, limit: 10 } },
    { title: 'duplicatePhone=true', filters: { duplicatePhone: true, limit: 10 } },
  ] as const;

  for (const testCase of filterCases) {
    const pageResult = await fetchLeadCommandCenterPage(testCase.filters);
    const rows = pageResult.leads;
    printSection(testCase.title, rows);
    console.log('meta:', {
      dbPaginated: pageResult.meta.dbPaginated,
      fallbackReason: pageResult.meta.fallbackReason,
      sortMode: pageResult.meta.sortMode,
      total: pageResult.meta.total,
    });

    if (testCase.title.startsWith('needsAttention')) {
      if (pageResult.meta.dbPaginated !== false) {
        throw new Error('needsAttention must use in-memory fallback');
      }
      if (!pageResult.meta.fallbackReason?.includes('needsAttention')) {
        throw new Error(
          `Unexpected fallbackReason for needsAttention: ${pageResult.meta.fallbackReason}`
        );
      }
      for (const row of rows) {
        if (row.attentionScore <= 0) {
          throw new Error(
            `needsAttention filter returned ${row.clientId} with attentionScore ${row.attentionScore}`
          );
        }
      }
    }

    if (testCase.title.startsWith('missingPhone')) {
      if (
        pageResult.meta.dbPaginated !== true &&
        process.env.LCC_SQL_PAGINATION !== 'false'
      ) {
        throw new Error('missingPhone should use DB pagination when SQL path enabled');
      }
    }

    if (testCase.title.startsWith('duplicateEmail')) {
      if (pageResult.meta.dbPaginated !== false) {
        throw new Error('duplicateEmail must use in-memory fallback');
      }
      for (const row of rows) {
        if (!row.duplicateWarnings.includes('Duplicate email')) {
          throw new Error(
            `duplicateEmail filter returned ${row.clientId} without Duplicate email warning`
          );
        }
      }
    }

    if (testCase.title.startsWith('duplicatePhone')) {
      if (pageResult.meta.dbPaginated !== false) {
        throw new Error('duplicatePhone must use in-memory fallback');
      }
      for (const row of rows) {
        if (!row.duplicateWarnings.includes('Duplicate phone')) {
          throw new Error(
            `duplicatePhone filter returned ${row.clientId} without Duplicate phone warning`
          );
        }
      }
    }
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
