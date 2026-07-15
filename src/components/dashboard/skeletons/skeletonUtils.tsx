type SkeletonPulseProps = {
  className?: string;
};

export function SkeletonPulse({ className = '' }: SkeletonPulseProps) {
  return <div className={`animate-pulse rounded bg-gray-200 ${className}`} aria-hidden="true" />;
}

export const dashboardWidgetSectionClassName =
  'rounded-xl border border-gray-200 bg-white p-4 shadow-sm';

export const dashboardWidgetHeadingClassName =
  'text-base font-semibold text-gray-900';
