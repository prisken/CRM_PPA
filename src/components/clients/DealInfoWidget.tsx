'use client';

import { DealParticipantRole } from '@prisma/client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import DealEditModal from '@/components/clients/DealEditModal';
import type {
  AssignedUser,
  CurrentUserInfo,
} from '@/components/clients/AssignedTeamWidget';
import { useClient360RefreshOptional } from '@/components/clients/client360Refresh';
import CompactPill, { type CompactPillTone } from '@/components/ui/CompactPill';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import { getWidgetPaddingClass } from '@/components/ui/displayDensity';
import {
  calculateCommittedValue,
  calculatePotentialValue,
  type DealParticipantResponse,
  type DealResponse,
} from '@/lib/dealCalculations';
import {
  calculateParticipantCommissionAmount,
  calculateParticipantReturnableAmount,
} from '@/lib/dealParticipantCalculations';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { formatMoneyRequired } from '@/lib/formatMoney';

const DEAL_MONEY_OPTIONS = {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
} as const;

function formatDealMoney(value: number) {
  return formatMoneyRequired(value, DEAL_MONEY_OPTIONS);
}

export type ClientDeal = DealResponse;

type DealInfoWidgetProps = {
  clientId: string;
  /** Server-hydrated deals; widget owns subsequent refetches. */
  initialDeals: ClientDeal[];
  myClientCommissionPercentage?: number;
  canCreateDeal?: boolean;
  canManageDeal?: (dealId: string) => boolean;
  assignedUsers?: AssignedUser[];
  currentUser?: CurrentUserInfo | null;
};

const DEAL_PREVIEW_COUNT = 3;
const PARTICIPANT_PREVIEW_COUNT = 3;

function formatCommissionPercentage(share: number) {
  return `${Math.round(share * 100)}%`;
}

function formatPercentValue(percent: number) {
  const rounded = Math.round(percent * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function formatStatusLabel(status: string) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function dealStatusTone(status: string): CompactPillTone {
  switch (status) {
    case 'WON':
      return 'green';
    case 'PROPOSED':
      return 'blue';
    case 'LOST':
      return 'red';
    case 'ON_HOLD':
      return 'yellow';
    default:
      return 'gray';
  }
}

function participantPillTone(role: DealParticipantRole): CompactPillTone {
  switch (role) {
    case DealParticipantRole.COMPANY:
      return 'gray';
    case DealParticipantRole.RELATIONSHIP:
      return 'blue';
    case DealParticipantRole.FOLLOW_UP:
      return 'yellow';
    case DealParticipantRole.DOCTOR:
      return 'green';
    case DealParticipantRole.EXTERNAL_PARTNER:
      return 'red';
    default:
      return 'gray';
  }
}

function getParticipantDisplayName(participant: DealParticipantResponse) {
  return (
    participant.userName ??
    participant.externalName ??
    participant.userEmail ??
    'Unassigned'
  );
}

function calculateUserDealCommissionShare(
  userId: string | undefined,
  deals: ClientDeal[]
) {
  if (!userId) {
    return null;
  }

  let hasParticipantData = false;
  let userAmount = 0;
  let totalCommission = 0;

  for (const deal of deals) {
    const participants = deal.participants ?? [];
    if (participants.length === 0) {
      continue;
    }

    hasParticipantData = true;
    totalCommission += deal.totalCommission;

    for (const participant of participants) {
      if (participant.userId !== userId) {
        continue;
      }

      userAmount +=
        participant.commissionAmount ??
        (deal.totalCommission * participant.commissionPercent) / 100;
    }
  }

  if (!hasParticipantData || totalCommission <= 0) {
    return null;
  }

  return userAmount / totalCommission;
}

function MetricField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-semibold text-gray-900">{value}</dd>
    </div>
  );
}

type ParticipantSummaryLine = {
  key: string;
  label: string;
  text: string;
};

function formatDoctorReturnableSummary(
  participant: DealParticipantResponse,
  totalCommission: number
) {
  const commissionAmount =
    participant.commissionAmount ??
    calculateParticipantCommissionAmount(totalCommission, participant);

  if (!participant.isReturnableRequired) {
    return `No returnable required · ${formatDealMoney(commissionAmount)} commission`;
  }

  const estimatedReturnable = calculateParticipantReturnableAmount(
    totalCommission,
    participant
  );

  if (participant.returnableAmount !== null) {
    return `${formatDealMoney(commissionAmount)} commission · Returnable ${formatDealMoney(participant.returnableAmount)}`;
  }

  if (participant.returnablePercent !== null) {
    return `${formatDealMoney(commissionAmount)} commission · Returnable ${formatPercentValue(participant.returnablePercent)}% (${formatDealMoney(estimatedReturnable ?? 0)})`;
  }

  return `${formatDealMoney(commissionAmount)} commission · Returnable required`;
}

