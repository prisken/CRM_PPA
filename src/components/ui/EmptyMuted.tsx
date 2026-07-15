'use client';

import { memo } from 'react';

export type EmptyMutedProps = {
  children?: React.ReactNode;
  label?: string;
};

function EmptyMuted({ children, label = '—' }: EmptyMutedProps) {
  return (
    <span className="text-sm text-gray-400" aria-label={typeof label === 'string' ? label : undefined}>
      {children ?? label}
    </span>
  );
}

export default memo(EmptyMuted);
