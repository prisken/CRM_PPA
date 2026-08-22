'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { memo, useMemo } from 'react';
import Logo from '@/components/Logo';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import {
  filterNavConfigForRole,
  getWorkspaceNavBadgeClassName,
  isWorkspaceNavItemActive,
} from '@/components/layout/workspaceNavUtils';
import { useWorkspaceShell } from '@/components/layout/WorkspaceShellContext';
import { useIsLargeScreen } from '@/components/layout/workspaceHooks';
import type { WorkspaceNavConfig, WorkspaceUserRole } from '@/components/layout/workspaceNavTypes';

type WorkspaceSidebarProps = {
  nav: WorkspaceNavConfig;
  userRole: WorkspaceUserRole;
  brandHref?: string;
  footer?: React.ReactNode;
  onNavigate?: () => void;
};

function NavItemIcon({
  icon,
  label,
  collapsed,
}: {
  icon?: React.ReactNode;
  label: string;
  collapsed: boolean;
}) {
  if (icon) {
    return (
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center text-gray-500 ${
          collapsed ? 'h-8 w-8' : 'h-5 w-5'
        }`}
      >
        {icon}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold uppercase text-gray-600 ${
        collapsed ? 'h-8 w-8' : 'h-5 w-5'
      }`}
    >
      {label.trim().charAt(0) || '?'}
    </span>
  );
}

function NavBadge({
  badge,
  collapsed,
}: {
  badge: NonNullable<WorkspaceNavConfig['sections'][number]['items'][number]['badge']>;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <span
        className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-600"
        aria-label={badge.label}
      />
    );
  }

  return (
    <span
      className={`ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${getWorkspaceNavBadgeClassName(
        badge.tone
      )}`}
    >
      {badge.label}
    </span>
  );
}

const WorkspaceSidebarNav = memo(function WorkspaceSidebarNav({
  nav,
  userRole,
  collapsed,
  onNavigate,
}: {
  nav: WorkspaceNavConfig;
  userRole: WorkspaceUserRole;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const { density } = useDisplayDensity();
  // Slightly taller touch targets on mobile; density still applies padding.
  const itemPaddingClass =
    density === 'compact' ? 'min-h-10 px-2.5 py-2.5 lg:py-2' : 'min-h-11 px-3 py-3 lg:py-2.5';

  const filteredNav = useMemo(
    () => filterNavConfigForRole(nav, userRole),
    [nav, userRole]
  );

  return (
    <nav aria-label="Workspace" className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-3">
      {filteredNav.sections.map((section) => (
        <div key={section.id} className="mb-4 last:mb-0">
          {section.label && !collapsed ? (
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              {section.label}
            </p>
          ) : null}

          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = isWorkspaceNavItemActive(pathname, item, search);
              const linkClassName = [
                'group relative flex items-center rounded-lg text-sm font-medium transition-colors',
                itemPaddingClass,
                collapsed ? 'justify-center' : 'gap-3',
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
              ].join(' ');

              const content = (
                <>
                  <NavItemIcon icon={item.icon} label={item.label} collapsed={collapsed} />
                  {!collapsed ? (
                    <span className="min-w-0 truncate">{item.label}</span>
                  ) : (
                    <span className="sr-only">{item.label}</span>
                  )}
                  {item.badge ? <NavBadge badge={item.badge} collapsed={collapsed} /> : null}
                </>
              );

              return (
                <li key={item.id}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className={linkClassName}
                      title={collapsed ? item.label : undefined}
                      onClick={onNavigate}
                    >
                      {content}
                    </a>
                  ) : (
                    <Link
                      href={item.href}
                      scroll={false}
                      prefetch
                      className={linkClassName}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      onClick={onNavigate}
                    >
                      {content}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
});

export default function WorkspaceSidebar({
  nav,
  userRole,
  brandHref = '/dashboard',
  footer,
  onNavigate,
}: WorkspaceSidebarProps) {
  const { desktopCollapsed } = useWorkspaceShell();
  const isLargeScreen = useIsLargeScreen();
  const collapsed = isLargeScreen && desktopCollapsed;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex items-center border-b border-gray-200 ${
          collapsed ? 'justify-center px-2 py-3' : 'gap-3 px-4 py-3'
        }`}
      >
        <Link
          href={brandHref}
          scroll={false}
          aria-label="Go to homepage"
          className="inline-flex shrink-0 items-center"
          onClick={() => {
            onNavigate?.();
          }}
        >
          {collapsed ? (
            <img
              src="/assets/logo192.png"
              alt=""
              className="h-8 w-8 rounded-md object-cover"
            />
          ) : (
            <Logo className="h-8 w-auto" />
          )}
        </Link>
      </div>

      <WorkspaceSidebarNav
        nav={nav}
        userRole={userRole}
        collapsed={collapsed}
        onNavigate={onNavigate}
      />

      {footer ? (
        <div
          className={`border-t border-gray-200 ${
            collapsed ? 'px-2 py-3' : 'px-3 py-3'
          }`}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );
}
