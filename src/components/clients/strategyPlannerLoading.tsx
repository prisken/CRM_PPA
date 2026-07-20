'use client';

import { SkeletonPulse } from '@/components/dashboard/skeletons/skeletonUtils';

/** Placeholder while Strategy Planner tab / plan detail chunk loads. */
export function StrategyPlannerPanelSkeleton({
  label = 'Loading Strategy Planner…',
}: {
  label?: string;
}) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label={label}>
      <SkeletonPulse className="h-8 w-56" />
      <SkeletonPulse className="h-4 w-full max-w-md" />
      <div className="space-y-3">
        <SkeletonPulse className="h-20 w-full rounded-lg" />
        <SkeletonPulse className="h-20 w-full rounded-lg" />
        <SkeletonPulse className="h-20 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Placeholder while Board canvas chunk loads. */
export function StrategyPlannerBoardSkeleton() {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-label="Loading board view"
    >
      <div className="flex gap-3 overflow-hidden pb-1">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="min-w-[200px] flex-1 space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3"
          >
            <SkeletonPulse className="h-4 w-24" />
            <SkeletonPulse className="h-24 w-full rounded-md" />
            <SkeletonPulse className="h-16 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Placeholder while Projection Journey chunk loads. */
export function StrategyPlannerProjectionSkeleton() {
  return (
    <div
      className="space-y-3"
      role="status"
      aria-live="polite"
      aria-label="Loading projection view"
    >
      <SkeletonPulse className="h-10 w-48" />
      <SkeletonPulse className="h-28 w-full rounded-lg" />
      <SkeletonPulse className="h-28 w-full rounded-lg" />
      <SkeletonPulse className="h-28 w-full rounded-lg" />
    </div>
  );
}
