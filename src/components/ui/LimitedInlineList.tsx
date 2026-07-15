'use client';

import { memo } from 'react';
import CompactPill from '@/components/ui/CompactPill';

export type LimitedInlineListProps = {
  items: React.ReactNode[];
  max?: number;
  className?: string;
  moreLabel?: (count: number) => string;
  /** Tooltip for the overflow "+N" pill (e.g. hidden item labels). */
  moreTitle?: string;
};

function LimitedInlineList({
  items,
  max = 2,
  className = '',
  moreLabel = (count) => `+${count}`,
  moreTitle,
}: LimitedInlineListProps) {
  if (items.length === 0) {
    return null;
  }

  const visibleItems = items.slice(0, max);
  const hiddenCount = items.length - visibleItems.length;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`.trim()}>
      {visibleItems.map((item, index) => (
        <span key={index} className="min-w-0 max-w-full">
          {item}
        </span>
      ))}
      {hiddenCount > 0 && (
        <CompactPill tone="gray" size="sm" title={moreTitle} className="shrink-0">
          {moreLabel(hiddenCount)}
        </CompactPill>
      )}
    </div>
  );
}

export default memo(LimitedInlineList);
