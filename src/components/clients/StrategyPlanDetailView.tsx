'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { memo, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import CompactPill from '@/components/ui/CompactPill';
import ConfirmActionModal from '@/components/ui/ConfirmActionModal';
import SectionCard from '@/components/ui/SectionCard';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import {
  getStackSpacingClass,
  getTightStackSpacingClass,
} from '@/components/ui/displayDensity';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type { StrategyConnectionEditValues } from '@/components/clients/StrategyConnectionEditModal';
import type { StrategyExpenseEditValues } from '@/components/clients/StrategyExpenseEditModal';
import type { StrategyStepEditValues } from '@/components/clients/StrategyStepEditModal';
import {
  toProjectionMilestoneEditValues,
  type StrategyProjectionMilestoneEditValues,
} from '@/components/clients/StrategyProjectionMilestoneEditModal';
import {
  getStrategyPlannerViewServerSnapshot,
  getStrategyPlannerViewSnapshot,
  subscribeStrategyPlannerView,
  writeStoredStrategyPlannerView,
  type StrategyPlannerView,
} from '@/components/clients/strategyPlannerViewPreference';
import type { StrategyProjectionMilestone } from '@/lib/clientStrategyProjectionHelpers';
import { buildProjectionMilestoneReorderIds } from '@/lib/clientStrategyProjectionHelpers';
import {
  getExpenseEconomicsLabels,
  getStepEconomicsLabels,
} from '@/components/clients/strategyTimelineEconomicsDisplay';

const StrategyPlannerBoard = dynamic(
  () => import('@/components/clients/StrategyPlannerBoard'),
  { ssr: false }
);

const StrategyProjectionJourneyView = dynamic(
  () => import('@/components/clients/StrategyProjectionJourneyView'),
  { ssr: false }
);

const StrategyStepEditModal = dynamic(
  () => import('@/components/clients/StrategyStepEditModal'),
  { ssr: false }
);

const StrategyConnectionEditModal = dynamic(
  () => import('@/components/clients/StrategyConnectionEditModal'),
  { ssr: false }
);

const StrategyExpenseEditModal = dynamic(
  () => import('@/components/clients/StrategyExpenseEditModal'),
  { ssr: false }
);

const StrategyProjectionMilestoneEditModal = dynamic(
  () => import('@/components/clients/StrategyProjectionMilestoneEditModal'),
  { ssr: false }
);

const StrategyPlanDeleteModal = dynamic(
  () => import('@/components/clients/StrategyPlanDeleteModal'),
  { ssr: false }
);

export type StrategyPlanDetailStep = {
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

export type StrategyPlanDetailConnection = {
  id: string;
  fromStepId: string;
  toStepId: string;
  connectionType: string;
  purpose: string | null;
  expectedOutcome: string | null;
  timing: string | null;
  createdAt?: string;
};

export type StrategyPlanDetailExpense = {
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

export type StrategyPlanDetail = {
  id: string;
  title: string;
  description: string | null;
  clientGoal: string | null;
  expectedOutcome: string | null;
  status: string;
  steps: StrategyPlanDetailStep[];
  connections: StrategyPlanDetailConnection[];
  expenses: StrategyPlanDetailExpense[];
  /** Present when loaded from plan detail API; omit/empty until Projection UI wires CRUD. */
  projectionMilestones?: StrategyProjectionMilestone[];
};

type StrategyPlanDetailViewProps = {
  clientId: string;
  plan: StrategyPlanDetail;
  canManage?: boolean;
  onBack: () => void;
  onEdit?: () => void;
  onRefresh?: () => void;
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

const STATUS_TONES: Record<
  string,
  'gray' | 'blue' | 'green' | 'yellow' | 'purple'
> = {
  DRAFT: 'gray',
  ACTIVE: 'blue',
  COMPLETED: 'green',
  ARCHIVED: 'yellow',
};

function humanizeEnum(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

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

type CoverageStatus =
  | 'FULLY_COVERED'
  | 'PARTIAL_COVERAGE'
  | 'NO_INCOME_PLANNED'
  | 'NO_EXPENSES_ADDED';

type OutcomeSummary = {
  expectedMonthlyIncome: number;
  plannedMonthlyExpenses: number;
  monthlyGap: number;
  coverageStatus: CoverageStatus;
};

const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  FULLY_COVERED: 'Fully Covered',
  PARTIAL_COVERAGE: 'Partial Coverage',
  NO_INCOME_PLANNED: 'No Income Planned',
  NO_EXPENSES_ADDED: 'No Expenses Added',
};

const COVERAGE_STATUS_STYLES: Record<
  CoverageStatus,
  { panel: string; badge: string; gapLabel: string; gapTone: string }
> = {
  FULLY_COVERED: {
    panel: 'border-green-200 bg-green-50',
    badge: 'bg-green-100 text-green-800',
    gapLabel: 'Surplus',
    gapTone: 'text-green-800',
  },
  PARTIAL_COVERAGE: {
    panel: 'border-amber-200 bg-amber-50',
    badge: 'bg-amber-100 text-amber-900',
    gapLabel: 'Gap',
    gapTone: 'text-amber-900',
  },
  NO_INCOME_PLANNED: {
    panel: 'border-red-200 bg-red-50',
    badge: 'bg-red-100 text-red-800',
    gapLabel: 'Gap',
    gapTone: 'text-red-800',
  },
  NO_EXPENSES_ADDED: {
    panel: 'border-gray-200 bg-gray-50',
    badge: 'bg-gray-100 text-gray-700',
    gapLabel: 'Surplus',
    gapTone: 'text-gray-700',
  },
};

function toMonthlyAmount(
  amount: number | null | undefined,
  frequency: string | null | undefined
): number {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return 0;
  }

  if (frequency === 'MONTHLY') {
    return amount;
  }

  // Recurring yearly → normalize into the monthly coverage view.
  if (frequency === 'YEARLY') {
    return amount / 12;
  }

  // ONE_TIME / CUSTOM stay out of the recurring monthly comparison.
  return 0;
}

function buildOutcomeSummary(
  steps: StrategyPlanDetailStep[],
  expenses: StrategyPlanDetailExpense[]
): OutcomeSummary {
  const expectedMonthlyIncome = steps.reduce(
    (sum, step) =>
      sum +
      toMonthlyAmount(step.expectedIncomeAmount, step.expectedIncomeFrequency),
    0
  );

  const plannedMonthlyExpenses = expenses.reduce(
    (sum, expense) =>
      sum + toMonthlyAmount(expense.amount, expense.frequency),
    0
  );

  const monthlyGap = expectedMonthlyIncome - plannedMonthlyExpenses;

  let coverageStatus: CoverageStatus;
  if (plannedMonthlyExpenses === 0) {
    coverageStatus = 'NO_EXPENSES_ADDED';
  } else if (expectedMonthlyIncome === 0) {
    coverageStatus = 'NO_INCOME_PLANNED';
  } else if (expectedMonthlyIncome >= plannedMonthlyExpenses) {
    coverageStatus = 'FULLY_COVERED';
  } else {
    coverageStatus = 'PARTIAL_COVERAGE';
  }

  return {
    expectedMonthlyIncome,
    plannedMonthlyExpenses,
    monthlyGap,
    coverageStatus,
  };
}

function formatStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? humanizeEnum(status) ?? status;
}

function MetaLine({
  label,
  value,
  showEmptyDash = false,
}: {
  label: string;
  value: string | null;
  showEmptyDash?: boolean;
}) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed && !showEmptyDash) {
    return null;
  }

  return (
    <p className="text-xs text-gray-600">
      <span className="font-medium text-gray-700">{label}: </span>
      {trimmed || '—'}
    </p>
  );
}

