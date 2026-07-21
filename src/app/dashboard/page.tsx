import { Suspense } from 'react';
import StandardUserDashboardPage from '@/components/dashboard/StandardUserDashboardPage';

export const dynamic = 'force-dynamic';

function DashboardFallback() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-100">
      <p className="text-sm text-gray-600">Loading dashboard…</p>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <StandardUserDashboardPage />
    </Suspense>
  );
}
