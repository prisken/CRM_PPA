'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import AuthRequiredMessage from '@/components/auth/AuthRequiredMessage';
import LeadPreviewDrawer from '@/components/admin/LeadPreviewDrawer';
import LeadDuplicatesPanel from '@/components/admin/LeadDuplicatesPanel';
import Logo from '@/components/Logo';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import LeadTagBadges from '@/components/clients/LeadTagBadges';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { CLIENT_STAGES, formatClientStage, getStatusBadgeStyles } from '@/lib/clientStages';
import type { LeadCommandCenterRow } from '@/lib/leadCommandCenter';
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

type AdminTagOption = {
  id: string;
  name: string;
  color: string | null;
};

type LeadCommandCenterTab = 'inbox' | 'duplicates';

type LeadsApiResponse = {
  leads: LeadCommandCenterRow[];
  meta: {
    count: number;
    limit: number;
    offset: number;
  };
};

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

const FILTER_CHIPS: { key: FilterChipKey; label: string }[] = [
  { key: 'needsAttention', label: 'Needs attention' },
  { key: 'missingPhone', label: 'Missing phone' },
  { key: 'missingEmail', label: 'Missing email' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'duplicateEmail', label: 'Duplicate email' },
  { key: 'duplicatePhone', label: 'Duplicate phone' },
  { key: 'overdueFollowUp', label: 'Overdue' },
  { key: 'dueToday', label: 'Due today' },
  { key: 'noNextAction', label: 'No next action' },
  { key: 'googleForms', label: 'Google Forms' },
  { key: 'profitPulseAlly', label: 'Profit Pulse Ally' },
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

const PRIORITY_BADGE_STYLES: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-amber-100 text-amber-800',
  HIGH: 'bg-red-100 text-red-800',
};

function truncateText(value: string, maxLength = 72) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) {
    return null;
  }

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
        PRIORITY_BADGE_STYLES[priority] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {priority}
    </span>
  );
}

