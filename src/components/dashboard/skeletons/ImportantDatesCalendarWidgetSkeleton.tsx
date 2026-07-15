import {
  dashboardWidgetHeadingClassName,
  dashboardWidgetSectionClassName,
  SkeletonPulse,
} from '@/components/dashboard/skeletons/skeletonUtils';

export default function ImportantDatesCalendarWidgetSkeleton() {
  return (
    <section className={dashboardWidgetSectionClassName} aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className={dashboardWidgetHeadingClassName}>
            Important Dates Calendar
          </h2>
          <SkeletonPulse className="mt-2 h-3 w-48 max-w-full sm:w-64" />
        </div>
        <SkeletonPulse className="h-8 w-32 shrink-0 self-start" />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <SkeletonPulse className="h-9 w-full rounded-lg" />
        <SkeletonPulse className="h-9 w-full rounded-lg sm:col-span-1 lg:col-span-2" />
        <SkeletonPulse className="hidden h-9 w-full rounded-lg lg:block" />
      </div>

      <div className="mt-3 overflow-x-auto">
        <div className="min-w-[20rem] sm:min-w-[36rem]">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-gray-200 bg-gray-200">
            {Array.from({ length: 7 }).map((_, index) => (
              <div key={`h-${index}`} className="bg-gray-50 px-1 py-2">
                <SkeletonPulse className="mx-auto h-3 w-6 sm:w-8" />
              </div>
            ))}
            {Array.from({ length: 35 }).map((_, index) => (
              <div
                key={`c-${index}`}
                className="min-h-[3.75rem] bg-white p-1 sm:min-h-[4.5rem] sm:p-1.5"
              >
                <SkeletonPulse className="h-4 w-4 rounded-full" />
                <SkeletonPulse className="mt-2 h-3 w-full" />
                <SkeletonPulse className="mt-1 hidden h-3 w-16 sm:block" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
