'use client';

import { memo, useId, useState, type ReactNode } from 'react';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import {
  getSectionCardBodyPaddingClass,
  getSectionCardHeaderPaddingClass,
} from '@/components/ui/displayDensity';

export type SectionCardProps = {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  defaultCollapsed?: boolean;
  collapsible?: boolean;
  /** Fires when collapse state changes (Phase 2L/2M: defer child fetches until expand). */
  onCollapsedChange?: (collapsed: boolean) => void;
  className?: string;
};

function SectionCard({
  title,
  description,
  action,
  children,
  defaultCollapsed = false,
  collapsible = false,
  onCollapsedChange,
  className = '',
}: SectionCardProps) {
  const contentId = useId();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsible && collapsed;
  const { density } = useDisplayDensity();
  const headerPaddingClass = getSectionCardHeaderPaddingClass(density);
  const bodyPaddingClass = getSectionCardBodyPaddingClass(density);

  const headerContent = (
    <div className="min-w-0 flex-1">
      {title !== undefined && title !== null && title !== '' && (
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      )}
      {description !== undefined && description !== null && description !== '' && (
        <div className="mt-1 text-sm text-gray-500">{description}</div>
      )}
    </div>
  );

  return (
    <section
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className}`.trim()}
    >
      {(title || description || action || collapsible) && (
        <div className={`flex items-start justify-between gap-3 border-b border-gray-100 ${headerPaddingClass}`}>
          {collapsible ? (
            <button
              type="button"
              onClick={() => {
                setCollapsed((current) => {
                  const next = !current;
                  onCollapsedChange?.(next);
                  return next;
                });
              }}
              aria-expanded={!isCollapsed}
              aria-controls={contentId}
              className="-mx-1 flex min-w-0 flex-1 items-start gap-2 rounded-lg px-1 py-0.5 text-left hover:bg-gray-50 active:bg-gray-100"
            >
              <span
                aria-hidden="true"
                className={`mt-0.5 shrink-0 text-xs text-gray-400 transition-transform ${
                  isCollapsed ? '' : 'rotate-90'
                }`}
              >
                ▶
              </span>
              {headerContent}
            </button>
          ) : (
            headerContent
          )}

          {action && (
            <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
              {action}
            </div>
          )}
        </div>
      )}

      {!isCollapsed && (
        <div id={contentId} className={bodyPaddingClass}>
          {children}
        </div>
      )}
    </section>
  );
}

export default memo(SectionCard);
