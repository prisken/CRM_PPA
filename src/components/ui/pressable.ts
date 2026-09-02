/**
 * Shared interaction tokens — the single press/pending language.
 *
 * Hover stays mouse-only (Tailwind v4 never applies hover: on touch).
 * `data-[pressed=true]` is the instant touch path (driven by usePressed).
 * `data-[pending=true]` is the in-flight state (opacity + no double taps).
 *
 * Do not add one-off hover hacks per page. Compose these strings.
 */

/** Compact controls: buttons, tiles, icon buttons, nav items. Scale on press. */
export const pressable =
  'relative select-none touch-manipulation cursor-pointer ' +
  'transition-[transform,background-color,opacity] duration-150 ease-out ' +
  'hover:bg-black/5 active:bg-black/10 ' +
  'data-[pressed=true]:bg-black/10 data-[pressed=true]:scale-[0.98] ' +
  'data-[pending=true]:opacity-70 data-[pending=true]:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/25 ' +
  'motion-reduce:transform-none motion-reduce:transition-none';

/** Full-width list rows: colour only, no scale (scale on long rows feels like a bug). */
export const pressableRow =
  'relative select-none touch-manipulation cursor-pointer ' +
  'transition-colors duration-100 ' +
  'hover:bg-black/5 active:bg-black/10 ' +
  'data-[pressed=true]:bg-black/10 ' +
  'data-[pending=true]:bg-black/5 data-[pending=true]:pointer-events-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-900/25';
