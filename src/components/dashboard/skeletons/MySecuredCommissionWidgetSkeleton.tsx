import {
  dashboardWidgetHeadingClassName,
  dashboardWidgetSectionClassName,
  SkeletonPulse,
} from '@/components/dashboard/skeletons/skeletonUtils';

export default function MySecuredCommissionWidgetSkeleton() {
  return (
    <section className={dashboardWidgetSectionClassName}>
      <h2 className={dashboardWidgetHeadingClassName}>My Secured Commission</h2>
      <SkeletonPulse className="mt-4 h-10 w-40" />
      <p className="mt-2 text-sm text-gray-500">
        Based on WON deals across your assigned clients
      </p>
    </section>
  );
}
