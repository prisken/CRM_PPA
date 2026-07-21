import type {
  WorkspaceNavBadge,
  WorkspaceNavConfig,
  WorkspaceNavItem,
  WorkspaceUserRole,
} from './workspaceNavTypes';

export function filterNavItemsForRole(
  items: WorkspaceNavItem[],
  userRole: WorkspaceUserRole
): WorkspaceNavItem[] {
  return items.filter((item) => {
    if (!item.roles || item.roles.length === 0) {
      return true;
    }

    return item.roles.includes(userRole);
  });
}

export function filterNavConfigForRole(
  config: WorkspaceNavConfig,
  userRole: WorkspaceUserRole
): WorkspaceNavConfig {
  return {
    sections: config.sections
      .map((section) => ({
        ...section,
        items: filterNavItemsForRole(section.items, userRole),
      }))
      .filter((section) => section.items.length > 0),
  };
}

export function flattenNavItems(config: WorkspaceNavConfig): WorkspaceNavItem[] {
  return config.sections.flatMap((section) => section.items);
}

function normalizeSearch(search: string | null | undefined): string {
  if (!search) {
    return '';
  }

  return search.startsWith('?') ? search.slice(1) : search;
}

/**
 * Dashboard/admin home is selected when `view`/`module` is missing, empty, or `home`.
 * Supports both `/dashboard` and `/dashboard?view=home` (same for `/admin`).
 */
export function isWorkspaceHomeViewParam(
  view: string | null | undefined
): boolean {
  return view == null || view === '' || view === 'home';
}

/**
 * Active match for sidebar items. Pass `search` (window/searchParams string)
 * so `?view=` / `?module=` links highlight correctly.
 */
export function isWorkspaceNavItemActive(
  pathname: string,
  item: Pick<WorkspaceNavItem, 'href' | 'exact'>,
  search: string | null | undefined = ''
): boolean {
  const hrefUrl = new URL(item.href, 'http://local.invalid');
  const hrefPath = hrefUrl.pathname;
  const hrefParams = hrefUrl.searchParams;
  const currentParams = new URLSearchParams(normalizeSearch(search));

  const hrefView = hrefParams.get('view') ?? hrefParams.get('module');
  const currentView = currentParams.get('view') ?? currentParams.get('module');

  if (hrefView) {
    if (pathname !== hrefPath) {
      return false;
    }

    if (hrefView === 'home') {
      return isWorkspaceHomeViewParam(currentView);
    }

    return currentView === hrefView;
  }

  if (item.exact) {
    if (pathname !== hrefPath) {
      return false;
    }

    // Root dashboard/admin home: `/path` or `/path?view=home`.
    if (hrefPath === '/dashboard' || hrefPath === '/admin') {
      return isWorkspaceHomeViewParam(currentView);
    }

    return true;
  }

  if (pathname === hrefPath) {
    return true;
  }

  if (hrefPath === '/dashboard' || hrefPath === '/admin') {
    return false;
  }

  return pathname.startsWith(`${hrefPath}/`);
}

export function getWorkspaceNavBadgeClassName(
  tone: WorkspaceNavBadge['tone'] = 'neutral'
): string {
  switch (tone) {
    case 'info':
      return 'bg-blue-100 text-blue-800';
    case 'warning':
      return 'bg-amber-100 text-amber-800';
    case 'danger':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}
