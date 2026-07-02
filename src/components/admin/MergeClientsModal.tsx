'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type {
  MergeFieldChoiceKey,
  MergeFieldWinner,
  MergeClientsSummary,
} from '@/lib/clientMerge';
import { formatClientStage, getStatusBadgeStyles } from '@/lib/clientStages';
import type {
  DuplicateReviewClient,
  DuplicateReviewGroup,
} from '@/lib/leadDuplicates';

type MergeClientsModalProps = {
  open: boolean;
  group: DuplicateReviewGroup | null;
  onClose: () => void;
  onMerged: (summary: MergeClientsSummary) => void;
};

type CompareField = {
  key: MergeFieldChoiceKey;
  label: string;
  getValue: (client: DuplicateReviewClient) => string | number | null;
};

const MERGE_COMPARE_FIELDS: CompareField[] = [
  { key: 'name', label: 'Name', getValue: (client) => client.name },
  { key: 'company', label: 'Company', getValue: (client) => client.company },
  { key: 'email', label: 'Email', getValue: (client) => client.email },
  { key: 'phone', label: 'Phone', getValue: (client) => client.phone },
  {
    key: 'lead_source',
    label: 'Lead source',
    getValue: (client) => client.leadSource,
  },
  {
    key: 'role_in_company',
    label: 'Role in company',
    getValue: (client) => client.roleInCompany,
  },
  {
    key: 'employee_count',
    label: 'Employee count',
    getValue: (client) => client.employeeCount,
  },
  {
    key: 'expectations',
    label: 'Expectations',
    getValue: (client) => client.expectations,
  },
  {
    key: 'contactInfo',
    label: 'Contact info',
    getValue: (client) => client.contactInfo,
  },
];

function isEmptyMergeValue(value: string | number | null | undefined) {
  if (value == null) {
    return true;
  }

  if (typeof value === 'number') {
    return false;
  }

  return value.trim() === '';
}

function formatMergeValue(value: string | number | null | undefined) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) {
    return '—';
  }

  return String(value);
}

function defaultWinnerForField(
  canonicalValue: string | number | null,
  duplicateValue: string | number | null
): MergeFieldWinner {
  if (!isEmptyMergeValue(canonicalValue)) {
    return 'canonical';
  }

  return 'duplicate';
}

function buildDefaultFieldWinners(
  canonical: DuplicateReviewClient,
  duplicate: DuplicateReviewClient
) {
  const winners = {} as Record<MergeFieldChoiceKey, MergeFieldWinner>;

  for (const field of MERGE_COMPARE_FIELDS) {
    winners[field.key] = defaultWinnerForField(
      field.getValue(canonical),
      field.getValue(duplicate)
    );
  }

  return winners;
}

function buildFieldChoices(
  canonical: DuplicateReviewClient,
  duplicate: DuplicateReviewClient,
  winners: Record<MergeFieldChoiceKey, MergeFieldWinner>
) {
  const choices: Partial<Record<MergeFieldChoiceKey, MergeFieldWinner>> = {};

  for (const field of MERGE_COMPARE_FIELDS) {
    const canonicalValue = field.getValue(canonical);
    const duplicateValue = field.getValue(duplicate);

    if (formatMergeValue(canonicalValue) === formatMergeValue(duplicateValue)) {
      continue;
    }

    choices[field.key] = winners[field.key];
  }

  return choices;
}

function pickDefaultCanonical(clients: DuplicateReviewClient[]) {
  return [...clients].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )[0];
}

function pickDefaultDuplicate(
  clients: DuplicateReviewClient[],
  canonicalClientId: string
) {
  return (
    clients.find((client) => client.clientId !== canonicalClientId) ?? null
  );
}

