'use client';

/**
 * Bottom nav for SIMPLE_MODE shells (UI pass §5.1). Phone/narrow-tablet only
 * (lg:hidden); nested pages (client 360, report review) do not mount
 * WorkspaceShell, so the nav naturally disappears there — back is the way out.
 *
 * Slots: the 4 simple-workspace items (Today/Clients/Calendar/Reports) plus
 * More. More opens a bottom sheet with the remaining role-filtered items
 * (Team & Admin, Settings) and Sign out.
 */

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  FileText,
  ListChecks,
  LogOut,
  MoreHorizontal,
  Settings,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import AppLink, { signalNavStart } from '@/components/ui/app-link';
import { usePressed } from '@/hooks/usePressed';
import {
  filterNavConfigForRole,
  flattenNavItems,
  hasSimpleWorkspaceSection,
  isWorkspaceNavItemActive,
} from '@/components/layout/workspaceNavUtils';
import type {
  WorkspaceNavConfig,
  WorkspaceNavItem,
  WorkspaceUserRole,
} from '@/components/layout/workspaceNavTypes';
import { supabase } from '@/lib/supabaseClient';

const NAV_ICONS: Record<string, LucideIcon> = {
  '/today': ListChecks,
  '/clients': Users,
  '/calendar': CalendarDays,
  '/reports': FileText,
  '/admin/leads': ShieldCheck,
  '/dashboard/settings': Settings,
};

function NavIcon({ item, className }: { item: WorkspaceNavItem; className: string }) {
  const Icon = NAV_ICONS[item.href] ?? MoreHorizontal;
  return <Icon className={className} aria-hidden="true" />;
}

function BarSlot({
  item,
  active,
}: {
  item: WorkspaceNavItem;
  active: boolean;
}) {
  const base = [
    'flex min-h-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2',
    'select-none touch-manipulation transition-colors duration-100',
    'active:bg-gray-100 data-[pressed=true]:bg-gray-100',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/25',
  ].join(' ');

  return (
    <AppLink
      href={item.href}
      className={base}
      aria-current={active ? 'page' : undefined}
    >
      <NavIcon
        item={item}
        className={`h-6 w-6 ${active ? 'text-blue-600' : 'text-gray-400'}`}
      />
      <span
        className={`max-w-full truncate text-[10px] font-medium leading-none ${
          active ? 'text-blue-700' : 'text-gray-500'
        }`}
      >
        {item.label}
      </span>
    </AppLink>
  );
}

function MoreSheet({
  items,
  onClose,
  onSignOut,
}: {
  items: WorkspaceNavItem[];
  onClose: () => void;
  onSignOut: () => void;
}) {
  const pathname = usePathname();

  // Close on any navigation.
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="More options">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/40"
      />
      <div className="absolute inset-x-0 bottom-0 overscroll-y-contain rounded-t-2xl bg-white pb-safe shadow-xl">
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-200" />
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <p className="text-sm font-semibold text-gray-900">More</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 active:bg-gray-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="max-h-[60dvh] overflow-y-auto overscroll-y-contain px-2 pb-2">
          {items.map((item) => {
            const active = isWorkspaceNavItemActive(pathname, item);
            return (
              <AppLink
                key={item.id}
                href={item.href}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors active:bg-gray-100 data-[pressed=true]:bg-gray-100 ${
                  active ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
              >
                <NavIcon
                  item={item}
                  className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-gray-500'}`}
                />
                <span className="truncate">{item.label}</span>
              </AppLink>
            );
          })}
          <button
            type="button"
            onClick={onSignOut}
            className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors active:bg-red-50 data-[pressed=true]:bg-red-50"
          >
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceBottomNav({
  nav,
  userRole,
}: {
  nav: WorkspaceNavConfig;
  userRole: WorkspaceUserRole;
}) {
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? '';
  const router = useRouter();
  const { pressed, bind } = usePressed();
  const [open, setOpen] = useState(false);

  const isSimple = hasSimpleWorkspaceSection(nav);
  const filtered = useMemo(
    () => filterNavConfigForRole(nav, userRole),
    [nav, userRole]
  );
  const items = useMemo(() => flattenNavItems(filtered), [filtered]);
  const primary = items.slice(0, 4);
  const more = items.slice(4); // Sign out always lives in the More sheet.

  if (!isSimple) {
    return null;
  }

  const signOut = async () => {
    signalNavStart();
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-white/90 lg:hidden"
      >
        <div className="grid grid-cols-5 items-stretch gap-1 px-1 pt-1">
          {primary.map((item) => (
            <BarSlot
              key={item.id}
              item={item}
              active={isWorkspaceNavItemActive(pathname, item, search)}
            />
          ))}
          <button
              type="button"
              {...bind<HTMLButtonElement>()}
              data-pressed={pressed || undefined}
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={open}
              className="flex min-h-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 select-none touch-manipulation transition-colors duration-100 active:bg-gray-100 data-[pressed=true]:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/25"
            >
              <MoreHorizontal
                className={`h-6 w-6 ${open ? 'text-blue-600' : 'text-gray-400'}`}
                aria-hidden="true"
              />
              <span
                className={`text-[10px] font-medium leading-none ${
                  open ? 'text-blue-700' : 'text-gray-500'
                }`}
              >
                More
              </span>
            </button>
        </div>
      </nav>

      {open ? (
        <MoreSheet items={more} onClose={() => setOpen(false)} onSignOut={signOut} />
      ) : null}
    </>
  );
}
