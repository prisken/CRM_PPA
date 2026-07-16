'use client';

import { memo, useMemo } from 'react';
import CompactPill from '@/components/ui/CompactPill';
import ClientStrategyMap from '@/components/clients/ClientStrategyMap';
import ClientStrategyMapSummary from '@/components/clients/ClientStrategyMapSummary';
import ClientStrategyPerks from '@/components/clients/ClientStrategyPerks';
import {
  buildClientStrategyMapNodes,
  buildClientStrategyPerks,
  buildClientStrategyReportSummary,
  type ClientStrategyReportPlanInput,
} from '@/lib/clientStrategyReportHelpers';

const NEXT_STEPS = [
  'Review the strategy overview with your advisor',
  'Confirm assumptions and milestone timing',
  'Approve or revise the recommended plan',
  'Schedule the next advisor review',
] as const;

export type ClientStrategyOverviewReportProps = {
  /** Plan fields + milestones + steps used to build the report view model. */
  plan: ClientStrategyReportPlanInput;
  /** Optional client display name for snapshot context. */
  clientName?: string | null;
  /** Optional plan status (e.g. DRAFT / ACTIVE). */
  status?: string | null;
  className?: string;
};

function formatStatusLabel(status: string | null | undefined): string | null {
  if (!status?.trim()) {
    return null;
  }
  return status
    .trim()
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ReportSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="space-y-3 print:break-inside-avoid"
    >
      <h3
        id={`${id}-heading`}
        className="text-sm font-semibold tracking-tight text-gray-900"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

function ClientStrategyOverviewReport({
  plan,
  clientName = null,
  status = null,
  className = '',
}: ClientStrategyOverviewReportProps) {
  const summary = useMemo(
    () => buildClientStrategyReportSummary(plan),
    [plan]
  );
  const nodes = useMemo(() => buildClientStrategyMapNodes(plan), [plan]);
  const perks = useMemo(() => buildClientStrategyPerks(plan), [plan]);

  const planTitle = summary.planTitle ?? 'Strategy overview';
  const statusLabel = formatStatusLabel(status);
  const hasMilestones = summary.milestoneCount > 0;
  const snapshotDescription =
    plan.description?.trim() ||
    summary.clientGoal ||
    'A presentation overview of this strategy plan\'s selected milestones and goals.';

  return (
    <article
      aria-labelledby="strategy-overview-title"
      className={`space-y-8 rounded-xl border border-gray-200 bg-gradient-to-b from-slate-50/80 to-white p-4 shadow-sm sm:p-6 print:border-0 print:bg-white print:p-0 print:text-black print:shadow-none ${className}`.trim()}
    >
      {/* 1. Header / Strategy Snapshot */}
      <header className="space-y-3 border-b border-gray-200 pb-5 print:border-gray-300 print:pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <CompactPill tone="blue" size="xs">
            Illustrative planning overview
          </CompactPill>
          {statusLabel ? (
            <CompactPill tone="gray" size="xs">
              {statusLabel}
            </CompactPill>
          ) : null}
        </div>

        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
            Strategy Snapshot
          </p>
          <h2
            id="strategy-overview-title"
            className="mt-1 text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl print:text-xl"
          >
            {planTitle}
          </h2>
          {clientName?.trim() ? (
            <p className="mt-1 text-sm text-gray-600">
              Prepared for{' '}
              <span className="font-medium text-gray-800">
                {clientName.trim()}
              </span>
            </p>
          ) : null}
          {summary.clientGoal && summary.clientGoal !== planTitle ? (
            <p className="mt-1 text-sm text-gray-700">
              <span className="font-medium text-gray-800">Goal: </span>
              {summary.clientGoal}
            </p>
          ) : null}
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-600">
            {snapshotDescription}
          </p>
          <p className="mt-3 max-w-3xl rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs leading-relaxed text-slate-600 print:border-gray-200 print:bg-transparent">
            <span className="font-medium text-slate-700">How to read this: </span>
            Start with the figures below, follow the journey map from goal to
            outcome, then review perks and assumptions. Figures are advisor-entered
            checkpoints—not an automatic forecast.
          </p>
        </div>
      </header>

      {/* 2. At-a-glance summary */}
      <ReportSection id="overview-summary" title="Key figures">
        <ClientStrategyMapSummary summary={summary} />
        <p className="text-[11px] leading-relaxed text-gray-500">
          Saved milestone values only. A dash (—) means nothing was entered.
          &ldquo;Entered&rdquo; labels reflect illustrative figures your advisor
          chose to record.
        </p>
      </ReportSection>

      {/* 3. Client Strategy Map */}
      <ReportSection id="overview-map" title="Your strategy journey">
        <ClientStrategyMap nodes={nodes} hasMilestones={hasMilestones} />
      </ReportSection>

      {/* 4. Plan Perks / Benefits */}
      <ReportSection id="overview-perks" title="What this plan highlights">
        <ClientStrategyPerks perks={perks} hasMilestones={hasMilestones} />
      </ReportSection>

      {/* 5. Key Assumptions & Disclaimer */}
      <ReportSection id="overview-disclaimer" title="Assumptions & disclaimer">
        <div className="space-y-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3.5 text-xs leading-relaxed text-slate-700 print:border-gray-200 print:bg-white print:text-gray-800">
          <p className="font-medium text-slate-800">
            For planning and presentation purposes only.
          </p>
          <p>
            Projection milestones are illustrative and based on manually entered
            assumptions. Actual results may vary. This view is for planning and
            presentation purposes only.
          </p>
          <ul className="list-disc space-y-1 pl-4 text-slate-600">
            <li>Values shown are manually entered by the advisor.</li>
            <li>
              Helper suggestions (if used when editing milestones) are optional
              and are never forced into this report.
            </li>
            <li>
              This report does not automatically generate year-by-year
              projections.
            </li>
          </ul>
        </div>
      </ReportSection>

      {/* 6. Recommended Next Steps */}
      <ReportSection id="overview-next-steps" title="Suggested next conversation">
        <ol className="space-y-2">
          {NEXT_STEPS.map((step, index) => (
            <li
              key={step}
              className="flex gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5 print:break-inside-avoid"
            >
              <span
                aria-hidden="true"
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700"
              >
                {index + 1}
              </span>
              <span className="text-sm text-gray-800">{step}</span>
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-gray-500">
          These next steps are discussion prompts only and are not binding
          commitments.
        </p>
      </ReportSection>
    </article>
  );
}

export default memo(ClientStrategyOverviewReport);
