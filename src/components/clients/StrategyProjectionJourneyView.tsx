'use client';

import { memo, useMemo } from 'react';
import CompactPill from '@/components/ui/CompactPill';
import SectionCard from '@/components/ui/SectionCard';
import {
  buildProjectionJourneySummary,
  formatProjectionMilestoneType,
  getProjectionMilestoneReorderBounds,
  sortProjectionMilestones,
  type StrategyProjectionMilestone,
} from '@/lib/clientStrategyProjectionHelpers';
import { displayMoney } from '@/lib/formatMoney';

type StrategyProjectionJourneyViewProps = {
  milestones: StrategyProjectionMilestone[];
  canManage?: boolean;
  deletingMilestoneId?: string | null;
  reorderingMilestoneId?: string | null;
  onAddMilestone?: () => void;
  onEditMilestone?: (milestone: StrategyProjectionMilestone) => void;
  onDeleteMilestone?: (milestone: StrategyProjectionMilestone) => void;
  onReorderMilestone?: (
    milestoneId: string,
    direction: 'earlier' | 'later'
  ) => void;
};

function displayYear(value: number | null | undefined) {
  return value === null || value === undefined ? '—' : String(value);
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

/** Always renders; missing values show as —. */
function MetaRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <p className="text-xs text-gray-600">
      <span className="font-medium text-gray-700">{label}: </span>
      {value}
    </p>
  );
}

