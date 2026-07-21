import { Suspense } from 'react';
import SuperAdminDashboardPage from '@/components/admin/SuperAdminDashboardPage';

export const dynamic = 'force-dynamic';

function AdminFallback() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-100">
      <p className="text-sm text-gray-600">Loading admin dashboard…</p>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<AdminFallback />}>
      <SuperAdminDashboardPage />
    </Suspense>
  );
}
