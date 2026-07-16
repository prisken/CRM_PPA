'use client';

import { memo } from 'react';
import type { ClientStrategyReportSummary } from '@/lib/clientStrategyReportHelpers';

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

function displayMoney(value: number | null | undefined) {
  return formatMoney(value) ?? '—';
}

function displayTimeline(
  startYear: number | null,
  endYear: number | null
): string {
  if (startYear === null && endYear === null) {
    return '—';
  }
  if (startYear !== null && endYear !== null) {
    if (startYear === endYear) {
      return String(startYear);
    }
    return `${startYear} – ${endYear}`;
  }
  return String(startYear ?? endYear);
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 print:break-inside-avoid">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-gray-900">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}

type ClientStrategyMapSummaryProps = {
  summary: ClientStrategyReportSummary;
};

function ClientStrategyMapSummary({ summary }: ClientStrategyMapSummaryProps) {
  const milestonesSteps =
    summary.milestoneCount === 0 &&
    summary.stepCount === 0 &&
    summary.expenseCount === 0
      ? '—'
      : `${summary.milestoneCount} milestone${
          summary.milestoneCount === 1 ? '' : 's'
        } · ${summary.stepCount} step${summary.stepCount === 1 ? '' : 's'}${
          summary.expenseCount > 0
            ? ` · ${summary.expenseCount} expense${
                summary.expenseCount === 1 ? '' : 's'
              }`
            : ''
        }`;

  const incomeThisYearHint =
    summary.incomeThisYearSourceYear !== null
      ? `Year ${summary.incomeThisYearSourceYear}`
      : 'As entered';

  return (
    <div
      role="group"
      aria-label="Key strategy figures"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
    >
      <SummaryCard
        label="Total planned investment"
        value={displayMoney(
          summary.totalPlannedInvestment ?? summary.initialCapital
        )}
        hint="As entered"
      />
      <SummaryCard
        label="Income this year"
        value={displayMoney(summary.incomeThisYear)}
        hint={incomeThisYearHint}
      />
      <SummaryCard
        label="Target income"
        value={displayMoney(summary.targetMonthlyIncome)}
        hint="Monthly · latest entered"
      />
      <SummaryCard
        label="Total projected income"
        value={displayMoney(summary.projectedCumulativeIncome)}
        hint="As entered"
      />
      <SummaryCard
        label="Total planned expenses"
        value={displayMoney(summary.totalPlannedExpenses)}
        hint="As entered"
      />
      <SummaryCard
        label="Capital expected back"
        value={displayMoney(summary.capitalExpectedBack)}
        hint="As entered"
      />
      <SummaryCard
        label="Illustrative total position"
        value={displayMoney(summary.projectedAssetPosition)}
        hint="As entered"
      />
      <SummaryCard
        label="Timeline"
        value={displayTimeline(
          summary.timelineStartYear,
          summary.timelineEndYear
        )}
        hint="Milestone years"
      />
      <SummaryCard
        label="Milestones / items"
        value={milestonesSteps}
        hint="Selected plan items"
      />
    </div>
  );
}

export default memo(ClientStrategyMapSummary);
