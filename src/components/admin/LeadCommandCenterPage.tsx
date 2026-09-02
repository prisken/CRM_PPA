'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import LeadPreviewDrawer from '@/components/admin/LeadPreviewDrawer';
import LeadDuplicatesPanel from '@/components/admin/LeadDuplicatesPanel';
import WorkspaceShell from '@/components/layout/WorkspaceShell';
import { buildWorkspaceNavConfig } from '@/components/layout/workspaceNavConfig';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import CompactPill from '@/components/ui/CompactPill';
import EmptyMuted from '@/components/ui/EmptyMuted';
import LimitedInlineList from '@/components/ui/LimitedInlineList';
import StatusPill from '@/components/ui/StatusPill';
import {
  DisplayDensityToggle,
  useDisplayDensity,
} from '@/components/ui/DisplayDensityProvider';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { CLIENT_STAGES } from '@/lib/clientStages';
import type { MergeModalResult } from '@/components/admin/MergeClientsModal';
import type {
  LeadCommandCenterPageMeta,
  LeadCommandCenterPreview,
  LeadCommandCenterRow,
} from '@/lib/leadCommandCenter';
import {
  LEAD_COMMAND_CENTER_DEFAULT_LIMIT,
  LEAD_COMMAND_CENTER_MAX_LIMIT,
} from '@/lib/leadCommandCenter';
import type { DuplicateReviewClient } from '@/lib/leadDuplicates';
import { supabase } from '@/lib/supabaseClient';

const QuickNoteModal = dynamic(() => import('@/components/admin/QuickNoteModal'), {
  ssr: false,
});

const BulkNoteModal = dynamic(() => import('@/components/admin/BulkNoteModal'), {
  ssr: false,
});

const BulkStatusModal = dynamic(() => import('@/components/admin/BulkStatusModal'), {
  ssr: false,
});

const BulkAssignRelationshipModal = dynamic(
  () => import('@/components/admin/BulkAssignRelationshipModal'),
  { ssr: false }
);

const BulkTagsModal = dynamic(() => import('@/components/admin/BulkTagsModal'), {
  ssr: false,
});

const BulkDeleteLeadsModal = dynamic(
  () => import('@/components/admin/BulkDeleteLeadsModal'),
  { ssr: false }
);

const MergeClientsModal = dynamic(() => import('@/components/admin/MergeClientsModal'), {
  ssr: false,
});

const MAX_MERGE_SELECTED = 10;
const FILTER_DEBOUNCE_MS = 300;
const PAGE_SIZE = LEAD_COMMAND_CENTER_DEFAULT_LIMIT;

type AdminTagOption = {
  id: string;
  name: string;
  color: string | null;
};

type LeadCommandCenterTab = 'inbox' | 'duplicates';

type LeadsApiResponse = {
  leads: LeadCommandCenterRow[];
  meta: LeadCommandCenterPageMeta;
};

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  );
}

type FilterChipKey =
  | 'needsAttention'
  | 'missingPhone'
  | 'missingEmail'
  | 'unassigned'
  | 'duplicateEmail'
  | 'duplicatePhone'
  | 'googleForms'
  | 'profitPulseAlly'
  | 'overdueFollowUp'
  | 'dueToday'
  | 'noNextAction';

const FILTER_CHIP_LABELS: Record<FilterChipKey, string> = {
  needsAttention: 'Needs attention',
  missingPhone: 'Missing phone',
  missingEmail: 'Missing email',
  unassigned: 'Unassigned',
  duplicateEmail: 'Duplicate email',
  duplicatePhone: 'Duplicate phone',
  overdueFollowUp: 'Overdue',
  dueToday: 'Due today',
  noNextAction: 'No next action',
  googleForms: 'Google Forms',
  profitPulseAlly: 'Profit Pulse Ally',
};

const ADVANCED_BOOLEAN_CHIPS: { key: FilterChipKey; label: string }[] = [
  { key: 'missingPhone', label: FILTER_CHIP_LABELS.missingPhone },
  { key: 'missingEmail', label: FILTER_CHIP_LABELS.missingEmail },
  { key: 'duplicateEmail', label: FILTER_CHIP_LABELS.duplicateEmail },
  { key: 'duplicatePhone', label: FILTER_CHIP_LABELS.duplicatePhone },
  { key: 'overdueFollowUp', label: FILTER_CHIP_LABELS.overdueFollowUp },
  { key: 'dueToday', label: FILTER_CHIP_LABELS.dueToday },
  { key: 'noNextAction', label: FILTER_CHIP_LABELS.noNextAction },
];

const SOURCE_FILTER_CHIPS: { key: FilterChipKey; label: string }[] = [
  { key: 'googleForms', label: FILTER_CHIP_LABELS.googleForms },
  { key: 'profitPulseAlly', label: FILTER_CHIP_LABELS.profitPulseAlly },
];

type ViewPresetId = 'attention' | 'new' | 'unassigned' | 'duplicates' | 'followUp';

const VIEW_PRESETS: { id: ViewPresetId; label: string }[] = [
  { id: 'attention', label: 'Attention' },
  { id: 'new', label: 'New' },
  { id: 'followUp', label: 'Follow-up' },
];

const STATUS_FILTER_OPTIONS = [
  { value: 'ALL_ACTIVE', label: 'All active statuses' },
  ...CLIENT_STAGES.map((stage) => ({
    value: stage.value,
    label: stage.label,
  })),
];

function formatDateTime(value: string | null) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}


