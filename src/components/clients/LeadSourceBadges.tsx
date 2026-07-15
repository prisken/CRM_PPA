'use client';

import { memo, useMemo } from 'react';
import CompactPill, { type CompactPillTone } from '@/components/ui/CompactPill';
import LimitedInlineList from '@/components/ui/LimitedInlineList';

type LeadSourceBadgesProps = {
  sources?: string[];
  maxVisible?: number;
};

function getSourceTone(label: string): CompactPillTone {
  const normalized = label.trim().toLowerCase();

  if (normalized === 'google forms' || normalized === 'google_forms') {
    return 'blue';
  }

  if (
    normalized === 'profit pulse ally' ||
    normalized === 'profit_pulse_ally' ||
    normalized.includes('profit pulse ally')
  ) {
    return 'purple';
  }

  if (normalized === 'manual' || normalized === 'other') {
    return 'gray';
  }

  return 'orange';
}

function LeadSourceBadges({
  sources = [],
  maxVisible = 2,
}: LeadSourceBadgesProps) {
  const uniqueSources = useMemo(
    () => [...new Set(sources.map((source) => source.trim()).filter(Boolean))],
    [sources]
  );

  if (uniqueSources.length === 0) {
    return null;
  }

  const hiddenSources = uniqueSources.slice(maxVisible);
  const hiddenTitle =
    hiddenSources.length > 0 ? hiddenSources.join(', ') : undefined;

  return (
    <div role="list" aria-label="Lead sources">
      <LimitedInlineList
        max={maxVisible}
        moreTitle={hiddenTitle}
        moreLabel={(count) => `+${count}`}
        items={uniqueSources.map((source) => (
          <CompactPill
            key={source}
            tone={getSourceTone(source)}
            size="xs"
            title={source}
            className="max-w-[9rem]"
          >
            {source}
          </CompactPill>
        ))}
      />
    </div>
  );
}

export default memo(LeadSourceBadges);
