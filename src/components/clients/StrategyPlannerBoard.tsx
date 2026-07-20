'use client';

import { memo, useMemo, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, CornerDownRight } from 'lucide-react';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getTightStackSpacingClass } from '@/components/ui/displayDensity';
import {
  buildStepProjectionBadges,
  type StepProjectionBadge,
  type StrategyProjectionMilestone,
} from '@/lib/clientStrategyProjectionHelpers';
import {
  buildExpenseEconomicsById,
  buildStepEconomicsById,
  getExpenseEconomicsLabels,
  getStepEconomicsLabels,
  type ExpenseEconomicsLabels,
  type StepEconomicsLabels,
} from '@/components/clients/strategyTimelineEconomicsDisplay';
import { formatMoney } from '@/lib/formatMoney';

/** Matches StrategyPlanDetailView / formatStrategyPlanDetail step payload. */
export type StrategyBoardStep = {
  id: string;
  title: string;
  stepType: string;
  linkedDealId: string | null;
  plannedAmount: number | null;
  amountDescription: string | null;
  purpose: string | null;
  expectedAchievement: string | null;
  expectedIncomeAmount: number | null;
  expectedIncomeFrequency: string | null;
  timelineLabel: string | null;
  startYear?: number | null;
  endYear?: number | null;
  investmentAmount?: number | null;
  incomeAmount?: number | null;
  incomeFrequency?: string | null;
  incomeStartYear?: number | null;
  incomeEndYear?: number | null;
  capitalReturned?: number | null;
  capitalReturnYear?: number | null;
  sortOrder: number;
  createdAt?: string;
  linkedDeal: {
    id: string;
    name: string;
    dealValue?: number | null;
    status?: string | null;
    dealType?: string | null;
  } | null;
};

export type StrategyBoardConnection = {
  id: string;
  fromStepId: string;
  toStepId: string;
  connectionType: string;
  purpose: string | null;
  expectedOutcome: string | null;
  timing: string | null;
  createdAt?: string;
};

export type StrategyBoardExpense = {
  id: string;
  title: string;
  category: string;
  amount: number | null;
  frequency: string;
  startTimelineLabel: string | null;
  endTimelineLabel: string | null;
  startYear?: number | null;
  endYear?: number | null;
  priority: string;
  purpose: string | null;
  coveredByStepId?: string | null;
  notes?: string | null;
  coveredByStep: { id: string; title: string } | null;
  sortOrder: number;
  createdAt?: string;
};

export type StrategyBoardPlan = {
  id: string;
  title: string;
  description: string | null;
  clientGoal: string | null;
  expectedOutcome: string | null;
  status: string;
  steps: StrategyBoardStep[];
  connections: StrategyBoardConnection[];
  expenses: StrategyBoardExpense[];
  /** Optional; step cards show compact badges when milestones link via stepId. */
  projectionMilestones?: StrategyProjectionMilestone[];
};

export type StrategyPlannerBoardProps = {
  plan: StrategyBoardPlan;
  canManage?: boolean;
  deletingStepId?: string | null;
  deletingConnectionId?: string | null;
  deletingExpenseId?: string | null;
  /**
   * Custom header actions. Pass `null` to hide the default Add controls
   * (e.g. when the parent already shows a shared CRUD toolbar).
   * Omit to use the board’s built-in Add buttons.
   */
  headerActions?: ReactNode | null;
  onAddStep?: () => void;
  onAddConnection?: () => void;
  /**
   * Open connection create flow with from/to prefilled for an adjacent step pair
   * (previous step → next step along the board path).
   */
  onAddConnectionBetweenSteps?: (
    fromStepId: string,
    toStepId: string
  ) => void;
  onAddExpense?: () => void;
  /** Open expense create flow with coveredByStepId prefilled for this step. */
  onAddExpenseForStep?: (stepId: string) => void;
  /** Swap this step earlier (-1 / left / up) or later (+1 / right / down) in sort order. */
  onReorderStep?: (
    stepId: string,
    direction: 'earlier' | 'later'
  ) => void;
  reorderingStepId?: string | null;
  onEditStep?: (step: StrategyBoardStep) => void;
  onDeleteStep?: (step: StrategyBoardStep) => void;
  onEditConnection?: (connection: StrategyBoardConnection) => void;
  onDeleteConnection?: (connection: StrategyBoardConnection) => void;
  onEditExpense?: (expense: StrategyBoardExpense) => void;
  onDeleteExpense?: (expense: StrategyBoardExpense) => void;
};

function focusableControlClass(extra = '') {
  return `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${extra}`.trim();
}

function humanizeEnum(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function compareSortThenCreatedAt(
  a: { sortOrder: number; createdAt?: string },
  b: { sortOrder: number; createdAt?: string }
) {
  if (a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder;
  }

  const aCreated = a.createdAt ?? '';
  const bCreated = b.createdAt ?? '';
  if (aCreated && bCreated && aCreated !== bCreated) {
    return aCreated < bCreated ? -1 : 1;
  }

  return 0;
}

function MetaLine({
  label,
  value,
  clamp,
  showEmptyDash = false,
}: {
  label: string;
  value: string | null;
  clamp?: boolean;
  dense?: boolean;
  /** When true, render "—" instead of hiding missing values. */
  showEmptyDash?: boolean;
}) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed && !showEmptyDash) {
    return null;
  }

  return (
    <p
      className={`text-xs leading-snug text-gray-600 ${
        clamp ? 'line-clamp-2' : ''
      }`}
    >
      <span className="font-medium text-gray-700">{label}: </span>
      {trimmed || '—'}
    </p>
  );
}

