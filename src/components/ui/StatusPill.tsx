'use client';

import { memo } from 'react';
import { formatClientStage, getStatusBadgeStyles } from '@/lib/clientStages';

export type StatusPillProps = {
  status: string;
  label?: string;
  className?: string;
};

function StatusPill({ status, label, className = '' }: StatusPillProps) {
  const displayLabel = label ?? formatClientStage(status);

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${getStatusBadgeStyles(status)} ${className}`.trim()}
      title={displayLabel}
    >
      {displayLabel}
    </span>
  );
}

export default memo(StatusPill);
