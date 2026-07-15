import {
  dashboardWidgetHeadingClassName,
  dashboardWidgetSectionClassName,
  SkeletonPulse,
} from '@/components/dashboard/skeletons/skeletonUtils';

const TABLE_HEADERS = [
  'Deal',
  'Client',
  'Type',
  'Status',
  'My roles',
  'My %',
  'My commission',
];

export default function MyDealParticipationWidgetSkeleton() {
  return (
    <section className={dashboardWidgetSectionClassName}>
      <h2 className={dashboardWidgetHeadingClassName}>My Deal Participation</h2>
      <SkeletonPulse className="mt-2 h-3 w-56" />

      <div className="mt-3 overflow-x-auto">
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
            {Array.from({ length: 3 }).map((_, index) => (
              <tr key={index} className="border-b border-gray-100">
                {TABLE_HEADERS.map((header) => (
                  <td key={header} className="px-3 py-3">
                    <SkeletonPulse className="h-4 w-20" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