/** Text + letter mark so type is not color-only. */
function TypeKindBadge({
  kind,
  label,
}: {
  kind: 'step' | 'connection' | 'expense';
  label: string;
}) {
  const kindMeta = {
    step: { letter: 'S', name: 'Step type', border: 'border-blue-300' },
    connection: {
      letter: 'C',
      name: 'Connection type',
      border: 'border-violet-300',
    },
    expense: { letter: 'E', name: 'Expense', border: 'border-amber-300' },
  }[kind];

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border bg-white px-1.5 py-0.5 text-[11px] font-medium text-gray-800 ${kindMeta.border}`}
      title={`${kindMeta.name}: ${label}`}
    >
      <span
        className="shrink-0 font-semibold text-gray-500"
        aria-hidden="true"
      >
        {kindMeta.letter}
      </span>
      <span className="sr-only">{kindMeta.name}: </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function LegendSwatch({
  letter,
  accentClass,
  label,
}: {
  letter: string;
  accentClass: string;
  label: string;
}) {
  return (
    <li className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-gray-700">
      <span
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-l-[3px] bg-white text-[10px] font-semibold text-gray-600 ${accentClass}`}
        aria-hidden="true"
      >
        {letter}
      </span>
      <span>{label}</span>
    </li>
  );
}

function BoardLegendItems() {
  return (
    <ul className="flex list-none flex-wrap items-center gap-x-3 gap-y-1.5 p-0">
      <LegendSwatch
        letter="S"
        accentClass="border-blue-200 border-l-blue-600"
        label="Step"
      />
      <LegendSwatch
        letter="C"
        accentClass="border-violet-200 border-l-violet-600 bg-violet-50/80"
        label="Connection"
      />
      <LegendSwatch
        letter="X"
        accentClass="border-violet-200 border-l-violet-700"
        label="Cross link"
      />
      <LegendSwatch
        letter="E"
        accentClass="border-amber-200 border-l-amber-600 bg-amber-50/80"
        label="Step-linked expense"
      />
      <LegendSwatch
        letter="P"
        accentClass="border-amber-200 border-l-amber-500 border-dashed"
        label="Plan-level expense"
      />
    </ul>
  );
}

/** Compact key for board chrome; collapsed on narrow screens. */
function BoardLegend() {
  return (
    <div className="min-w-0">
      <details className="rounded-md border border-gray-200 bg-white/90 sm:hidden">
        <summary
          className={focusableControlClass(
            'cursor-pointer list-none px-2.5 py-1.5 text-[11px] font-medium text-gray-700 marker:content-none [&::-webkit-details-marker]:hidden'
          )}
        >
          <span className="inline-flex items-center gap-1">
            Board legend
            <span className="text-gray-400" aria-hidden="true">
              ▾
            </span>
          </span>
        </summary>
        <div className="border-t border-gray-100 px-2.5 py-2">
          <BoardLegendItems />
        </div>
      </details>

      <div
        className="hidden min-w-0 sm:block"
        role="group"
        aria-label="Board legend"
      >
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          Legend
        </p>
        <BoardLegendItems />
      </div>
    </div>
  );
}

function ManageActions({
  canManage,
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
  deleting,
}: {
  canManage: boolean;
  editLabel: string;
  deleteLabel: string;
  onEdit?: () => void;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  if (!canManage || (!onEdit && !onDelete)) {
    return null;
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-2.5">
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={editLabel}
          className={focusableControlClass(
            'rounded-sm text-[11px] font-medium text-blue-700 underline-offset-2 hover:text-blue-800 hover:underline'
          )}
        >
          Edit
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={deleteLabel}
          className={focusableControlClass(
            'rounded-sm text-[11px] font-medium text-red-700 underline-offset-2 hover:text-red-800 hover:underline disabled:opacity-60'
          )}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      ) : null}
    </div>
  );
}

function StepReorderControls({
  stepTitle,
  canMoveEarlier,
  canMoveLater,
  disabled,
  showBusyLabel,
  onMoveEarlier,
  onMoveLater,
}: {
  stepTitle: string;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  disabled?: boolean;
  showBusyLabel?: boolean;
  onMoveEarlier: () => void;
  onMoveLater: () => void;
}) {
  if (!canMoveEarlier && !canMoveLater) {
    return null;
  }

  const buttonClass = focusableControlClass(
    'rounded-sm text-[11px] font-medium text-gray-700 underline-offset-2 hover:text-gray-900 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline'
  );

  return (
    <div
      role="group"
      aria-label={`Reorder step ${stepTitle}`}
      className="mt-1.5 flex flex-wrap items-center gap-2.5"
    >
      {canMoveEarlier ? (
        <button
          type="button"
          onClick={onMoveEarlier}
          disabled={disabled}
          aria-label={`Move step ${stepTitle} earlier`}
          className={buttonClass}
        >
          <span className="lg:hidden">Move up</span>
          <span className="hidden lg:inline">Move left</span>
        </button>
      ) : null}
      {canMoveLater ? (
        <button
          type="button"
          onClick={onMoveLater}
          disabled={disabled}
          aria-label={`Move step ${stepTitle} later`}
          className={buttonClass}
        >
          <span className="lg:hidden">Move down</span>
          <span className="hidden lg:inline">Move right</span>
        </button>
      ) : null}
      {showBusyLabel ? (
        <span className="text-[11px] text-gray-500" aria-live="polite">
          Reordering…
        </span>
      ) : null}
    </div>
  );
}