function buildParticipantSummaryLines(
  participants: DealParticipantResponse[],
  totalCommission: number
): ParticipantSummaryLine[] {
  const lines: ParticipantSummaryLine[] = [];

  const companyParticipants = participants.filter(
    (participant) => participant.role === DealParticipantRole.COMPANY
  );
  if (companyParticipants.length > 0) {
    lines.push({
      key: 'company',
      label: 'PPA',
      text: companyParticipants
        .map(
          (participant) =>
            `${formatPercentValue(participant.commissionPercent)}% · ${getParticipantDisplayName(participant)}`
        )
        .join(', '),
    });
  }

  const relationshipParticipants = participants.filter(
    (participant) => participant.role === DealParticipantRole.RELATIONSHIP
  );
  for (const participant of relationshipParticipants) {
    lines.push({
      key: `relationship-${participant.id}`,
      label: participant.roleLabel,
      text: `${formatPercentValue(participant.commissionPercent)}% · ${getParticipantDisplayName(participant)}`,
    });
  }

  const followUpParticipants = participants.filter(
    (participant) => participant.role === DealParticipantRole.FOLLOW_UP
  );
  for (const participant of followUpParticipants) {
    lines.push({
      key: `follow-up-${participant.id}`,
      label: participant.roleLabel,
      text: `${formatPercentValue(participant.commissionPercent)}% · ${getParticipantDisplayName(participant)}`,
    });
  }

  const doctorParticipants = participants.filter(
    (participant) => participant.role === DealParticipantRole.DOCTOR
  );
  for (const participant of doctorParticipants) {
    lines.push({
      key: `doctor-${participant.id}`,
      label: participant.roleLabel,
      text: `${formatPercentValue(participant.commissionPercent)}% · ${getParticipantDisplayName(participant)} · ${formatDoctorReturnableSummary(participant, totalCommission)}`,
    });
  }

  const externalParticipants = participants.filter(
    (participant) => participant.role === DealParticipantRole.EXTERNAL_PARTNER
  );
  for (const participant of externalParticipants) {
    lines.push({
      key: `external-${participant.id}`,
      label: 'External partner',
      text: `${formatPercentValue(participant.commissionPercent)}% · ${getParticipantDisplayName(participant)}`,
    });
  }

  return lines;
}

function DealParticipantSummary({
  participants,
  totalCommission,
}: {
  participants: DealParticipantResponse[];
  totalCommission: number;
}) {
  const lines = buildParticipantSummaryLines(participants, totalCommission);

  if (lines.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-1 text-xs text-gray-600">
      {lines.map((line) => (
        <li key={line.key}>
          <span className="font-medium text-gray-700">{line.label}:</span> {line.text}
        </li>
      ))}
    </ul>
  );
}

function DealParticipantPills({
  participants,
  expanded,
  onToggle,
}: {
  participants: DealParticipantResponse[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const visibleParticipants = expanded
    ? participants
    : participants.slice(0, PARTICIPANT_PREVIEW_COUNT);
  const hiddenCount = Math.max(
    participants.length - PARTICIPANT_PREVIEW_COUNT,
    0
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {visibleParticipants.map((participant) => (
          <CompactPill
            key={participant.id}
            tone={participantPillTone(participant.role)}
            size="xs"
            title={`${participant.roleLabel} · ${getParticipantDisplayName(participant)}`}
          >
            {participant.roleLabel} {formatPercentValue(participant.commissionPercent)}%
            {' · '}
            {getParticipantDisplayName(participant)}
          </CompactPill>
        ))}
      </div>

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onToggle}
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          {expanded ? 'Show fewer participants' : `Show participants (${participants.length})`}
        </button>
      )}
    </div>
  );
}

