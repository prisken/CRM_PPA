'use client';

import dynamic from 'next/dynamic';
import { memo, useEffect, useState } from 'react';
import CompactPill from '@/components/ui/CompactPill';
import SectionCard from '@/components/ui/SectionCard';
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
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-5 text-center">
      <p className="text-sm text-gray-500">{children}</p>
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
}: ClientStrategyBuilderWidgetProps) {
  const { density } = useDisplayDensity();
  const listSpacingClass = getTightStackSpacingClass(density);
  const asideSpacingClass = getStackSpacingClass(density);
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
  }, [clientId, plansReloadKey]);

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
  }, [clientId, selectedPlanId, detailReloadKey]);

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
    <>
      {showingDetail ? (
        <div className={asideSpacingClass}>
          {isDetailLoading ? (
            <StrategyPlanDetailSkeleton cardStackClass={asideSpacingClass} />
          ) : detailError ? (
            <SectionCard
              title="Client Strategy Builder"
              description="Could not open this strategy plan."
            >
              <StrategyErrorState
                message={detailError}
                onRetry={reloadSelectedPlanDetail}
                secondaryAction={
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900"
                  >
                    ← Back to plans
                  </button>
                }
              />
            </SectionCard>
          ) : selectedPlan ? (
            <StrategyPlanDetailView
              clientId={clientId}
              plan={selectedPlan}
              canManage={canManage}
              onBack={handleBackToList}
              onEdit={() => openEditModal(selectedPlan)}
              onRefresh={reloadSelectedPlanDetail}
            />
          ) : (
            <SectionCard
              title="Client Strategy Builder"
              description="This strategy plan is unavailable."
            >
              <StrategyEmptyState
                action={
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    ← Back to plans
                  </button>
                }
              >
                Strategy plan not found. It may have been removed or archived.
              </StrategyEmptyState>
            </SectionCard>
          )}
        </div>
      ) : (
        <SectionCard
          title="Client Strategy Builder"
          description="Map the client’s goals, strategy steps, deal connections, and expense coverage."
          action={
            canManage && !isLoading && !error ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                + New Strategy
              </button>
            ) : undefined
          }
          className="shadow-sm"
        >
          {isLoading ? (
            <StrategyPlanListSkeleton listSpacingClass={listSpacingClass} />
          ) : error ? (
            <StrategyErrorState
              message={error}
              onRetry={reloadPlans}
            />
          ) : displayPlans.length === 0 ? (
            <StrategyEmptyState
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Create your first strategy
                  </button>
                ) : undefined
              }
            >
              {canManage
                ? 'No strategy plan yet. Create one to map this client’s income sources and expense coverage.'
                : 'No strategy plan yet for this client.'}
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
                      className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => openPlanDetail(plan.id)}
                              className="truncate text-left text-sm font-medium text-gray-900 hover:text-blue-700"
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
                              className="text-xs font-medium text-blue-600 hover:text-blue-700"
                            >
                              View
                            </button>
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => openEditModal(plan)}
                                className="text-xs font-medium text-blue-600 hover:text-blue-700"
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
                                className="text-xs font-medium text-red-600 hover:text-red-700"
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
        </SectionCard>
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
    </>
  );
});
