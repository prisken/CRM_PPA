'use client';

import { memo } from 'react';

const TONE_CLASSES = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-100 text-blue-800',
  green: 'bg-green-100 text-green-800',
  yellow: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800',
  purple: 'bg-violet-100 text-violet-800',
  orange: 'bg-orange-100 text-orange-800',
} as const;

const SIZE_CLASSES = {
  xs: 'px-1.5 py-0.5 text-[11px]',
  sm: 'px-2 py-0.5 text-xs',
} as const;

export type CompactPillTone = keyof typeof TONE_CLASSES;
export type CompactPillSize = keyof typeof SIZE_CLASSES;

export type CompactPillProps = {
  children: React.ReactNode;
  tone?: CompactPillTone;
  size?: CompactPillSize;
  title?: string;
  className?: string;
};

function CompactPill({
  children,
  tone = 'gray',
  size = 'sm',
  title,
  className = '',
}: CompactPillProps) {
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center truncate rounded-full font-medium ${TONE_CLASSES[tone]} ${SIZE_CLASSES[size]} ${className}`.trim()}
      title={title}
    >
      {children}
    </span>
  );
}

export default memo(CompactPill);
