import {
  dashboardWidgetHeadingClassName,
  dashboardWidgetSectionClassName,
  SkeletonPulse,
} from '@/components/dashboard/skeletons/skeletonUtils';

export default function MyTasksWidgetSkeleton() {
  return (
    <section className={dashboardWidgetSectionClassName}>
      <h2 className={dashboardWidgetHeadingClassName}>My Open Tasks</h2>

      <ul className="mt-4 space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <li
            key={index}
            className="flex items-start gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-3"
          >
            <SkeletonPulse className="mt-1 h-4 w-4 shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <SkeletonPulse className="h-4 w-full max-w-[240px]" />
              <SkeletonPulse className="mt-1 h-3 w-28" />
              <SkeletonPulse className="mt-1 h-3 w-24" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