function SourceChips({
  label,
  items,
  tone,
}: {
  label: string;
  items: Array<{ id: string; title: string }>;
  tone: 'blue' | 'amber';
}) {
  if (items.length === 0) {
    return null;
  }

  const chipClass =
    tone === 'blue'
      ? 'border-blue-200 bg-blue-50 text-blue-900'
      : 'border-amber-200 bg-amber-50 text-amber-900';

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <ul className="mt-1 flex list-none flex-wrap gap-1 p-0">
        {items.map((item) => (
          <li
            key={item.id}
            className={`max-w-full truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${chipClass}`}
            title={item.title}
          >
            {item.title}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MilestoneTableHead() {
  return (
    <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
      <tr>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">Year</th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">
          Milestone
        </th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">Type</th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">
          Income this year
        </th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">
          Expenses this year
        </th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">
          Net this year
        </th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">
          Cumulative income
        </th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">
          Cumulative expenses
        </th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">
          Capital returned
        </th>
        <th className="whitespace-nowrap px-3 py-2 font-semibold">
          Total position
        </th>
      </tr>
    </thead>
  );
}

function milestoneSourceStepChips(
  milestone: StrategyProjectionMilestone
): Array<{ id: string; title: string }> {
  return (milestone.selectedSteps ?? []).map((entry) => ({
    id: entry.stepId,
    title: entry.step?.title?.trim() || entry.stepId,
  }));
}

function milestoneSourceExpenseChips(
  milestone: StrategyProjectionMilestone
): Array<{ id: string; title: string }> {
  return (milestone.selectedExpenses ?? []).map((entry) => ({
    id: entry.expenseId,
    title: entry.expense?.title?.trim() || entry.expenseId,
  }));
}

function StrategyProjectionJourneyView({
  milestones,
  canManage = false,
  deletingMilestoneId = null,
  reorderingMilestoneId = null,
  onAddMilestone,
  onEditMilestone,
  onDeleteMilestone,
  onReorderMilestone,
}: StrategyProjectionJourneyViewProps) {
  const isEmpty = milestones.length === 0;
  const sorted = useMemo(
    () => sortProjectionMilestones(milestones),
    [milestones]
  );
  // Illustrative summary cards — pure aggregate; recompute only when milestones change.
  const summary = useMemo(
    () => buildProjectionJourneySummary(milestones),
    [milestones]
  );

  function handleAddMilestone() {
    onAddMilestone?.();
  }

  return (
    <SectionCard
      title="Projection Journey"
      description="Show selected years with illustrative earning, spending, net cashflow, and total position. Values are advisor-entered (or applied from suggestions)."
      action={
        canManage && !isEmpty ? (
          <button
            type="button"
            onClick={handleAddMilestone}
            className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
          >
            Add projection milestone
          </button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        {isEmpty ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 px-3 py-6">
              <div className="mx-auto max-w-md text-center">
                <p className="text-sm font-medium text-gray-900">
                  No projection milestones yet
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Add selected years to show illustrative income, expenses, and
                  total position for the client journey.
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-500">
                  Milestones are chosen manually—this view does not auto-generate
                  every year.
                </p>
                {canManage ? (
                  <button
                    type="button"
                    onClick={handleAddMilestone}
                    className="mt-4 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  >
                    Add projection milestone
                  </button>
                ) : null}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">
                Milestone table
              </p>
              <div className="overflow-x-auto rounded-lg border border-dashed border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                  <MilestoneTableHead />
                  <tbody className="bg-white">
                    <tr>
                      <td
                        colSpan={10}
                        className="px-3 py-8 text-center text-xs text-gray-500"
                      >
                        No projection rows yet. Add a milestone to populate this
                        table.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">
                Illustrative summary
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <SummaryCard
                  label="Initial Capital"
                  value={displayMoney(summary.initialCapital)}
                />
                <SummaryCard
                  label="Monthly Income"
                  value={displayMoney(summary.monthlyIncome)}
                />
                <SummaryCard
                  label="First Projection Year"
                  value={displayYear(summary.firstProjectionYear)}
                />
                <SummaryCard
                  label="Latest Projection Year"
                  value={displayYear(summary.latestProjectionYear)}
                />
                <SummaryCard
                  label="Cumulative Income"
                  value={displayMoney(summary.cumulativeIncome)}
                />
                <SummaryCard
                  label="Total Asset Position"
                  value={displayMoney(summary.totalAssetPosition)}
                />
              </div>
              <p className="mt-2 text-[11px] text-gray-500">
                Summary uses values saved on milestones only. Cumulative income
                and total asset position prefer the latest year (then sort
                order). Missing values show as —.
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">
                Journey timeline
              </p>
              <ol className="space-y-3">
                {sorted.map((milestone, index) => {
                  const reorderBounds = getProjectionMilestoneReorderBounds(
                    milestones,
                    milestone.id
                  );
                  const showReorder =
                    canManage &&
                    Boolean(onReorderMilestone) &&
                    (reorderBounds.canMoveEarlier ||
                      reorderBounds.canMoveLater);
                  const stepChips = milestoneSourceStepChips(milestone);
                  const expenseChips = milestoneSourceExpenseChips(milestone);
                  const capitalReturnedDisplay =
                    milestone.capitalReturnedToDate ??
                    milestone.capitalReturnedThisYear ??
                    null;

                  return (
                    <li
                      key={milestone.id}
                      className="relative rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm"
                    >
                      {index < sorted.length - 1 ? (
                        <span
                          aria-hidden
                          className="absolute left-[1.35rem] top-full hidden h-3 w-px bg-gray-200 sm:block"
                        />
                      ) : null}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-gray-900">
                              {milestone.year}
                            </span>
                            <CompactPill tone="blue">
                              {formatProjectionMilestoneType(milestone.type)}
                            </CompactPill>
                          </div>
                          <h4 className="mt-1 text-sm font-medium text-gray-900">
                            {milestone.title}
                          </h4>

                          <div className="mt-2 grid gap-1 sm:grid-cols-2">
                            <MetaRow
                              label="Income this year"
                              value={displayMoney(milestone.incomeThisPeriod)}
                            />
                            <MetaRow
                              label="Expenses this year"
                              value={displayMoney(milestone.expensesThisYear)}
                            />
                            <MetaRow
                              label="Net this year"
                              value={displayMoney(
                                milestone.netCashflowThisYear
                              )}
                            />
                            <MetaRow
                              label="Cumulative income"
                              value={displayMoney(milestone.cumulativeIncome)}
                            />
                            <MetaRow
                              label="Cumulative expenses"
                              value={displayMoney(
                                milestone.cumulativeExpenses
                              )}
                            />
                            <MetaRow
                              label="Capital returned"
                              value={displayMoney(capitalReturnedDisplay)}
                            />
                            <MetaRow
                              label="Total position"
                              value={displayMoney(
                                milestone.totalAssetPosition
                              )}
                            />
                          </div>

                          {(stepChips.length > 0 || expenseChips.length > 0) && (
                            <div className="mt-2 space-y-1.5">
                              <SourceChips
                                label="Strategy items"
                                items={stepChips}
                                tone="blue"
                              />
                              <SourceChips
                                label="Expenses"
                                items={expenseChips}
                                tone="amber"
                              />
                            </div>
                          )}

                          <div className="mt-2 grid gap-1 border-t border-dashed border-gray-100 pt-2 sm:grid-cols-2">
                            <MetaRow
                              label="Capital invested"
                              value={displayMoney(milestone.capitalInvested)}
                            />
                            <MetaRow
                              label="Capital remaining"
                              value={displayMoney(milestone.capitalRemaining)}
                            />
                            <MetaRow
                              label="Monthly income"
                              value={displayMoney(milestone.monthlyIncome)}
                            />
                            <MetaRow
                              label="Capital returned this year"
                              value={displayMoney(
                                milestone.capitalReturnedThisYear
                              )}
                            />
                          </div>

                          {milestone.notes?.trim() ? (
                            <p className="mt-2 text-xs text-gray-600">
                              <span className="font-medium text-gray-700">
                                Notes:{' '}
                              </span>
                              {milestone.notes.trim()}
                            </p>
                          ) : null}

                          {showReorder && onReorderMilestone ? (
                            <div
                              role="group"
                              aria-label={`Reorder ${milestone.title}`}
                              className="mt-2 flex flex-wrap items-center gap-2.5"
                            >
                              {reorderBounds.canMoveEarlier ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onReorderMilestone(
                                      milestone.id,
                                      'earlier'
                                    )
                                  }
                                  disabled={Boolean(reorderingMilestoneId)}
                                  aria-label={`Move ${milestone.title} up`}
                                  className="text-[11px] font-medium text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                                >
                                  Move up
                                </button>
                              ) : null}
                              {reorderBounds.canMoveLater ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onReorderMilestone(milestone.id, 'later')
                                  }
                                  disabled={Boolean(reorderingMilestoneId)}
                                  aria-label={`Move ${milestone.title} down`}
                                  className="text-[11px] font-medium text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
                                >
                                  Move down
                                </button>
                              ) : null}
                              {reorderingMilestoneId === milestone.id ? (
                                <span
                                  className="text-[11px] text-gray-500"
                                  aria-live="polite"
                                >
                                  Reordering…
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        {canManage ? (
                          <div className="flex shrink-0 items-center gap-2">
                            {onEditMilestone ? (
                              <button
                                type="button"
                                onClick={() => onEditMilestone(milestone)}
                                className="text-xs font-medium text-blue-700 hover:text-blue-900"
                              >
                                Edit
                              </button>
                            ) : null}
                            {onDeleteMilestone ? (
                              <button
                                type="button"
                                onClick={() => onDeleteMilestone(milestone)}
                                disabled={
                                  deletingMilestoneId === milestone.id
                                }
                                className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                              >
                                {deletingMilestoneId === milestone.id
                                  ? 'Deleting…'
                                  : 'Delete'}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-gray-700">
                Milestone table
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                  <MilestoneTableHead />
                  <tbody className="divide-y divide-gray-100 bg-white text-gray-800">
                    {sorted.map((milestone) => {
                      const capitalReturnedDisplay =
                        milestone.capitalReturnedToDate ??
                        milestone.capitalReturnedThisYear ??
                        null;

                      return (
                        <tr key={`table-${milestone.id}`}>
                          <td className="whitespace-nowrap px-3 py-2 font-medium">
                            {milestone.year}
                          </td>
                          <td className="max-w-[12rem] truncate px-3 py-2">
                            {milestone.title}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {formatProjectionMilestoneType(milestone.type)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {displayMoney(milestone.incomeThisPeriod)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {displayMoney(milestone.expensesThisYear)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {displayMoney(milestone.netCashflowThisYear)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {displayMoney(milestone.cumulativeIncome)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {displayMoney(milestone.cumulativeExpenses)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {displayMoney(capitalReturnedDisplay)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {displayMoney(milestone.totalAssetPosition)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-gray-500">
          Projection milestones are illustrative. Figures are advisor-entered or
          applied from suggestions based on selected plans and expenses—they are
          not guarantees. Actual results may vary. This view is for planning and
          presentation purposes only.
        </p>
      </div>
    </SectionCard>
  );
}

export default memo(StrategyProjectionJourneyView);
