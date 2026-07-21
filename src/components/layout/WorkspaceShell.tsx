'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import WorkspaceSidebar from '@/components/layout/WorkspaceSidebar';
import { useIsLargeScreen } from '@/components/layout/workspaceHooks';
import {
  WorkspaceShellProvider,
  useWorkspaceShell,
} from '@/components/layout/WorkspaceShellContext';
import WorkspaceTopBar from '@/components/layout/WorkspaceTopBar';
import type { WorkspaceNavConfig, WorkspaceUserRole } from '@/components/layout/workspaceNavTypes';

type WorkspaceShellProps = {
  children: ReactNode;
  nav: WorkspaceNavConfig;
  userRole: WorkspaceUserRole;
  title: string;
  subtitle?: string;
  topBarActions?: ReactNode;
  sidebarFooter?: ReactNode;
  brandHref?: string;
  /**
   * default — capped content width with normal padding
   * wide — uncapped width for charts/calendar
   * full — uncapped + tighter padding for pipeline Kanban
   */
  contentLayout?: 'default' | 'wide' | 'full';
};

function WorkspaceShellLayout({
  children,
  nav,
  userRole,
  title,
  subtitle,
  topBarActions,
  sidebarFooter,
  brandHref,
  contentLayout = 'default',
}: WorkspaceShellProps) {
  const { desktopCollapsed, mobileOpen, closeMobileSidebar } = useWorkspaceShell();
  const isLargeScreen = useIsLargeScreen();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const sidebarAriaHidden = !isLargeScreen && !mobileOpen;

  // Keep drawer closed when crossing into desktop layout.
  useEffect(() => {
    if (isLargeScreen) {
      closeMobileSidebar();
    }
  }, [isLargeScreen, closeMobileSidebar]);

  // Soft nav / back-forward / replace: always dismiss the mobile drawer.
  useEffect(() => {
    closeMobileSidebar();
  }, [pathname, search, closeMobileSidebar]);

  const contentFrameClass =
    contentLayout === 'full'
      ? 'w-full max-w-none px-2 py-3 sm:px-3 sm:py-4 lg:px-4'
      : contentLayout === 'wide'
        ? 'mx-auto w-full max-w-none px-3 py-3 sm:px-5 sm:py-5 lg:px-6'
        : 'mx-auto w-full max-w-[1600px] px-3 py-3 sm:px-5 sm:py-5 lg:px-6';

  return (
    // Single viewport shell: page body does not scroll; main is the scroll owner.
    <div className="flex h-dvh max-h-dvh overflow-hidden bg-gray-100">
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Close navigation menu"
          onClick={closeMobileSidebar}
        />
      ) : null}

      {/*
        Mobile/iPad (< lg): fixed off-canvas overlay — does not consume workspace width.
        Desktop (lg+): in-flow collapsible sidebar.
      */}
      <aside
        id="workspace-sidebar"
        className={[
          'fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh w-[min(18rem,85vw)] flex-col border-r border-gray-200 bg-white shadow-xl transition-transform duration-200 ease-in-out',
          'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
          mobileOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
          'lg:pointer-events-auto lg:relative lg:z-auto lg:h-auto lg:max-h-none lg:w-auto lg:max-w-none lg:translate-x-0 lg:shadow-none lg:transition-[width] lg:pt-0 lg:pb-0',
          desktopCollapsed ? 'lg:w-16' : 'lg:w-60',
        ].join(' ')}
        aria-hidden={sidebarAriaHidden || undefined}
      >
        <div className="flex h-full min-h-0 w-full flex-col lg:min-h-dvh">
          <WorkspaceSidebar
            nav={nav}
            userRole={userRole}
            brandHref={brandHref}
            footer={sidebarFooter}
            onNavigate={closeMobileSidebar}
          />
        </div>
      </aside>

      {/* Always full remaining width; on mobile the drawer is overlay-only. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceTopBar title={title} subtitle={subtitle} actions={topBarActions} />

        <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain">
          <div className={contentFrameClass}>
            <div className="min-w-0 space-y-4">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function WorkspaceShell(props: WorkspaceShellProps) {
  return (
    <WorkspaceShellProvider>
      <WorkspaceShellLayout {...props} />
    </WorkspaceShellProvider>
  );
}
