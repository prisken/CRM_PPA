/**
 * Phase 2M — Client 360 load-guard contract tests (source-records deferral + SectionCard).
 *
 * Run: npm run test:client360-load-guards
 * Or:  npx tsx scripts/test-client360-load-guards.ts
 */
import {
  applySourceRecordsCollapsedChange,
  countClient360SourceRecordsFetches,
  nextSectionCardCollapsedState,
  shouldFetchClient360SourceRecords,
} from '../lib/client360LoadGuards';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function record(name: string, ok: boolean, detail: string) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}: ${detail}`);
  if (!ok) {
    throw new Error(`${name}: ${detail}`);
  }
}

function main() {
  console.log('Client 360 load-guard contract tests\n');

  record(
    'collapsed mount does not fetch',
    !shouldFetchClient360SourceRecords({ hasExpanded: false }),
    'hasExpanded=false → no fetch'
  );

  record(
    'expanded does fetch',
    shouldFetchClient360SourceRecords({ hasExpanded: true }),
    'hasExpanded=true → fetch'
  );

  record(
    'expand sets hasExpanded permanently',
    applySourceRecordsCollapsedChange({
      collapsed: false,
      hasExpanded: false,
    }).hasExpanded === true,
    'first expand → hasExpanded=true'
  );

  record(
    'collapse keeps hasExpanded',
    applySourceRecordsCollapsedChange({
      collapsed: true,
      hasExpanded: true,
    }).hasExpanded === true,
    'collapse does not reset hasExpanded'
  );

  const mountOnly = countClient360SourceRecordsFetches([{ type: 'mount' }]);
  record(
    'default collapsed state does not fetch on mount',
    mountOnly === 0,
    `fetches=${mountOnly}`
  );

  const firstExpand = countClient360SourceRecordsFetches([
    { type: 'mount' },
    { type: 'expand' },
  ]);
  record(
    'first expand triggers exactly one fetch',
    firstExpand === 1,
    `fetches=${firstExpand}`
  );

  const collapseReexpand = countClient360SourceRecordsFetches([
    { type: 'mount' },
    { type: 'expand' },
    { type: 'collapse' },
    { type: 'reexpand' },
  ]);
  record(
    'collapse/re-expand does not duplicate fetch',
    collapseReexpand === 1,
    `fetches=${collapseReexpand}`
  );

  const sliceAfterExpand = countClient360SourceRecordsFetches([
    { type: 'mount' },
    { type: 'expand' },
    { type: 'sliceBump' },
  ]);
  record(
    'sourceRecords slice bump after expand refetches',
    sliceAfterExpand === 2,
    `fetches=${sliceAfterExpand}`
  );

  const sliceWhileCollapsed = countClient360SourceRecordsFetches([
    { type: 'mount' },
    { type: 'sliceBump' },
    { type: 'expand' },
  ]);
  record(
    'slice bump while collapsed does not fetch until expand',
    sliceWhileCollapsed === 1,
    `fetches=${sliceWhileCollapsed}`
  );

  const expandToggle = nextSectionCardCollapsedState(true);
  record(
    'SectionCard expand notifies collapsed=false',
    expandToggle.collapsed === false &&
      expandToggle.notifiedCollapsed === false,
    `collapsed=${expandToggle.collapsed}`
  );

  const collapseToggle = nextSectionCardCollapsedState(false);
  record(
    'SectionCard collapse notifies collapsed=true',
    collapseToggle.collapsed === true &&
      collapseToggle.notifiedCollapsed === true,
    `collapsed=${collapseToggle.collapsed}`
  );

  console.log('\nPASS');
}

main();
