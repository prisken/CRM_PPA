/**
 * Pure workspace navigation config + helper tests.
 *
 * Run: npm run test:workspace-nav
 */
import {
  buildAdminDashboardNav,
  buildStandardDashboardNav,
  buildWorkspaceNavConfig,
  listWorkspaceNavItemIds,
  parseAdminDashboardView,
  parseStandardDashboardView,
  adminDashboardHref,
  standardDashboardHref,
  WORKSPACE_NAV_ITEM_IDS,
} from '../src/components/layout/workspaceNavConfig';
import {
  filterNavConfigForRole,
  isWorkspaceHomeViewParam,
  isWorkspaceNavItemActive,
} from '../src/components/layout/workspaceNavUtils';

function record(name: string, ok: boolean, detail: string) {
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}: ${detail}`);
  if (!ok) {
    throw new Error(`${name}: ${detail}`);
  }
}

function includesAll(ids: string[], expected: string[]) {
  return expected.every((id) => ids.includes(id));
}

function excludesAll(ids: string[], unexpected: string[]) {
  return unexpected.every((id) => !ids.includes(id));
}

function main() {
  console.log('Workspace navigation config tests\n');

  const standardIds = listWorkspaceNavItemIds(buildStandardDashboardNav());
  record(
    'standard nav includes core workspace modules',
    includesAll(standardIds, [
      WORKSPACE_NAV_ITEM_IDS.STANDARD_HOME,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_CLIENTS,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_TASKS,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_ACTIVITY,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_CALENDAR,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_DEALS,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_COMMISSION,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_SETTINGS,
    ]),
    standardIds.join(', ')
  );
  record(
    'standard nav omits returnables by default',
    excludesAll(standardIds, [WORKSPACE_NAV_ITEM_IDS.STANDARD_RETURNABLES]),
    standardIds.join(', ')
  );

  const standardWithReturnables = listWorkspaceNavItemIds(
    buildStandardDashboardNav({ showReturnableStatements: true })
  );
  record(
    'standard nav includes returnables when flagged',
    standardWithReturnables.includes(WORKSPACE_NAV_ITEM_IDS.STANDARD_RETURNABLES),
    standardWithReturnables.join(', ')
  );

  const standardUserNav = buildWorkspaceNavConfig({
    shell: 'standard',
    role: 'STANDARD_USER',
  });
  const standardUserIds = listWorkspaceNavItemIds(standardUserNav);
  record(
    'STANDARD_USER standard shell gets standard sections',
    includesAll(standardUserIds, [
      WORKSPACE_NAV_ITEM_IDS.STANDARD_HOME,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_CLIENTS,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_TASKS,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_ACTIVITY,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_CALENDAR,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_DEALS,
      WORKSPACE_NAV_ITEM_IDS.STANDARD_COMMISSION,
    ]),
    standardUserIds.join(', ')
  );
  record(
    'STANDARD_USER standard shell has no admin link',
    excludesAll(standardUserIds, [
      WORKSPACE_NAV_ITEM_IDS.STANDARD_ADMIN_LINK,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_LEADS,
    ]),
    standardUserIds.join(', ')
  );

  const superAdminStandardNav = buildWorkspaceNavConfig({
    shell: 'standard',
    role: 'SUPER_ADMIN',
  });
  const superAdminStandardIds = listWorkspaceNavItemIds(superAdminStandardNav);
  record(
    'SUPER_ADMIN standard shell includes admin dashboard link',
    superAdminStandardIds.includes(WORKSPACE_NAV_ITEM_IDS.STANDARD_ADMIN_LINK),
    superAdminStandardIds.join(', ')
  );

  const filteredAdminLink = filterNavConfigForRole(
    superAdminStandardNav,
    'STANDARD_USER'
  );
  record(
    'role filter hides super-admin-only admin link',
    !listWorkspaceNavItemIds(filteredAdminLink).includes(
      WORKSPACE_NAV_ITEM_IDS.STANDARD_ADMIN_LINK
    ),
    listWorkspaceNavItemIds(filteredAdminLink).join(', ')
  );

  const adminIds = listWorkspaceNavItemIds(buildAdminDashboardNav());
  record(
    'admin nav includes workspace + tools sections',
    includesAll(adminIds, [
      WORKSPACE_NAV_ITEM_IDS.ADMIN_HOME,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_PIPELINE,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_CALENDAR,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_ACTIVITY,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_ANALYTICS,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_REVENUE,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_LEADERBOARDS,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_LEADS,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_USERS,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_RECONCILIATION,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_USER_DASHBOARD,
      WORKSPACE_NAV_ITEM_IDS.ADMIN_SETTINGS,
    ]),
    adminIds.join(', ')
  );

  const superAdminAdminNav = buildWorkspaceNavConfig({
    shell: 'admin',
    role: 'SUPER_ADMIN',
  });
  record(
    'SUPER_ADMIN admin shell matches admin dashboard nav',
    listWorkspaceNavItemIds(superAdminAdminNav).join(',') === adminIds.join(','),
    listWorkspaceNavItemIds(superAdminAdminNav).join(', ')
  );

  const standardUserAdminShell = buildWorkspaceNavConfig({
    shell: 'admin',
    role: 'STANDARD_USER',
  });
  record(
    'STANDARD_USER admin shell is empty',
    standardUserAdminShell.sections.length === 0,
    `sections=${standardUserAdminShell.sections.length}`
  );

  record(
    'parseStandardDashboardView defaults to home',
    parseStandardDashboardView(null) === 'home' &&
      parseStandardDashboardView('tasks') === 'tasks' &&
      parseStandardDashboardView('nope') === 'home',
    'home/tasks/fallback'
  );

  record(
    'parseAdminDashboardView defaults to home',
    parseAdminDashboardView(null) === 'home' &&
      parseAdminDashboardView('pipeline') === 'pipeline' &&
      parseAdminDashboardView('nope') === 'home',
    'home/pipeline/fallback'
  );

  record(
    'standardDashboardHref builds view links',
    standardDashboardHref('home') === '/dashboard' &&
      standardDashboardHref('tasks') === '/dashboard?view=tasks',
    'href builder'
  );

  record(
    'adminDashboardHref builds view links',
    adminDashboardHref('home') === '/admin' &&
      adminDashboardHref('pipeline') === '/admin?view=pipeline',
    'admin href builder'
  );

  record(
    'home view param treats missing and home as home',
    isWorkspaceHomeViewParam(null) &&
      isWorkspaceHomeViewParam('') &&
      isWorkspaceHomeViewParam('home') &&
      !isWorkspaceHomeViewParam('tasks'),
    'home param helper'
  );

  record(
    'active match respects dashboard home without view',
    isWorkspaceNavItemActive('/dashboard', { href: '/dashboard', exact: true }, '') &&
      isWorkspaceNavItemActive(
        '/dashboard',
        { href: '/dashboard', exact: true },
        'view=home'
      ) &&
      !isWorkspaceNavItemActive(
        '/dashboard',
        { href: '/dashboard', exact: true },
        'view=tasks'
      ) &&
      !isWorkspaceNavItemActive('/dashboard/settings', {
        href: '/dashboard',
        exact: true,
      }),
    '/dashboard exact + view'
  );

  record(
    'active match highlights dashboard view query',
    isWorkspaceNavItemActive(
      '/dashboard',
      { href: '/dashboard?view=tasks', exact: true },
      'view=tasks'
    ) &&
      !isWorkspaceNavItemActive(
        '/dashboard',
        { href: '/dashboard?view=tasks', exact: true },
        'view=clients'
      ),
    '?view=tasks'
  );

  record(
    'active match treats admin ?view=home as home',
    isWorkspaceNavItemActive('/admin', { href: '/admin', exact: true }, 'view=home') &&
      isWorkspaceNavItemActive(
        '/admin',
        { href: '/admin?view=home', exact: true },
        ''
      ),
    '/admin?view=home'
  );

  record(
    'active match highlights admin pipeline view',
    isWorkspaceNavItemActive(
      '/admin',
      { href: '/admin?view=pipeline', exact: true },
      'view=pipeline'
    ),
    '?view=pipeline'
  );

  record(
    'active match includes admin sub-routes',
    isWorkspaceNavItemActive('/admin/leads', { href: '/admin/leads' }),
    '/admin/leads'
  );

  record(
    'active match does not highlight admin root on child paths',
    !isWorkspaceNavItemActive('/admin/leads', { href: '/admin', exact: true }),
    '/admin exact vs /admin/leads'
  );

  console.log('\nAll workspace navigation tests passed.');
}

main();