type DealCardProps = {
  deal: ClientDeal;
  canManage: boolean;
  deletingDealId: string | null;
  participantsExpanded: boolean;
  onToggleParticipants: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function DealCard({
  deal,
  canManage,
  deletingDealId,
  participantsExpanded,
  onToggleParticipants,
  onEdit,
  onDelete,
}: DealCardProps) {
  const participants = deal.participants ?? [];
  const hasParticipants = participants.length > 0;

  return (
    <article
      id={`deal-${deal.id}`}
      className="scroll-mt-4 rounded-lg border border-gray-200 bg-gray-50/60 p-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-gray-900" title={deal.name}>
            {deal.name}
          </h4>
          <p className="mt-0.5 text-xs text-gray-500">{deal.dealTypeLabel}</p>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <CompactPill tone={dealStatusTone(deal.status)} size="xs">
            {formatStatusLabel(deal.status)}
          </CompactPill>
          {canManage && (
            <details className="inline-block text-left">
              <summary className="cursor-pointer list-none text-[11px] font-medium text-gray-600 hover:text-gray-900 [&::-webkit-details-marker]:hidden">
                Actions
              </summary>
              <div className="mt-1 flex flex-col gap-1 rounded-md border border-gray-200 bg-white p-1.5 shadow-sm">
                <button
                  type="button"
                  onClick={onEdit}
                  className="rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deletingDealId === deal.id}
                  className="rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {deletingDealId === deal.id ? '…' : 'Delete'}
                </button>
              </div>
            </details>
          )}
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-medium uppercase tracking-wide text-gray-500">Deal value</dt>
          <dd className="mt-0.5 font-medium text-gray-900">{formatDealMoney(deal.dealValue)}</dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide text-gray-500">
            Total commission
          </dt>
          <dd className="mt-0.5 font-medium text-gray-900">
            {formatDealMoney(deal.totalCommission)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 border-t border-gray-200 pt-3">
        {!hasParticipants || deal.usesLegacyCommissionFallback ? (
          <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2">
            <p className="text-xs font-medium text-amber-900">
              Legacy commission fallback
            </p>
            <p className="text-xs leading-relaxed text-amber-800">
              This deal has no participant split and is using the legacy
              client-assignment commission fallback. Backfill or edit
              participants before relying on final commission numbers.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                Commission split
              </p>
              <p className="text-[11px] text-gray-500">
                {formatPercentValue(
                  participants.reduce(
                    (sum, participant) => sum + participant.commissionPercent,
                    0
                  )
                )}
                % allocated
                {deal.commissionModel === 'PARTICIPANT'
                  ? ` · ${deal.commissionModel}`
                  : ''}
              </p>
            </div>
            <DealParticipantSummary
              participants={participants}
              totalCommission={deal.totalCommission}
            />
            <DealParticipantPills
              participants={participants}
              expanded={participantsExpanded}
              onToggle={onToggleParticipants}
            />
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(function DealInfoWidget({
  clientId,
  initialDeals,
  myClientCommissionPercentage = 0,
  canCreateDeal = false,
  canManageDeal = () => false,
  assignedUsers = [],
  currentUser = null,
}: DealInfoWidgetProps) {
  const { density } = useDisplayDensity();
  const widgetPaddingClass = getWidgetPaddingClass(density);
  const [deals, setDeals] = useState<ClientDeal[]>(initialDeals);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<ClientDeal | null>(null);
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);
  const [showAllDeals, setShowAllDeals] = useState(false);
  const [expandedParticipantDeals, setExpandedParticipantDeals] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setDeals(initialDeals);
  }, [initialDeals]);

  const client360Refresh = useClient360RefreshOptional();
  const dealsSliceKey = client360Refresh?.sliceKeys.deals ?? 0;
  const skipDealsSliceEffectRef = useRef(true);

  const committedValue = useMemo(
    () => calculateCommittedValue(deals),
    [deals]
  );
  const potentialValue = useMemo(
    () => calculatePotentialValue(deals),
    [deals]
  );

  const myShare = useMemo(() => {
    const dealShare = calculateUserDealCommissionShare(currentUser?.id, deals);
    if (dealShare !== null) {
      return dealShare;
    }

    return myClientCommissionPercentage;
  }, [currentUser?.id, deals, myClientCommissionPercentage]);

  async function refreshDeals() {
    setIsRefreshing(true);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/deals`);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to refresh deals'
        );
      }

      const data = (await res.json()) as { deals?: ClientDeal[] };
      setDeals(Array.isArray(data.deals) ? data.deals : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh deals');
      throw err;
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (skipDealsSliceEffectRef.current) {
      skipDealsSliceEffectRef.current = false;
      return;
    }

    void refreshDeals().catch(() => {
      // Error already surfaced via refreshDeals → setError
    });
  }, [dealsSliceKey]);

  function openCreateModal() {
    setEditingDeal(null);
    setModalOpen(true);
  }

  function openEditModal(deal: ClientDeal) {
    setEditingDeal(deal);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingDeal(null);
  }

  function toggleDealParticipants(dealId: string) {
    setExpandedParticipantDeals((current) => ({
      ...current,
      [dealId]: !current[dealId],
    }));
  }

  async function handleDeleteDeal(dealId: string) {
    if (!window.confirm('Delete this deal? This cannot be undone.')) {
      return;
    }

    setDeletingDealId(dealId);
    setError(null);

    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/deals/${dealId}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to delete deal'
        );
      }

      await refreshDeals();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete deal');
    } finally {
      setDeletingDealId(null);
    }
  }

  async function handleDealSaved() {
    setModalOpen(false);
    setEditingDeal(null);

    try {
      await refreshDeals();
    } catch {
      // Error already surfaced via refreshDeals → setError
    }
  }

  const visibleDeals = showAllDeals ? deals : deals.slice(0, DEAL_PREVIEW_COUNT);
  const hiddenDealCount = Math.max(deals.length - DEAL_PREVIEW_COUNT, 0);

  useEffect(() => {
    function scrollToDealFromHash() {
      if (typeof window === 'undefined') {
        return;
      }

      const hash = window.location.hash;
      if (hash === '#deal-info') {
        document.getElementById('deal-info')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        return;
      }

      const match = /^#deal-(.+)$/.exec(hash);
      if (!match) {
        return;
      }

      const dealId = match[1];
      if (!deals.some((deal) => deal.id === dealId)) {
        document.getElementById('deal-info')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
        return;
      }

      setShowAllDeals(true);
      window.requestAnimationFrame(() => {
        document.getElementById(`deal-${dealId}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      });
    }

    scrollToDealFromHash();
    window.addEventListener('hashchange', scrollToDealFromHash);
    return () => {
      window.removeEventListener('hashchange', scrollToDealFromHash);
    };
  }, [deals]);

  return (
    <>
      <div
        id="deal-info"
        className={`scroll-mt-4 rounded-xl border border-gray-200 bg-white shadow-sm ${widgetPaddingClass}`}
      >
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900">Deal Info</h3>
          {canCreateDeal && (
            <button
              type="button"
              onClick={openCreateModal}
              disabled={isRefreshing}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Add Deal
            </button>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <MetricField label="Committed" value={formatDealMoney(committedValue)} />
          <MetricField label="Potential" value={formatDealMoney(potentialValue)} />
          <MetricField
            label="My share"
            value={myShare > 0 ? formatCommissionPercentage(myShare) : '—'}
          />
        </dl>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {isRefreshing && deals.length === 0 ? (
          <div className="mt-3 space-y-3" aria-busy="true" aria-label="Loading deals">
            <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
            <div className="h-24 animate-pulse rounded-lg bg-gray-100" />
          </div>
        ) : deals.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No deals yet.</p>
        ) : (
          <div
            className={`mt-3 space-y-3 ${isRefreshing ? 'opacity-60' : ''}`}
            aria-busy={isRefreshing}
          >
            {isRefreshing ? (
              <p className="text-xs text-gray-500">Refreshing deals…</p>
            ) : null}
            {visibleDeals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                canManage={canManageDeal(deal.id)}
                deletingDealId={deletingDealId}
                participantsExpanded={Boolean(expandedParticipantDeals[deal.id])}
                onToggleParticipants={() => toggleDealParticipants(deal.id)}
                onEdit={() => openEditModal(deal)}
                onDelete={() => handleDeleteDeal(deal.id)}
              />
            ))}

            {hiddenDealCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllDeals((current) => !current)}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                {showAllDeals ? 'Show fewer deals' : `Show all deals (${deals.length})`}
              </button>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <DealEditModal
          clientId={clientId}
          deal={editingDeal}
          assignedUsers={assignedUsers}
          currentUser={currentUser}
          isOpen
          onClose={closeModal}
          onSaved={handleDealSaved}
        />
      )}
    </>
  );
});
