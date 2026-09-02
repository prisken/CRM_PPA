'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Instant (<100ms) press feedback. CSS :active alone is too late on mobile
 * (300ms double-tap delay, Safari ignores :active without a touchstart
 * listener). pointerdown fires on contact — that is the "I felt it" moment.
 *
 * Usage:
 *   const { pressed, bind } = usePressed();
 *   <button data-pressed={pressed || undefined} {...bind<HTMLButtonElement>()} />
 *
 * If the pointer moves more than PRESS_MOVE_TOLERANCE px the press is
 * cancelled (finger is scrolling, not tapping) so list rows still scroll.
 */
const PRESS_MOVE_TOLERANCE = 10;

export function usePressed() {
  const [pressed, setPressed] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const cancel = useCallback(() => {
    origin.current = null;
    setPressed(false);
  }, []);

  const bind = useCallback(
    function bind<T extends HTMLElement>(): React.HTMLAttributes<T> {
      return {
        onPointerDown: (e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          origin.current = { x: e.clientX, y: e.clientY };
          setPressed(true);
          try {
            e.currentTarget.setPointerCapture?.(e.pointerId);
          } catch {
            /* pointer already released */
          }
        },
        onPointerMove: (e) => {
          if (!pressed || !origin.current) return;
          const dx = e.clientX - origin.current.x;
          const dy = e.clientY - origin.current.y;
          if (dx * dx + dy * dy > PRESS_MOVE_TOLERANCE * PRESS_MOVE_TOLERANCE) {
            cancel();
          }
        },
        onPointerUp: cancel,
        onPointerCancel: cancel,
        onLostPointerCapture: cancel,
      };
    },
    [pressed, cancel]
  );

  return { pressed, bind };
}
