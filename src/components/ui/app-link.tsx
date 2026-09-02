'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { usePressed } from '@/hooks/usePressed';

/**
 * Fired when an AppLink starts an internal client navigation.
 * NavigationProgress listens for it. Router-driven navigations are covered
 * by the bar's pathname-change completion.
 */
export const NAV_START_EVENT = 'app-nav:start';

export function signalNavStart() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NAV_START_EVENT));
}

type AppLinkProps = React.ComponentProps<typeof Link>;

/**
 * next/link wrapper: instant press feedback + "I heard you" navigation
 * signal. Bring your own visual classes — compose `pressable` /
 * `pressableRow` from @/components/ui/pressable for the pressed look.
 *
 * data-pressed is set here (via usePressed); Tailwind
 * data-[pressed=true]: variants do the rest.
 */
export default function AppLink({
  children,
  onClick,
  onPointerDown,
  ...rest
}: AppLinkProps) {
  const { pressed, bind } = usePressed();

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLAnchorElement>) => {
      bind<HTMLAnchorElement>().onPointerDown?.(e);
      onPointerDown?.(e);
    },
    [bind, onPointerDown]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // modified click
      const href = rest.href;
      if (typeof href === 'string' && href.startsWith('#')) return; // hash only
      signalNavStart();
    },
    [onClick, rest.href]
  );

  return (
    <Link
      {...rest}
      data-pressed={pressed || undefined}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}
