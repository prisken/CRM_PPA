/**
 * Phase 2N / 3D — workspace strategy-tasks contract: first-paint fields only,
 * legacy Strategy fallback only when strategyText is blank.
 *
 * Run: npx tsx scripts/test-client360-workspace-strategy-tasks.ts
 */
import {
  buildStrategyTasksWorkspace,
  client360StrategyTasksSelect,
  shouldFetchLegacyStrategyFallback,
} from '../lib/client360';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  console.log('Client 360 workspace strategy-tasks contract tests\n');

  const selectKeys = Object.keys(client360StrategyTasksSelect).sort();
  assert(
    selectKeys.join(',') === 'strategies,strategyText,tasks',
    `unexpected select keys: ${selectKeys.join(',')}`
  );
  console.log(
    '[PASS] strategy-tasks select is strategyText + strategies + tasks only'
  );

  const forbidden = [
    'deals',
    'clientAssignments',
    'interactions',
    'activityLogs',
    'documents',
    'contacts',
  ];
  for (const key of forbidden) {
    assert(
      !(key in client360StrategyTasksSelect),
      `select must not include ${key}`
    );
  }
  console.log(
    '[PASS] strategy-tasks select excludes deals/assignments/activity/documents'
  );

  const empty = buildStrategyTasksWorkspace({
    strategyText: null,
    strategies: [],
    tasks: [],
  });
  assert(empty.tab === 'strategy-tasks', 'tab key');
  assert(empty.strategyText === '', 'empty strategyText');
  assert(
    Array.isArray(empty.tasks) && empty.tasks.length === 0,
    'empty tasks'
  );
  assert(
    Object.keys(empty).sort().join(',') === 'strategyText,tab,tasks',
    `unexpected response keys: ${Object.keys(empty).join(',')}`
  );
  console.log('[PASS] workspace DTO keys are tab + strategyText + tasks');

  assert(
    shouldFetchLegacyStrategyFallback(null) === true,
    'null strategyText needs legacy'
  );
  assert(
    shouldFetchLegacyStrategyFallback('  ') === true,
    'blank strategyText needs legacy'
  );
  assert(
    shouldFetchLegacyStrategyFallback('Live plan') === false,
    'non-blank strategyText skips legacy'
  );
  console.log(
    '[PASS] legacy Strategy fetch short-circuits when strategyText set'
  );

  const withPrimary = buildStrategyTasksWorkspace({
    strategyText: 'Primary strategy text',
    strategies: [
      {
        description: 'Should be ignored',
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ],
    tasks: [],
  });
  assert(
    withPrimary.strategyText === 'Primary strategy text',
    'primary strategyText wins over legacy'
  );
  console.log('[PASS] primary strategyText preferred over legacy Strategy row');

  const withLegacy = buildStrategyTasksWorkspace({
    strategyText: '  ',
    strategies: [
      {
        description: 'Legacy from Strategy row',
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Follow up',
        description: 'Call client',
        status: 'PENDING',
        dueDate: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        assignee: { id: 'u1', name: 'Alex', email: 'alex@example.test' },
      },
    ],
  });
  assert(
    withLegacy.strategyText === 'Legacy from Strategy row',
    'legacy Strategy fallback when strategyText blank'
  );
  assert(withLegacy.tasks.length === 1, 'maps one task');
  assert(withLegacy.tasks[0].assignee?.user_id === 'u1', 'assignee user_id');
  assert(withLegacy.tasks[0].assignee?.name === 'Alex', 'assignee name');
  console.log('[PASS] legacy strategy fallback + task mapping for first paint');

  console.log('\nPASS');
}

main();
