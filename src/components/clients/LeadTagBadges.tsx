'use client';

import { memo } from 'react';
import CompactPill from '@/components/ui/CompactPill';
import EmptyMuted from '@/components/ui/EmptyMuted';
import LimitedInlineList from '@/components/ui/LimitedInlineList';
import type { LeadCommandCenterTag } from '@/lib/leadCommandCenter';

type LeadTagBadgesProps = {
  tags?: LeadCommandCenterTag[];
  maxVisible?: number;
};

function LeadTagBadges({ tags = [], maxVisible = 2 }: LeadTagBadgesProps) {
  if (tags.length === 0) {
    return <EmptyMuted />;
  }

  const hiddenTags = tags.slice(maxVisible);
  const hiddenTitle =
    hiddenTags.length > 0
      ? hiddenTags.map((tag) => tag.name).join(', ')
      : undefined;

  return (
    <div role="list" aria-label="Lead tags">
      <LimitedInlineList
        max={maxVisible}
        moreTitle={hiddenTitle}
        moreLabel={(count) => `+${count}`}
        items={tags.map((tag) =>
          tag.color ? (
            <span
              key={tag.id}
              role="listitem"
              className="inline-flex max-w-full min-w-0 items-center truncate rounded-full px-1.5 py-0.5 text-[11px] font-medium text-gray-900"
              style={{ backgroundColor: tag.color }}
              title={tag.name}
            >
              {tag.name}
            </span>
          ) : (
            <CompactPill
              key={tag.id}
              tone="purple"
              size="xs"
              title={tag.name}
              className="max-w-[9rem]"
            >
              {tag.name}
            </CompactPill>
          )
        )}
      />
    </div>
  );
}

export default memo(LeadTagBadges);
