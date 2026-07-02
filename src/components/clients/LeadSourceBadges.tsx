'use client';

import { memo, useMemo } from 'react';

type LeadSourceBadgesProps = {
  sources?: string[];
  maxVisible?: number;
};

function getSourceBadgeStyles(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === 'google forms' || normalized === 'google_forms') {
    return 'bg-blue-100 text-blue-800';
  }

  if (
    normalized === 'profit pulse ally' ||
    normalized === 'profit_pulse_ally' ||
    normalized.includes('profit pulse ally')
  ) {
    return 'bg-purple-100 text-purple-800';
  }

  if (normalized === 'manual') {
    return 'bg-gray-100 text-gray-700';
  }

  if (normalized === 'other') {
    return 'bg-gray-100 text-gray-600';
  }

  return 'bg-amber-100 text-amber-800';
}

function LeadSourceBadges({
  sources = [],
  maxVisible = 3,
}: LeadSourceBadgesProps) {
  const uniqueSources = useMemo(
    () => [...new Set(sources.map((source) => source.trim()).filter(Boolean))],
    [sources]
  );

  if (uniqueSources.length === 0) {
    return null;
  }

  const visibleSources = uniqueSources.slice(0, maxVisible);
  const hiddenCount = uniqueSources.length - visibleSources.length;
  const hiddenSources = uniqueSources.slice(maxVisible);

  return (
    <div className="flex flex-wrap gap-1" role="list" aria-label="Lead sources">
      {visibleSources.map((source) => (
        <span
          key={source}
          role="listitem"
          className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-xs font-medium ${getSourceBadgeStyles(source)}`}
          title={source}
        >
          {source}
        </span>
      ))}
      {hiddenCount > 0 && (
        <span
          role="listitem"
          className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
          title={hiddenSources.join(', ')}
          aria-label={`${hiddenCount} more source${hiddenCount === 1 ? '' : 's'}: ${hiddenSources.join(', ')}`}
        >
          +{hiddenCount}
        </span>
      )}
    </div>
  );
}

export default memo(LeadSourceBadges);
