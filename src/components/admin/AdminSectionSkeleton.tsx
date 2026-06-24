export default function AdminSectionSkeleton({ className = 'h-80' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} aria-hidden="true" />
  );
}
