'use client';

import Link from 'next/link';
import ClientStrategyOverviewReport from '@/components/clients/ClientStrategyOverviewReport';
import type { ClientStrategyReportPlanInput } from '@/lib/clientStrategyReportHelpers';

export type ClientStrategyOverviewPageShellProps = {
  clientId: string;
  planId: string;
  clientName: string | null;
  planStatus: string | null;
  reportPlan: ClientStrategyReportPlanInput;
};

function ClientStrategyOverviewPageShell({
  clientId,
  planId,
  clientName,
  planStatus,
  reportPlan,
}: ClientStrategyOverviewPageShellProps) {
  return (
    <div className="min-h-full bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:px-0 print:py-0">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 print:mb-4 print:hidden">
          <Link
            href={`/clients/${clientId}#strategy-planner`}
            className="text-sm font-medium text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            ← Back to Strategy Planner
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print strategy overview"
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            Print
          </button>
        </header>

        <ClientStrategyOverviewReport
          plan={reportPlan}
          clientName={clientName}
          status={planStatus}
        />

        <p className="mt-6 text-center text-[11px] text-gray-400 print:hidden">
          Plan reference: {planId}
        </p>
      </div>
    </div>
  );
}

export default ClientStrategyOverviewPageShell;
