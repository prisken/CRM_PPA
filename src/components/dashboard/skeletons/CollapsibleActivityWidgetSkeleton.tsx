import { ChevronDown } from 'lucide-react';
import {
  dashboardWidgetHeadingClassName,
  dashboardWidgetSectionClassName,
  SkeletonPulse,
} from '@/components/dashboard/skeletons/skeletonUtils';

type CollapsibleActivityWidgetSkeletonProps = {
  title?: string;
};

export default function CollapsibleActivityWidgetSkeleton({
  title = 'Recent Activity',
}: CollapsibleActivityWidgetSkeletonProps) {
  return (
    <section className={dashboardWidgetSectionClassName}>
      <h2 className={dashboardWidgetHeadingClassName}>{title}</h2>

      <div className="mt-4 divide-y divide-gray-200 rounded-lg border border-gray-200">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex w-full items-center justify-between gap-3 px-4 py-3"
          >
            <SkeletonPulse className="h-4 w-40 max-w-full" />
            <ChevronDown
              className="h-4 w-4 shrink-0 text-gray-300"
              aria-hidden="true"
            />
          </div>
        ))}
      </div>
    </section>
  );
}
