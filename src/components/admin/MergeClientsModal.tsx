'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import LeadSourceBadges from '@/components/clients/LeadSourceBadges';
import StatusPill from '@/components/ui/StatusPill';
import type {
  MergeFieldChoiceKey,
  MergeFieldOverrides,
  MergeFieldWinner,
  MergeClientsSummary,
  MergeMultipleClientsSummary,
} from '@/lib/clientMerge';
import type {
  DuplicateReviewClient,
  DuplicateReviewGroup,
} from '@/lib/leadDuplicates';

export type MergeModalResult = MergeClientsSummary | MergeMultipleClientsSummary;

type MergeCandidateClient = DuplicateReviewClient & {
  priority?: string | null;
  nextAction?: string | null;
  nextFollowUpAt?: string | null;
};

type MergeClientsModalProps = {
  open: boolean;
  onClose: () => void;
  onMerged: (result: MergeModalResult) => void;
  clients?: MergeCandidateClient[];
  mode?: 'pairwise' | 'manual-multi';
  defaultCanonicalClientId?: string;
  group?: DuplicateReviewGroup | null;
};

type FinalFieldKey = Extract<
  MergeFieldChoiceKey,
  | 'name'
  | 'company'
  | 'email'
  | 'phone'
  | 'lead_source'
  | 'role_in_company'
  | 'employee_count'
  | 'expectations'
  | 'contactInfo'
  | 'priority'
  | 'next_action'
  | 'next_follow_up_at'
>;

type FinalFieldConfig = {
  key: FinalFieldKey;
  label: string;
  multiline?: boolean;
  inputType?: 'text' | 'number' | 'datetime-local';
  required?: boolean;
  getValue: (client: MergeCandidateClient) => string | number | null;
};

type FieldOptionSource = 'blank' | 'custom' | string;

type FieldState = {
  source: FieldOptionSource;
  customValue: string;
};

type WizardStep = 1 | 2 | 3;

