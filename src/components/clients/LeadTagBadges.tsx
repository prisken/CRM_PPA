'use client';

import { memo } from 'react';
import type { LeadCommandCenterTag } from '@/lib/leadCommandCenter';

type LeadTagBadgesProps = {
  tags?: LeadCommandCenterTag[];
  maxVisible?: number;
};

function getTagBadgeClass(color: string | null) {
  if (!color) {
    return 'bg-violet-100 text-violet-800';
  }

  return 'text-gray-900';
}

function LeadTagBadges({ tags = [], maxVisible = 4 }: LeadTagBadgesProps) {
  if (tags.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const visibleTags = tags.slice(0, maxVisible);
  const hiddenCount = tags.length - visibleTags.length;
  const hiddenTags = tags.slice(maxVisible);

  return (
    <div className="flex flex-wrap gap-1" role="list" aria-label="Lead tags">
      {visibleTags.map((tag) => (
        <span
          key={tag.id}
          role="listitem"
          className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${getTagBadgeClass(tag.color)}`}
          style={tag.color ? { backgroundColor: tag.color } : undefined}
          title={tag.name}
        >
          {tag.name}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span
          role="listitem"
          className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
          title={hiddenTags.map((tag) => tag.name).join(', ')}
          aria-label={`${hiddenCount} more tag${hiddenCount === 1 ? '' : 's'}: ${hiddenTags.map((tag) => tag.name).join(', ')}`}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

export default memo(LeadTagBadges);