function truncateText(value: string, maxLength = 72) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function formatShortDateTime(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getLeadAttentionItems(lead: LeadCommandCenterRow) {
  return [
    ...lead.attentionReasons,
    ...lead.dataQualityWarnings,
    ...lead.duplicateWarnings,
  ];
}

function getRelationshipOwner(lead: LeadCommandCenterRow) {
  return lead.assignedUsers.find((user) => user.role === 'RELATIONSHIP') ?? null;
}

function mapLeadPreviewToDuplicateReviewClient(
  lead: LeadCommandCenterPreview
): DuplicateReviewClient {
  return {
    clientId: lead.clientId,
    name: lead.name,
    company: lead.company,
    email: lead.email,
    phone: lead.phone,
    leadSource: lead.leadSource,
    roleInCompany: lead.roleInCompany,
    employeeCount: lead.employeeCount,
    expectations: lead.expectations,
    priority: lead.priority,
    nextAction: lead.nextAction,
    nextFollowUpAt: lead.nextFollowUpAt,
    contactInfo: null,
    status: lead.status,
    createdAt: lead.createdAt,
    lastModified: lead.lastModified,
    sourceLabels: lead.sourceLabels,
    assignedUsers: lead.assignedUsers.map((user) => ({
      assignmentId: user.assignmentId,
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    })),
    activityCount: lead.lastActivityAt ? 1 : 0,
    dealCount: 0,
  };
}

function LeadContactCell({ lead }: { lead: LeadCommandCenterRow }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <p className="truncate text-xs text-gray-600" title={lead.email ?? undefined}>
        {lead.email ? lead.email : <EmptyMuted />}
      </p>
      <p className="truncate text-xs text-gray-600" title={lead.phone ?? undefined}>
        {lead.phone ? lead.phone : <EmptyMuted />}
      </p>
    </div>
  );
}

function LeadOwnerCell({ lead }: { lead: LeadCommandCenterRow }) {
  const relationshipOwner = getRelationshipOwner(lead);
  const teamCount = lead.assignedUsers.length;

  if (!relationshipOwner && teamCount === 0) {
    return <EmptyMuted label="Unassigned">Unassigned</EmptyMuted>;
  }

  const extraTeamCount = relationshipOwner ? teamCount - 1 : teamCount;

  return (
    <div className="min-w-0">
      <p className="truncate text-sm text-gray-700">
        {relationshipOwner ? relationshipOwner.name : <EmptyMuted label="Unassigned">Unassigned</EmptyMuted>}
      </p>
      {extraTeamCount > 0 && (
        <p className="text-xs text-gray-500">+{extraTeamCount} team</p>
      )}
    </div>
  );
}

