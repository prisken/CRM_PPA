'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useState } from 'react';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import LeadTagBadges from '@/components/clients/LeadTagBadges';
import ImportantDatesPanel from '@/components/clients/ImportantDatesPanel';
import CompactPill, { type CompactPillTone } from '@/components/ui/CompactPill';
import EmptyMuted from '@/components/ui/EmptyMuted';
import StatusPill from '@/components/ui/StatusPill';
import SectionCard from '@/components/ui/SectionCard';
import { useDisplayDensity } from '@/components/ui/DisplayDensityProvider';
import {
  getSectionCardBodyPaddingClass,
  getStackSpacingClass,
  getTightStackSpacingClass,
} from '@/components/ui/displayDensity';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type { LeadCommandCenterRow } from '@/lib/leadCommandCenter';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UserRole } from '@prisma/client';

type LeadPreviewDrawerProps = {
  lead: LeadCommandCenterRow | null;
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  onAddNote?: () => void;
  /** When omitted, SUPER_ADMIN may edit (Lead Command Center is SA-only). */
  canEditImportantDates?: boolean;
};

const PRIORITY_OPTIONS = [
  { value: '', label: 'No priority' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
] as const;

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

function formatSourceRecordLabel(source: string) {
  const labels: Record<string, string> = {
    GOOGLE_FORMS: 'Google Forms',
    PROFIT_PULSE_ALLY: 'Profit Pulse Ally',
    MANUAL: 'Manual',
    OTHER: 'Other',
  };

  return labels[source] ?? source.replace(/_/g, ' ');
}

function toDateTimeLocalValue(value: string | null) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const pad = (part: number) => String(part).padStart(2, '0');

  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function getRelationshipOwner(lead: LeadCommandCenterRow) {
  return lead.assignedUsers.find((user) => user.role === 'RELATIONSHIP') ?? null;
}

function priorityTone(priority: string | null): CompactPillTone {
  if (priority === 'HIGH') {
    return 'red';
  }
  if (priority === 'MEDIUM') {
    return 'yellow';
  }
  return 'gray';
}

function WarningList({ items, tone }: { items: string[]; tone: CompactPillTone }) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-500">None</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <CompactPill key={item} tone={tone} size="xs" title={item}>
          {item}
        </CompactPill>
      ))}
    </div>
  );
}

