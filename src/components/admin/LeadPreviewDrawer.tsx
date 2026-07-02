'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { formatClientStage, getStatusBadgeStyles } from '@/lib/clientStages';
import type { LeadCommandCenterRow } from '@/lib/leadCommandCenter';

type LeadPreviewDrawerProps = {
  lead: LeadCommandCenterRow | null;
  open: boolean;
  onClose: () => void;
  onRefresh?: () => void;
  onAddNote?: () => void;
};

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

const PRIORITY_OPTIONS = [
  { value: '', label: 'No priority' },
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
] as const;

function WarningBadges({
  items,
  tone,
}: {
  items: string[];
  tone: 'attention' | 'quality' | 'duplicate';
}) {
  if (items.length === 0) {
    return <p className="text-sm text-gray-500">None</p>;
  }

  const toneClasses = {
    attention: 'bg-orange-100 text-orange-800',
    quality: 'bg-amber-100 text-amber-800',
    duplicate: 'bg-red-100 text-red-800',
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

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function LeadPreviewDrawer({
  lead,
  open,
  onClose,
  onRefresh,
  onAddNote,
}: LeadPreviewDrawerProps) {
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

  const assignedSummary =
    lead.assignedUsers.length > 0
      ? lead.assignedUsers.map((user) => `${user.name} (${user.role.replace(/_/g, ' ')})`)
      : [];

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
        className="fixed inset-0 flex flex-col bg-white shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:w-full sm:max-w-md"
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="lead-preview-title" className="truncate text-lg font-semibold text-gray-900">
              {lead.name}
            </h2>
            {lead.company && (
              <p className="mt-1 truncate text-sm text-gray-500">{lead.company}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-5">
            <DrawerSection title="Status">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeStyles(lead.status)}`}
              >
                {formatClientStage(lead.status)}
              </span>
            </DrawerSection>

            <DrawerSection title="Follow-up">
              <form onSubmit={handleSaveFollowUp} className="space-y-3">
                <div>
                  <label
                    htmlFor="lead-preview-priority"
                    className="mb-1 block text-sm font-medium text-gray-700"
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
                    className="mb-1 block text-sm font-medium text-gray-700"
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
                    className="mb-1 block text-sm font-medium text-gray-700"
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

                {followUpError && (
                  <p className="text-sm text-red-600">{followUpError}</p>
                )}
                {followUpMessage && (
                  <p className="text-sm text-green-700" role="status">
                    {followUpMessage}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={isSavingFollowUp}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingFollowUp ? 'Saving...' : 'Save follow-up'}
                </button>
              </form>
            </DrawerSection>

            <DrawerSection title="Sources">
              <LeadSourceBadges sources={lead.sourceLabels} maxVisible={6} />
            </DrawerSection>

            <DrawerSection title="Contact">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500">Email</dt>
                  <dd className="font-medium text-gray-900">
                    {lead.email ?? <span className="text-gray-400">Missing</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="font-medium text-gray-900">
                    {lead.phone ?? <span className="text-gray-400">Missing</span>}
                  </dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Assigned Users">
              {assignedSummary.length > 0 ? (
                <ul className="space-y-1 text-sm text-gray-800">
                  {assignedSummary.map((entry) => (
                    <li key={entry}>{entry}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">Unassigned</p>
              )}
            </DrawerSection>

            <DrawerSection title="Attention">
              <p className="text-sm font-semibold text-gray-900">
                Score: {lead.attentionScore > 0 ? lead.attentionScore : '—'}
              </p>
              <div className="mt-2">
                <WarningBadges items={lead.attentionReasons} tone="attention" />
              </div>
            </DrawerSection>

            <DrawerSection title="Data Quality">
              <WarningBadges items={lead.dataQualityWarnings} tone="quality" />
            </DrawerSection>

            <DrawerSection title="Duplicates">
              <WarningBadges items={lead.duplicateWarnings} tone="duplicate" />
            </DrawerSection>

            <DrawerSection title="Latest Source">
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="text-gray-500">Label</dt>
                  <dd className="font-medium text-gray-900">
                    {lead.latestSourceLabel ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500">Received</dt>
                  <dd className="font-medium text-gray-900">
                    {formatDateTime(lead.latestSourceReceivedAt)}
                  </dd>
                </div>
              </dl>
            </DrawerSection>

            <DrawerSection title="Source Records">
              <p className="text-sm text-gray-700">
                {lead.sourceRecordCount} record{lead.sourceRecordCount === 1 ? '' : 's'}
              </p>
              {lead.sources.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {lead.sources.slice(0, 5).map((record, index) => (
                    <li
                      key={`${record.source}-${record.receivedAt}-${index}`}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm"
                    >
                      <p className="font-medium text-gray-900">
                        {formatSourceRecordLabel(record.source)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDateTime(record.receivedAt)}
                      </p>
                      {record.externalId && (
                        <p className="mt-1 break-all text-xs text-gray-600">
                          ID: {record.externalId}
                        </p>
                      )}
                    </li>
                  ))}
                  {lead.sources.length > 5 && (
                    <li className="text-xs text-gray-500">
                      +{lead.sources.length - 5} more record
                      {lead.sources.length - 5 === 1 ? '' : 's'}
                    </li>
                  )}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-gray-500">No source records yet.</p>
              )}
            </DrawerSection>

            <DrawerSection title="Last Activity">
              <p className="text-sm font-medium text-gray-900">
                {formatDateTime(lead.lastActivityAt)}
              </p>
              {lead.lastActivitySummary && (
                <p className="mt-1 text-sm text-gray-600">{lead.lastActivitySummary}</p>
              )}
            </DrawerSection>
          </div>
        </div>

        <footer className="border-t border-gray-200 px-4 py-4 sm:px-5">
          {copyMessage && (
            <p className="mb-3 text-sm text-green-700" role="status">
              {copyMessage}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link
              href={`/clients/${lead.clientId}`}
              className="inline-flex justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open Client 360
            </Link>
            {onAddNote && (
              <button
                type="button"
                onClick={onAddNote}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Add note
              </button>
            )}
            {lead.email && (
              <button
                type="button"
                onClick={() => handleCopy(lead.email, 'Email')}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Copy email
              </button>
            )}
            {lead.phone && (
              <button
                type="button"
                onClick={() => handleCopy(lead.phone, 'Phone')}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Copy phone
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 sm:ml-auto"
            >
              Close
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default memo(LeadPreviewDrawer);