function LeadFollowUpSummary({ lead }: { lead: LeadCommandCenterRow }) {
  const hasFollowUp =
    lead.priority || lead.nextFollowUpAt || lead.nextAction?.trim();

  if (!hasFollowUp) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <div className="space-y-1">
      {lead.priority && <PriorityBadge priority={lead.priority} />}
      {lead.nextFollowUpAt && (
        <p className="text-sm text-gray-700">{formatDateTime(lead.nextFollowUpAt)}</p>
      )}
      {lead.nextAction?.trim() && (
        <p className="text-xs text-gray-500" title={lead.nextAction}>
          {truncateText(lead.nextAction)}
        </p>
      )}
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

function BadgeList({
  items,
  tone,
}: {
  items: string[];
  tone: 'attention' | 'quality' | 'duplicate' | 'source';
}) {
  if (items.length === 0) {
    return null;
  }

  const toneClasses = {
    attention: 'bg-orange-100 text-orange-800',
    quality: 'bg-amber-100 text-amber-800',
    duplicate: 'bg-red-100 text-red-800',
    source: 'bg-sky-100 text-sky-800',
  }[tone];

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item}
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${toneClasses}`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function AttentionScoreBadge({ score }: { score: number }) {
  if (score <= 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  const tone =
    score >= 80
      ? 'bg-red-100 text-red-800'
      : score >= 40
        ? 'bg-orange-100 text-orange-800'
        : 'bg-amber-100 text-amber-800';

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>
      {score}
    </span>
  );
}

function LeadActions({
  lead,
  onCopied,
  onPreview,
  onAddNote,
}: {
  lead: LeadCommandCenterRow;
  onCopied: (label: string) => void;
  onPreview: (lead: LeadCommandCenterRow) => void;
  onAddNote: (lead: LeadCommandCenterRow) => void;
}) {
  async function handleCopy(value: string | null, label: string) {
    if (!value?.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      onCopied(label);
    } catch {
      onCopied(`Failed to copy ${label.toLowerCase()}`);
    }
  }

  return (
    <div
      className="flex flex-wrap gap-2"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onPreview(lead)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Preview
      </button>
      <button
        type="button"
        onClick={() => onAddNote(lead)}
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        Add note
      </button>
      <Link
        href={`/clients/${lead.clientId}`}
        onClick={(event) => event.stopPropagation()}
        className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
      >
        Open Client 360
      </Link>
      {lead.email && (
        <button
          type="button"
          onClick={() => handleCopy(lead.email, 'Email')}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Copy email
        </button>
      )}
      {lead.phone && (
        <button
          type="button"
          onClick={() => handleCopy(lead.phone, 'Phone')}
          className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Copy phone
        </button>
      )}
    </div>
  );
}

const LeadTableRow = memo(function LeadTableRow({
  lead,
  isSelected,
  onToggleSelect,
  onCopied,
  onPreview,
  onAddNote,
}: {
  lead: LeadCommandCenterRow;
  isSelected: boolean;
  onToggleSelect: (clientId: string) => void;
  onCopied: (label: string) => void;
  onPreview: (lead: LeadCommandCenterRow) => void;
  onAddNote: (lead: LeadCommandCenterRow) => void;
}) {
  const ownerSummary =
    lead.assignedUsers.length > 0
      ? lead.assignedUsers
          .map((user) => `${user.name} (${user.role.replace(/_/g, ' ')})`)
          .join(', ')
      : 'Unassigned';

  return (
    <tr
      className={`cursor-pointer align-top hover:bg-gray-50 ${isSelected ? 'bg-blue-50/60' : ''}`}
      onClick={() => onPreview(lead)}
    >
      <td className="w-10 px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(lead.clientId)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${lead.name}`}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
      </td>
      <td className="px-4 py-3">
        <p className="font-medium text-blue-600">{lead.name}</p>
        {lead.company && <p className="mt-1 text-xs text-gray-500">{lead.company}</p>}
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadgeStyles(lead.status)}`}
        >
          {formatClientStage(lead.status)}
        </span>
      </td>
      <td className="px-4 py-3">
        <LeadSourceBadges sources={lead.sourceLabels} />
      </td>
      <td className="px-4 py-3">
        <LeadTagBadges tags={lead.tags} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        <p>{lead.email ?? <span className="text-gray-400">Missing</span>}</p>
        <p className="mt-1">{lead.phone ?? <span className="text-gray-400">Missing</span>}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{ownerSummary}</td>
      <td className="px-4 py-3 text-sm text-gray-700">
        <LeadFollowUpSummary lead={lead} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        <p>{formatDateTime(lead.lastActivityAt)}</p>
        {lead.lastActivitySummary && (
          <p className="mt-1 text-xs text-gray-500">{lead.lastActivitySummary}</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="space-y-2">
          <AttentionScoreBadge score={lead.attentionScore} />
          <BadgeList items={lead.attentionReasons} tone="attention" />
          <BadgeList items={lead.dataQualityWarnings} tone="quality" />
          <BadgeList items={lead.duplicateWarnings} tone="duplicate" />
        </div>
      </td>
      <td className="px-4 py-3">
        <LeadActions
          lead={lead}
          onCopied={onCopied}
          onPreview={onPreview}
          onAddNote={onAddNote}
        />
      </td>
    </tr>
  );
});

const LeadMobileCard = memo(function LeadMobileCard({
  lead,
  isSelected,
  onToggleSelect,
  onCopied,
  onPreview,
  onAddNote,
}: {
  lead: LeadCommandCenterRow;
  isSelected: boolean;
  onToggleSelect: (clientId: string) => void;
  onCopied: (label: string) => void;
  onPreview: (lead: LeadCommandCenterRow) => void;
  onAddNote: (lead: LeadCommandCenterRow) => void;
}) {
  const ownerSummary =
    lead.assignedUsers.length > 0
      ? lead.assignedUsers
          .map((user) => `${user.name} (${user.role.replace(/_/g, ' ')})`)
          .join(', ')
      : 'Unassigned';

  return (
    <article
      className={`cursor-pointer rounded-xl border bg-white p-4 shadow-sm hover:border-blue-200 hover:bg-blue-50/30 ${
        isSelected ? 'border-blue-400 bg-blue-50/60' : 'border-gray-200'
      }`}
      onClick={() => onPreview(lead)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(lead.clientId)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${lead.name}`}
            className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <div className="min-w-0">
            <p className="text-base font-semibold text-blue-600">{lead.name}</p>
            {lead.company && <p className="mt-1 text-sm text-gray-500">{lead.company}</p>}
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${getStatusBadgeStyles(lead.status)}`}
        >
          {formatClientStage(lead.status)}
        </span>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Sources</p>
          <div className="mt-1">
            <LeadSourceBadges sources={lead.sourceLabels} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Tags</p>
          <div className="mt-1">
            <LeadTagBadges tags={lead.tags} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Contact</p>
          <p className="mt-1 text-sm text-gray-700">
            {lead.email ?? <span className="text-gray-400">Missing email</span>}
          </p>
          <p className="mt-1 text-sm text-gray-700">
            {lead.phone ?? <span className="text-gray-400">Missing phone</span>}
          </p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Owner</p>
          <p className="mt-1 text-sm text-gray-700">{ownerSummary}</p>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Follow-up</p>
          <div className="mt-1">
            <LeadFollowUpSummary lead={lead} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Attention</p>
          <div className="mt-1 space-y-2">
            <AttentionScoreBadge score={lead.attentionScore} />
            <BadgeList items={lead.attentionReasons} tone="attention" />
            <BadgeList items={lead.dataQualityWarnings} tone="quality" />
            <BadgeList items={lead.duplicateWarnings} tone="duplicate" />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Last Activity
          </p>
          <p className="mt-1 text-sm text-gray-700">{formatDateTime(lead.lastActivityAt)}</p>
          {lead.lastActivitySummary && (
            <p className="mt-1 text-xs text-gray-500">{lead.lastActivitySummary}</p>
          )}
        </div>

        <LeadActions
          lead={lead}
          onCopied={onCopied}
          onPreview={onPreview}
          onAddNote={onAddNote}
        />
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
          <div key={index} className="h-48 animate-pulse rounded-xl bg-gray-100" />
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
  const [leadsLoading, setLeadsLoading] = useState(true);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [previewLead, setPreviewLead] = useState<LeadCommandCenterRow | null>(null);
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
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeadCommandCenterTab>('inbox');
  const [availableTags, setAvailableTags] = useState<AdminTagOption[]>([]);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);

  const queryString = useMemo(
    () =>
      buildLeadsQueryString({
        search,
        statusFilter,
        activeChips,
        activeTagFilter,
      }),
    [search, statusFilter, activeChips, activeTagFilter]
  );

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

  const loadLeads = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLeadsLoading(true);
    }
    setLeadsError(null);

    try {
      const suffix = queryString ? `?${queryString}` : '';
      const response = await authenticatedFetch(`/api/admin/leads${suffix}`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to load leads'
        );
      }

      const data = (await response.json()) as LeadsApiResponse;
      setLeads(Array.isArray(data.leads) ? data.leads : []);
    } catch (error) {
      setLeadsError(error instanceof Error ? error.message : 'Failed to load leads');
      setLeads([]);
    } finally {
      if (!options?.silent) {
        setLeadsLoading(false);
      }
    }
  }, [queryString]);

  useEffect(() => {
    if (!profileLoading && profile && profile.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [profileLoading, profile, router]);

  useEffect(() => {
    if (profileLoading || !profile || profile.role !== 'SUPER_ADMIN') {
      return;
    }

    loadLeads();
  }, [profile, profileLoading, loadLeads]);

  useEffect(() => {
    if (profileLoading || !profile || profile.role !== 'SUPER_ADMIN') {
      return;
    }

    void loadAvailableTags();
  }, [profile, profileLoading, loadAvailableTags]);

  useEffect(() => {
    if (!copyMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopyMessage(null), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copyMessage]);

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

  useEffect(() => {
    if (!previewOpen || !previewLead) {
      return;
    }

    const updatedLead = leads.find((lead) => lead.clientId === previewLead.clientId);
    if (!updatedLead) {
      return;
    }

    setPreviewLead((current) => {
      if (
        current?.clientId === updatedLead.clientId &&
        current.lastModified === updatedLead.lastModified &&
        current.lastActivityAt === updatedLead.lastActivityAt &&
        current.priority === updatedLead.priority &&
        current.nextAction === updatedLead.nextAction &&
        current.nextFollowUpAt === updatedLead.nextFollowUpAt
      ) {
        return current;
      }

      return updatedLead;
    });
  }, [leads, previewOpen, previewLead?.clientId]);

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

  const handleCopied = useCallback((label: string) => {
    setCopyMessage(
      label.startsWith('Failed') ? label : `${label} copied to clipboard`
    );
  }, []);

  const openPreview = useCallback((lead: LeadCommandCenterRow) => {
    setPreviewLead(lead);
    setPreviewOpen(true);
  }, []);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    setPreviewLead(null);
  }, []);

  const openQuickNote = useCallback((lead: LeadCommandCenterRow) => {
    setQuickNoteTarget({
      clientId: lead.clientId,
      clientName: lead.name,
    });
    setQuickNoteOpen(true);
  }, []);

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    localStorage.removeItem('token');
    router.push('/login');
  }

  if (profileLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading Lead Command Center...</p>
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

  return (
    <main
      className={`min-h-screen bg-gray-100 ${
        activeTab === 'inbox' && selectedCount > 0 ? 'pb-24' : ''
      }`}
    >
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label="Go to homepage">
              <Logo className="h-8 w-auto" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
                Lead Command Center
              </h1>
              <p className="text-sm text-gray-500">
                Triage, segment, and navigate leads faster
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back to Admin Dashboard
            </Link>
            <Link
              href="/dashboard/settings"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Account Settings
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 border-b border-gray-200">
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
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <label htmlFor="lead-search" className="mb-1 block text-sm font-medium text-gray-700">
                Search
              </label>
              <input
                id="lead-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, company, email, phone..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="w-full lg:w-64">
              <label htmlFor="status-filter" className="mb-1 block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
              >
                {STATUS_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {FILTER_CHIPS.map((chip) => {
              const isActive = activeChips.has(chip.key);
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => toggleChip(chip.key)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>

          {availableTags.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">Filter by tag</p>
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isActive = activeTagFilter === tag.name;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        setActiveTagFilter((current) =>
                          current === tag.name ? null : tag.name
                        )
                      }
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                        isActive
                          ? 'bg-violet-600 text-white'
                          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {copyMessage && (
            <p className="mt-4 text-sm text-green-700" role="status">
              {copyMessage}
            </p>
          )}

          {successMessage && (
            <p className="mt-4 text-sm text-green-700" role="status">
              {successMessage}
            </p>
          )}
        </section>

        <div className="mt-6">
          {leadsError ? (
            <section className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
              {leadsError}
            </section>
          ) : leadsLoading ? (
            <LeadsLoadingState />
          ) : leads.length === 0 ? (
            <section className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
              No leads match the current filters.
            </section>
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-500">
                Showing {leads.length} lead{leads.length === 1 ? '' : 's'}
              </p>

              <section className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="w-10 px-4 py-3">
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
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Name / Company
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Status
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Sources
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Tags
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Contact
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Owner
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Follow-up
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Last Activity
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
                          Attention
                        </th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">
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
                          onCopied={handleCopied}
                          onPreview={openPreview}
                          onAddNote={openQuickNote}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="space-y-4 lg:hidden">
                {leads.map((lead) => (
                  <LeadMobileCard
                    key={lead.clientId}
                    lead={lead}
                    isSelected={selectedClientIds.has(lead.clientId)}
                    onToggleSelect={toggleLeadSelection}
                    onCopied={handleCopied}
                    onPreview={openPreview}
                    onAddNote={openQuickNote}
                  />
                ))}
              </div>
            </>
          )}
        </div>
          </>
        ) : (
          <LeadDuplicatesPanel onMergeSuccess={() => loadLeads({ silent: true })} />
        )}
      </div>

      <LeadPreviewDrawer
        lead={previewLead}
        open={previewOpen}
        onClose={closePreview}
        onRefresh={() => loadLeads({ silent: true })}
        onAddNote={
          previewLead
            ? () => openQuickNote(previewLead)
            : undefined
        }
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

      {activeTab === 'inbox' && selectedCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-gray-900">
              {selectedCount} selected
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openBulkTags}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Add tags
              </button>
              <button
                type="button"
                onClick={openBulkAssignRelationship}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Assign relationship owner
              </button>
              <button
                type="button"
                onClick={openBulkStatus}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Change status
              </button>
              <button
                type="button"
                onClick={openBulkNote}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add bulk note
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Clear selection
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
