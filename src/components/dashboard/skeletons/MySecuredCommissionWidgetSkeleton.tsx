import {
  dashboardWidgetHeadingClassName,
  dashboardWidgetSectionClassName,
  SkeletonPulse,
} from '@/components/dashboard/skeletons/skeletonUtils';

export default function MySecuredCommissionWidgetSkeleton() {
  return (
    <section className={dashboardWidgetSectionClassName}>
      <h2 className={dashboardWidgetHeadingClassName}>My Secured Commission</h2>
      <SkeletonPulse className="mt-3 h-9 w-36" />
      <SkeletonPulse className="mt-1 h-3 w-48" />
    </section>
  );
}