function EmptyState({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center">
      <p className="text-sm text-gray-500">{children}</p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

function SectionHelper({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-xs text-gray-500">{children}</p>;
}

function toStepEditValues(step: StrategyPlanDetailStep): StrategyStepEditValues {
  return {
    id: step.id,
    title: step.title,
    stepType: step.stepType,
    linkedDealId: step.linkedDealId ?? step.linkedDeal?.id ?? null,
    plannedAmount: step.plannedAmount,
    amountDescription: step.amountDescription,
    purpose: step.purpose,
    expectedAchievement: step.expectedAchievement,
    expectedIncomeAmount: step.expectedIncomeAmount,
    expectedIncomeFrequency: step.expectedIncomeFrequency,
    timelineLabel: step.timelineLabel,
    startYear: step.startYear ?? null,
    endYear: step.endYear ?? null,
    investmentAmount: step.investmentAmount ?? null,
    incomeAmount: step.incomeAmount ?? null,
    incomeFrequency: step.incomeFrequency ?? null,
    incomeStartYear: step.incomeStartYear ?? null,
    incomeEndYear: step.incomeEndYear ?? null,
    capitalReturned: step.capitalReturned ?? null,
    capitalReturnYear: step.capitalReturnYear ?? null,
    sortOrder: step.sortOrder,
  };
}

function StrategyPlanDetailView({
  clientId,
  plan,
  canManage = false,
  onBack,
  onEdit,
  onRefresh,
}: StrategyPlanDetailViewProps) {
  const { density } = useDisplayDensity();
  const listSpacingClass = getTightStackSpacingClass(density);
  const cardStackClass = getStackSpacingClass(density);
  const [isStepModalOpen, setIsStepModalOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<StrategyStepEditValues | null>(
    null
  );
  const [stepActionError, setStepActionError] = useState<string | null>(null);
  const [deletingStepId, setDeletingStepId] = useState<string | null>(null);
  const [pendingDeleteStep, setPendingDeleteStep] =
    useState<StrategyPlanDetailStep | null>(null);
  const [isConnectionModalOpen, setIsConnectionModalOpen] = useState(false);
  const [createConnectionDefaults, setCreateConnectionDefaults] = useState<{
    fromStepId: string;
    toStepId: string;
  } | null>(null);
  const [editingConnection, setEditingConnection] =
    useState<StrategyConnectionEditValues | null>(null);
  const [connectionActionError, setConnectionActionError] = useState<
    string | null
  >(null);
  const [deletingConnectionId, setDeletingConnectionId] = useState<
    string | null
  >(null);
  const [pendingDeleteConnection, setPendingDeleteConnection] =
    useState<StrategyPlanDetailConnection | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [createExpenseCoveredByStepId, setCreateExpenseCoveredByStepId] =
    useState<string | null>(null);
  const [editingExpense, setEditingExpense] =
    useState<StrategyExpenseEditValues | null>(null);
  const [expenseActionError, setExpenseActionError] = useState<string | null>(
    null
  );
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(
    null
  );
  const [pendingDeleteExpense, setPendingDeleteExpense] =
    useState<StrategyPlanDetailExpense | null>(null);
  const [isProjectionMilestoneModalOpen, setIsProjectionMilestoneModalOpen] =
    useState(false);
  const [editingProjectionMilestone, setEditingProjectionMilestone] =
    useState<StrategyProjectionMilestoneEditValues | null>(null);
  const [pendingDeleteProjectionMilestone, setPendingDeleteProjectionMilestone] =
    useState<StrategyProjectionMilestone | null>(null);
  const [deletingProjectionMilestoneId, setDeletingProjectionMilestoneId] =
    useState<string | null>(null);
  const [reorderingProjectionMilestoneId, setReorderingProjectionMilestoneId] =
    useState<string | null>(null);
  const [projectionActionError, setProjectionActionError] = useState<
    string | null
  >(null);
  const [isPlanDeleteModalOpen, setIsPlanDeleteModalOpen] = useState(false);
  const [deleteConfirmError, setDeleteConfirmError] = useState<string | null>(
    null
  );
  const [reorderingStepId, setReorderingStepId] = useState<string | null>(null);
  const deleteAbortRef = useRef<AbortController | null>(null);
  const planDetailView = useSyncExternalStore(
    subscribeStrategyPlannerView,
    getStrategyPlannerViewSnapshot,
    getStrategyPlannerViewServerSnapshot
  );

  function handlePlanDetailViewChange(view: StrategyPlannerView) {
    writeStoredStrategyPlannerView(view);
  }

  const stepTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const step of plan.steps) {
      map.set(step.id, step.title);
    }
    return map;
  }, [plan.steps]);

  const sortedSteps = useMemo(
    () =>
      [...plan.steps].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        const aCreated = a.createdAt ?? '';
        const bCreated = b.createdAt ?? '';
        if (aCreated && bCreated && aCreated !== bCreated) {
          return aCreated < bCreated ? -1 : 1;
        }
        return 0;
      }),
    [plan.steps]
  );

  const sortedExpenses = useMemo(
    () =>
      [...plan.expenses].sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        const aCreated = a.createdAt ?? '';
        const bCreated = b.createdAt ?? '';
        if (aCreated && bCreated && aCreated !== bCreated) {
          return aCreated < bCreated ? -1 : 1;
        }
        return 0;
      }),
    [plan.expenses]
  );

  const outcomeSummary = useMemo(
    () => buildOutcomeSummary(plan.steps, plan.expenses),
    [plan.steps, plan.expenses]
  );
  const coverageStyles = COVERAGE_STATUS_STYLES[outcomeSummary.coverageStatus];

  function openCreateStep() {
    setStepActionError(null);
    setEditingStep(null);
    setIsStepModalOpen(true);
  }

  function openEditStep(step: StrategyPlanDetailStep) {
    setStepActionError(null);
    setEditingStep(toStepEditValues(step));
    setIsStepModalOpen(true);
  }

  function closeStepModal() {
    setIsStepModalOpen(false);
    setEditingStep(null);
  }

  function openCreateConnection(
    fromStepId?: string | null,
    toStepId?: string | null
  ) {
    setConnectionActionError(null);
    setEditingConnection(null);
    const from =
      typeof fromStepId === 'string' && fromStepId.trim()
        ? fromStepId.trim()
        : null;
    const to =
      typeof toStepId === 'string' && toStepId.trim() ? toStepId.trim() : null;
    setCreateConnectionDefaults(
      from && to ? { fromStepId: from, toStepId: to } : null
    );
    setIsConnectionModalOpen(true);
  }

  function openEditConnection(connection: StrategyPlanDetailConnection) {
    setConnectionActionError(null);
    setCreateConnectionDefaults(null);
    setEditingConnection({
      id: connection.id,
      fromStepId: connection.fromStepId,
      toStepId: connection.toStepId,
      connectionType: connection.connectionType,
      purpose: connection.purpose,
      expectedOutcome: connection.expectedOutcome,
      timing: connection.timing,
    });
    setIsConnectionModalOpen(true);
  }

  function closeConnectionModal() {
    setIsConnectionModalOpen(false);
    setEditingConnection(null);
    setCreateConnectionDefaults(null);
  }

  function openCreateExpense(coveredByStepId?: string | null) {
    setExpenseActionError(null);
    setEditingExpense(null);
    setCreateExpenseCoveredByStepId(
      typeof coveredByStepId === 'string' && coveredByStepId.trim()
        ? coveredByStepId.trim()
        : null
    );
    setIsExpenseModalOpen(true);
  }

  function openEditExpense(expense: StrategyPlanDetailExpense) {
    setExpenseActionError(null);
    setCreateExpenseCoveredByStepId(null);
    setEditingExpense({
      id: expense.id,
      title: expense.title,
      category: expense.category,
      amount: expense.amount,
      frequency: expense.frequency,
      startTimelineLabel: expense.startTimelineLabel,
      endTimelineLabel: expense.endTimelineLabel,
      startYear: expense.startYear ?? null,
      endYear: expense.endYear ?? null,
      priority: expense.priority,
      purpose: expense.purpose,
      coveredByStepId:
        expense.coveredByStepId ?? expense.coveredByStep?.id ?? null,
      notes: expense.notes ?? null,
      sortOrder: expense.sortOrder,
    });
    setIsExpenseModalOpen(true);
  }

  function closeExpenseModal() {
    setIsExpenseModalOpen(false);
    setEditingExpense(null);
    setCreateExpenseCoveredByStepId(null);
  }

  function openCreateProjectionMilestone() {
    setEditingProjectionMilestone(null);
    setIsProjectionMilestoneModalOpen(true);
  }

  function openEditProjectionMilestone(milestone: StrategyProjectionMilestone) {
    setEditingProjectionMilestone(toProjectionMilestoneEditValues(milestone));
    setIsProjectionMilestoneModalOpen(true);
  }

  function closeProjectionMilestoneModal() {
    setIsProjectionMilestoneModalOpen(false);
    setEditingProjectionMilestone(null);
  }

  async function confirmDeleteProjectionMilestone() {
    if (!pendingDeleteProjectionMilestone) {
      return;
    }

    const milestone = pendingDeleteProjectionMilestone;
    const controller = startDeleteRequest();
    setDeletingProjectionMilestoneId(milestone.id);
    setDeleteConfirmError(null);

    try {
      const response = await authenticatedFetch(
        `/api/clients/${clientId}/strategy-plans/${plan.id}/projection-milestones/${milestone.id}`,
        { method: 'DELETE', signal: controller.signal }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Failed to delete projection milestone'
        );
      }

      setPendingDeleteProjectionMilestone(null);
      onRefresh?.();
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to delete projection milestone';
      setDeleteConfirmError(message);
    } finally {
      if (deleteAbortRef.current === controller) {
        deleteAbortRef.current = null;
      }
      setDeletingProjectionMilestoneId(null);
    }
  }

  async function reorderProjectionMilestone(
    milestoneId: string,
    direction: 'earlier' | 'later'
  ) {
    if (!canManage || reorderingProjectionMilestoneId) {
      return;
    }

    const nextOrderedIds = buildProjectionMilestoneReorderIds(
      plan.projectionMilestones ?? [],
      milestoneId,
      direction
    );
    if (!nextOrderedIds) {
      return;
    }

    setReorderingProjectionMilestoneId(milestoneId);
    setProjectionActionError(null);

    try {
      const response = await authenticatedFetch(
        `/api/clients/${clientId}/strategy-plans/${plan.id}/projection-milestones/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ orderedIds: nextOrderedIds }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Failed to reorder projection milestones'
        );
      }

      onRefresh?.();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to reorder projection milestones';
      setProjectionActionError(message);
    } finally {
      setReorderingProjectionMilestoneId(null);
    }
  }

  async function reorderStep(
    stepId: string,
    direction: 'earlier' | 'later'
  ) {
    if (!canManage || reorderingStepId) {
      return;
    }

    const orderedIds = sortedSteps.map((step) => step.id);
    const index = orderedIds.indexOf(stepId);
    if (index < 0) {
      return;
    }

    const targetIndex = direction === 'earlier' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedIds.length) {
      return;
    }

    const nextOrderedIds = [...orderedIds];
    const swapId = nextOrderedIds[targetIndex]!;
    nextOrderedIds[targetIndex] = nextOrderedIds[index]!;
    nextOrderedIds[index] = swapId;

    setReorderingStepId(stepId);
    setStepActionError(null);

    try {
      const response = await authenticatedFetch(
        `/api/clients/${clientId}/strategy-plans/${plan.id}/steps/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ orderedIds: nextOrderedIds }),
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Failed to reorder strategy steps'
        );
      }

      onRefresh?.();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to reorder strategy steps';
      setStepActionError(message);
    } finally {
      setReorderingStepId(null);
    }
  }

  function abortPendingDeleteRequest() {
    deleteAbortRef.current?.abort();
    deleteAbortRef.current = null;
  }

  function startDeleteRequest() {
    abortPendingDeleteRequest();
    const controller = new AbortController();
    deleteAbortRef.current = controller;
    return controller;
  }

  async function confirmDeleteStep() {
    if (!pendingDeleteStep) {
      return;
    }

    const step = pendingDeleteStep;
    const controller = startDeleteRequest();
    setDeletingStepId(step.id);
    setStepActionError(null);
    setDeleteConfirmError(null);

    try {
      const response = await authenticatedFetch(
        `/api/clients/${clientId}/strategy-plans/${plan.id}/steps/${step.id}`,
        { method: 'DELETE', signal: controller.signal }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Failed to delete strategy step'
        );
      }

      setPendingDeleteStep(null);
      onRefresh?.();
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        err instanceof Error ? err.message : 'Failed to delete strategy step';
      setDeleteConfirmError(message);
      setStepActionError(message);
    } finally {
      if (deleteAbortRef.current === controller) {
        deleteAbortRef.current = null;
      }
      setDeletingStepId(null);
    }
  }

  async function confirmDeleteConnection() {
    if (!pendingDeleteConnection) {
      return;
    }

    const connection = pendingDeleteConnection;
    const controller = startDeleteRequest();
    setDeletingConnectionId(connection.id);
    setConnectionActionError(null);
    setDeleteConfirmError(null);

    try {
      const response = await authenticatedFetch(
        `/api/clients/${clientId}/strategy-plans/${plan.id}/connections/${connection.id}`,
        { method: 'DELETE', signal: controller.signal }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Failed to delete strategy connection'
        );
      }

      setPendingDeleteConnection(null);
      onRefresh?.();
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to delete strategy connection';
      setDeleteConfirmError(message);
      setConnectionActionError(message);
    } finally {
      if (deleteAbortRef.current === controller) {
        deleteAbortRef.current = null;
      }
      setDeletingConnectionId(null);
    }
  }

  async function confirmDeleteExpense() {
    if (!pendingDeleteExpense) {
      return;
    }

    const expense = pendingDeleteExpense;
    const controller = startDeleteRequest();
    setDeletingExpenseId(expense.id);
    setExpenseActionError(null);
    setDeleteConfirmError(null);

    try {
      const response = await authenticatedFetch(
        `/api/clients/${clientId}/strategy-plans/${plan.id}/expenses/${expense.id}`,
        { method: 'DELETE', signal: controller.signal }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          typeof body.error === 'string'
            ? body.error
            : 'Failed to delete strategy expense'
        );
      }

      setPendingDeleteExpense(null);
      onRefresh?.();
    } catch (err) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to delete strategy expense';
      setDeleteConfirmError(message);
      setExpenseActionError(message);
    } finally {
      if (deleteAbortRef.current === controller) {
        deleteAbortRef.current = null;
      }
      setDeletingExpenseId(null);
    }
  }

  const pendingConnectionFromTitle = pendingDeleteConnection
    ? (stepTitleById.get(pendingDeleteConnection.fromStepId) ?? 'Unknown step')
    : '';
  const pendingConnectionToTitle = pendingDeleteConnection
    ? (stepTitleById.get(pendingDeleteConnection.toStepId) ?? 'Unknown step')
    : '';

  const pendingStepConnectionCount = pendingDeleteStep
    ? plan.connections.filter(
        (connection) =>
          connection.fromStepId === pendingDeleteStep.id ||
          connection.toStepId === pendingDeleteStep.id
      ).length
    : 0;
  const pendingStepCoverageCount = pendingDeleteStep
    ? plan.expenses.filter(
        (expense) =>
          expense.coveredByStepId === pendingDeleteStep.id ||
          expense.coveredByStep?.id === pendingDeleteStep.id
      ).length
    : 0;

  return (
    <div className={`w-full min-w-0 ${cardStackClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-gray-600 hover:text-gray-900"
        >
          ← Back to plans
        </button>
        {canManage ? (
          <div className="flex flex-wrap items-center gap-2">
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Edit plan
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setDeleteConfirmError(null);
                setIsPlanDeleteModalOpen(true);
              }}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
            >
              Remove plan
            </button>
          </div>
        ) : null}
      </div>

      <p className="text-xs text-gray-500">
        {planDetailView === 'board'
          ? 'Board maps this plan as a workspace canvas. Switch to List for vertical CRUD, or Projection for selected journey milestones.'
          : planDetailView === 'list'
            ? 'Client goal → strategy steps / connections / expenses → outcome.'
            : 'Illustrative years and scenarios — not an auto-generated yearly projection.'}
      </p>

      {planDetailView === 'list' ? (
        <SectionCard
          title="1. Plan Summary"
          description="Capture the client goal and the outcome this strategy should achieve."
          action={
            canManage && onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                Edit
              </button>
            ) : undefined
          }
        >
          <SectionHelper>
            Use this section as the north star for steps, funding links, and
            expense coverage below.
          </SectionHelper>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900">{plan.title}</h3>
            <CompactPill
              tone={STATUS_TONES[plan.status] ?? 'gray'}
              className="shrink-0"
            >
              {formatStatusLabel(plan.status)}
            </CompactPill>
          </div>
          <div className={`mt-3 ${listSpacingClass}`}>
            <MetaLine label="Client goal" value={plan.clientGoal} />
            <MetaLine label="Expected outcome" value={plan.expectedOutcome} />
            <MetaLine label="Description" value={plan.description} />
            {!plan.clientGoal?.trim() &&
            !plan.expectedOutcome?.trim() &&
            !plan.description?.trim() ? (
              <EmptyState
                action={
                  canManage && onEdit ? (
                    <button
                      type="button"
                      onClick={onEdit}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                    >
                      Add goal & outcome
                    </button>
                  ) : undefined
                }
              >
                No client goal or description yet
                {canManage
                  ? '. Add what success looks like so the rest of the plan stays focused.'
                  : '.'}
              </EmptyState>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {(stepActionError ||
        connectionActionError ||
        expenseActionError ||
        projectionActionError) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {stepActionError ? <p>{stepActionError}</p> : null}
          {connectionActionError ? <p>{connectionActionError}</p> : null}
          {expenseActionError ? <p>{expenseActionError}</p> : null}
          {projectionActionError ? <p>{projectionActionError}</p> : null}
        </div>
      )}

      {!canManage ? (
        <p
          className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600"
          role="status"
        >
          View only — you can open plans and review the board, but you cannot
          create or edit strategy content.
        </p>
      ) : null}

      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Strategy plan view"
          className="inline-flex w-full max-w-full rounded-lg border border-gray-200 bg-gray-50 p-0.5 sm:w-auto"
        >
          <button
            type="button"
            onClick={() => handlePlanDetailViewChange('board')}
            aria-pressed={planDetailView === 'board'}
            className={`min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 sm:flex-none ${
              planDetailView === 'board'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Board view
          </button>
          <button
            type="button"
            onClick={() => handlePlanDetailViewChange('list')}
            aria-pressed={planDetailView === 'list'}
            className={`min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 sm:flex-none ${
              planDetailView === 'list'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            List view
          </button>
          <button
            type="button"
            onClick={() => handlePlanDetailViewChange('projection')}
            aria-pressed={planDetailView === 'projection'}
            className={`min-w-0 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 sm:flex-none ${
              planDetailView === 'projection'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Projection
          </button>
        </div>

        <Link
          href={`/clients/${clientId}/strategy-plans/${plan.id}/overview`}
          className="inline-flex w-full items-center justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 sm:w-auto"
        >
          View client overview
        </Link>

        {canManage && planDetailView !== 'projection' ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={openCreateStep}
              aria-label="Add strategy step"
              className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              + Add step
            </button>
            <button
              type="button"
              onClick={() => openCreateConnection()}
              disabled={sortedSteps.length < 2}
              aria-label="Add strategy connection"
              aria-describedby={
                sortedSteps.length < 2
                  ? 'strategy-detail-connection-hint'
                  : undefined
              }
              title={
                sortedSteps.length < 2
                  ? 'Add at least two strategy steps first'
                  : undefined
              }
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Add connection
            </button>
            <button
              type="button"
              onClick={() => openCreateExpense()}
              aria-label="Add strategy expense"
              className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
            >
              + Add expense
            </button>
            {sortedSteps.length < 2 ? (
              <p
                id="strategy-detail-connection-hint"
                className="basis-full text-[11px] text-gray-500"
              >
                Connections need at least two steps.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {planDetailView === 'board' ? (
        <StrategyPlannerBoard
          plan={plan}
          canManage={canManage}
          deletingStepId={deletingStepId}
          deletingConnectionId={deletingConnectionId}
          deletingExpenseId={deletingExpenseId}
          reorderingStepId={reorderingStepId}
          headerActions={null}
          onAddStep={canManage ? openCreateStep : undefined}
          onAddConnection={canManage ? () => openCreateConnection() : undefined}
          onAddConnectionBetweenSteps={
            canManage
              ? (fromStepId, toStepId) =>
                  openCreateConnection(fromStepId, toStepId)
              : undefined
          }
          onAddExpense={canManage ? () => openCreateExpense() : undefined}
          onAddExpenseForStep={
            canManage
              ? (stepId) => openCreateExpense(stepId)
              : undefined
          }
          onReorderStep={canManage ? reorderStep : undefined}
          onEditStep={canManage ? openEditStep : undefined}
          onDeleteStep={
            canManage
              ? (step) => {
                  setDeleteConfirmError(null);
                  setPendingDeleteStep(step);
                }
              : undefined
          }
          onEditConnection={canManage ? openEditConnection : undefined}
          onDeleteConnection={
            canManage
              ? (connection) => {
                  setDeleteConfirmError(null);
                  setPendingDeleteConnection(connection);
                }
              : undefined
          }
          onEditExpense={canManage ? openEditExpense : undefined}
          onDeleteExpense={
            canManage
              ? (expense) => {
                  setDeleteConfirmError(null);
                  setPendingDeleteExpense(expense);
                }
              : undefined
          }
        />
      ) : planDetailView === 'list' ? (
        <div id="strategy-list-view" className={cardStackClass}>
      <SectionCard
        title="Strategy Steps"
        description="List the deals and actions that create expected income."
      >
        <SectionHelper>
          Prefer linking existing deals when available. Add MONTHLY income on
          steps so outcome coverage can be calculated later.
        </SectionHelper>
        {stepActionError ? (
          <p className="mb-2 text-sm text-red-600">{stepActionError}</p>
        ) : null}
        {sortedSteps.length === 0 ? (
          <EmptyState
            action={
              canManage ? (
                <button
                  type="button"
                  onClick={openCreateStep}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Add first step
                </button>
              ) : undefined
            }
          >
            No strategy steps yet.
            {canManage
              ? ' Add an existing deal, planned deal, or manual step that helps fund the client’s needs.'
              : ''}
          </EmptyState>
        ) : (
          <ul className={listSpacingClass}>
            {sortedSteps.map((step, index) => {
              const economics = getStepEconomicsLabels(step);

              const linkedDealLabel = step.linkedDeal
                ? [
                    step.linkedDeal.name,
                    formatMoney(step.linkedDeal.dealValue),
                    humanizeEnum(step.linkedDeal.status),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : null;
              const linkedDealId =
                step.linkedDeal?.id ?? step.linkedDealId ?? null;

              return (
                <li
                  key={step.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {index + 1}. {step.title}
                    </p>
                    <CompactPill className="shrink-0">
                      {humanizeEnum(step.stepType) ?? step.stepType}
                    </CompactPill>
                  </div>
                  <div className={`mt-1.5 ${listSpacingClass}`}>
                    <MetaLine label="Linked deal" value={linkedDealLabel} />
                    {linkedDealId ? (
                      <a
                        href={`#deal-${linkedDealId}`}
                        className="text-xs font-medium text-emerald-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                      >
                        View deal
                      </a>
                    ) : null}
                    <MetaLine
                      label="Invest"
                      value={economics.invest}
                      showEmptyDash
                    />
                    <MetaLine
                      label="Income"
                      value={economics.income}
                      showEmptyDash
                    />
                    <MetaLine
                      label="Timeline"
                      value={economics.timeline}
                      showEmptyDash
                    />
                    <MetaLine
                      label="Total income"
                      value={economics.totalIncome}
                      showEmptyDash
                    />
                    <MetaLine
                      label="Capital back"
                      value={economics.capitalBack}
                      showEmptyDash
                    />
                    <MetaLine
                      label="Illustrative position"
                      value={economics.illustrativePosition}
                      showEmptyDash
                    />
                    <MetaLine label="Purpose" value={step.purpose} />
                    <MetaLine
                      label="Expected achievement"
                      value={step.expectedAchievement}
                    />
                  </div>
                  {canManage ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => openEditStep(step)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmError(null);
                          setPendingDeleteStep(step);
                        }}
                        disabled={deletingStepId === step.id}
                        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                      >
                        {deletingStepId === step.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Deal Connections"
        description="Show how steps fund, support, or protect one another."
      >
        <SectionHelper>
          {sortedSteps.length < 2
            ? 'Connections need at least two strategy steps. Add another step to enable linking.'
            : 'Connect steps to show funding flow, income direction, or protective support between them.'}
        </SectionHelper>
        {connectionActionError ? (
          <p className="mb-2 text-sm text-red-600">{connectionActionError}</p>
        ) : null}
        {plan.connections.length === 0 ? (
          <EmptyState
            action={
              canManage && sortedSteps.length >= 2 ? (
                <button
                  type="button"
                  onClick={() => openCreateConnection()}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Add first connection
                </button>
              ) : canManage && sortedSteps.length < 2 ? (
                <button
                  type="button"
                  onClick={openCreateStep}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Add another step first
                </button>
              ) : undefined
            }
          >
            No connections yet.
            {canManage
              ? sortedSteps.length < 2
                ? ' Add at least two strategy steps, then link how funding or income flows between them.'
                : ' Link two steps to show how funding, income, or protection moves between them.'
              : ''}
          </EmptyState>
        ) : (
          <ul className={listSpacingClass}>
            {plan.connections.map((connection) => {
              const fromTitle =
                stepTitleById.get(connection.fromStepId) ?? 'Unknown step';
              const toTitle =
                stepTitleById.get(connection.toStepId) ?? 'Unknown step';

              return (
                <li
                  key={connection.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                >
                  <p className="text-sm font-medium text-gray-900">
                    {fromTitle} → {toTitle}
                  </p>
                  <div className={`mt-1.5 ${listSpacingClass}`}>
                    <MetaLine
                      label="Type"
                      value={humanizeEnum(connection.connectionType)}
                    />
                    <MetaLine label="Purpose" value={connection.purpose} />
                    <MetaLine
                      label="Expected outcome"
                      value={connection.expectedOutcome}
                    />
                    <MetaLine label="Timing" value={connection.timing} />
                  </div>
                  {canManage ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => openEditConnection(connection)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmError(null);
                          setPendingDeleteConnection(connection);
                        }}
                        disabled={deletingConnectionId === connection.id}
                        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                      >
                        {deletingConnectionId === connection.id
                          ? 'Deleting…'
                          : 'Delete'}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Expense Coverage"
        description="List the costs this strategy should cover and which step funds them."
      >
        <SectionHelper>
          Mark MONTHLY expenses and link coverage to a step whenever possible.
          Monthly items drive the outcome summary.
        </SectionHelper>
        {expenseActionError ? (
          <p className="mb-2 text-sm text-red-600">{expenseActionError}</p>
        ) : null}
        {sortedExpenses.length === 0 ? (
          <EmptyState
            action={
              canManage ? (
                <button
                  type="button"
                  onClick={() => openCreateExpense()}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Add first expense
                </button>
              ) : undefined
            }
          >
            No expenses yet.
            {canManage
              ? ' Add planned costs (especially MONTHLY) so coverage can be compared with income.'
              : ''}
          </EmptyState>
        ) : (
          <ul className={listSpacingClass}>
            {sortedExpenses.map((expense) => {
              const economics = getExpenseEconomicsLabels(expense);

              return (
                <li
                  key={expense.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      {expense.title}
                    </p>
                    <CompactPill className="shrink-0">
                      {humanizeEnum(expense.priority) ?? expense.priority}
                    </CompactPill>
                  </div>
                  <div className={`mt-1.5 ${listSpacingClass}`}>
                    <MetaLine
                      label="Amount"
                      value={economics.amount}
                      showEmptyDash
                    />
                    <MetaLine
                      label="Timeline"
                      value={economics.timeline}
                      showEmptyDash
                    />
                    <MetaLine
                      label="Total expense"
                      value={economics.totalExpense}
                      showEmptyDash
                    />
                    <MetaLine
                      label="Covered by"
                      value={economics.coveredBy}
                    />
                    <MetaLine
                      label="Category"
                      value={humanizeEnum(expense.category)}
                    />
                    <MetaLine label="Purpose" value={expense.purpose} />
                  </div>
                  {canManage ? (
                    <div className="mt-2 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => openEditExpense(expense)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteConfirmError(null);
                          setPendingDeleteExpense(expense);
                        }}
                        disabled={deletingExpenseId === expense.id}
                        className="text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-60"
                      >
                        {deletingExpenseId === expense.id
                          ? 'Deleting…'
                          : 'Delete'}
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
        </div>
      ) : (
        <StrategyProjectionJourneyView
          milestones={plan.projectionMilestones ?? []}
          canManage={canManage}
          deletingMilestoneId={deletingProjectionMilestoneId}
          reorderingMilestoneId={reorderingProjectionMilestoneId}
          onAddMilestone={
            canManage ? openCreateProjectionMilestone : undefined
          }
          onEditMilestone={
            canManage ? openEditProjectionMilestone : undefined
          }
          onDeleteMilestone={
            canManage
              ? (milestone) => {
                  setDeleteConfirmError(null);
                  setPendingDeleteProjectionMilestone(milestone);
                }
              : undefined
          }
          onReorderMilestone={
            canManage ? reorderProjectionMilestone : undefined
          }
        />
      )}

      {planDetailView === 'board' ? (
        <div
          className={`rounded-lg border px-3 py-3 ${coverageStyles.panel}`}
          aria-label="Outcome summary"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-gray-800">
                Outcome summary
              </p>
              <p className="text-[11px] text-gray-600">
                Monthly coverage (MONTHLY + YEARLY÷12)
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${coverageStyles.badge}`}
            >
              {COVERAGE_STATUS_LABELS[outcomeSummary.coverageStatus]}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500">Expected Monthly Income</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                {formatMoney(outcomeSummary.expectedMonthlyIncome) ?? '$0.00'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Planned Monthly Expenses</p>
              <p className="mt-0.5 text-sm font-semibold text-gray-900">
                {formatMoney(outcomeSummary.plannedMonthlyExpenses) ?? '$0.00'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">{coverageStyles.gapLabel}</p>
              <p
                className={`mt-0.5 text-sm font-semibold ${coverageStyles.gapTone}`}
              >
                {formatMoney(Math.abs(outcomeSummary.monthlyGap)) ?? '$0.00'}
                {outcomeSummary.monthlyGap < 0
                  ? ' short'
                  : outcomeSummary.monthlyGap > 0
                    ? ' surplus'
                    : ''}
              </p>
            </div>
          </div>
        </div>
      ) : planDetailView === 'list' ? (
        <SectionCard
          title="Outcome Summary"
          description="A simple monthly view of whether planned income may cover expenses."
        >
          <SectionHelper>
            Only MONTHLY amounts and YEARLY amounts (÷12) are included. ONE_TIME
            and CUSTOM stay out of this recurring view. This is a planning aid,
            not a financial projection.
          </SectionHelper>
          <div className={`rounded-lg border px-3 py-3 ${coverageStyles.panel}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-gray-600">
                Monthly coverage (MONTHLY + YEARLY÷12)
              </p>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${coverageStyles.badge}`}
              >
                {COVERAGE_STATUS_LABELS[outcomeSummary.coverageStatus]}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-gray-500">Expected Monthly Income</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {formatMoney(outcomeSummary.expectedMonthlyIncome) ?? '$0.00'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Planned Monthly Expenses</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900">
                  {formatMoney(outcomeSummary.plannedMonthlyExpenses) ?? '$0.00'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">{coverageStyles.gapLabel}</p>
                <p
                  className={`mt-0.5 text-sm font-semibold ${coverageStyles.gapTone}`}
                >
                  {formatMoney(Math.abs(outcomeSummary.monthlyGap)) ?? '$0.00'}
                  {outcomeSummary.monthlyGap < 0
                    ? ' short'
                    : outcomeSummary.monthlyGap > 0
                      ? ' surplus'
                      : ''}
                </p>
              </div>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              This is a simple planning summary based on manual inputs, not a
              financial projection.
            </p>
          </div>
        </SectionCard>
      ) : null}

      {canManage && isStepModalOpen ? (
        <StrategyStepEditModal
          clientId={clientId}
          planId={plan.id}
          step={editingStep}
          isOpen={isStepModalOpen}
          onClose={closeStepModal}
          onSaved={() => {
            onRefresh?.();
          }}
        />
      ) : null}

      {canManage && isConnectionModalOpen ? (
        <StrategyConnectionEditModal
          clientId={clientId}
          planId={plan.id}
          steps={sortedSteps.map((step) => ({
            id: step.id,
            title: step.title,
          }))}
          connection={editingConnection}
          defaultFromStepId={
            editingConnection ? null : (createConnectionDefaults?.fromStepId ?? null)
          }
          defaultToStepId={
            editingConnection ? null : (createConnectionDefaults?.toStepId ?? null)
          }
          isOpen={isConnectionModalOpen}
          onClose={closeConnectionModal}
          onSaved={() => {
            onRefresh?.();
          }}
        />
      ) : null}

      {canManage && isExpenseModalOpen ? (
        <StrategyExpenseEditModal
          clientId={clientId}
          planId={plan.id}
          steps={sortedSteps.map((step) => ({
            id: step.id,
            title: step.title,
          }))}
          expense={editingExpense}
          defaultCoveredByStepId={
            editingExpense ? null : createExpenseCoveredByStepId
          }
          isOpen={isExpenseModalOpen}
          onClose={closeExpenseModal}
          onSaved={() => {
            onRefresh?.();
          }}
        />
      ) : null}

      {canManage && isProjectionMilestoneModalOpen ? (
        <StrategyProjectionMilestoneEditModal
          clientId={clientId}
          planId={plan.id}
          steps={sortedSteps.map((step) => ({
            id: step.id,
            title: step.title,
            investmentAmount: step.investmentAmount ?? null,
            plannedAmount: step.plannedAmount,
            incomeAmount: step.incomeAmount ?? null,
            expectedIncomeAmount: step.expectedIncomeAmount,
            incomeFrequency: step.incomeFrequency ?? null,
            expectedIncomeFrequency: step.expectedIncomeFrequency,
            startYear: step.startYear ?? null,
            endYear: step.endYear ?? null,
            incomeStartYear: step.incomeStartYear ?? null,
            incomeEndYear: step.incomeEndYear ?? null,
            capitalReturned: step.capitalReturned ?? null,
            capitalReturnYear: step.capitalReturnYear ?? null,
          }))}
          expenses={plan.expenses.map((expense) => ({
            id: expense.id,
            title: expense.title,
            amount: expense.amount,
            frequency: expense.frequency,
            startYear: expense.startYear ?? null,
            endYear: expense.endYear ?? null,
          }))}
          milestone={editingProjectionMilestone}
          isOpen={isProjectionMilestoneModalOpen}
          onClose={closeProjectionMilestoneModal}
          onSaved={() => {
            onRefresh?.();
          }}
        />
      ) : null}

      {canManage && pendingDeleteStep ? (
        <ConfirmActionModal
          isOpen
          title="Delete strategy step?"
          description={
            <>
              Delete{' '}
              <span className="font-medium text-gray-900">
                {pendingDeleteStep.title}
              </span>
              ? This cannot be undone.
            </>
          }
          warnings={[
            pendingStepConnectionCount > 0
              ? `${pendingStepConnectionCount} related connection${pendingStepConnectionCount === 1 ? '' : 's'} will be removed.`
              : 'Any connections that include this step will be removed.',
            pendingStepCoverageCount > 0
              ? `${pendingStepCoverageCount} expense${pendingStepCoverageCount === 1 ? '' : 's'} will keep their rows but lose coverage links to this step.`
              : 'Expenses covered by this step will keep the expense but lose their coverage link.',
          ]}
          confirmLabel="Delete step"
          tone="danger"
          isSubmitting={deletingStepId === pendingDeleteStep.id}
          error={deleteConfirmError}
          onClose={() => {
            abortPendingDeleteRequest();
            setDeletingStepId(null);
            setPendingDeleteStep(null);
            setDeleteConfirmError(null);
          }}
          onConfirm={() => {
            void confirmDeleteStep();
          }}
        />
      ) : null}

      {canManage && pendingDeleteConnection ? (
        <ConfirmActionModal
          isOpen
          title="Delete connection?"
          description={
            <>
              Delete the connection from{' '}
              <span className="font-medium text-gray-900">
                {pendingConnectionFromTitle}
              </span>{' '}
              to{' '}
              <span className="font-medium text-gray-900">
                {pendingConnectionToTitle}
              </span>
              ? This cannot be undone.
            </>
          }
          warnings={[
            'The linked strategy steps will remain; only this connection is removed.',
          ]}
          confirmLabel="Delete connection"
          tone="danger"
          isSubmitting={deletingConnectionId === pendingDeleteConnection.id}
          error={deleteConfirmError}
          onClose={() => {
            abortPendingDeleteRequest();
            setDeletingConnectionId(null);
            setPendingDeleteConnection(null);
            setDeleteConfirmError(null);
          }}
          onConfirm={() => {
            void confirmDeleteConnection();
          }}
        />
      ) : null}

      {canManage && pendingDeleteExpense ? (
        <ConfirmActionModal
          isOpen
          title="Delete expense?"
          description={
            <>
              Delete{' '}
              <span className="font-medium text-gray-900">
                {pendingDeleteExpense.title}
              </span>
              ? This cannot be undone.
            </>
          }
          warnings={
            pendingDeleteExpense.coveredByStep
              ? [
                  `Coverage link to “${pendingDeleteExpense.coveredByStep.title}” will be removed with this expense.`,
                ]
              : undefined
          }
          confirmLabel="Delete expense"
          tone="danger"
          isSubmitting={deletingExpenseId === pendingDeleteExpense.id}
          error={deleteConfirmError}
          onClose={() => {
            abortPendingDeleteRequest();
            setDeletingExpenseId(null);
            setPendingDeleteExpense(null);
            setDeleteConfirmError(null);
          }}
          onConfirm={() => {
            void confirmDeleteExpense();
          }}
        />
      ) : null}

      {canManage && pendingDeleteProjectionMilestone ? (
        <ConfirmActionModal
          isOpen
          title="Delete projection milestone?"
          description={
            <>
              Delete{' '}
              <span className="font-medium text-gray-900">
                {pendingDeleteProjectionMilestone.title}
              </span>{' '}
              ({pendingDeleteProjectionMilestone.year})? This cannot be undone.
            </>
          }
          confirmLabel="Delete milestone"
          tone="danger"
          isSubmitting={
            deletingProjectionMilestoneId ===
            pendingDeleteProjectionMilestone.id
          }
          error={deleteConfirmError}
          onClose={() => {
            abortPendingDeleteRequest();
            setDeletingProjectionMilestoneId(null);
            setPendingDeleteProjectionMilestone(null);
            setDeleteConfirmError(null);
          }}
          onConfirm={() => {
            void confirmDeleteProjectionMilestone();
          }}
        />
      ) : null}

      {canManage && isPlanDeleteModalOpen ? (
        <StrategyPlanDeleteModal
          isOpen={isPlanDeleteModalOpen}
          clientId={clientId}
          planId={plan.id}
          planTitle={plan.title}
          onClose={() => setIsPlanDeleteModalOpen(false)}
          onArchived={onBack}
          onDeleted={onBack}
        />
      ) : null}
    </div>
  );
}

export default memo(StrategyPlanDetailView);
