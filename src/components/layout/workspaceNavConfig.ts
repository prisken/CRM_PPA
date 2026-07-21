import type {
  WorkspaceNavConfig,
  WorkspaceNavItem,
  WorkspaceUserRole,
} from './workspaceNavTypes';

/** Stable ids for tests and icon mapping in the shell layer. */
export const WORKSPACE_NAV_ITEM_IDS = {
  STANDARD_HOME: 'standard-home',
  STANDARD_CLIENTS: 'standard-clients',
  STANDARD_TASKS: 'standard-tasks',
  STANDARD_ACTIVITY: 'standard-activity',
  STANDARD_CALENDAR: 'standard-calendar',
  STANDARD_DEALS: 'standard-deals',
  STANDARD_COMMISSION: 'standard-commission',
  STANDARD_RETURNABLES: 'standard-returnables',
  STANDARD_SETTINGS: 'standard-settings',
  STANDARD_ADMIN_LINK: 'standard-admin-link',
  ADMIN_HOME: 'admin-home',
  ADMIN_PIPELINE: 'admin-pipeline',
  ADMIN_CALENDAR: 'admin-calendar',
  ADMIN_ACTIVITY: 'admin-activity',
  ADMIN_ANALYTICS: 'admin-analytics',
  ADMIN_REVENUE: 'admin-revenue',
  ADMIN_LEADERBOARDS: 'admin-leaderboards',
  ADMIN_LEADS: 'admin-leads',
  ADMIN_USERS: 'admin-users',
  ADMIN_RECONCILIATION: 'admin-reconciliation',
  ADMIN_USER_DASHBOARD: 'admin-user-dashboard',
  ADMIN_SETTINGS: 'admin-settings',
  /** @deprecated Use ADMIN_HOME */
  ADMIN_OVERVIEW: 'admin-home',
  /** @deprecated Use ADMIN_CALENDAR */
  ADMIN_SCHEDULE: 'admin-calendar',
} as const;

export type WorkspaceNavItemId =
  (typeof WORKSPACE_NAV_ITEM_IDS)[keyof typeof WORKSPACE_NAV_ITEM_IDS];

export type WorkspaceNavFlags = {
  /** When true, include Returnables workspace (`?view=returnables`). Mirrors `hasDoctorRole`. */
  showReturnableStatements?: boolean;
};

export type WorkspaceNavShell = 'standard' | 'admin';

export type WorkspaceNavBuildOptions = {
  shell: WorkspaceNavShell;
  role: WorkspaceUserRole;
  flags?: WorkspaceNavFlags;
};

/** Standard dashboard workspace views (query: `?view=`). */
export const STANDARD_DASHBOARD_VIEWS = [
  'home',
  'clients',
  'tasks',
  'activity',
  'calendar',
  'deals',
  'commission',
  'returnables',
] as const;

export type StandardDashboardView = (typeof STANDARD_DASHBOARD_VIEWS)[number];

/** Super-admin `/admin` workspace views (query: `?view=`). */
export const ADMIN_DASHBOARD_VIEWS = [
  'home',
  'pipeline',
  'calendar',
  'activity',
  'analytics',
  'revenue',
  'leaderboards',
] as const;

export type AdminDashboardView = (typeof ADMIN_DASHBOARD_VIEWS)[number];

export function isStandardDashboardView(
  value: string | null | undefined
): value is StandardDashboardView {
  return (
    typeof value === 'string' &&
    (STANDARD_DASHBOARD_VIEWS as readonly string[]).includes(value)
  );
}

export function parseStandardDashboardView(
  value: string | null | undefined
): StandardDashboardView {
  return isStandardDashboardView(value) ? value : 'home';
}

export function standardDashboardHref(view: StandardDashboardView = 'home'): string {
  return view === 'home' ? '/dashboard' : `/dashboard?view=${view}`;
}

export function isAdminDashboardView(
  value: string | null | undefined
): value is AdminDashboardView {
  return (
    typeof value === 'string' &&
    (ADMIN_DASHBOARD_VIEWS as readonly string[]).includes(value)
  );
}

export function parseAdminDashboardView(
  value: string | null | undefined
): AdminDashboardView {
  return isAdminDashboardView(value) ? value : 'home';
}

export function adminDashboardHref(view: AdminDashboardView = 'home'): string {
  return view === 'home' ? '/admin' : `/admin?view=${view}`;
}

function section(
  id: string,
  label: string | undefined,
  items: WorkspaceNavItem[]
) {
  return { id, label, items };
}

/**
 * Standard-user workspace modules. Views use `?view=` until nested routes land.
 */