function ContactField({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string | null;
  onCopy: (value: string | null, label: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <p className="mt-0.5 truncate text-sm text-gray-800">
          {value ?? <EmptyMuted label={`No ${label.toLowerCase()}`}>—</EmptyMuted>}
        </p>
      </div>
      {value?.trim() && (
        <button
          type="button"
          onClick={() => onCopy(value, label)}
          className="shrink-0 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Copy
        </button>
      )}
    </div>
  );
}

function LeadPreviewDrawer({
  lead,
  open,
  onClose,
  onRefresh,
  onAddNote,
  canEditImportantDates,
}: LeadPreviewDrawerProps) {
  const { profile } = useUserProfile();
  const { density } = useDisplayDensity();
  const stackSpacingClass = getStackSpacingClass(density);
  const tightStackSpacingClass = getTightStackSpacingClass(density);
  const bodyPaddingClass = getSectionCardBodyPaddingClass(density);
  const canManageDates =
    canEditImportantDates ?? profile?.role === UserRole.SUPER_ADMIN;
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [priority, setPriority] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [isSavingFollowUp, setIsSavingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpMessage, setFollowUpMessage] = useState<string | null>(null);

  const handleCopy = useCallback(async (value: string | null, label: string) => {
    if (!value?.trim()) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} copied`);
    } catch {
      setCopyMessage(`Failed to copy ${label.toLowerCase()}`);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!copyMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setCopyMessage(null), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [copyMessage]);

  useEffect(() => {
    if (!lead) {
      return;
    }

    setPriority(lead.priority ?? '');
    setNextAction(lead.nextAction ?? '');
    setNextFollowUpAt(toDateTimeLocalValue(lead.nextFollowUpAt));
    setFollowUpError(null);
    setFollowUpMessage(null);
    setIsSavingFollowUp(false);
  }, [lead?.clientId, lead?.priority, lead?.nextAction, lead?.nextFollowUpAt]);

  async function handleSaveFollowUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!lead) {
      return;
    }

    setIsSavingFollowUp(true);
    setFollowUpError(null);
    setFollowUpMessage(null);

    try {
      const response = await authenticatedFetch(
        `/api/clients/${lead.clientId}/follow-up`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            priority: priority || null,
            nextAction: nextAction.trim() || null,
            nextFollowUpAt: nextFollowUpAt
              ? new Date(nextFollowUpAt).toISOString()
              : null,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to save follow-up'
        );
      }

      setFollowUpMessage('Follow-up saved');
      onRefresh?.();
    } catch (error) {
      setFollowUpError(
        error instanceof Error ? error.message : 'Failed to save follow-up'
      );
    } finally {
      setIsSavingFollowUp(false);
    }
  }

  if (!open || !lead) {
    return null;
  }

  const relationshipOwner = getRelationshipOwner(lead);
  const extraTeamCount = relationshipOwner
    ? lead.assignedUsers.length - 1
    : lead.assignedUsers.length;
  const attentionExpandedByDefault = lead.attentionScore > 0;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Close lead preview"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-preview-title"
        className="fixed inset-0 flex flex-col bg-gray-50 shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-md"
      >
        <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-5">
          <h2 id="lead-preview-title" className="text-sm font-semibold text-gray-900">
            Lead preview
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </header>

        {copyMessage && (
          <p className="border-b border-green-100 bg-green-50 px-4 py-2 text-xs text-green-700 sm:px-5" role="status">
            {copyMessage}
          </p>
        )}

        <div key={lead.clientId} className={`flex-1 overflow-y-auto ${bodyPaddingClass}`}>
          <div className={stackSpacingClass}>
            <SectionCard title="Summary" collapsible className="shadow-none">
              <div className={tightStackSpacingClass}>
                <div>
                  <p className="text-base font-semibold text-gray-900">{lead.name}</p>
                  {lead.company && (
                    <p className="mt-0.5 text-sm text-gray-500">{lead.company}</p>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Status
                    </dt>
                    <dd className="mt-0.5">
                      <StatusPill status={lead.status} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Priority
                    </dt>
                    <dd className="mt-0.5">
                      {lead.priority ? (
                        <CompactPill tone={priorityTone(lead.priority)} size="xs">
                          {lead.priority}
                        </CompactPill>
                      ) : (
                        <EmptyMuted label="No priority">—</EmptyMuted>
                      )}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      Owner
                    </dt>
                    <dd className="mt-0.5 text-sm text-gray-800">
                      {relationshipOwner ? (
                        <>
                          {relationshipOwner.name}
                          {extraTeamCount > 0 && (
                            <span className="text-gray-500">{` · +${extraTeamCount} team`}</span>
                          )}
                        </>
                      ) : lead.assignedUsers.length > 0 ? (
                        <>
                          <EmptyMuted label="Unassigned">Unassigned</EmptyMuted>
                          <span className="text-gray-500">{` · +${lead.assignedUsers.length} team`}</span>
                        </>
                      ) : (
                        <EmptyMuted label="Unassigned">Unassigned</EmptyMuted>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                  <Link
                    href={`/clients/${lead.clientId}`}
                    className="inline-flex rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    Open Client 360
                  </Link>
                  {onAddNote && (
                    <button
                      type="button"
                      onClick={onAddNote}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Add quick note
                    </button>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Contact" collapsible defaultCollapsed className="shadow-none">
              <div className={tightStackSpacingClass}>
                <ContactField label="Email" value={lead.email} onCopy={handleCopy} />
                <ContactField label="Phone" value={lead.phone} onCopy={handleCopy} />
              </div>
            </SectionCard>

            <SectionCard title="Important Dates" collapsible className="shadow-none">
              <ImportantDatesPanel
                key={lead.clientId}
                ownerId={lead.clientId}
                ownerKind="lead"
                canEdit={canManageDates}
                showHeading={false}
                onChanged={onRefresh}
              />
            </SectionCard>

            <SectionCard title="Follow-up" collapsible className="shadow-none">
              <form onSubmit={handleSaveFollowUp} className={tightStackSpacingClass}>
                <div>
                  <label
                    htmlFor="lead-preview-priority"
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Priority
                  </label>
                  <select
                    id="lead-preview-priority"
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    disabled={isSavingFollowUp}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-60"
                  >
                    {PRIORITY_OPTIONS.map((option) => (
                      <option key={option.value || 'none'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="lead-preview-next-action"
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Next action
                  </label>
                  <textarea
                    id="lead-preview-next-action"
                    value={nextAction}
                    onChange={(event) => setNextAction(event.target.value)}
                    disabled={isSavingFollowUp}
                    rows={3}
                    placeholder="What should happen next?"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60"
                  />
                </div>

                <div>
                  <label
                    htmlFor="lead-preview-follow-up-at"
                    className="mb-1 block text-xs font-medium text-gray-600"
                  >
                    Follow-up date
                  </label>
                  <input
                    id="lead-preview-follow-up-at"
                    type="datetime-local"
                    value={nextFollowUpAt}
                    onChange={(event) => setNextFollowUpAt(event.target.value)}
                    disabled={isSavingFollowUp}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60"
                  />
                </div>

                {followUpError && <p className="text-xs text-red-600">{followUpError}</p>}
                {followUpMessage && (
                  <p className="text-xs text-green-700" role="status">
                    {followUpMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSavingFollowUp}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingFollowUp ? 'Saving...' : 'Save follow-up'}
                </button>
              </form>
            </SectionCard>

            <SectionCard
              title="Attention"
              collapsible
              defaultCollapsed={!attentionExpandedByDefault}
              className="shadow-none"
            >
              <div className={tightStackSpacingClass}>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Score
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-gray-900">
                    {lead.attentionScore > 0 ? lead.attentionScore : '—'}
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Reasons
                  </p>
                  <WarningList items={lead.attentionReasons} tone="orange" />
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Data quality
                  </p>
                  <WarningList items={lead.dataQualityWarnings} tone="yellow" />
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Duplicates
                  </p>
                  <WarningList items={lead.duplicateWarnings} tone="red" />
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Sources and tags"
              collapsible
              defaultCollapsed
              className="shadow-none"
            >
              <div className={stackSpacingClass}>
                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Sources
                  </p>
                  <LeadSourceBadges sources={lead.sourceLabels} maxVisible={2} />
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Latest source
                  </p>
                  <p className="text-sm text-gray-800">
                    {lead.latestSourceLabel ?? '—'}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDateTime(lead.latestSourceReceivedAt)}
                  </p>
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Source records
                  </p>
                  <p className="text-sm text-gray-700">
                    {lead.sourceRecordCount} record{lead.sourceRecordCount === 1 ? '' : 's'}
                  </p>
                  {lead.sources.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {lead.sources.slice(0, 2).map((record, index) => (
                        <li
                          key={`${record.source}-${record.receivedAt}-${index}`}
                          className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700"
                        >
                          <span className="font-medium text-gray-900">
                            {formatSourceRecordLabel(record.source)}
                          </span>
                          <span className="text-gray-400"> · </span>
                          <span className="text-gray-500">
                            {formatDateTime(record.receivedAt)}
                          </span>
                        </li>
                      ))}
                      {lead.sources.length > 2 && (
                        <li className="text-xs text-gray-500">
                          +{lead.sources.length - 2} more record
                          {lead.sources.length - 2 === 1 ? '' : 's'}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-gray-500">No source records yet.</p>
                  )}
                </div>

                <div>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    Tags
                  </p>
                  {lead.tags.length > 0 ? (
                    <LeadTagBadges tags={lead.tags} maxVisible={2} />
                  ) : (
                    <EmptyMuted label="No tags" />
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Recent activity"
              collapsible
              defaultCollapsed
              className="shadow-none"
            >
              <p className="text-sm text-gray-800">{formatDateTime(lead.lastActivityAt)}</p>
              {lead.lastActivitySummary ? (
                <p className="mt-1 text-sm text-gray-600">{lead.lastActivitySummary}</p>
              ) : (
                <EmptyMuted label="No activity summary" />
              )}
            </SectionCard>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default memo(LeadPreviewDrawer);
