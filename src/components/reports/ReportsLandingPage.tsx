'use client';

import Link from 'next/link';
import WorkspaceShell from '@/components/layout/WorkspaceShell';
import { buildWorkspaceNavConfig } from '@/components/layout/workspaceNavConfig';
import { useUserProfile } from '@/hooks/useUserProfile';

/**
 * Reports (SIMPLE_MODE nav) — v1 landing. The full client-reporting
 * engine (Monthly Pulse + Quarterly Policy Review) lands in Phases 4-5
 * of the revamp brief; this page keeps the nav destination real today.
 */
export default function ReportsLandingPage() {
  const { profile, loading } = useUserProfile();

  if (loading) {
    return <div className="flex min-h-dvh items-center justify-center bg-gray-100 text-sm text-gray-500">Loading…</div>;
  }

  const nav = buildWorkspaceNavConfig({
    shell: 'standard',
    role: profile?.role ?? 'STANDARD_USER',
  });

  return (
    <WorkspaceShell
      nav={nav}
      userRole={profile?.role ?? 'STANDARD_USER'}
      title="Reports"
      subtitle="Client reporting rhythm — monthly snapshots and quarterly reviews"
    >
      <div className="space-y-4">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Client reporting</h2>
          <p className="mt-1 text-sm text-gray-600">
            Two rhythms, one goal: keep every client reviewed and give you a reason to meet.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Monthly Pulse</h3>
              <p className="mt-1 text-xs text-gray-500">
                One page: what's covered, what's coming up, one concept. Drafted automatically near month end.
              </p>
              <span className="mt-3 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                Coming in the reporting build
              </span>
            </div>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <h3 className="text-sm font-semibold text-gray-900">Quarterly Policy Review</h3>
              <p className="mt-1 text-xs text-gray-500">
                Pre-meeting pack: goals, current policies, discussion items, agenda. Booked face-to-face.
              </p>
              <span className="mt-3 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                Coming in the reporting build
              </span>
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-400">
            Need a client's numbers now?{' '}
            <Link href="/clients" className="font-medium text-blue-600 hover:underline">
              Open a client
            </Link>{' '}
            — their deal, dates, and notes are all there.
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}