function LeadStageCell({ lead }: { lead: LeadCommandCenterRow }) {
  const followUpLabel = formatShortDateTime(lead.nextFollowUpAt);

  return (
    <div className="space-y-1">
      <StatusPill status={lead.status} />
      {(lead.priority || followUpLabel) && (
        <div className="flex flex-wrap items-center gap-1">
          {lead.priority && (
            <CompactPill
              tone={
                lead.priority === 'HIGH'
                  ? 'red'
                  : lead.priority === 'MEDIUM'
                    ? 'yellow'
                    : 'gray'
              }
              size="xs"
              title={`Priority: ${lead.priority}`}
            >
              {lead.priority}
            </CompactPill>
          )}
          {followUpLabel && (
            <span className="text-[11px] text-gray-500" title={formatDateTime(lead.nextFollowUpAt)}>
              {followUpLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function LeadAttentionCell({
  lead,
  maxVisible,
}: {
  lead: LeadCommandCenterRow;
  maxVisible: number;
}) {
  const allItems = getLeadAttentionItems(lead);

  if (lead.attentionScore <= 0 && allItems.length === 0) {
    return <EmptyMuted />;
  }

  return (
    <div className="min-w-0 space-y-1">
      <AttentionScoreBadge score={lead.attentionScore} />
      {allItems.length > 0 && (
        <LimitedInlineList
          max={maxVisible}
          moreTitle={allItems.join(' · ')}
          items={allItems.map((item, index) => (
            <CompactPill
              key={`${item}-${index}`}
              tone="orange"
              size="xs"
              title={item}
              className="max-w-[9rem]"
            >
              {truncateText(item, 28)}
            </CompactPill>
          ))}
        />
      )}
    </div>
  );
}

function LeadNextStepCell({ lead }: { lead: LeadCommandCenterRow }) {
  const followUpLabel = formatShortDateTime(lead.nextFollowUpAt);
  const nextAction = lead.nextAction?.trim();

  if (!nextAction && !followUpLabel) {
    return <EmptyMuted label="No next step">—</EmptyMuted>;
  }

  return (
    <div className="min-w-0 space-y-0.5">
      {nextAction && (
        <p className="truncate text-xs text-gray-700" title={nextAction}>
          {truncateText(nextAction, 48)}
        </p>
      )}
      {followUpLabel && (
        <p className="text-[11px] text-gray-500" title={formatDateTime(lead.nextFollowUpAt)}>
          {followUpLabel}
        </p>
      )}
    </div>
  );
}

function LeadRowActions({
  lead,
  onPreview,
}: {
  lead: LeadCommandCenterRow;
  onPreview: (lead: LeadCommandCenterRow) => void;
}) {
  return (
    <div
      className="flex items-center"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onPreview(lead)}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
      >
        Preview
      </button>
    </div>
  );
}

function buildLeadsQueryString(options: {
  search: string;
  statusFilter: string;
  activeChips: Set<FilterChipKey>;
  activeTagFilter: string | null;
}) {
  const params = new URLSearchParams();

  const search = options.search.trim();
  if (search) {
    params.set('search', search);
  }

  if (options.statusFilter && options.statusFilter !== 'ALL_ACTIVE') {
    params.set('status', options.statusFilter);
  }

  const sourceValues: string[] = [];
  if (options.activeChips.has('googleForms')) {
    sourceValues.push('GOOGLE_FORMS');
  }
  if (options.activeChips.has('profitPulseAlly')) {
    sourceValues.push('PROFIT_PULSE_ALLY');
  }
  if (sourceValues.length > 0) {
    params.set('source', sourceValues.join(','));
  }

  const booleanFilters: { chip: FilterChipKey; param: string }[] = [
    { chip: 'needsAttention', param: 'needsAttention' },
    { chip: 'missingPhone', param: 'missingPhone' },
    { chip: 'missingEmail', param: 'missingEmail' },
    { chip: 'unassigned', param: 'unassigned' },
    { chip: 'duplicateEmail', param: 'duplicateEmail' },
    { chip: 'duplicatePhone', param: 'duplicatePhone' },
    { chip: 'overdueFollowUp', param: 'overdueFollowUp' },
    { chip: 'dueToday', param: 'dueToday' },
    { chip: 'noNextAction', param: 'noNextAction' },
  ];

  for (const filter of booleanFilters) {
    if (options.activeChips.has(filter.chip)) {
      params.set(filter.param, 'true');
    }
  }

  if (options.activeTagFilter) {
    params.set('tagNames', options.activeTagFilter);
  }

  return params.toString();
}

function countActiveFilters(options: {
  statusFilter: string;
  activeChips: Set<FilterChipKey>;
  activeTagFilter: string | null;
}) {
  let count = 0;

  if (options.statusFilter !== 'ALL_ACTIVE') {
    count += 1;
  }

  if (options.activeTagFilter) {
    count += 1;
  }

  count += options.activeChips.size;

  return count;
}

function buildActiveFilterSummaries(options: {
  statusFilter: string;
  activeChips: Set<FilterChipKey>;
  activeTagFilter: string | null;
}) {
  const summaries: string[] = [];

  if (options.statusFilter !== 'ALL_ACTIVE') {
    const statusLabel = STATUS_FILTER_OPTIONS.find(
      (option) => option.value === options.statusFilter
    )?.label;
    summaries.push(statusLabel ?? options.statusFilter);
  }

  for (const chipKey of Object.keys(FILTER_CHIP_LABELS) as FilterChipKey[]) {
    if (options.activeChips.has(chipKey)) {
      summaries.push(FILTER_CHIP_LABELS[chipKey]);
    }
  }

  if (options.activeTagFilter) {
    summaries.push(`Tag: ${options.activeTagFilter}`);
  }

  return summaries;
}

function FilterChipButton({
  label,
  isActive,
  onClick,
  tone = 'blue',
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  tone?: 'blue' | 'purple';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
        isActive
          ? tone === 'purple'
            ? 'border-violet-600 bg-violet-600 text-white'
            : 'border-blue-600 bg-blue-600 text-white'
          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );
}

function AttentionScoreBadge({ score }: { score: number }) {
  if (score <= 0) {
    return <EmptyMuted />;
  }

  const tone =
    score >= 80 ? 'red' : score >= 40 ? 'orange' : 'yellow';

  return (
    <CompactPill tone={tone} size="xs" title={`Attention score: ${score}`}>
      {score}
    </CompactPill>
  );
}

const LeadTableRow = memo(function LeadTableRow({
  lead,
  isSelected,
  onToggleSelect,
  onPreview,
}: {
  lead: LeadCommandCenterRow;
  isSelected: boolean;
  onToggleSelect: (clientId: string) => void;
  onPreview: (lead: LeadCommandCenterRow) => void;
}) {
  const { density } = useDisplayDensity();
  const rowPaddingClass = density === 'compact' ? 'py-2' : 'py-3';
  const attentionReasonsMaxVisible = 2;

  return (
    <tr
      className={`cursor-pointer align-top hover:bg-gray-50 active:bg-gray-100 ${isSelected ? 'bg-blue-50/60' : ''}`}
      onClick={() => onPreview(lead)}
    >
      <td className={`w-10 px-3 ${rowPaddingClass}`}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(lead.clientId)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${lead.name}`}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </td>
      <td className={`min-w-0 px-3 ${rowPaddingClass}`}>
        <p className="truncate font-medium text-gray-900">{lead.name}</p>
        {lead.company && (
          <p className="mt-0.5 truncate text-xs text-gray-500">{lead.company}</p>
        )}
        <div className="mt-1 min-w-0">
          <LeadSourceBadges sources={lead.sourceLabels} maxVisible={2} />
        </div>
      </td>
      <td className={`px-3 ${rowPaddingClass}`}>
        <LeadStageCell lead={lead} />
      </td>
      <td className={`min-w-0 px-3 ${rowPaddingClass}`}>
        <LeadContactCell lead={lead} />
      </td>
      <td className={`min-w-0 px-3 ${rowPaddingClass}`}>
        <LeadOwnerCell lead={lead} />
      </td>
      <td className={`min-w-0 px-3 ${rowPaddingClass}`}>
        <LeadAttentionCell lead={lead} maxVisible={attentionReasonsMaxVisible} />
      </td>
      <td className={`min-w-0 px-3 ${rowPaddingClass}`}>
        <LeadNextStepCell lead={lead} />
      </td>
      <td className={`w-28 shrink-0 px-3 ${rowPaddingClass}`}>
        <LeadRowActions lead={lead} onPreview={onPreview} />
      </td>
    </tr>
  );
});

function LeadMobileAttentionHint({ lead }: { lead: LeadCommandCenterRow }) {
  const items = getLeadAttentionItems(lead);
  if (items.length === 0) {
    return null;
  }

  const primary = items[0];
  const extraCount = items.length - 1;

  return (
    <p className="truncate text-xs text-gray-500" title={items.join(' · ')}>
      {truncateText(primary, 44)}
      {extraCount > 0 && <span className="text-gray-400">{` · +${extraCount} more`}</span>}
    </p>
  );
}

function LeadMobileOwnerLabel({ lead }: { lead: LeadCommandCenterRow }) {
  const relationshipOwner = getRelationshipOwner(lead);
  const extraTeamCount = relationshipOwner
    ? lead.assignedUsers.length - 1
    : lead.assignedUsers.length;

  if (!relationshipOwner && lead.assignedUsers.length === 0) {
    return <EmptyMuted label="Unassigned">Unassigned</EmptyMuted>;
  }

  return (
    <span className="min-w-0 truncate" title={relationshipOwner?.name ?? 'Unassigned'}>
      {relationshipOwner ? relationshipOwner.name : 'Unassigned'}
      {extraTeamCount > 0 && (
        <span className="text-gray-400">{` (+${extraTeamCount})`}</span>
      )}
    </span>
  );
}

const LeadMobileCard = memo(function LeadMobileCard({
  lead,
  isSelected,
  onToggleSelect,
  onPreview,
}: {
  lead: LeadCommandCenterRow;
  isSelected: boolean;
  onToggleSelect: (clientId: string) => void;
  onPreview: (lead: LeadCommandCenterRow) => void;
}) {
  const { density } = useDisplayDensity();
  const cardPaddingClass = density === 'compact' ? 'p-2.5' : 'p-3.5';
  const nextAction = lead.nextAction?.trim();
  const followUpLabel = formatShortDateTime(lead.nextFollowUpAt);
  const hasNextStep = Boolean(nextAction || followUpLabel);
  const attentionItems = getLeadAttentionItems(lead);

  return (
    <article
      className={`cursor-pointer rounded-lg border bg-white ${cardPaddingClass} transition-colors hover:bg-gray-50 active:bg-gray-100/80 ${
        isSelected ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'
      }`}
      onClick={() => onPreview(lead)}
    >
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(lead.clientId)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${lead.name}`}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 truncate text-sm font-medium text-gray-900">{lead.name}</p>
            <div className="shrink-0">
              <AttentionScoreBadge score={lead.attentionScore} />
            </div>
          </div>

          {lead.company && (
            <p className="truncate text-xs text-gray-500">{lead.company}</p>
          )}

          <div className="flex min-w-0 items-center gap-2 text-xs text-gray-600">
            <StatusPill status={lead.status} className="shrink-0" />
            <span className="text-gray-300">·</span>
            <div className="min-w-0 shrink">
              <LeadSourceBadges sources={lead.sourceLabels} maxVisible={2} />
            </div>
            <span className="text-gray-300">·</span>
            <LeadMobileOwnerLabel lead={lead} />
          </div>

          <p className="truncate text-xs text-gray-600">
            {lead.email ? (
              <span title={lead.email}>{lead.email}</span>
            ) : (
              <EmptyMuted />
            )}
            <span className="text-gray-300"> · </span>
            {lead.phone ? (
              <span title={lead.phone}>{lead.phone}</span>
            ) : (
              <EmptyMuted />
            )}
          </p>

          {hasNextStep && (
            <p className="truncate text-xs text-gray-600" title={[nextAction, followUpLabel].filter(Boolean).join(' · ')}>
              {nextAction && truncateText(nextAction, 56)}
              {nextAction && followUpLabel && <span className="text-gray-300"> · </span>}
              {followUpLabel && (
                <span className="text-gray-500">{followUpLabel}</span>
              )}
            </p>
          )}

          {attentionItems.length > 0 && <LeadMobileAttentionHint lead={lead} />}
        </div>
      </div>
    </article>
  );
});

function LeadsLoadingState() {
  return (
    <div className="space-y-4">
      <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
      <div className="hidden lg:block overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="space-y-3 p-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      </div>
      <div className="space-y-3 lg:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

export default function LeadCommandCenterPage() {
  const router = useRouter();
  const { profile, loading: profileLoading, error: profileError } = useUserProfile();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL_ACTIVE');
  const [activeChips, setActiveChips] = useState<Set<FilterChipKey>>(new Set());
  const [leads, setLeads] = useState<LeadCommandCenterRow[]>([]);
  const [leadsMeta, setLeadsMeta] = useState<LeadCommandCenterPageMeta | null>(null);
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsRefreshing, setLeadsRefreshing] = useState(false);
  const [leadsLoadingMore, setLeadsLoadingMore] = useState(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [previewClientId, setPreviewClientId] = useState<string | null>(null);
  const [previewFallbackName, setPreviewFallbackName] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [quickNoteTarget, setQuickNoteTarget] = useState<{
    clientId: string;
    clientName: string;
  } | null>(null);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);
  const [bulkNoteOpen, setBulkNoteOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkAssignRelationshipOpen, setBulkAssignRelationshipOpen] = useState(false);
  const [bulkTagsOpen, setBulkTagsOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkMergeOpen, setBulkMergeOpen] = useState(false);
  const [selectedMergeClients, setSelectedMergeClients] = useState<DuplicateReviewClient[]>(
    []
  );
  const [bulkMergeLoading, setBulkMergeLoading] = useState(false);
  const [bulkMergeError, setBulkMergeError] = useState<string | null>(null);
  const [duplicatesRefreshKey, setDuplicatesRefreshKey] = useState(0);
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeadCommandCenterTab>('inbox');
  const [availableTags, setAvailableTags] = useState<AdminTagOption[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  const liveFilterQuery = useMemo(
    () =>
      buildLeadsQueryString({
        search,
        statusFilter,
        activeChips,
        activeTagFilter,
      }),
    [search, statusFilter, activeChips, activeTagFilter]
  );

  const [debouncedFilterQuery, setDebouncedFilterQuery] = useState(liveFilterQuery);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedFilterQuery(liveFilterQuery);
    }, FILTER_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [liveFilterQuery]);

  const loadAvailableTags = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/admin/tags');
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as AdminTagOption[];
      setAvailableTags(Array.isArray(data) ? data : []);
    } catch {
      setAvailableTags([]);
    }
  }, []);

  const loadLeads = useCallback(
    async (options?: {
      silent?: boolean;
      append?: boolean;
      signal?: AbortSignal;
    }) => {
      const append = options?.append === true;
      const silent = options?.silent === true;
      const ownsController = !options?.signal;
      const controller = ownsController ? new AbortController() : null;
      const signal = options?.signal ?? controller!.signal;

      const currentCount = leadsRef.current.length;
      const offset = append ? currentCount : 0;
      const limit = append
        ? PAGE_SIZE
        : silent && currentCount > 0
          ? Math.min(Math.max(currentCount, PAGE_SIZE), LEAD_COMMAND_CENTER_MAX_LIMIT)
          : PAGE_SIZE;

      if (append) {
        setLeadsLoadingMore(true);
      } else if (silent) {
        setLeadsRefreshing(true);
      } else if (currentCount === 0) {
        setLeadsLoading(true);
      } else {
        setLeadsRefreshing(true);
      }

      setLeadsError(null);

      try {
        const params = new URLSearchParams(debouncedFilterQuery);
        params.set('limit', String(limit));
        params.set('offset', String(offset));
        const response = await authenticatedFetch(
          `/api/admin/leads?${params.toString()}`,
          { signal }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          const apiError =
            typeof data.error === 'string' ? data.error : 'Failed to load leads';
          throw new Error(`${apiError} (${response.status})`);
        }

        const data = (await response.json()) as LeadsApiResponse;
        if (signal.aborted) {
          return;
        }

        const nextLeads = Array.isArray(data.leads) ? data.leads : [];
        setLeads((current) => (append ? [...current, ...nextLeads] : nextLeads));
        setLeadsMeta(data.meta ?? null);
      } catch (error) {
        if (signal.aborted || isAbortError(error)) {
          return;
        }

        setLeadsError(error instanceof Error ? error.message : 'Failed to load leads');
        if (!append && leadsRef.current.length === 0) {
          setLeads([]);
          setLeadsMeta(null);
        }
      } finally {
        if (!signal.aborted) {
          if (append) {
            setLeadsLoadingMore(false);
          } else {
            setLeadsLoading(false);
            setLeadsRefreshing(false);
          }
        }
      }
    },
    [debouncedFilterQuery]
  );

  useEffect(() => {
    if (!profileLoading && profile && profile.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [profileLoading, profile, router]);

  useEffect(() => {
    if (profileLoading || !profile || profile.role !== 'SUPER_ADMIN') {
      return;
    }

    const controller = new AbortController();
    void loadLeads({ signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [profile, profileLoading, loadLeads]);

  useEffect(() => {
    if (profileLoading || !profile || profile.role !== 'SUPER_ADMIN') {
      return;
    }

    void loadAvailableTags();
  }, [profile, profileLoading, loadAvailableTags]);

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSuccessMessage(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  useEffect(() => {
    setSelectedClientIds((current) => {
      const loadedIds = new Set(leads.map((lead) => lead.clientId));
      const next = new Set([...current].filter((clientId) => loadedIds.has(clientId)));

      return next.size === current.size ? current : next;
    });
  }, [leads]);

  const selectedCount = selectedClientIds.size;

  const allLoadedSelected = useMemo(
    () => leads.length > 0 && leads.every((lead) => selectedClientIds.has(lead.clientId)),
    [leads, selectedClientIds]
  );

  const someLoadedSelected = useMemo(
    () => leads.some((lead) => selectedClientIds.has(lead.clientId)),
    [leads, selectedClientIds]
  );

  const selectedClientIdsList = useMemo(
    () => [...selectedClientIds],
    [selectedClientIds]
  );

  const canMergeSelected =
    selectedCount >= 2 && selectedCount <= MAX_MERGE_SELECTED;
  const mergeDisabledReason =
    selectedCount < 2
      ? 'Select at least 2 leads to merge'
      : selectedCount > MAX_MERGE_SELECTED
        ? 'Merge supports up to 10 records at a time.'
        : undefined;

  const hasMoreLeads = leadsMeta?.hasMore === true;
  const totalMatchingLeads = leadsMeta?.total;

  const loadMoreLeads = useCallback(() => {
    if (leadsLoadingMore || leadsRefreshing || leadsLoading || !hasMoreLeads) {
      return;
    }

    void loadLeads({ append: true });
  }, [
    hasMoreLeads,
    leadsLoading,
    leadsLoadingMore,
    leadsRefreshing,
    loadLeads,
  ]);

  const toggleChip = useCallback((chip: FilterChipKey) => {
    setActiveChips((current) => {
      const next = new Set(current);
      if (next.has(chip)) {
        next.delete(chip);
      } else {
        next.add(chip);
      }
      return next;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setStatusFilter('ALL_ACTIVE');
    setActiveChips(new Set());
    setActiveTagFilter(null);
  }, []);

  const toggleViewPreset = useCallback((presetId: ViewPresetId) => {
    switch (presetId) {
      case 'attention':
        toggleChip('needsAttention');
        break;
      case 'new':
        setStatusFilter((current) =>
          current === 'NEW_LEAD' ? 'ALL_ACTIVE' : 'NEW_LEAD'
        );
        break;
      case 'unassigned':
        toggleChip('unassigned');
        break;
      case 'duplicates':
        setActiveChips((current) => {
          const next = new Set(current);
          const isActive =
            next.has('duplicateEmail') && next.has('duplicatePhone');

          if (isActive) {
            next.delete('duplicateEmail');
            next.delete('duplicatePhone');
          } else {
            next.add('duplicateEmail');
            next.add('duplicatePhone');
          }

          return next;
        });
        break;
      case 'followUp':
        setActiveChips((current) => {
          const next = new Set(current);
          const isActive =
            next.has('overdueFollowUp') ||
            next.has('dueToday') ||
            next.has('noNextAction');

          if (isActive) {
            next.delete('overdueFollowUp');
            next.delete('dueToday');
            next.delete('noNextAction');
          } else {
            next.add('overdueFollowUp');
          }

          return next;
        });
        break;
      default:
        break;
    }
  }, [toggleChip]);

  const isViewPresetActive = useCallback(
    (presetId: ViewPresetId) => {
      switch (presetId) {
        case 'attention':
          return activeChips.has('needsAttention');
        case 'new':
          return statusFilter === 'NEW_LEAD';
        case 'unassigned':
          return activeChips.has('unassigned');
        case 'duplicates':
          return (
            activeChips.has('duplicateEmail') && activeChips.has('duplicatePhone')
          );
        case 'followUp':
          return (
            activeChips.has('overdueFollowUp') ||
            activeChips.has('dueToday') ||
            activeChips.has('noNextAction')
          );
        default:
          return false;
      }
    },
    [activeChips, statusFilter]
  );

  const activeFilterCount = useMemo(
    () =>
      countActiveFilters({
        statusFilter,
        activeChips,
        activeTagFilter,
      }),
    [statusFilter, activeChips, activeTagFilter]
  );

  const activeFilterSummaries = useMemo(
    () =>
      buildActiveFilterSummaries({
        statusFilter,
        activeChips,
        activeTagFilter,
      }),
    [statusFilter, activeChips, activeTagFilter]
  );

  const visibleFilterSummaries = activeFilterSummaries.slice(0, 3);
  const hiddenFilterSummaryCount = Math.max(
    0,
    activeFilterSummaries.length - visibleFilterSummaries.length
  );

  const openPreview = useCallback((lead: LeadCommandCenterRow) => {
    setPreviewClientId(lead.clientId);
    setPreviewFallbackName(lead.name);
    setPreviewOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewClientId(null);
    setPreviewFallbackName(null);
  }, []);

  const openQuickNote = useCallback(
    (lead: Pick<LeadCommandCenterRow, 'clientId' | 'name'>) => {
      setQuickNoteTarget({
        clientId: lead.clientId,
        clientName: lead.name,
      });
      setQuickNoteOpen(true);
    },
    []
  );

  const closeQuickNote = useCallback(() => {
    setQuickNoteOpen(false);
    setQuickNoteTarget(null);
  }, []);

  const handleNoteSaved = useCallback(() => {
    void loadLeads({ silent: true });
  }, [loadLeads]);

  const toggleLeadSelection = useCallback((clientId: string) => {
    setSelectedClientIds((current) => {
      const next = new Set(current);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
  }, []);

  const toggleSelectAllLoaded = useCallback(() => {
    setSelectedClientIds((current) => {
      const next = new Set(current);

      if (allLoadedSelected) {
        for (const lead of leads) {
          next.delete(lead.clientId);
        }
      } else {
        for (const lead of leads) {
          next.add(lead.clientId);
        }
      }

      return next;
    });
  }, [allLoadedSelected, leads]);

  const clearSelection = useCallback(() => {
    setSelectedClientIds(new Set());
  }, []);

  const openBulkNote = useCallback(() => {
    setBulkNoteOpen(true);
  }, []);

  const closeBulkNote = useCallback(() => {
    setBulkNoteOpen(false);
  }, []);

  const openBulkStatus = useCallback(() => {
    setBulkStatusOpen(true);
  }, []);

  const closeBulkStatus = useCallback(() => {
    setBulkStatusOpen(false);
  }, []);

  const openBulkAssignRelationship = useCallback(() => {
    setBulkAssignRelationshipOpen(true);
  }, []);

  const closeBulkAssignRelationship = useCallback(() => {
    setBulkAssignRelationshipOpen(false);
  }, []);

  const openBulkTags = useCallback(() => {
    setBulkTagsOpen(true);
  }, []);

  const closeBulkTags = useCallback(() => {
    setBulkTagsOpen(false);
  }, []);

  const openBulkDelete = useCallback(() => {
    setBulkDeleteOpen(true);
  }, []);

  const closeBulkDelete = useCallback(() => {
    setBulkDeleteOpen(false);
  }, []);

  const openBulkMerge = useCallback(async () => {
    if (selectedClientIds.size < 2 || selectedClientIds.size > MAX_MERGE_SELECTED) {
      return;
    }

    const clientIds = [...selectedClientIds];
    setBulkMergeLoading(true);
    setBulkMergeError(null);
    setSuccessMessage(null);
    setBulkMergeOpen(true);
    setSelectedMergeClients([]);

    try {
      const clients = await Promise.all(
        clientIds.map(async (clientId) => {
          const response = await authenticatedFetch(
            `/api/admin/leads/${clientId}/preview`
          );
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(
              typeof data.error === 'string'
                ? data.error
                : `Failed to load merge details for ${clientId}`
            );
          }

          const data = (await response.json()) as {
            lead?: LeadCommandCenterPreview;
          };
          if (!data.lead) {
            throw new Error(`Merge details missing for ${clientId}`);
          }

          return mapLeadPreviewToDuplicateReviewClient(data.lead);
        })
      );

      setSelectedMergeClients(clients);
    } catch (error) {
      setBulkMergeOpen(false);
      setSelectedMergeClients([]);
      setBulkMergeError(
        error instanceof Error ? error.message : 'Failed to load merge candidates'
      );
    } finally {
      setBulkMergeLoading(false);
    }
  }, [selectedClientIds]);

  const closeBulkMerge = useCallback(() => {
    setBulkMergeOpen(false);
    setSelectedMergeClients([]);
    setBulkMergeError(null);
  }, []);

  const handleBulkMergeCompleted = useCallback(
    (summary: MergeModalResult) => {
      const conflictCount =
        summary.conflicts.assignments.length + summary.conflicts.sourceRecords.length;
      const conflictSuffix =
        conflictCount > 0 ? ` ${conflictCount} conflict(s) recorded in audit.` : '';
      const mergedCount =
        'mergedClientIds' in summary ? summary.mergedClientIds.length : 1;

      setSuccessMessage(
        `Merged ${mergedCount} client${mergedCount === 1 ? '' : 's'} successfully. Duplicate${mergedCount === 1 ? '' : 's'} archived.${conflictSuffix}`
      );
      setSelectedClientIds(new Set());
      setSelectedMergeClients([]);
      setBulkMergeOpen(false);
      void loadLeads({ silent: true });
      if (activeTab === 'duplicates') {
        setDuplicatesRefreshKey((key) => key + 1);
      }
    },
    [activeTab, loadLeads]
  );

  const handleBulkNoteSaved = useCallback(
    (count: number) => {
      setSuccessMessage(
        `Bulk note added to ${count} lead${count === 1 ? '' : 's'}`
      );
      setSelectedClientIds(new Set());
      void loadLeads({ silent: true });
    },
    [loadLeads]
  );

  const handleBulkStatusSaved = useCallback(
    (count: number) => {
      setSuccessMessage(
        `Status updated for ${count} lead${count === 1 ? '' : 's'}`
      );
      setSelectedClientIds(new Set());
      void loadLeads({ silent: true });
    },
    [loadLeads]
  );

  const handleBulkAssignRelationshipCompleted = useCallback(
    (result: { assignedCount: number; skipped: { clientId: string; reason: string }[] }) => {
      const skippedCount = result.skipped.length;
      const assignedMessage = `Relationship owner assigned to ${result.assignedCount} lead${
        result.assignedCount === 1 ? '' : 's'
      }`;
      setSuccessMessage(
        skippedCount > 0
          ? `${assignedMessage}. ${skippedCount} skipped.`
          : assignedMessage
      );
      setSelectedClientIds(new Set());
      void loadLeads({ silent: true });
    },
    [loadLeads]
  );

  const handleBulkTagsSaved = useCallback(
    (count: number) => {
      setSuccessMessage(
        `Tags added to ${count} lead association${count === 1 ? '' : 's'}`
      );
      setSelectedClientIds(new Set());
      void loadAvailableTags();
      void loadLeads({ silent: true });
    },
    [loadAvailableTags, loadLeads]
  );

  const handleBulkDeleteCompleted = useCallback(
    (result: { mode: 'archive' | 'permanent'; count: number }) => {
      const { mode, count } = result;
      setSuccessMessage(
        mode === 'permanent'
          ? `Permanently deleted ${count} lead${count === 1 ? '' : 's'}`
          : `Archived ${count} lead${count === 1 ? '' : 's'}`
      );
      setSelectedClientIds(new Set());
      void loadLeads({ silent: true });
    },
    [loadLeads]
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }

  const nav = useMemo(
    () =>
      buildWorkspaceNavConfig({
        shell: 'admin',
        role: 'SUPER_ADMIN',
      }),
    []
  );

  if (profileLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-gray-100">
        <p className="text-sm text-gray-600">Loading Lead Command Center…</p>
      </main>
    );
  }

  if (profileError || !profile) {
    return (
      <AuthRequiredMessage
        message={profileError ?? 'Please log in to view the Lead Command Center.'}
      />
    );
  }

  if (profile.role !== 'SUPER_ADMIN') {
    return null;
  }

  const displayName = profile.name ?? profile.email;

  const topBarActions = (
    <>
      <Link
        href="/admin"
        className="whitespace-nowrap rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 sm:px-3 sm:text-sm"
      >
        Admin Home
      </Link>
      <Link
        href="/dashboard/settings"
        className="whitespace-nowrap rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 sm:px-3 sm:text-sm"
      >
        Settings
      </Link>
      <button
        type="button"
        onClick={handleSignOut}
        className="whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 active:bg-gray-900 sm:px-3 sm:text-sm"
      >
        Sign Out
      </button>
    </>
  );

  return (
    <>
      <WorkspaceShell
        nav={nav}
        userRole={profile.role}
        title="Lead Command Center"
        subtitle={displayName}
        brandHref="/admin"
        topBarActions={topBarActions}
        contentLayout="full"
      >
        <div
          className={`min-w-0 ${
            activeTab === 'inbox' && selectedCount > 0 ? 'pb-24' : ''
          }`}
        >
        <div className="mb-4 border-b border-gray-200 sm:mb-6">
          <nav className="-mb-px flex gap-2 overflow-x-auto" aria-label="Lead Command Center tabs">
            <button
              type="button"
              onClick={() => setActiveTab('inbox')}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
                activeTab === 'inbox'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Inbox
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('duplicates')}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition ${
                activeTab === 'duplicates'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              Duplicates
            </button>
          </nav>
        </div>

        {activeTab === 'inbox' ? (
          <>
        <div className="mb-4 space-y-2">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="w-full min-w-0 lg:flex-1">
              <label htmlFor="lead-search" className="sr-only">
                Search leads
              </label>
              <input
                id="lead-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, company, email, phone..."
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <DisplayDensityToggle />

              <div
                className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-0.5 lg:flex-none"
                role="group"
                aria-label="View presets"
              >
                {VIEW_PRESETS.map((preset) => {
                  const isActive = isViewPresetActive(preset.id);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => toggleViewPreset(preset.id)}
                      aria-pressed={isActive}
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                        isActive
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setFiltersPanelOpen((current) => !current)}
                aria-expanded={filtersPanelOpen}
                className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 sm:text-sm"
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {activeFilterSummaries.length > 0 && (
            <p className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Filters:</span>{' '}
              {visibleFilterSummaries.join(', ')}
              {hiddenFilterSummaryCount > 0 && (
                <span className="text-gray-500">
                  {`, +${hiddenFilterSummaryCount} more`}
                </span>
              )}
            </p>
          )}

          {filtersPanelOpen && (
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 shadow-sm sm:px-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="w-full sm:max-w-xs">
                  <label
                    htmlFor="status-filter"
                    className="mb-1 block text-xs font-medium text-gray-700"
                  >
                    Status
                  </label>
                  <select
                    id="status-filter"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm text-gray-700"
                  >
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={clearAllFilters}
                  disabled={activeFilterCount === 0}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear filters
                </button>
              </div>

              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-gray-700">Source</p>
                <div className="flex flex-wrap gap-1.5">
                  {SOURCE_FILTER_CHIPS.map((chip) => (
                    <FilterChipButton
                      key={chip.key}
                      label={chip.label}
                      isActive={activeChips.has(chip.key)}
                      onClick={() => toggleChip(chip.key)}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-gray-700">Quality & follow-up</p>
                <div className="flex flex-wrap gap-1.5">
                  {ADVANCED_BOOLEAN_CHIPS.map((chip) => (
                    <FilterChipButton
                      key={chip.key}
                      label={chip.label}
                      isActive={activeChips.has(chip.key)}
                      onClick={() => toggleChip(chip.key)}
                    />
                  ))}
                </div>
              </div>

              {availableTags.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-medium text-gray-700">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableTags.map((tag) => (
                      <FilterChipButton
                        key={tag.id}
                        label={tag.name}
                        isActive={activeTagFilter === tag.name}
                        tone="purple"
                        onClick={() =>
                          setActiveTagFilter((current) =>
                            current === tag.name ? null : tag.name
                          )
                        }
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(successMessage || bulkMergeError) && (
            <div className="space-y-1">
              {successMessage && (
                <p
                  className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
                  role="status"
                >
                  {successMessage}
                </p>
              )}
              {bulkMergeError && (
                <p
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  role="alert"
                >
                  {bulkMergeError}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4">
          {leadsError && leads.length === 0 ? (
            <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {leadsError}
            </section>
          ) : leadsLoading && leads.length === 0 ? (
            <LeadsLoadingState />
          ) : leads.length === 0 ? (
            <section className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
              No leads match the current filters.
            </section>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-500">
                  Showing {leads.length}
                  {typeof totalMatchingLeads === 'number'
                    ? ` of ${totalMatchingLeads}`
                    : ''}{' '}
                  lead{totalMatchingLeads === 1 || leads.length === 1 ? '' : 's'}
                  {leadsRefreshing ? ' · Updating…' : ''}
                </p>
                {leadsError && (
                  <p className="text-xs text-red-600" role="alert">
                    {leadsError}
                  </p>
                )}
              </div>

              <section
                className={`hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:block ${
                  leadsRefreshing ? 'opacity-70 transition-opacity' : ''
                }`}
              >
                <table className="w-full table-fixed divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-10 px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={allLoadedSelected}
                          ref={(input) => {
                            if (input) {
                              input.indeterminate =
                                someLoadedSelected && !allLoadedSelected;
                            }
                          }}
                          onChange={toggleSelectAllLoaded}
                          aria-label="Select all loaded leads"
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </th>
                      <th className="w-[18%] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Lead
                      </th>
                      <th className="w-[11%] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Stage
                      </th>
                      <th className="w-[14%] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Contact
                      </th>
                      <th className="w-[11%] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Owner
                      </th>
                      <th className="w-[14%] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Attention
                      </th>
                      <th className="w-[16%] px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Next step
                      </th>
                      <th className="w-28 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {leads.map((lead) => (
                      <LeadTableRow
                        key={lead.clientId}
                        lead={lead}
                        isSelected={selectedClientIds.has(lead.clientId)}
                        onToggleSelect={toggleLeadSelection}
                        onPreview={openPreview}
                      />
                    ))}
                  </tbody>
                </table>
              </section>

              <div
                className={`space-y-3 lg:hidden ${
                  leadsRefreshing ? 'opacity-70 transition-opacity' : ''
                }`}
              >
                {leads.map((lead) => (
                  <LeadMobileCard
                    key={lead.clientId}
                    lead={lead}
                    isSelected={selectedClientIds.has(lead.clientId)}
                    onToggleSelect={toggleLeadSelection}
                    onPreview={openPreview}
                  />
                ))}
              </div>

              {hasMoreLeads && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={loadMoreLeads}
                    disabled={leadsLoadingMore || leadsRefreshing}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {leadsLoadingMore ? 'Loading more…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
          </>
        ) : (
          <LeadDuplicatesPanel
            refreshKey={duplicatesRefreshKey}
            onMergeSuccess={() => loadLeads({ silent: true })}
          />
        )}
        </div>
      </WorkspaceShell>

      <LeadPreviewDrawer
        clientId={previewClientId}
        fallbackName={previewFallbackName}
        open={previewOpen}
        onClose={closePreview}
        onRefresh={() => loadLeads({ silent: true })}
        onAddNote={openQuickNote}
      />

      {quickNoteTarget && (
        <QuickNoteModal
          clientId={quickNoteTarget.clientId}
          clientName={quickNoteTarget.clientName}
          open={quickNoteOpen}
          onClose={closeQuickNote}
          onSaved={handleNoteSaved}
        />
      )}

      <BulkNoteModal
        clientIds={selectedClientIdsList}
        open={bulkNoteOpen}
        onClose={closeBulkNote}
        onSaved={handleBulkNoteSaved}
      />

      <BulkStatusModal
        clientIds={selectedClientIdsList}
        open={bulkStatusOpen}
        onClose={closeBulkStatus}
        onSaved={handleBulkStatusSaved}
      />

      <BulkAssignRelationshipModal
        clientIds={selectedClientIdsList}
        open={bulkAssignRelationshipOpen}
        onClose={closeBulkAssignRelationship}
        onCompleted={handleBulkAssignRelationshipCompleted}
      />

      <BulkTagsModal
        clientIds={selectedClientIdsList}
        open={bulkTagsOpen}
        onClose={closeBulkTags}
        onSaved={handleBulkTagsSaved}
      />

      <BulkDeleteLeadsModal
        clientIds={selectedClientIdsList}
        open={bulkDeleteOpen}
        onClose={closeBulkDelete}
        onCompleted={handleBulkDeleteCompleted}
      />

      {bulkMergeOpen &&
        !bulkMergeLoading &&
        selectedMergeClients.length >= 2 &&
        selectedMergeClients.length <= MAX_MERGE_SELECTED && (
        <MergeClientsModal
          mode="manual-multi"
          clients={selectedMergeClients}
          open={bulkMergeOpen}
          onClose={closeBulkMerge}
          onMerged={handleBulkMergeCompleted}
        />
      )}

      {bulkMergeOpen && bulkMergeLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-lg bg-white px-5 py-4 text-sm text-gray-700 shadow-lg" role="status">
            Loading merge details…
          </div>
        </div>
      )}

      {activeTab === 'inbox' && selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:px-6">
            <div className="mx-auto flex w-full max-w-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-gray-900">
                  {selectedCount} selected
                </p>
                {selectedCount > MAX_MERGE_SELECTED && (
                  <p className="text-xs text-amber-700">
                    Merge supports up to 10 records at a time.
                  </p>
                )}
              </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openBulkTags}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              >
                Add tags
              </button>
              <button
                type="button"
                onClick={openBulkAssignRelationship}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              >
                Assign relationship owner
              </button>
              <button
                type="button"
                onClick={openBulkStatus}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              >
                Change status
              </button>
              <button
                type="button"
                onClick={openBulkMerge}
                disabled={!canMergeSelected}
                title={mergeDisabledReason}
                className="rounded-lg border border-violet-300 px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent"
              >
                Merge selected
              </button>
              <button
                type="button"
                onClick={openBulkNote}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
              >
                Add bulk note
              </button>
              <button
                type="button"
                onClick={openBulkDelete}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 active:bg-red-100"
              >
                Delete leads
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
              >
                Clear selection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
