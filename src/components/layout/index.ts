export { default as WorkspaceShell } from '@/components/layout/WorkspaceShell';
export { default as WorkspaceSidebar } from '@/components/layout/WorkspaceSidebar';
export { default as WorkspaceTopBar } from '@/components/layout/WorkspaceTopBar';
export {
  WorkspaceShellProvider,
  useWorkspaceShell,
} from '@/components/layout/WorkspaceShellContext';
export type {
  WorkspaceNavBadge,
  WorkspaceNavConfig,
  WorkspaceNavItem,
  WorkspaceNavSection,
  WorkspaceUserRole,
} from '@/components/layout/workspaceNavTypes';
export {
  filterNavConfigForRole,
  filterNavItemsForRole,
  flattenNavItems,
  getWorkspaceNavBadgeClassName,
  isWorkspaceHomeViewParam,
  isWorkspaceNavItemActive,
} from '@/components/layout/workspaceNavUtils';
export { useIsLargeScreen } from '@/components/layout/workspaceHooks';
export {
  buildAdminDashboardNav,
  buildStandardDashboardNav,
  buildWorkspaceNavConfig,
  listWorkspaceNavItemIds,
  parseStandardDashboardView,
  parseAdminDashboardView,
  isStandardDashboardView,
  isAdminDashboardView,
  standardDashboardHref,
  adminDashboardHref,
  WORKSPACE_NAV_ITEM_IDS,
  STANDARD_DASHBOARD_VIEWS,
  ADMIN_DASHBOARD_VIEWS,
} from '@/components/layout/workspaceNavConfig';
export type {
  WorkspaceNavBuildOptions,
  WorkspaceNavFlags,
  WorkspaceNavItemId,
  WorkspaceNavShell,
  StandardDashboardView,
  AdminDashboardView,
} from '@/components/layout/workspaceNavConfig';
