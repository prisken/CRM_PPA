'use client';

import dynamic from 'next/dynamic';
import { memo, useEffect, useState } from 'react';
import CompactPill from '@/components/ui/CompactPill';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import {
  getStackSpacingClass,
  getTightStackSpacingClass,
} from '@/components/ui/displayDensity';
import { SkeletonPulse } from '@/components/dashboard/skeletons/skeletonUtils';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type { StrategyPlanEditValues } from '@/components/clients/StrategyPlanEditModal';
import StrategyPlanDetailView, {
  type StrategyPlanDetail,
} from '@/components/clients/StrategyPlanDetailView';

const StrategyPlanEditModal = dynamic(
  () => import('@/components/clients/StrategyPlanEditModal'),
  { ssr: false }
);

const StrategyPlanDeleteModal = dynamic(
  () => import('@/components/clients/StrategyPlanDeleteModal'),
  { ssr: false }
);

type StrategyPlanSummary = StrategyPlanEditValues & {
  updatedAt: string;
  counts?: {
    steps: number;
    connections: number;
    expenses: number;
  };
};

type ClientStrategyBuilderWidgetProps = {
  clientId: string;
  canManage?: boolean;
  /** When bumped by parent (Client 360 refresh), reload plan list / open detail. */
  refreshKey?: number;
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

function formatStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

function formatUpdatedAt(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatPlanCounts(counts: StrategyPlanSummary['counts']) {
  if (!counts) {
    return null;
  }

  return [
    `${counts.steps} step${counts.steps === 1 ? '' : 's'}`,
    `${counts.connections} connection${counts.connections === 1 ? '' : 's'}`,
    `${counts.expenses} expense${counts.expenses === 1 ? '' : 's'}`,
  ].join(' · ');
}

function StrategyEmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-center sm:py-5"
      role="status"
    >
      <p className="text-sm font-semibold text-gray-800">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-snug text-gray-600 sm:text-sm">
        {children}
      </p>
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}

function StrategyErrorState({
  message,
  onRetry,
  secondaryAction,
}: {
  message: string;
  onRetry: () => void;
  secondaryAction?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-4">
      <p className="text-sm text-red-700">{message}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
        >
          Try again
        </button>
        {secondaryAction}
      </div>
    </div>
  );
}

function StrategyPlanListSkeleton({
  listSpacingClass,
}: {
  listSpacingClass: string;
}) {
  return (
    <ul className={listSpacingClass} aria-busy="true" aria-label="Loading strategy plans">
      {Array.from({ length: 3 }).map((_, index) => (
        <li
          key={index}
          className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <SkeletonPulse className="h-4 w-40 max-w-[70%]" />
            <SkeletonPulse className="h-5 w-14 shrink-0 rounded-full" />
          </div>
          <SkeletonPulse className="mt-2 h-3 w-full max-w-[220px]" />
          <SkeletonPulse className="mt-1.5 h-3 w-36" />
          <div className="mt-2.5 flex gap-3">
            <SkeletonPulse className="h-3 w-10" />
            <SkeletonPulse className="h-3 w-10" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StrategyPlanDetailSkeleton({
  cardStackClass,
}: {
  cardStackClass: string;
}) {
  return (
    <div
      className={cardStackClass}
      aria-busy="true"
      aria-label="Loading strategy plan"
    >
      <div className="flex items-center justify-between gap-2">
        <SkeletonPulse className="h-3 w-24" />
        <SkeletonPulse className="h-7 w-20 rounded-lg" />
      </div>
      <SkeletonPulse className="h-3 w-64 max-w-full" />
      {Array.from({ length: 3 }).map((_, index) => (
        <section
          key={index}
          className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <SkeletonPulse className="h-4 w-36" />
            <SkeletonPulse className="mt-2 h-3 w-56 max-w-full" />
          </div>
          <div className="space-y-2 px-4 py-3">
            <SkeletonPulse className="h-4 w-48" />
            <SkeletonPulse className="h-3 w-full" />
            <SkeletonPulse className="h-3 w-2/3" />
          </div>
        </section>
      ))}
    </div>
  );
}

export default memo(function ClientStrategyBuilderWidget({
  clientId,
  canManage = false,
  refreshKey = 0,
}: ClientStrategyBuilderWidgetProps) {
  const { density } = useDisplayDensity();
  const listSpacingClass = getTightStackSpacingClass(density);
  const workspaceSpacingClass = getStackSpacingClass(density);
  const [plans, setPlans] = useState<StrategyPlanSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<StrategyPlanEditValues | null>(
    null
  );
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<StrategyPlanDetail | null>(
    null
  );
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pendingDeletePlan, setPendingDeletePlan] =
    useState<StrategyPlanSummary | null>(null);
  const [plansReloadKey, setPlansReloadKey] = useState(0);
  const [detailReloadKey, setDetailReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPlans() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await authenticatedFetch(
          `/api/clients/${clientId}/strategy-plans`
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body.error === 'string'
              ? body.error
              : 'Failed to load strategy plans'
          );
        }

        const body = (await response.json()) as {
          plans?: StrategyPlanSummary[];
        };

        if (!cancelled) {
          setPlans(body.plans ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load strategy plans'
          );
          setPlans([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadPlans();

    return () => {
      cancelled = true;
    };
  }, [clientId, plansReloadKey, refreshKey]);

  useEffect(() => {
    if (!selectedPlanId) {
      return;
    }

    let cancelled = false;

    async function loadPlanDetail() {
      setIsDetailLoading(true);
      setDetailError(null);

      try {
        const response = await authenticatedFetch(
          `/api/clients/${clientId}/strategy-plans/${selectedPlanId}`
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            typeof body.error === 'string'
              ? body.error
              : 'Failed to load strategy plan'
          );
        }

        const body = (await response.json()) as {
          plan?: StrategyPlanDetail;
        };

        if (!body.plan) {
          throw new Error('Strategy plan not found');
        }

        if (!cancelled) {
          setSelectedPlan(body.plan);
        }
      } catch (err) {
        if (!cancelled) {
          setSelectedPlan(null);
          setDetailError(
            err instanceof Error ? err.message : 'Failed to load strategy plan'
          );
        }
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    }

    void loadPlanDetail();

    return () => {
      cancelled = true;
    };
  }, [clientId, selectedPlanId, detailReloadKey, refreshKey]);

  function reloadPlans() {
    setPlansReloadKey((current) => current + 1);
  }

  function reloadSelectedPlanDetail() {
    setDetailReloadKey((current) => current + 1);
  }

  function openCreateModal() {
    setEditingPlan(null);
    setIsModalOpen(true);
  }

  function openEditModal(plan: StrategyPlanEditValues) {
    setEditingPlan({
      id: plan.id,
      title: plan.title,
      description: plan.description,
      clientGoal: plan.clientGoal,
      expectedOutcome: plan.expectedOutcome,
      status: plan.status,
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingPlan(null);
  }

  function openPlanDetail(planId: string) {
    setSelectedPlan(null);
    setDetailError(null);
    setSelectedPlanId(planId);
  }

  function handleBackToList() {
    setSelectedPlanId(null);
    setSelectedPlan(null);
    setDetailError(null);
    reloadPlans();
  }

  function handlePlanSaved() {
    reloadPlans();
    if (selectedPlanId) {
      reloadSelectedPlanDetail();
    }
  }

  const activePlans = plans.filter((plan) => plan.status !== 'ARCHIVED');
  const displayPlans = activePlans.length > 0 ? activePlans : plans;
  const showingDetail = Boolean(selectedPlanId);
  const showingOnlyArchived =
    !isLoading &&
    !error &&
    activePlans.length === 0 &&
    plans.length > 0;

  return (
    <div className="w-full min-w-0">
      {showingDetail ? (
        <div className={workspaceSpacingClass}>
          {selectedPlan ? (
            <StrategyPlanDetailView
              clientId={clientId}
              plan={selectedPlan}
              canManage={canManage}
              onBack={handleBackToList}
              onEdit={
                canManage ? () => openEditModal(selectedPlan) : undefined
              }
              onRefresh={reloadSelectedPlanDetail}
            />
          ) : isDetailLoading ? (
            <StrategyPlanDetailSkeleton cardStackClass={workspaceSpacingClass} />
          ) : detailError ? (
            <div className="w-full min-w-0">
              <div className="mb-3 border-b border-gray-100 pb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Strategy plans
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Could not open this strategy plan.
                </p>
              </div>
              <StrategyErrorState
                message={detailError}
                onRetry={reloadSelectedPlanDetail}
                secondaryAction={
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  >
                    ← Back to plans
                  </button>
                }
              />
            </div>
          ) : (
            <div className="w-full min-w-0">
              <div className="mb-3 border-b border-gray-100 pb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Strategy plans
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  This strategy plan is unavailable.
                </p>
              </div>
              <StrategyEmptyState
                title="Strategy plan unavailable"
                action={
                  <button
                    type="button"
                    onClick={handleBackToList}
                    aria-label="Back to strategy plans list"
                    className="text-xs font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  >
                    ← Back to plans
                  </button>
                }
              >
                Strategy plan not found. It may have been removed or archived.
              </StrategyEmptyState>
            </div>
          )}
        </div>
      ) : (
        <div className="w-full min-w-0">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2 border-b border-gray-100 pb-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Strategy plans
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Map the client’s goals, strategy steps, deal connections, and
                expense coverage.
              </p>
            </div>
            {canManage && !isLoading && !error ? (
              <button
                type="button"
                onClick={openCreateModal}
                aria-label="Create new strategy plan"
                className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
              >
                + New Strategy
              </button>
            ) : null}
          </div>

          {isLoading ? (
            <StrategyPlanListSkeleton listSpacingClass={listSpacingClass} />
          ) : error ? (
            <StrategyErrorState
              message={error}
              onRetry={reloadPlans}
            />
          ) : displayPlans.length === 0 ? (
            <StrategyEmptyState
              title="No strategy plans yet"
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    aria-label="Create strategy plan"
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  >
                    Create strategy plan
                  </button>
                ) : undefined
              }
            >
              {canManage
                ? 'A strategy plan maps this client’s goals into steps on a canvas, links between those steps (funding, support, dependence), and expense coverage. Create one to start planning.'
                : 'A strategy plan maps goals into steps, links between those steps, and expense coverage. No plan has been created for this client yet — ask someone with edit access if you need one.'}
            </StrategyEmptyState>
          ) : (
            <div className={listSpacingClass}>
              {showingOnlyArchived ? (
                <p className="text-xs text-amber-800">
                  Showing archived plans only. Create a new strategy to start a
                  fresh plan.
                </p>
              ) : (
                <p className="text-xs text-gray-500">
                  Open a plan to review steps, connections, and expense coverage.
                </p>
              )}
              <ul className={listSpacingClass}>
                {displayPlans.map((plan) => {
                  const countsLabel = formatPlanCounts(plan.counts);

                  return (
                    <li
                      key={plan.id}
                      className="rounded-lg border border-gray-100 bg-gray-50/80 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => openPlanDetail(plan.id)}
                              className="truncate text-left text-sm font-medium text-gray-900 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                            >
                              {plan.title}
                            </button>
                            <CompactPill
                              tone={STATUS_TONES[plan.status] ?? 'gray'}
                              className="shrink-0"
                            >
                              {formatStatusLabel(plan.status)}
                            </CompactPill>
                          </div>
                          {plan.clientGoal?.trim() ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                              Goal: {plan.clientGoal.trim()}
                            </p>
                          ) : plan.description?.trim() ? (
                            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                              {plan.description.trim()}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-gray-400">
                            Updated {formatUpdatedAt(plan.updatedAt)}
                            {countsLabel ? ` · ${countsLabel}` : ''}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-3">
                            <button
                              type="button"
                              onClick={() => openPlanDetail(plan.id)}
                              className="text-xs font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                            >
                              View
                            </button>
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => openEditModal(plan)}
                                className="text-xs font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                              >
                                Edit
                              </button>
                            ) : null}
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setPendingDeletePlan(plan);
                                }}
                                className="text-xs font-medium text-red-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {canManage && isModalOpen ? (
        <StrategyPlanEditModal
          clientId={clientId}
          plan={editingPlan}
          isOpen={isModalOpen}
          onClose={closeModal}
          onSaved={() => {
            handlePlanSaved();
          }}
        />
      ) : null}

      {canManage && pendingDeletePlan ? (
        <StrategyPlanDeleteModal
          isOpen
          clientId={clientId}
          planId={pendingDeletePlan.id}
          planTitle={pendingDeletePlan.title}
          onClose={() => setPendingDeletePlan(null)}
          onArchived={() => {
            reloadPlans();
          }}
          onDeleted={() => {
            const removedId = pendingDeletePlan.id;
            if (selectedPlanId === removedId) {
              handleBackToList();
            } else {
              reloadPlans();
            }
          }}
        />
      ) : null}
    </div>
  );
});