function BoardEmptyState({
  title,
  description,
  action,
  headingId,
  prominent,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  headingId?: string;
  /** Larger padding for primary board empty (e.g. no steps). */
  prominent?: boolean;
}) {
  const titleId = headingId ?? undefined;

  return (
    <div
      className={`rounded-md border border-dashed border-gray-300 bg-gray-50/80 text-center ${
        prominent
          ? 'mx-auto max-w-md px-3 py-6 sm:px-4 sm:py-8'
          : 'px-2.5 py-3'
      }`}
      role="status"
      aria-labelledby={titleId}
    >
      <p
        id={titleId}
        className={`font-semibold text-gray-800 ${
          prominent ? 'text-sm' : 'text-xs'
        }`}
      >
        {title}
      </p>
      {description ? (
        <p
          className={`mt-1 leading-snug text-gray-600 ${
            prominent
              ? 'text-xs sm:text-[13px]'
              : 'text-[11px] sm:text-xs'
          }`}
        >
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2.5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Compact guidance when secondary board sections are empty. */
function BoardHint({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-md border border-dashed border-gray-200 bg-white/60 px-2.5 py-2 text-center text-[11px] leading-snug text-gray-600 sm:text-xs"
      role="status"
    >
      {children}
    </p>
  );
}

function BoardLane({
  eyebrow,
  title,
  description,
  headingId,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  headingId: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0" aria-labelledby={headingId}>
      <div className="mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
          {eyebrow}
        </p>
        <h3 id={headingId} className="text-xs font-semibold text-gray-900 sm:text-sm">
          {title}
        </h3>
        {description ? (
          <p className="mt-0.5 text-[11px] leading-snug text-gray-600 sm:text-xs">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ExpenseWidget({
  expense,
  economics: economicsProp,
  canManage,
  compact,
  dense,
  showCoveredBy = true,
  deleting,
  onEdit,
  onDelete,
}: {
  expense: StrategyBoardExpense;
  /** Precomputed labels from the board; falls back if omitted. */
  economics?: ExpenseEconomicsLabels;
  canManage: boolean;
  compact?: boolean;
  dense?: boolean;
  /** Hide when nested under the covering step to avoid repeating the parent title. */
  showCoveredBy?: boolean;
  deleting?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const economics = economicsProp ?? getExpenseEconomicsLabels(expense);
  const categoryLabel =
    humanizeEnum(expense.category) ?? expense.category;
  const priorityLabel =
    humanizeEnum(expense.priority) ?? expense.priority;

  return (
    <div
      className={`rounded-md border border-amber-200 border-l-4 border-l-amber-600 bg-amber-50/80 ${
        compact ? 'px-2 py-1.5' : 'px-2 py-1.5'
      }`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <p className="min-w-0 truncate text-[11px] font-medium text-gray-900 sm:text-xs">
          <span className="sr-only">Expense: </span>
          {expense.title}
        </p>
        <TypeKindBadge kind="expense" label={priorityLabel} />
      </div>
      <div className="mt-1 space-y-0.5">
        <MetaLine
          label="Amount"
          value={economics.amount}
          dense={dense}
          showEmptyDash
        />
        <MetaLine
          label="Timeline"
          value={economics.timeline}
          dense={dense}
          showEmptyDash
        />
        <MetaLine
          label="Total expense"
          value={economics.totalExpense}
          dense={dense}
          showEmptyDash
        />
        {showCoveredBy ? (
          <MetaLine
            label="Covered by"
            value={economics.coveredBy}
            dense={dense}
          />
        ) : null}
        <MetaLine label="Category" value={categoryLabel} dense={dense} />
        <MetaLine label="Purpose" value={expense.purpose} clamp dense={dense} />
      </div>
      <ManageActions
        canManage={canManage}
        editLabel={`Edit expense ${expense.title}`}
        deleteLabel={`Delete expense ${expense.title}`}
        onEdit={onEdit}
        onDelete={onDelete}
        deleting={deleting}
      />
    </div>
  );
}

function PathFlowArrow({
  orientation,
  muted = false,
}: {
  orientation: 'horizontal' | 'vertical';
  muted?: boolean;
}) {
  const lineTone = muted ? 'bg-gray-300' : 'bg-violet-400';
  const iconTone = muted ? 'text-gray-400' : 'text-violet-500';

  if (orientation === 'horizontal') {
    return (
      <div
        className="flex min-w-[1.75rem] flex-1 items-center"
        aria-hidden="true"
      >
        <div className={`h-0.5 min-w-[0.75rem] flex-1 rounded-full ${lineTone}`} />
        <ArrowRight className={`h-3.5 w-3.5 shrink-0 ${iconTone}`} strokeWidth={2.25} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center" aria-hidden="true">
      <div className={`h-3 w-0.5 rounded-full ${lineTone}`} />
      <ArrowDown className={`h-3.5 w-3.5 ${iconTone}`} strokeWidth={2.25} />
    </div>
  );
}

function ConnectionWidget({
  connection,
  fromTitle,
  toTitle,
  canManage,
  variant,
  deleting,
  onEdit,
  onDelete,
}: {
  connection: StrategyBoardConnection;
  fromTitle: string;
  toTitle: string;
  canManage: boolean;
  variant: 'path' | 'cross';
  deleting?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const isPath = variant === 'path';
  const typeLabel =
    humanizeEnum(connection.connectionType) ?? connection.connectionType;

  function handleCardActivate() {
    if (onEdit) {
      onEdit();
    }
  }

  return (
    <div
      className={`min-w-0 max-w-full rounded-md border border-l-4 outline-none ${
        isPath
          ? 'border-violet-200 border-l-violet-600 bg-violet-50 px-2 py-1.5'
          : 'border-violet-200 border-l-violet-700 bg-white px-2.5 py-2'
      } ${
        canManage && onEdit
          ? 'cursor-pointer focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 hover:border-violet-400'
          : ''
      }`}
      onDoubleClick={
        canManage && onEdit ? handleCardActivate : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-1">
        <TypeKindBadge kind="connection" label={typeLabel ?? 'Connection'} />
        {!isPath ? (
          <>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
              Cross-plan
            </span>
            <CornerDownRight
              className="h-3 w-3 shrink-0 text-violet-500"
              aria-hidden="true"
              strokeWidth={2.25}
            />
          </>
        ) : (
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
            Adjacent
          </span>
        )}
      </div>

      <p
        className={`mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 font-medium leading-snug text-gray-900 ${
          isPath ? 'text-[11px]' : 'text-xs'
        }`}
      >
        <span className="min-w-0 break-words text-gray-800">{fromTitle}</span>
        <ArrowRight
          className="h-3 w-3 shrink-0 text-violet-500"
          aria-hidden="true"
          strokeWidth={2.5}
        />
        <span className="sr-only"> to </span>
        <span className="min-w-0 break-words text-gray-800">{toTitle}</span>
      </p>

      <div className="mt-1 space-y-0.5">
        <MetaLine label="Purpose" value={connection.purpose} clamp />
        <MetaLine label="Outcome" value={connection.expectedOutcome} clamp />
        <MetaLine label="Timing" value={connection.timing} />
      </div>
      <ManageActions
        canManage={canManage}
        editLabel={`Edit connection from ${fromTitle} to ${toTitle}`}
        deleteLabel={`Delete connection from ${fromTitle} to ${toTitle}`}
        onEdit={onEdit}
        onDelete={onDelete}
        deleting={deleting}
      />
    </div>
  );
}

function AdjacentConnectorStack({
  connections,
  fromStepId,
  toStepId,
  fromStepTitle,
  toStepTitle,
  stepTitleById,
  canManage,
  deletingConnectionId,
  onEditConnection,
  onDeleteConnection,
  onAddConnectionBetweenSteps,
  orientation,
}: {
  connections: StrategyBoardConnection[];
  fromStepId: string;
  toStepId: string;
  fromStepTitle: string;
  toStepTitle: string;
  stepTitleById: Map<string, string>;
  canManage: boolean;
  deletingConnectionId?: string | null;
  onEditConnection?: (connection: StrategyBoardConnection) => void;
  onDeleteConnection?: (connection: StrategyBoardConnection) => void;
  onAddConnectionBetweenSteps?: (
    fromStepId: string,
    toStepId: string
  ) => void;
  orientation: 'horizontal' | 'vertical';
}) {
  const isHorizontal = orientation === 'horizontal';
  const hasConnections = connections.length > 0;
  const showAdd =
    canManage && Boolean(onAddConnectionBetweenSteps);

  const addButton = showAdd ? (
    <button
      type="button"
      onClick={() => onAddConnectionBetweenSteps?.(fromStepId, toStepId)}
      aria-label={
        hasConnections
          ? `Add another connection from ${fromStepTitle} to ${toStepTitle}`
          : `Add connection from ${fromStepTitle} to ${toStepTitle}`
      }
      className={focusableControlClass(
        hasConnections
          ? 'rounded-sm text-[10px] font-medium text-violet-700 underline-offset-2 hover:text-violet-900 hover:underline'
          : 'rounded-md border border-dashed border-violet-300 bg-violet-50/80 px-2 py-1 text-[11px] font-medium text-violet-800 hover:border-violet-400 hover:bg-violet-50'
      )}
    >
      {hasConnections ? '+ Add another' : 'Add connection'}
    </button>
  ) : null;

  const cards =
    hasConnections ? (
      <div
        className={`flex flex-col gap-1.5 ${
          isHorizontal ? 'w-[9.75rem] shrink-0' : 'w-full min-w-0 max-w-full'
        }`}
        role="group"
        aria-label={`${connections.length} connection${
          connections.length === 1 ? '' : 's'
        } between adjacent steps`}
      >
        {connections.map((connection) => (
          <ConnectionWidget
            key={connection.id}
            connection={connection}
            fromTitle={
              stepTitleById.get(connection.fromStepId) ?? 'Unknown step'
            }
            toTitle={stepTitleById.get(connection.toStepId) ?? 'Unknown step'}
            canManage={canManage}
            variant="path"
            deleting={deletingConnectionId === connection.id}
            onEdit={
              onEditConnection ? () => onEditConnection(connection) : undefined
            }
            onDelete={
              onDeleteConnection
                ? () => onDeleteConnection(connection)
                : undefined
            }
          />
        ))}
        {addButton}
      </div>
    ) : addButton ? (
      <div
        className={
          isHorizontal ? 'w-[9.75rem] shrink-0 text-center' : 'w-full text-center'
        }
      >
        {addButton}
      </div>
    ) : null;

  if (isHorizontal) {
    return (
      <div
        className="flex max-w-[13rem] shrink-0 items-center gap-1 self-center py-1"
        aria-label={
          hasConnections
            ? 'Connection lane between adjacent steps'
            : 'Path continues to next step'
        }
      >
        <PathFlowArrow orientation="horizontal" muted={!hasConnections} />
        {cards}
        {hasConnections ? (
          <div className="flex min-w-[0.75rem] items-center" aria-hidden="true">
            <div className="h-0.5 w-3 rounded-full bg-violet-300 sm:w-4" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex w-full flex-col items-center gap-1.5 px-1 py-0.5"
      aria-label={
        hasConnections
          ? 'Connection lane between adjacent steps'
          : 'Path continues to next step'
      }
    >
      <PathFlowArrow orientation="vertical" muted={!hasConnections} />
      {cards}
      {hasConnections ? (
        <div className="h-3 w-0.5 rounded-full bg-violet-300" aria-hidden="true" />
      ) : null}
    </div>
  );
}

function StepNode({
  step,
  index,
  stepCount,
  expenses,
  economics: economicsProp,
  expenseEconomicsById,
  projectionBadges = [],
  canManage,
  dense,
  deletingStepId,
  deletingExpenseId,
  reorderingStepId,
  onEditStep,
  onDeleteStep,
  onEditExpense,
  onDeleteExpense,
  onAddExpenseForStep,
  onReorderStep,
}: {
  step: StrategyBoardStep;
  index: number;
  stepCount: number;
  expenses: StrategyBoardExpense[];
  economics?: StepEconomicsLabels;
  expenseEconomicsById?: Map<string, ExpenseEconomicsLabels>;
  projectionBadges?: StepProjectionBadge[];
  canManage: boolean;
  dense?: boolean;
  deletingStepId?: string | null;
  deletingExpenseId?: string | null;
  reorderingStepId?: string | null;
  onEditStep?: (step: StrategyBoardStep) => void;
  onDeleteStep?: (step: StrategyBoardStep) => void;
  onEditExpense?: (expense: StrategyBoardExpense) => void;
  onDeleteExpense?: (expense: StrategyBoardExpense) => void;
  onAddExpenseForStep?: (stepId: string) => void;
  onReorderStep?: (
    stepId: string,
    direction: 'earlier' | 'later'
  ) => void;
}) {
  const economics = economicsProp ?? getStepEconomicsLabels(step);

  const hasLinkedDeal = Boolean(step.linkedDealId || step.linkedDeal);
  const linkedDealId = step.linkedDeal?.id ?? step.linkedDealId ?? null;
  const linkedDealName =
    step.linkedDeal?.name?.trim() ||
    (linkedDealId ? 'Linked deal' : null);
  const linkedDealValue = formatMoney(step.linkedDeal?.dealValue);
  const linkedDealStatus = humanizeEnum(step.linkedDeal?.status);
  const linkedDealMeta = [linkedDealValue, linkedDealStatus]
    .filter(Boolean)
    .join(' · ');
  const canReorder =
    canManage && Boolean(onReorderStep) && stepCount > 1;

  return (
    <article className="flex h-full min-w-0 w-full flex-col rounded-lg border border-gray-200 border-l-4 border-l-blue-600 bg-white p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
            Step {index + 1}
          </p>
          <h4 className="mt-0.5 text-xs font-semibold leading-snug text-gray-900 sm:text-sm">
            {step.title}
          </h4>
        </div>
        <TypeKindBadge
          kind="step"
          label={humanizeEnum(step.stepType) ?? step.stepType}
        />
      </div>

      {hasLinkedDeal ? (
        <div className="mt-1.5 max-w-full min-w-0 rounded-md border border-emerald-200 bg-emerald-50/70 px-2 py-1.5">
          <div className="flex items-start gap-1.5">
            <span
              className="mt-0.5 shrink-0 text-[10px] font-semibold text-emerald-800"
              aria-hidden="true"
            >
              D
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] font-medium text-gray-900">
                <span className="sr-only">Linked deal: </span>
                {linkedDealName ?? 'Linked deal'}
              </p>
              {linkedDealMeta ? (
                <p className="mt-0.5 truncate text-[10px] text-gray-600">
                  {linkedDealMeta}
                </p>
              ) : null}
              {linkedDealId ? (
                <a
                  href={`#deal-${linkedDealId}`}
                  className={focusableControlClass(
                    'mt-1 inline-block text-[11px] font-medium text-emerald-800 underline-offset-2 hover:text-emerald-950 hover:underline'
                  )}
                >
                  View deal
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {projectionBadges.length > 0 ? (
        <div
          className="mt-1.5 flex flex-wrap gap-1"
          aria-label="Projection highlights"
        >
          {projectionBadges.map((badge) => (
            <span
              key={badge.kind}
              className="inline-flex max-w-full truncate rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-900"
              title={badge.label}
            >
              {badge.label}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-1.5 space-y-0.5">
        <MetaLine
          label="Invest"
          value={economics.invest}
          dense={dense}
          showEmptyDash
        />
        <MetaLine
          label="Income"
          value={economics.income}
          dense={dense}
          showEmptyDash
        />
        <MetaLine
          label="Timeline"
          value={economics.timeline}
          dense={dense}
          showEmptyDash
        />
        <MetaLine
          label="Total income"
          value={economics.totalIncome}
          dense={dense}
          showEmptyDash
        />
        <MetaLine
          label="Capital back"
          value={economics.capitalBack}
          dense={dense}
          showEmptyDash
        />
        <MetaLine
          label="Illustrative position"
          value={economics.illustrativePosition}
          dense={dense}
          showEmptyDash
        />
        <MetaLine label="Purpose" value={step.purpose} clamp dense={dense} />
        <MetaLine
          label="Achievement"
          value={step.expectedAchievement}
          clamp
          dense={dense}
        />
      </div>

      {canReorder && onReorderStep ? (
        <StepReorderControls
          stepTitle={step.title}
          canMoveEarlier={index > 0}
          canMoveLater={index < stepCount - 1}
          disabled={Boolean(reorderingStepId)}
          showBusyLabel={reorderingStepId === step.id}
          onMoveEarlier={() => onReorderStep(step.id, 'earlier')}
          onMoveLater={() => onReorderStep(step.id, 'later')}
        />
      ) : null}

      <ManageActions
        canManage={canManage}
        editLabel={`Edit step ${step.title}`}
        deleteLabel={`Delete step ${step.title}`}
        onEdit={onEditStep ? () => onEditStep(step) : undefined}
        onDelete={onDeleteStep ? () => onDeleteStep(step) : undefined}
        deleting={deletingStepId === step.id}
      />

      {canManage && onAddExpenseForStep ? (
        <button
          type="button"
          onClick={() => onAddExpenseForStep(step.id)}
          aria-label={`Add expense covered by ${step.title}`}
          className={focusableControlClass(
            'mt-1.5 self-start rounded-sm text-[11px] font-medium text-amber-800 underline-offset-2 hover:text-amber-950 hover:underline'
          )}
        >
          Add expense
        </button>
      ) : null}

      {expenses.length > 0 ? (
        <div className="mt-2 border-t border-dashed border-amber-200 pt-2">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Expenses covered here
          </p>
          <div className="space-y-1.5">
            {expenses.map((expense) => (
              <ExpenseWidget
                key={expense.id}
                expense={expense}
                economics={expenseEconomicsById?.get(expense.id)}
                canManage={canManage}
                compact
                dense={dense}
                showCoveredBy={false}
                deleting={deletingExpenseId === expense.id}
                onEdit={onEditExpense ? () => onEditExpense(expense) : undefined}
                onDelete={
                  onDeleteExpense ? () => onDeleteExpense(expense) : undefined
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

type BoardLayout = {
  sortedSteps: StrategyBoardStep[];
  /** Connections between step[i] and step[i+1], stacked. */
  adjacentByGap: Map<number, StrategyBoardConnection[]>;
  crossConnections: StrategyBoardConnection[];
  expensesByStepId: Map<string, StrategyBoardExpense[]>;
  planLevelExpenses: StrategyBoardExpense[];
  stepTitleById: Map<string, string>;
  coveredExpenseCount: number;
};

function buildBoardLayout(plan: StrategyBoardPlan): BoardLayout {
  const sortedSteps = [...plan.steps].sort(compareSortThenCreatedAt);
  const indexByStepId = new Map(
    sortedSteps.map((step, index) => [step.id, index] as const)
  );
  const stepTitleById = new Map(
    sortedSteps.map((step) => [step.id, step.title] as const)
  );

  const adjacentByGap = new Map<number, StrategyBoardConnection[]>();
  const crossConnections: StrategyBoardConnection[] = [];

  for (const connection of plan.connections) {
    const fromIndex = indexByStepId.get(connection.fromStepId);
    const toIndex = indexByStepId.get(connection.toStepId);

    if (fromIndex === undefined || toIndex === undefined) {
      crossConnections.push(connection);
      continue;
    }

    // Only true neighbors belong on the main path ( |Δindex| === 1 ).
    if (Math.abs(fromIndex - toIndex) === 1) {
      const gapIndex = Math.min(fromIndex, toIndex);
      const list = adjacentByGap.get(gapIndex) ?? [];
      list.push(connection);
      adjacentByGap.set(gapIndex, list);
    } else {
      // Skips one or more steps → cross-plan lane.
      crossConnections.push(connection);
    }
  }

  const expensesByStepId = new Map<string, StrategyBoardExpense[]>();
  const planLevelExpenses: StrategyBoardExpense[] = [];
  const sortedExpenses = [...plan.expenses].sort(compareSortThenCreatedAt);

  for (const expense of sortedExpenses) {
    const coveredId = expense.coveredByStepId ?? expense.coveredByStep?.id ?? null;
    if (coveredId && indexByStepId.has(coveredId)) {
      const list = expensesByStepId.get(coveredId) ?? [];
      list.push(expense);
      expensesByStepId.set(coveredId, list);
    } else {
      planLevelExpenses.push(expense);
    }
  }

  let coveredExpenseCount = 0;
  for (const list of expensesByStepId.values()) {
    coveredExpenseCount += list.length;
  }

  return {
    sortedSteps,
    adjacentByGap,
    crossConnections,
    expensesByStepId,
    planLevelExpenses,
    stepTitleById,
    coveredExpenseCount,
  };
}

function StrategyPlannerBoard({
  plan,
  canManage = false,
  deletingStepId = null,
  deletingConnectionId = null,
  deletingExpenseId = null,
  reorderingStepId = null,
  headerActions,
  onAddStep,
  onAddConnection,
  onAddConnectionBetweenSteps,
  onAddExpense,
  onAddExpenseForStep,
  onReorderStep,
  onEditStep,
  onDeleteStep,
  onEditConnection,
  onDeleteConnection,
  onEditExpense,
  onDeleteExpense,
}: StrategyPlannerBoardProps) {
  const { density } = useDisplayDensity();
  const listSpacingClass = getTightStackSpacingClass(density);
  const isCompact = density === 'compact';

  const layout = useMemo(() => buildBoardLayout(plan), [plan]);

  const projectionBadgesByStepId = useMemo(() => {
    const milestones = plan.projectionMilestones ?? [];
    const map = new Map<string, StepProjectionBadge[]>();
    if (milestones.length === 0) {
      return map;
    }

    for (const step of plan.steps) {
      const badges = buildStepProjectionBadges(milestones, step.id, 3);
      if (badges.length > 0) {
        map.set(step.id, badges);
      }
    }
    return map;
  }, [plan.projectionMilestones, plan.steps]);

  // Card economics once per plan change (Board renders each step twice: lg + mobile).
  const stepEconomicsById = useMemo(
    () => buildStepEconomicsById(plan.steps),
    [plan.steps]
  );
  const expenseEconomicsById = useMemo(
    () => buildExpenseEconomicsById(plan.expenses),
    [plan.expenses]
  );

  const {
    sortedSteps,
    adjacentByGap,
    crossConnections,
    expensesByStepId,
    planLevelExpenses,
    stepTitleById,
    coveredExpenseCount,
  } = layout;

  const connectionDisabledReason =
    sortedSteps.length < 2
      ? 'Add at least two strategy steps before creating a connection.'
      : undefined;

  const defaultHeaderActions =
    canManage && (onAddStep || onAddConnection || onAddExpense) ? (
      <div className="flex flex-wrap items-center gap-1.5">
        {onAddStep ? (
          <button
            type="button"
            onClick={onAddStep}
            aria-label="Add strategy step"
            className={focusableControlClass(
              'rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700'
            )}
          >
            + Step
          </button>
        ) : null}
        {onAddConnection ? (
          <button
            type="button"
            onClick={onAddConnection}
            disabled={Boolean(connectionDisabledReason)}
            aria-label="Add strategy connection"
            aria-describedby={
              connectionDisabledReason
                ? 'strategy-board-connection-hint'
                : undefined
            }
            title={connectionDisabledReason}
            className={focusableControlClass(
              'rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60'
            )}
          >
            + Connection
          </button>
        ) : null}
        {onAddExpense ? (
          <button
            type="button"
            onClick={onAddExpense}
            aria-label="Add strategy expense"
            className={focusableControlClass(
              'rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50'
            )}
          >
            + Expense
          </button>
        ) : null}
      </div>
    ) : null;

  const boardActions =
    headerActions === undefined ? defaultHeaderActions : headerActions;

  const stepNodeProps = {
    canManage,
    dense: isCompact,
    deletingStepId,
    deletingExpenseId,
    reorderingStepId,
    stepCount: sortedSteps.length,
    expenseEconomicsById,
    onEditStep,
    onDeleteStep,
    onEditExpense,
    onDeleteExpense,
    onAddExpenseForStep,
    onReorderStep,
  };

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">Strategy board</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Main path shows ordered steps with links between neighbors. Jump
            links and unassigned costs sit below.
          </p>
        </div>
        {boardActions ? (
          <div className="shrink-0">{boardActions}</div>
        ) : null}
      </div>

      <div className="mb-3">
        <BoardLegend />
      </div>

      <div
        className={`w-full min-w-0 max-w-full overflow-x-hidden rounded-lg border border-dashed border-gray-200 bg-slate-50/70 ${
          isCompact ? 'space-y-3 p-2.5 sm:p-3' : 'space-y-4 p-3 sm:p-4'
        }`}
        role="region"
        aria-label="Strategy planning canvas"
      >
        {connectionDisabledReason && canManage && onAddConnection ? (
          <p id="strategy-board-connection-hint" className="sr-only">
            {connectionDisabledReason}
          </p>
        ) : null}

        {/* Plan strip (flat, not a nested card) */}
        <header
          className="border-b border-gray-200/80 pb-2.5"
          aria-labelledby="strategy-board-plan-title"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Plan
              </p>
              <h3
                id="strategy-board-plan-title"
                className="text-sm font-semibold text-gray-900"
              >
                {plan.title}
              </h3>
            </div>
            <span
              className="inline-flex shrink-0 items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-800"
              title={`Status: ${humanizeEnum(plan.status) ?? plan.status}`}
            >
              <span className="sr-only">Status: </span>
              {humanizeEnum(plan.status) ?? plan.status}
            </span>
          </div>
          {plan.clientGoal?.trim() ? (
            <p className="mt-1.5 line-clamp-2 text-xs text-gray-600">
              <span className="font-medium text-gray-700">Goal: </span>
              {plan.clientGoal.trim()}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-gray-500">
              No client goal captured yet.
            </p>
          )}
        </header>

        {/* 2. Main strategy path */}
        <BoardLane
          eyebrow="Main path"
          title="Strategy steps"
          headingId="strategy-board-main-path"
          description="Ordered by sort order. Adjacent connections render between their from and to steps."
        >
          {sortedSteps.length === 0 ? (
            <BoardEmptyState
              prominent
              headingId="strategy-board-empty-steps"
              title="Steps build this board"
              description={
                canManage
                  ? 'Strategy steps are the primary nodes on this canvas. Add the first step to start mapping deals, funding flows, and coverage.'
                  : 'Strategy steps are the primary nodes on this canvas. None have been added yet — a teammate with edit access can start the path.'
              }
              action={
                canManage && onAddStep ? (
                  <button
                    type="button"
                    onClick={onAddStep}
                    aria-label="Add first strategy step"
                    className={focusableControlClass(
                      'rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-blue-700'
                    )}
                  >
                    Add first step
                  </button>
                ) : undefined
              }
            />
          ) : (
            <>
              {/* Desktop/wide: Step → Connection(s) → Step (lg+ keeps tablet stacked) */}
              <div className="hidden w-full min-w-0 max-w-full lg:block">
                <div className="w-full max-w-full overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
                  <ol className="flex w-max min-w-full list-none items-stretch gap-2 p-0">
                    {sortedSteps.flatMap((step, index) => {
                      const isLast = index === sortedSteps.length - 1;
                      const gapConnections = adjacentByGap.get(index) ?? [];
                      const stepItem = (
                        <li
                          key={step.id}
                          className="min-w-[15rem] max-w-md flex-1 basis-[15rem] list-none"
                        >
                          <StepNode
                            step={step}
                            index={index}
                            expenses={expensesByStepId.get(step.id) ?? []}
                            economics={stepEconomicsById.get(step.id)}
                            projectionBadges={
                              projectionBadgesByStepId.get(step.id) ?? []
                            }
                            {...stepNodeProps}
                          />
                        </li>
                      );

                      if (isLast) {
                        return [stepItem];
                      }

                      return [
                        stepItem,
                        <li
                          key={`connector-after-${step.id}`}
                          className="flex shrink-0 list-none items-center self-center"
                        >
                          <AdjacentConnectorStack
                            connections={gapConnections}
                            fromStepId={step.id}
                            toStepId={sortedSteps[index + 1]!.id}
                            fromStepTitle={step.title}
                            toStepTitle={sortedSteps[index + 1]!.title}
                            stepTitleById={stepTitleById}
                            canManage={canManage}
                            deletingConnectionId={deletingConnectionId}
                            onEditConnection={onEditConnection}
                            onDeleteConnection={onDeleteConnection}
                            onAddConnectionBetweenSteps={
                              onAddConnectionBetweenSteps
                            }
                            orientation="horizontal"
                          />
                        </li>,
                      ];
                    })}
                  </ol>
                </div>
              </div>

              {/* Mobile + tablet: Step → adjacent connection → next step */}
              <ol
                className={`w-full min-w-0 max-w-full list-none p-0 lg:hidden ${listSpacingClass}`}
              >
                {sortedSteps.map((step, index) => {
                  const isLast = index === sortedSteps.length - 1;
                  const gapConnections = adjacentByGap.get(index) ?? [];
                  const nextStep = sortedSteps[index + 1];

                  return (
                    <li
                      key={step.id}
                      className={`min-w-0 list-none ${listSpacingClass}`}
                    >
                      <StepNode
                        step={step}
                        index={index}
                        expenses={expensesByStepId.get(step.id) ?? []}
                        economics={stepEconomicsById.get(step.id)}
                        projectionBadges={
                          projectionBadgesByStepId.get(step.id) ?? []
                        }
                        {...stepNodeProps}
                      />
                      {!isLast && nextStep ? (
                        <AdjacentConnectorStack
                          connections={gapConnections}
                          fromStepId={step.id}
                          toStepId={nextStep.id}
                          fromStepTitle={step.title}
                          toStepTitle={nextStep.title}
                          stepTitleById={stepTitleById}
                          canManage={canManage}
                          deletingConnectionId={deletingConnectionId}
                          onEditConnection={onEditConnection}
                          onDeleteConnection={onDeleteConnection}
                          onAddConnectionBetweenSteps={
                            onAddConnectionBetweenSteps
                          }
                          orientation="vertical"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </BoardLane>

        {sortedSteps.length > 0 ? (
          <BoardLane
            eyebrow="Cross links"
            title="Cross-plan connections"
            headingId="strategy-board-cross-connections"
            description="Connections that skip one or more steps stay off the main path."
          >
            {plan.connections.length === 0 ? (
              <BoardHint>
                Add connections to show how steps fund, support, or depend on
                each other.
              </BoardHint>
            ) : crossConnections.length === 0 ? (
              <BoardHint>
                No jump links yet. Connections that skip steps will appear
                here.
              </BoardHint>
            ) : (
              <ul className="grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {crossConnections.map((connection) => (
                  <li key={connection.id} className="min-w-0 list-none">
                    <ConnectionWidget
                      connection={connection}
                      fromTitle={
                        stepTitleById.get(connection.fromStepId) ??
                        'Unknown step'
                      }
                      toTitle={
                        stepTitleById.get(connection.toStepId) ?? 'Unknown step'
                      }
                      canManage={canManage}
                      variant="cross"
                      deleting={deletingConnectionId === connection.id}
                      onEdit={
                        onEditConnection
                          ? () => onEditConnection(connection)
                          : undefined
                      }
                      onDelete={
                        onDeleteConnection
                          ? () => onDeleteConnection(connection)
                          : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </BoardLane>
        ) : null}

        {/* Plan-level expenses stay visible even before steps exist. */}
        <BoardLane
          eyebrow="Coverage"
          title="Plan-level expenses"
          headingId="strategy-board-plan-expenses"
          description="Costs without a coveredByStepId stay at plan level. Step-linked costs sit under their step."
        >
          {plan.expenses.length === 0 ? (
            <BoardHint>
              Attach expenses to a step or track plan-level costs.
            </BoardHint>
          ) : planLevelExpenses.length === 0 ? (
            <BoardHint>
              {coveredExpenseCount > 0
                ? `All ${coveredExpenseCount} expense${
                    coveredExpenseCount === 1 ? '' : 's'
                  } are attached to steps on the path above.`
                : 'Attach expenses to a step or track plan-level costs.'}
            </BoardHint>
          ) : (
            <ul className="grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3">
              {planLevelExpenses.map((expense) => (
                <li key={expense.id} className="min-w-0 list-none">
                  <ExpenseWidget
                    expense={expense}
                    economics={expenseEconomicsById.get(expense.id)}
                    canManage={canManage}
                    dense={isCompact}
                    deleting={deletingExpenseId === expense.id}
                    onEdit={
                      onEditExpense ? () => onEditExpense(expense) : undefined
                    }
                    onDelete={
                      onDeleteExpense
                        ? () => onDeleteExpense(expense)
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </BoardLane>
      </div>
    </div>
  );
}

export default memo(StrategyPlannerBoard);
