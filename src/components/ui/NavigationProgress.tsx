'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NAV_START_EVENT } from '@/components/ui/app-link';

type Phase = 'idle' | 'run' | 'done';

/**
 * 2–3px top progress bar. Starts when an AppLink click signals a navigation,
 * completes when the pathname actually changes. If navigation was instant
 * (< MIN_SHOW_MS) the bar still pulses so the tap was acknowledged —
 * silence is the bug.
 */
const MIN_SHOW_MS = 200;
const DONE_HOLD_MS = 300;

export default function NavigationProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>('idle');
  const runStart = useRef(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const firstPath = useRef<string | null>(null);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const finish = () => {
    clearTimers();
    setPhase('done');
    timers.current.push(setTimeout(() => setPhase('idle'), DONE_HOLD_MS));
  };

  // Start on AppLink navigation signal.
  useEffect(() => {
    const onStart = () => {
      clearTimers();
      runStart.current = performance.now();
      setPhase('run');
    };
    window.addEventListener(NAV_START_EVENT, onStart);
    return () => {
      window.removeEventListener(NAV_START_EVENT, onStart);
      clearTimers();
    };
  }, []);

  // Complete when the route actually changes (covers back/forward, redirects,
  // router.push). Skip the very first render.
  useEffect(() => {
    if (firstPath.current === null) {
      firstPath.current = pathname;
      return;
    }
    const elapsed = performance.now() - runStart.current;
    const wait = Math.max(0, MIN_SHOW_MS - elapsed);
    clearTimers();
    timers.current.push(setTimeout(finish, wait));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const width = phase === 'idle' ? '0%' : phase === 'run' ? '72%' : '100%';
  const opacity = phase === 'idle' ? '0' : '1';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]"
    >
      <div
        className={`h-full bg-blue-600 transition-[width] ease-out ${
          phase === 'run' ? 'duration-200' : 'duration-150'
        }`}
        style={{ width, opacity, transitionTimingFunction: 'cubic-bezier(0.32, 0.72, 0, 1)' }}
      />
    </div>
  );
}
