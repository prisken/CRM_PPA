import {
  dashboardWidgetHeadingClassName,
  dashboardWidgetSectionClassName,
  SkeletonPulse,
} from '@/components/dashboard/skeletons/skeletonUtils';

const TABLE_HEADERS = ['Client Name', 'My Role', 'Client Status', 'Deal Value'];

export default function MyClientsWidgetSkeleton() {
  return (
    <section className={dashboardWidgetSectionClassName}>
      <h2 className={dashboardWidgetHeadingClassName}>My Assigned Clients</h2>

      <SkeletonPulse className="mt-4 h-[38px] w-full rounded-lg" />

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
              {TABLE_HEADERS.map((header) => (
                <th key={header} className="px-3 py-2 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, index) => (
              <tr key={index} className="border-b border-gray-100">
                <td className="px-3 py-3">
                  <SkeletonPulse className="h-4 w-32" />
                </td>
                <td className="px-3 py-3">
                  <SkeletonPulse className="h-4 w-24" />
                </td>
                <td className="px-3 py-3">
                  <SkeletonPulse className="h-4 w-28" />
                </td>
                <td className="px-3 py-3">
                  <SkeletonPulse className="h-4 w-16" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