export function buildStandardDashboardNav(
  flags: WorkspaceNavFlags = {}
): WorkspaceNavConfig {
  const workspaceItems: WorkspaceNavItem[] = [
    {
      id: WORKSPACE_NAV_ITEM_IDS.STANDARD_HOME,
      label: 'Home',
      href: standardDashboardHref('home'),
      exact: true,
    },
    {
      id: WORKSPACE_NAV_ITEM_IDS.STANDARD_CLIENTS,
      label: 'My Clients',
      href: standardDashboardHref('clients'),
      exact: true,
    },
    {
      id: WORKSPACE_NAV_ITEM_IDS.STANDARD_TASKS,
      label: 'Tasks',
      href: standardDashboardHref('tasks'),
      exact: true,
    },
    {
      id: WORKSPACE_NAV_ITEM_IDS.STANDARD_ACTIVITY,
      label: 'Activity',
      href: standardDashboardHref('activity'),
      exact: true,
    },
    {
      id: WORKSPACE_NAV_ITEM_IDS.STANDARD_CALENDAR,
      label: 'Calendar',
      href: standardDashboardHref('calendar'),
      exact: true,
    },
    {
      id: WORKSPACE_NAV_ITEM_IDS.STANDARD_DEALS,
      label: 'Deals',
      href: standardDashboardHref('deals'),
      exact: true,
    },
    {
      id: WORKSPACE_NAV_ITEM_IDS.STANDARD_COMMISSION,
      label: 'Commission',
      href: standardDashboardHref('commission'),
      exact: true,
    },
  ];

  if (flags.showReturnableStatements) {
    workspaceItems.push({
      id: WORKSPACE_NAV_ITEM_IDS.STANDARD_RETURNABLES,
      label: 'Returnables',
      href: standardDashboardHref('returnables'),
      exact: true,
    });
  }

  return {
    sections: [
      section('standard-workspace', 'Workspace', workspaceItems),
      section('standard-account', 'Account', [
        {
          id: WORKSPACE_NAV_ITEM_IDS.STANDARD_SETTINGS,
          label: 'Settings',
          href: '/dashboard/settings',
        },
      ]),
    ],
  };
}

/** Super-admin workspace modules and admin tools (existing routes). */
export function buildAdminDashboardNav(): WorkspaceNavConfig {
  return {
    sections: [
      section('admin-workspace', 'Workspace', [
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_HOME,
          label: 'Home',
          href: adminDashboardHref('home'),
          exact: true,
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_LEADS,
          label: 'Lead Command Center',
          href: '/admin/leads',
          badge: { label: 'LCC', tone: 'info' },
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_PIPELINE,
          label: 'Pipeline',
          href: adminDashboardHref('pipeline'),
          exact: true,
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_CALENDAR,
          label: 'Calendar',
          href: adminDashboardHref('calendar'),
          exact: true,
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_ACTIVITY,
          label: 'Activity',
          href: adminDashboardHref('activity'),
          exact: true,
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_ANALYTICS,
          label: 'Analytics',
          href: adminDashboardHref('analytics'),
          exact: true,
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_REVENUE,
          label: 'Revenue',
          href: adminDashboardHref('revenue'),
          exact: true,
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_LEADERBOARDS,
          label: 'Leaderboards',
          href: adminDashboardHref('leaderboards'),
          exact: true,
        },
      ]),
      section('admin-tools', 'Tools', [
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_USERS,
          label: 'User Management',
          href: '/admin/users',
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_RECONCILIATION,
          label: 'Commission / Returnables',
          href: '/admin/reconciliation',
        },
      ]),
      section('admin-account', 'Account', [
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_USER_DASHBOARD,
          label: 'User Dashboard',
          href: '/dashboard',
          exact: true,
        },
        {
          id: WORKSPACE_NAV_ITEM_IDS.ADMIN_SETTINGS,
          label: 'Settings',
          href: '/dashboard/settings',
        },
      ]),
    ],
  };
}

function withSuperAdminStandardExtras(
  config: WorkspaceNavConfig
): WorkspaceNavConfig {
  const toolsSection = {
    id: 'standard-admin',
    label: 'Admin',
    items: [
      {
        id: WORKSPACE_NAV_ITEM_IDS.STANDARD_ADMIN_LINK,
        label: 'Admin Dashboard',
        href: '/admin',
        exact: true,
        roles: ['SUPER_ADMIN' as const],
      },
    ],
  };

  return {
    sections: [...config.sections, toolsSection],
  };
}

/**
 * Resolve the nav config for a shell + role. Pure — no React icons or fetches.
 */
export function buildWorkspaceNavConfig(
  options: WorkspaceNavBuildOptions
): WorkspaceNavConfig {
  const flags = options.flags ?? {};

  if (options.shell === 'admin') {
    if (options.role !== 'SUPER_ADMIN') {
      return { sections: [] };
    }

    return buildAdminDashboardNav();
  }

  const standardNav = buildStandardDashboardNav(flags);

  if (options.role === 'SUPER_ADMIN') {
    return withSuperAdminStandardExtras(standardNav);
  }

  return standardNav;
}

export function listWorkspaceNavItemIds(config: WorkspaceNavConfig): string[] {
  return config.sections.flatMap((entry) => entry.items.map((item) => item.id));
}
