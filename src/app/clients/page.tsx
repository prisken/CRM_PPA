import StandardUserDashboardPage from '@/components/dashboard/StandardUserDashboardPage';

export const dynamic = 'force-dynamic';

/** SIMPLE_MODE: Clients is a top-level nav item (assigned for RO, all for admin). */
export default function ClientsRoute() {
  return <StandardUserDashboardPage forcedView="clients" />;
}
