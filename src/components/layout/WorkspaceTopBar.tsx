'use client';

import { Menu, PanelLeft, PanelLeftClose, X } from 'lucide-react';
import type { ReactNode } from 'react';

import { useWorkspaceShell } from '@/components/layout/WorkspaceShellContext';

type WorkspaceTopBarProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** SIMPLE shells on <lg use the bottom nav for navigation; hide the drawer toggle. */
  hideMenuButton?: boolean;
};

export default function WorkspaceTopBar({
  title,
  subtitle,
  actions,
  hideMenuButton = false,
}: WorkspaceTopBarProps) {
  const {
    desktopCollapsed,
    toggleDesktopCollapsed,
    mobileOpen,
    toggleMobileSidebar,
  } = useWorkspaceShell();

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-gray-200 bg-white/95 pt-safe backdrop-blur supports-[backdrop-filter]:bg-white/90">
      <div className="flex flex-col gap-2 px-3 py-2.5 sm:px-5 sm:py-3">
        <div className="flex min-h-10 items-center gap-2 sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {!hideMenuButton ? (
              <button
                type="button"
                onClick={toggleMobileSidebar}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-200 data-[pressed=true]:bg-gray-200 lg:hidden"
                aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={mobileOpen}
                aria-controls="workspace-sidebar"
              >
                {mobileOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            ) : null}

            <button
              type="button"
              onClick={toggleDesktopCollapsed}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-50 active:bg-gray-200 lg:inline-flex"
              aria-label={desktopCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!desktopCollapsed}
              aria-controls="workspace-sidebar"
            >
              {desktopCollapsed ? (
                <PanelLeft className="h-5 w-5" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-semibold leading-tight text-gray-900 sm:text-lg">
                {title}
              </h1>
              {subtitle ? (
                <p className="truncate text-xs leading-tight text-gray-500 sm:text-sm">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>

          {/* Desktop / tablet landscape: actions stay on the title row. */}
          {actions ? (
            <div className="hidden min-w-0 shrink-0 items-center justify-end gap-2 sm:flex">
              {actions}
            </div>
          ) : null}
        </div>

        {/*
          Phone / narrow iPad portrait: full-width action row so Add Lead /
          Settings / Sign Out stay tappable without crowding the title or
          causing horizontal page scroll.
        */}
        {actions ? (
          <div className="flex min-w-0 gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden">
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          </div>
        ) : null}
      </div>
    </header>
  );
}