const FINAL_MERGE_FIELDS: FinalFieldConfig[] = [
  { key: 'name', label: 'Name', required: true, getValue: (client) => client.name },
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
    inputType: 'number',
    getValue: (client) => client.employeeCount,
  },
  {
    key: 'expectations',
    label: 'Expectations',
    multiline: true,
    getValue: (client) => client.expectations,
  },
  {
    key: 'contactInfo',
    label: 'Contact info',
    multiline: true,
    getValue: (client) => client.contactInfo,
  },
  {
    key: 'priority',
    label: 'Priority',
    getValue: (client) => client.priority ?? null,
  },
  {
    key: 'next_action',
    label: 'Next action',
    multiline: true,
    getValue: (client) => client.nextAction ?? null,
  },
  {
    key: 'next_follow_up_at',
    label: 'Next follow-up date',
    inputType: 'datetime-local',
    getValue: (client) => client.nextFollowUpAt ?? null,
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

function formatDisplayValue(value: string | number | null | undefined) {
  if (isEmptyMergeValue(value)) {
    return 'Blank';
  }

  return String(value);
}

function toDatetimeLocalValue(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatReviewDateTime(value: string | null | undefined) {
  if (!value) {
    return 'Blank';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function buildPairwiseMergePayload(
  canonical: MergeCandidateClient,
  duplicate: MergeCandidateClient,
  canonicalClientId: string,
  fieldStates: Record<FinalFieldKey, FieldState>,
  mergeClients: MergeCandidateClient[]
) {
  const fieldChoices: Partial<Record<MergeFieldChoiceKey, MergeFieldWinner>> = {};
  const fieldOverrides: MergeFieldOverrides = {};

  for (const field of FINAL_MERGE_FIELDS) {
    const state = fieldStates[field.key];
    if (!state) {
      continue;
    }

    const canonicalValue = field.getValue(canonical);
    const duplicateValue = field.getValue(duplicate);
    const valuesDiffer =
      formatMergeValue(canonicalValue) !== formatMergeValue(duplicateValue);

    if (state.source === 'custom') {
      fieldOverrides[field.key] = resolveFieldValue(
        field,
        state,
        mergeClients
      ) as never;
      continue;
    }

    if (state.source === 'blank') {
      fieldOverrides[field.key] = null as never;
      continue;
    }

    if (state.source === canonicalClientId && valuesDiffer) {
      fieldChoices[field.key] = 'canonical';
      continue;
    }

    if (state.source === duplicate.clientId && valuesDiffer) {
      fieldChoices[field.key] = 'duplicate';
    }
  }

  return { fieldChoices, fieldOverrides };
}

function pickDefaultCanonical(clients: MergeCandidateClient[]) {
  return [...clients].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )[0];
}

function pickDefaultDuplicate(
  clients: MergeCandidateClient[],
  canonicalClientId: string
) {
  return clients.find((client) => client.clientId !== canonicalClientId) ?? null;
}

function buildDefaultFieldStates(
  clients: MergeCandidateClient[],
  canonicalClientId: string
) {
  const canonical =
    clients.find((client) => client.clientId === canonicalClientId) ?? null;
  const states = {} as Record<FinalFieldKey, FieldState>;

  for (const field of FINAL_MERGE_FIELDS) {
    const canonicalValue = canonical ? field.getValue(canonical) : null;

    if (!isEmptyMergeValue(canonicalValue)) {
      states[field.key] = {
        source: canonicalClientId,
        customValue:
          field.inputType === 'datetime-local'
            ? toDatetimeLocalValue(String(canonicalValue))
            : String(canonicalValue),
      };
      continue;
    }

    const firstWithValue = clients.find(
      (client) => !isEmptyMergeValue(field.getValue(client))
    );

    if (firstWithValue) {
      const value = firstWithValue ? field.getValue(firstWithValue) : null;
      states[field.key] = {
        source: firstWithValue.clientId,
        customValue:
          field.inputType === 'datetime-local'
            ? toDatetimeLocalValue(String(value))
            : String(value ?? ''),
      };
      continue;
    }

    states[field.key] = { source: 'blank', customValue: '' };
  }

  return states;
}

function resolveFieldValue(
  field: FinalFieldConfig,
  state: FieldState | undefined,
  clients: MergeCandidateClient[]
): string | number | null {
  if (!state) {
    return null;
  }

  if (state.source === 'custom') {
    const trimmed = state.customValue.trim();

    if (field.key === 'employee_count') {
      if (trimmed === '') {
        return null;
      }

      const parsed = Number(trimmed);
      return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
    }

    if (field.key === 'next_follow_up_at') {
      if (trimmed === '') {
        return null;
      }

      const parsed = new Date(trimmed);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }

    return trimmed === '' ? null : trimmed;
  }

  if (state.source === 'blank') {
    return null;
  }

  const client = clients.find((item) => item.clientId === state.source);
  if (!client) {
    return null;
  }

  const value = field.getValue(client);
  if (field.key === 'next_follow_up_at' && typeof value === 'string' && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return value;
}

function buildFieldOverrides(
  fieldStates: Record<FinalFieldKey, FieldState>,
  clients: MergeCandidateClient[]
): MergeFieldOverrides {
  const overrides: MergeFieldOverrides = {};

  for (const field of FINAL_MERGE_FIELDS) {
    const state = fieldStates[field.key];
    if (!state) {
      continue;
    }

    overrides[field.key] = resolveFieldValue(field, state, clients) as never;
  }

  return overrides;
}

function buildFieldOptions(
  field: FinalFieldConfig,
  clients: MergeCandidateClient[]
) {
  const options: Array<{
    source: FieldOptionSource;
    label: string;
    detail?: string;
  }> = [];
  const seen = new Set<string>();
  let hasBlank = false;

  for (const client of clients) {
    const rawValue = field.getValue(client);
    if (isEmptyMergeValue(rawValue)) {
      hasBlank = true;
      continue;
    }

    const serialized =
      field.key === 'next_follow_up_at'
        ? toDatetimeLocalValue(String(rawValue))
        : String(rawValue);

    if (seen.has(serialized)) {
      continue;
    }

    seen.add(serialized);
    options.push({
      source: client.clientId,
      label: formatDisplayValue(rawValue),
      detail: client.name,
    });
  }

  if (hasBlank) {
    options.push({ source: 'blank', label: 'Blank' });
  }

  options.push({ source: 'custom', label: 'Custom' });
  return options;
}

function ClientSummaryCard({ client }: { client: MergeCandidateClient }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 truncate font-medium text-gray-900" title={client.name}>
          {client.name}
        </p>
        <StatusPill status={client.status} className="shrink-0" />
      </div>
      <dl className="mt-2 grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-gray-400">Company</dt>
          <dd className="truncate">{client.company ?? '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-gray-400">Email</dt>
          <dd className="truncate" title={client.email ?? undefined}>
            {client.email ?? '—'}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-gray-400">Phone</dt>
          <dd className="truncate">{client.phone ?? '—'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-gray-400">Sources</dt>
          <dd className="mt-0.5">
            {client.sourceLabels.length > 0 ? (
              <LeadSourceBadges sources={client.sourceLabels} maxVisible={2} />
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function StepIndicator({ step }: { step: WizardStep }) {
  const steps = [
    { id: 1, label: 'Surviving record' },
    { id: 2, label: 'Final client data' },
    { id: 3, label: 'Review' },
  ] as const;

  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      {steps.map((item) => {
        const active = step === item.id;
        const complete = step > item.id;

        return (
          <li key={item.id} className="flex items-center gap-2 text-sm">
            <span
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                active
                  ? 'bg-blue-600 text-white'
                  : complete
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {item.id}
            </span>
            <span className={active ? 'font-medium text-gray-900' : 'text-gray-500'}>
              {item.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function MergeClientsModal(props: MergeClientsModalProps) {
  const { open, onClose, onMerged, defaultCanonicalClientId, group } = props;
  const clients = props.clients?.length
    ? props.clients
    : (group?.clients ?? []);
  const mode = props.mode ?? (group ? 'pairwise' : 'manual-multi');
  const isManualMulti = mode === 'manual-multi';
  const duplicateGroup = group ?? null;
  const clientIdsKey = clients.map((client) => client.clientId).join(',');

  const [canonicalClientId, setCanonicalClientId] = useState('');
  const [duplicateClientId, setDuplicateClientId] = useState('');
  const [fieldStates, setFieldStates] = useState<Record<FinalFieldKey, FieldState>>(
    {} as Record<FinalFieldKey, FieldState>
  );
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [confirmArchive, setConfirmArchive] = useState(false);
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
  const duplicateClients = useMemo(
    () => clients.filter((client) => client.clientId !== canonicalClientId),
    [clients, canonicalClientId]
  );
  const pairwiseFieldClients = useMemo(() => {
    if (!canonicalClient || !duplicateClient) {
      return [];
    }

    return [canonicalClient, duplicateClient];
  }, [canonicalClient, duplicateClient]);
  const fieldClientsForResolution = isManualMulti ? clients : pairwiseFieldClients;
  const finalFieldOverrides = useMemo(
    () => buildFieldOverrides(fieldStates, fieldClientsForResolution),
    [fieldStates, fieldClientsForResolution]
  );
  const finalNameValue = useMemo(() => {
    const nameField = FINAL_MERGE_FIELDS.find((field) => field.key === 'name');
    if (!nameField || !fieldStates.name) {
      return '';
    }

    return String(
      resolveFieldValue(nameField, fieldStates.name, fieldClientsForResolution) ?? ''
    ).trim();
  }, [fieldStates, fieldClientsForResolution]);

  useEffect(() => {
    if (!open || clients.length < 2) {
      return;
    }

    const defaultCanonical =
      (defaultCanonicalClientId &&
        clients.find((client) => client.clientId === defaultCanonicalClientId)) ||
      pickDefaultCanonical(clients);
    const defaultDuplicate = pickDefaultDuplicate(
      clients,
      defaultCanonical.clientId
    );

    setCanonicalClientId(defaultCanonical.clientId);
    setDuplicateClientId(defaultDuplicate?.clientId ?? '');
    if (isManualMulti || defaultDuplicate) {
      setFieldStates(
        buildDefaultFieldStates(
          defaultDuplicate ? [defaultCanonical, defaultDuplicate] : clients,
          defaultCanonical.clientId
        )
      );
    } else {
      setFieldStates({} as Record<FinalFieldKey, FieldState>);
    }
    setWizardStep(1);
    setReason('');
    setConfirmName('');
    setConfirmArchive(false);
    setError(null);
    setIsSubmitting(false);
  }, [open, clientIdsKey, clients, defaultCanonicalClientId, isManualMulti]);

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

  if (!open || clients.length < 2) {
    return null;
  }

  const duplicateOptions = clients.filter(
    (client) => client.clientId !== canonicalClientId
  );
  const nameMatches =
    duplicateClient !== null && confirmName.trim() === duplicateClient.name;
  const canAdvanceStep1 = Boolean(canonicalClient);
  const canAdvanceStep2 = finalNameValue.length > 0;
  const canSubmitManualMulti =
    canAdvanceStep1 &&
    canAdvanceStep2 &&
    confirmArchive &&
    !isSubmitting;
  const canSubmitPairwise =
    Boolean(canonicalClient && duplicateClient) &&
    canonicalClientId !== duplicateClientId &&
    finalNameValue.length > 0 &&
    nameMatches &&
    !isSubmitting;

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

  async function submitPairwiseMerge() {
    if (!canonicalClient || !duplicateClient || !canSubmitPairwise) {
      return;
    }

    const { fieldChoices, fieldOverrides } = buildPairwiseMergePayload(
      canonicalClient,
      duplicateClient,
      canonicalClientId,
      fieldStates,
      pairwiseFieldClients
    );

    const response = await authenticatedFetch('/api/admin/leads/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canonicalClientId: canonicalClient.clientId,
        duplicateClientId: duplicateClient.clientId,
        fieldChoices,
        ...(Object.keys(fieldOverrides).length > 0 ? { fieldOverrides } : {}),
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
  }

  async function submitManualMultiMerge() {
    if (!canonicalClient || !canSubmitManualMulti) {
      return;
    }

    const response = await authenticatedFetch('/api/admin/leads/merge-multiple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        canonicalClientId: canonicalClient.clientId,
        duplicateClientIds: duplicateClients.map((client) => client.clientId),
        fieldOverrides: finalFieldOverrides,
        reason: reason.trim() || undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(
        typeof data.error === 'string' ? data.error : 'Failed to merge clients'
      );
    }

    const data = (await response.json()) as {
      ok?: boolean;
      result: MergeMultipleClientsSummary;
    };
    onMerged(data.result);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      if (isManualMulti || clients.length > 2) {
        await submitManualMultiMerge();
      } else {
        await submitPairwiseMerge();
      }
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

  function handleCanonicalChange(nextCanonicalId: string) {
    setCanonicalClientId(nextCanonicalId);

    if (!isManualMulti) {
      let nextDuplicateId = duplicateClientId;
      if (duplicateClientId === nextCanonicalId) {
        const nextDuplicate = pickDefaultDuplicate(clients, nextCanonicalId);
        nextDuplicateId = nextDuplicate?.clientId ?? '';
        setDuplicateClientId(nextDuplicateId);
      }

      const canonical = clients.find((client) => client.clientId === nextCanonicalId);
      const duplicate = clients.find((client) => client.clientId === nextDuplicateId);
      if (canonical && duplicate) {
        setFieldStates(
          buildDefaultFieldStates([canonical, duplicate], nextCanonicalId)
        );
      }
      return;
    }

    setFieldStates(buildDefaultFieldStates(clients, nextCanonicalId));
  }

  function handleDuplicateChange(nextDuplicateId: string) {
    setDuplicateClientId(nextDuplicateId);

    if (!isManualMulti && canonicalClient) {
      const duplicate = clients.find((client) => client.clientId === nextDuplicateId);
      if (duplicate) {
        setFieldStates(
          buildDefaultFieldStates([canonicalClient, duplicate], canonicalClientId)
        );
      }
    }
  }

  function renderFinalFieldEditor(
    clientsForFields: MergeCandidateClient[],
    options?: { showNameRequiredError?: boolean }
  ) {
    return (
      <div className="space-y-5">
        <p className="text-sm text-gray-600">
          Choose the final value for each field. Pick an existing value from the
          selected leads or enter a custom value.
        </p>
        {FINAL_MERGE_FIELDS.map((field) => {
          const state =
            fieldStates[field.key] ?? ({ source: 'blank', customValue: '' } satisfies FieldState);
          const optionsForField = buildFieldOptions(field, clientsForFields);

          return (
            <fieldset
              key={field.key}
              className="rounded-xl border border-gray-200 p-4"
            >
              <legend className="px-1 text-sm font-semibold text-gray-900">
                {field.label}
                {field.required ? ' *' : ''}
              </legend>
              <div className="mt-3 space-y-2">
                {optionsForField.map((option) => (
                  <label
                    key={`${field.key}-${option.source}`}
                    className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name={`final-field-${field.key}`}
                      checked={state?.source === option.source}
                      onChange={() =>
                        setFieldStates((current) => ({
                          ...current,
                          [field.key]: {
                            source: option.source,
                            customValue: current[field.key]?.customValue ?? '',
                          },
                        }))
                      }
                      disabled={isSubmitting}
                      className="mt-1"
                    />
                    <span className="min-w-0 text-sm text-gray-700">
                      <span className="font-medium">{option.label}</span>
                      {option.detail && (
                        <span className="mt-0.5 block text-xs text-gray-500">
                          From {option.detail}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {state?.source === 'custom' &&
                (field.multiline ? (
                  <textarea
                    value={state.customValue}
                    onChange={(event) =>
                      setFieldStates((current) => ({
                        ...current,
                        [field.key]: {
                          source: 'custom',
                          customValue: event.target.value,
                        },
                      }))
                    }
                    disabled={isSubmitting}
                    rows={3}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60 bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  />
                ) : (
                  <input
                    type={field.inputType ?? 'text'}
                    value={state.customValue}
                    onChange={(event) =>
                      setFieldStates((current) => ({
                        ...current,
                        [field.key]: {
                          source: 'custom',
                          customValue: event.target.value,
                        },
                      }))
                    }
                    disabled={isSubmitting}
                    className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60 bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
                  />
                ))}
            </fieldset>
          );
        })}
        {options?.showNameRequiredError && !canAdvanceStep2 && (
          <p className="text-sm text-red-600">Name is required before continuing.</p>
        )}
        {!isManualMulti && !canAdvanceStep2 && (
          <p className="text-sm text-red-600">Name is required before merging.</p>
        )}
      </div>
    );
  }

  function renderManualMultiStep1() {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          The selected record will remain active. Other selected records will be
          archived after their data is moved.
        </p>
        <div className="space-y-3">
          {clients.map((client) => (
            <label
              key={client.clientId}
              className={`block cursor-pointer rounded-xl border p-4 transition ${
                canonicalClientId === client.clientId
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="merge-canonical-client"
                  checked={canonicalClientId === client.clientId}
                  onChange={() => handleCanonicalChange(client.clientId)}
                  disabled={isSubmitting}
                  className="mt-1"
                />
                <div className="min-w-0 flex-1">
                  <ClientSummaryCard client={client} />
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  }

  function renderManualMultiStep2() {
    return renderFinalFieldEditor(clients, { showNameRequiredError: true });
  }

  function renderManualMultiStep3() {
    return (
      <div className="space-y-5">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">Surviving record</h4>
          {canonicalClient && (
            <div className="mt-2">
              <ClientSummaryCard client={canonicalClient} />
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-900">
            Records to archive ({duplicateClients.length})
          </h4>
          <div className="mt-2 space-y-2">
            {duplicateClients.map((client) => (
              <ClientSummaryCard key={client.clientId} client={client} />
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-900">Final client data</h4>
          <dl className="mt-2 divide-y divide-gray-100 rounded-xl border border-gray-200">
            {FINAL_MERGE_FIELDS.map((field) => {
              const state =
                fieldStates[field.key] ??
                ({ source: 'blank', customValue: '' } satisfies FieldState);
              const value = resolveFieldValue(
                field,
                state,
                fieldClientsForResolution
              );
              const displayValue =
                field.key === 'next_follow_up_at'
                  ? formatReviewDateTime(
                      typeof value === 'string' ? value : null
                    )
                  : formatDisplayValue(value);

              return (
                <div
                  key={field.key}
                  className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]"
                >
                  <dt className="text-sm font-medium text-gray-500">{field.label}</dt>
                  <dd className="text-sm text-gray-900 break-words">{displayValue}</dd>
                </div>
              );
            })}
          </dl>
        </div>

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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60 bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
          />
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <input
            type="checkbox"
            checked={confirmArchive}
            onChange={(event) => setConfirmArchive(event.target.checked)}
            disabled={isSubmitting}
            className="mt-1"
          />
          <span>
            I understand the other selected records will be archived.
          </span>
        </label>
      </div>
    );
  }

  function renderPairwiseForm() {
    return (
      <>
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
              onChange={(event) => handleCanonicalChange(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:opacity-60 bg-white placeholder:text-gray-500 caret-gray-900"
            >
              {clients.map((client) => (
                <option key={client.clientId} value={client.clientId}>
                  {client.name}
                  {client.company ? ` · ${client.company}` : ''}
                </option>
              ))}
            </select>
            {canonicalClient && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <span>Status:</span>
                <StatusPill status={canonicalClient.status} />
                <span className="text-gray-300">·</span>
                <span>
                  {canonicalClient.dealCount} deal
                  {canonicalClient.dealCount === 1 ? '' : 's'}
                </span>
                <span className="text-gray-300">·</span>
                <span>{canonicalClient.activityCount} activities</span>
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
              onChange={(event) => handleDuplicateChange(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 disabled:opacity-60 bg-white placeholder:text-gray-500 caret-gray-900"
            >
              {duplicateOptions.map((client) => (
                <option key={client.clientId} value={client.clientId}>
                  {client.name}
                  {client.company ? ` · ${client.company}` : ''}
                </option>
              ))}
            </select>
            {duplicateClient && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                <span>Status:</span>
                <StatusPill status={duplicateClient.status} />
                <span className="text-gray-300">·</span>
                <span>
                  {duplicateClient.dealCount} deal
                  {duplicateClient.dealCount === 1 ? '' : 's'}
                </span>
                <span className="text-gray-300">·</span>
                <span>{duplicateClient.activityCount} activities</span>
              </p>
            )}
          </div>
        </div>

        {(hasRelationshipConflict ||
          (canonicalClient &&
            duplicateClient &&
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
            <h4 className="text-sm font-semibold text-gray-900">Final client data</h4>
            <div className="mt-3">
              {renderFinalFieldEditor(pairwiseFieldClients)}
            </div>
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-60 bg-white text-gray-900 placeholder:text-gray-500 caret-gray-900"
          />
        </div>

        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            This action cannot be undone.
          </p>
          <p className="mt-2 text-sm text-red-700">
            Type the duplicate client name{' '}
            <span className="font-medium">{duplicateClient?.name}</span> to confirm.
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
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-clients-title"
          className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        >
          <div className="overflow-y-auto p-4 sm:p-6">
            <h3 id="merge-clients-title" className="text-lg font-semibold text-gray-900">
              {isManualMulti ? 'Merge selected leads' : 'Merge duplicate clients'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {isManualMulti
                ? 'Choose the surviving lead, set final client data, and review before merging.'
                : 'Merge one duplicate into the canonical record. The duplicate will be archived and its history moved to the canonical client.'}
            </p>
            {isManualMulti ? (
              <p className="mt-1 text-sm text-gray-500">
                {clients.length} lead{clients.length === 1 ? '' : 's'} selected
              </p>
            ) : (
              duplicateGroup && (
                <p className="mt-1 break-all text-sm text-gray-500">
                  Group: {duplicateGroup.type === 'email' ? 'Email' : 'Phone'} ·{' '}
                  {duplicateGroup.key}
                </p>
              )
            )}

            {isManualMulti && (
              <div className="mt-4">
                <StepIndicator step={wizardStep} />
              </div>
            )}

            <form
              id="merge-clients-form"
              onSubmit={handleSubmit}
              className="mt-5 space-y-6"
            >
              {isManualMulti ? (
                <>
                  {wizardStep === 1 && renderManualMultiStep1()}
                  {wizardStep === 2 && renderManualMultiStep2()}
                  {wizardStep === 3 && renderManualMultiStep3()}
                </>
              ) : (
                renderPairwiseForm()
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          </div>

          <div className="border-t border-gray-200 bg-white p-4 sm:px-6">
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                Cancel
              </button>

              {isManualMulti && wizardStep > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setWizardStep((current) => (current - 1) as WizardStep)
                  }
                  disabled={isSubmitting}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  Back
                </button>
              )}

              {isManualMulti && wizardStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (wizardStep === 1 && canAdvanceStep1) {
                      setWizardStep(2);
                    } else if (wizardStep === 2 && canAdvanceStep2) {
                      setWizardStep(3);
                    }
                  }}
                  disabled={
                    isSubmitting ||
                    (wizardStep === 1 && !canAdvanceStep1) ||
                    (wizardStep === 2 && !canAdvanceStep2)
                  }
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Continue
                </button>
              ) : (
                <button
                  type="submit"
                  form="merge-clients-form"
                  disabled={isManualMulti ? !canSubmitManualMulti : !canSubmitPairwise}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? 'Merging...' : 'Merge clients'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(MergeClientsModal);