function MergeClientsModal({
  open,
  group,
  onClose,
  onMerged,
}: MergeClientsModalProps) {
  const clients = group?.clients ?? [];
  const [canonicalClientId, setCanonicalClientId] = useState('');
  const [duplicateClientId, setDuplicateClientId] = useState('');
  const [fieldWinners, setFieldWinners] = useState<
    Record<MergeFieldChoiceKey, MergeFieldWinner>
  >({} as Record<MergeFieldChoiceKey, MergeFieldWinner>);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canonicalClient = useMemo(
    () => clients.find((client) => client.clientId === canonicalClientId) ?? null,
    [clients, canonicalClientId]
  );
  const duplicateClient = useMemo(
    () => clients.find((client) => client.clientId === duplicateClientId) ?? null,
    [clients, duplicateClientId]
  );

  useEffect(() => {
    if (!open || clients.length < 2) {
      return;
    }

    const defaultCanonical = pickDefaultCanonical(clients);
    const defaultDuplicate = pickDefaultDuplicate(
      clients,
      defaultCanonical.clientId
    );

    setCanonicalClientId(defaultCanonical.clientId);
    setDuplicateClientId(defaultDuplicate?.clientId ?? '');
    setReason('');
    setConfirmName('');
    setError(null);
    setIsSubmitting(false);

    if (defaultDuplicate) {
      setFieldWinners(
        buildDefaultFieldWinners(defaultCanonical, defaultDuplicate)
      );
    }
  }, [open, group, clients]);

  useEffect(() => {
    if (!canonicalClient || !duplicateClient) {
      return;
    }

    setFieldWinners(buildDefaultFieldWinners(canonicalClient, duplicateClient));
  }, [canonicalClientId, duplicateClientId, canonicalClient, duplicateClient]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isSubmitting, onClose]);

  if (!open || !group || clients.length < 2) {
    return null;
  }

  const duplicateOptions = clients.filter(
    (client) => client.clientId !== canonicalClientId
  );
  const nameMatches =
    duplicateClient !== null && confirmName.trim() === duplicateClient.name;
  const canSubmit =
    Boolean(canonicalClient && duplicateClient) &&
    canonicalClientId !== duplicateClientId &&
    nameMatches &&
    !isSubmitting;

  const differingFields = MERGE_COMPARE_FIELDS.filter((field) => {
    if (!canonicalClient || !duplicateClient) {
      return false;
    }

    return (
      formatMergeValue(field.getValue(canonicalClient)) !==
      formatMergeValue(field.getValue(duplicateClient))
    );
  });

  const relationshipOwners = clients.flatMap((client) =>
    client.assignedUsers
      .filter((user) => user.role === 'RELATIONSHIP')
      .map((user) => ({
        clientId: client.clientId,
        clientName: client.name,
        userName: user.name,
      }))
  );
  const hasRelationshipConflict =
    relationshipOwners.length > 1 &&
    new Set(relationshipOwners.map((owner) => owner.userName)).size > 1;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canonicalClient || !duplicateClient || !canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await authenticatedFetch('/api/admin/leads/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalClientId: canonicalClient.clientId,
          duplicateClientId: duplicateClient.clientId,
          fieldChoices: buildFieldChoices(
            canonicalClient,
            duplicateClient,
            fieldWinners
          ),
          reason: reason.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string' ? data.error : 'Failed to merge clients'
        );
      }

      const data = (await response.json()) as { ok?: boolean } & MergeClientsSummary;
      onMerged(data);
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Failed to merge clients'
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-clients-title"
          className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <h3 id="merge-clients-title" className="text-lg font-semibold text-gray-900">
            Merge duplicate clients
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Merge one duplicate into the canonical record. The duplicate will be
            archived and its history moved to the canonical client.
          </p>
          <p className="mt-1 break-all text-sm text-gray-500">
            Group: {group.type === 'email' ? 'Email' : 'Phone'} · {group.key}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label
                  htmlFor="merge-canonical-client"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Canonical client (keep)
                </label>
                <select
                  id="merge-canonical-client"
                  value={canonicalClientId}
                  onChange={(event) => {
                    const nextCanonicalId = event.target.value;
                    setCanonicalClientId(nextCanonicalId);
                    if (duplicateClientId === nextCanonicalId) {
                      const nextDuplicate = pickDefaultDuplicate(
                        clients,
                        nextCanonicalId
                      );
                      setDuplicateClientId(nextDuplicate?.clientId ?? '');
                    }
                  }}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-60"
                >
                  {clients.map((client) => (
                    <option key={client.clientId} value={client.clientId}>
                      {client.name}
                      {client.company ? ` · ${client.company}` : ''}
                    </option>
                  ))}
                </select>
                {canonicalClient && (
                  <p className="mt-2 text-xs text-gray-500">
                    Status:{' '}
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${getStatusBadgeStyles(canonicalClient.status)}`}
                    >
                      {formatClientStage(canonicalClient.status)}
                    </span>
                    {' · '}
                    {canonicalClient.dealCount} deal
                    {canonicalClient.dealCount === 1 ? '' : 's'}
                    {' · '}
                    {canonicalClient.activityCount} activities
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="merge-duplicate-client"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Duplicate client (archive)
                </label>
                <select
                  id="merge-duplicate-client"
                  value={duplicateClientId}
                  onChange={(event) => setDuplicateClientId(event.target.value)}
                  disabled={isSubmitting}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-60"
                >
                  {duplicateOptions.map((client) => (
                    <option key={client.clientId} value={client.clientId}>
                      {client.name}
                      {client.company ? ` · ${client.company}` : ''}
                    </option>
                  ))}
                </select>
                {duplicateClient && (
                  <p className="mt-2 text-xs text-gray-500">
                    Status:{' '}
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${getStatusBadgeStyles(duplicateClient.status)}`}
                    >
                      {formatClientStage(duplicateClient.status)}
                    </span>
                    {' · '}
                    {duplicateClient.dealCount} deal
                    {duplicateClient.dealCount === 1 ? '' : 's'}
                    {' · '}
                    {duplicateClient.activityCount} activities
                  </p>
                )}
              </div>
            </div>

            {(hasRelationshipConflict ||
              (canonicalClient && duplicateClient &&
                (canonicalClient.dealCount > 0 || duplicateClient.dealCount > 0))) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">Review before merging</p>
                {hasRelationshipConflict && (
                  <p className="mt-2">
                    Multiple relationship owners are assigned across these clients.
                    Conflicting assignments may be skipped during merge.
                  </p>
                )}
                {canonicalClient && duplicateClient && (
                  <p className="mt-2">
                    This merge will move{' '}
                    {duplicateClient.dealCount + duplicateClient.activityCount}{' '}
                    duplicate records (deals, activity, tasks, documents) onto the
                    canonical client.
                  </p>
                )}
              </div>
            )}

            {canonicalClient && duplicateClient && (
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  Field comparison
                </h4>
                <p className="mt-1 text-sm text-gray-500">
                  Choose which value to keep when fields differ.
                </p>

                <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                  <div className="hidden md:grid md:grid-cols-[1.1fr_1fr_1fr] border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <div className="px-4 py-3">Field</div>
                    <div className="px-4 py-3">Canonical</div>
                    <div className="px-4 py-3">Duplicate</div>
                  </div>

                  <div className="divide-y divide-gray-100">
                    {MERGE_COMPARE_FIELDS.map((field) => {
                      const canonicalValue = field.getValue(canonicalClient);
                      const duplicateValue = field.getValue(duplicateClient);
                      const differs =
                        formatMergeValue(canonicalValue) !==
                        formatMergeValue(duplicateValue);
                      const winner = fieldWinners[field.key] ?? 'canonical';

                      return (
                        <div
                          key={field.key}
                          className="grid gap-3 px-4 py-3 md:grid-cols-[1.1fr_1fr_1fr] md:items-start"
                        >
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {field.label}
                            </p>
                            {differs && (
                              <p className="mt-1 text-xs text-amber-700">Differs</p>
                            )}
                          </div>

                          <label className="flex cursor-pointer gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                            <input
                              type="radio"
                              name={`field-${field.key}`}
                              checked={winner === 'canonical'}
                              onChange={() =>
                                setFieldWinners((current) => ({
                                  ...current,
                                  [field.key]: 'canonical',
                                }))
                              }
                              disabled={isSubmitting}
                              className="mt-1"
                            />
                            <span className="min-w-0 text-sm text-gray-700">
                              {formatMergeValue(canonicalValue)}
                            </span>
                          </label>

                          <label className="flex cursor-pointer gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
                            <input
                              type="radio"
                              name={`field-${field.key}`}
                              checked={winner === 'duplicate'}
                              onChange={() =>
                                setFieldWinners((current) => ({
                                  ...current,
                                  [field.key]: 'duplicate',
                                }))
                              }
                              disabled={isSubmitting}
                              className="mt-1"
                            />
                            <span className="min-w-0 text-sm text-gray-700">
                              {formatMergeValue(duplicateValue)}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {differingFields.length === 0 && (
                  <p className="mt-3 text-sm text-gray-500">
                    All compared fields match. Merge will still move related records.
                  </p>
                )}
              </div>
            )}

            <div>
              <label
                htmlFor="merge-reason"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Reason (optional)
              </label>
              <textarea
                id="merge-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={isSubmitting}
                rows={3}
                placeholder="Why are these records being merged?"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">
                This action cannot be undone.
              </p>
              <p className="mt-2 text-sm text-red-700">
                Type the duplicate client name{' '}
                <span className="font-medium">{duplicateClient?.name}</span> to
                confirm.
              </p>
              <input
                type="text"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                disabled={isSubmitting}
                placeholder={duplicateClient?.name ?? ''}
                className="mt-3 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm"
                autoComplete="off"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Merging...' : 'Merge clients'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default memo(MergeClientsModal);
