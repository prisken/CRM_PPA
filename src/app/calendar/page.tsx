import StandardUserDashboardPage from '@/components/dashboard/StandardUserDashboardPage';

export const dynamic = 'force-dynamic';

/** SIMPLE_MODE: Calendar (important dates + tasks + reviews). */
export default function CalendarRoute() {
  return <StandardUserDashboardPage forcedView="calendar" />;
}
