'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImportantDate } from '@/components/clients/ClientDetailsWidget';
import { useClient360RefreshOptional } from '@/components/clients/client360Refresh';
import {
  formatImportantDateCardParts,
} from '@/components/clients/importantDateDisplay';
import {
  formatImportantDateApiError,
  hasImportantDateFieldErrors,
  validateImportantDateFields,
  type ImportantDateFieldErrors,
} from '@/components/clients/importantDateFormValidation';
import EmptyMuted from '@/components/ui/EmptyMuted';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import {
  parseImportantDateInput,
  parseImportantDateUpdateInput,
} from '@/lib/importantDateValidation';

type ImportantDatesPanelProps = {
  /** Client id (also leadId — leads share the Client model). */
  ownerId: string;
  ownerKind: 'client' | 'lead';
  canEdit?: boolean;
  /** Optional initial list — if omitted, fetches from API. */
  initialDates?: ImportantDate[];
  onChanged?: () => void;
  className?: string;
  showHeading?: boolean;
};

type DraftFields = {
  label: string;
  date: string;
  time: string;
  notes: string;
};

const EMPTY_DRAFT: DraftFields = {
  label: '',
  date: '',
  time: '',
  notes: '',
};

function apiBase(ownerKind: 'client' | 'lead', ownerId: string) {
  return ownerKind === 'lead'
    ? `/api/leads/${ownerId}/important-dates`
    : `/api/clients/${ownerId}/important-dates`;
}

function toDraft(entry?: ImportantDate | null): DraftFields {
  if (!entry) {
    return { ...EMPTY_DRAFT };
  }

  return {
    label: entry.label ?? '',
    date: entry.date ?? '',
    time: entry.time?.trim() || '',
    notes: entry.notes ?? '',
  };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-xs text-red-600" role="alert">
      {message}
    </p>
  );
}

function ImportantDateFields({
  draft,
  onChange,
  disabled,
  fieldErrors,
}: {
  draft: DraftFields;
  onChange: (field: keyof DraftFields, value: string) => void;
  disabled?: boolean;
  fieldErrors?: ImportantDateFieldErrors;
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Label <span className="text-red-600">*</span>
        </label>
        <input
          type="text"
          value={draft.label}
          onChange={(event) => onChange('label', event.target.value)}
          required
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors?.label)}
          placeholder="e.g. Contract renewal"
          className={`w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
            fieldErrors?.label
              ? 'border-red-300 focus:border-red-400 focus:outline-none'
              : 'border-gray-300'
          }`}
        />
        <FieldError message={fieldErrors?.label} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Date <span className="text-red-600">*</span>
          </label>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => onChange('date', event.target.value)}
            required
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors?.date)}
            className={`w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
              fieldErrors?.date
                ? 'border-red-300 focus:border-red-400 focus:outline-none'
                : 'border-gray-300'
            }`}
          />
          <FieldError message={fieldErrors?.date} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Time (optional)
          </label>
          <input
            type="time"
            value={draft.time}
            onChange={(event) => onChange('time', event.target.value)}
            disabled={disabled}
            aria-invalid={Boolean(fieldErrors?.time)}
            className={`w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
              fieldErrors?.time
                ? 'border-red-300 focus:border-red-400 focus:outline-none'
                : 'border-gray-300'
            }`}
          />
          {!draft.time.trim() && !fieldErrors?.time ? (
            <p className="mt-1 text-[11px] text-gray-400">No time set</p>
          ) : null}
          <FieldError message={fieldErrors?.time} />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Notes (optional)
        </label>
        <textarea
          value={draft.notes}
          onChange={(event) => onChange('notes', event.target.value)}
          rows={2}
          disabled={disabled}
          placeholder="Details for this date"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
    </div>
  );
}

export default function ImportantDatesPanel({
  ownerId,
  ownerKind,
  canEdit = false,
  initialDates,
  onChanged,
  className = '',
  showHeading = true,
}: ImportantDatesPanelProps) {
  const [dates, setDates] = useState<ImportantDate[]>(() => initialDates ?? []);
  const [isLoading, setIsLoading] = useState(initialDates === undefined);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  /** null = closed; 'new' = create; string id = edit that row */
  const [editorTarget, setEditorTarget] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<ImportantDateFieldErrors>({});

  // Keep in sync when parent reloads (e.g. Client 360 router.refresh on other mutations).
  useEffect(() => {
    if (initialDates !== undefined) {
      setDates(initialDates);
    }
  }, [initialDates]);

  const client360Refresh = useClient360RefreshOptional();
  const importantDatesSliceKey =
    client360Refresh?.sliceKeys.importantDates ?? 0;
  const skipImportantDatesSliceEffectRef = useRef(true);

  const loadDates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authenticatedFetch(apiBase(ownerKind, ownerId));
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to load important dates'
        );
      }
      const data = await response.json();
      setDates(
        Array.isArray(data.importantDates) ? data.importantDates : []
      );
    } catch (err) {
      setError(
        formatImportantDateApiError(
          err instanceof Error ? err.message : 'Failed to load important dates'
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [ownerId, ownerKind]);

  useEffect(() => {
    if (skipImportantDatesSliceEffectRef.current) {
      skipImportantDatesSliceEffectRef.current = false;
      return;
    }

    void loadDates();
  }, [importantDatesSliceKey, loadDates]);

  useEffect(() => {
    if (initialDates !== undefined) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await authenticatedFetch(apiBase(ownerKind, ownerId));
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Failed to load important dates'
          );
        }
        const data = await response.json();
        if (!cancelled) {
          setDates(
            Array.isArray(data.importantDates) ? data.importantDates : []
          );
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            formatImportantDateApiError(
              err instanceof Error
                ? err.message
                : 'Failed to load important dates'
            )
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialDates, ownerId, ownerKind]);

  function closeEditor() {
    setEditorTarget(null);
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
  }

  function openCreate() {
    setError(null);
    setFieldErrors({});
    setEditorTarget('new');
    setDraft({ ...EMPTY_DRAFT });
  }

  function openEdit(entry: ImportantDate) {
    if (!entry.id) {
      return;
    }
    setError(null);
    setFieldErrors({});
    setEditorTarget(entry.id);
    setDraft(toDraft(entry));
  }

  function updateDraft(field: keyof DraftFields, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field as keyof ImportantDateFieldErrors]) {
        return current;
      }
      const next = { ...current };
      delete next[field as keyof ImportantDateFieldErrors];
      return next;
    });
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!editorTarget || isSaving) {
      return;
    }

    const nextFieldErrors = validateImportantDateFields({
      label: draft.label,
      date: draft.date,
      time: draft.time,
    });
    if (hasImportantDateFieldErrors(nextFieldErrors)) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      if (editorTarget === 'new') {
        const parsed = parseImportantDateInput({
          label: draft.label.trim(),
          date: draft.date.trim(),
          time: draft.time.trim() || null,
          notes: draft.notes.trim() || null,
          ...(ownerKind === 'lead' ? { leadId: ownerId } : { clientId: ownerId }),
        });
        if (!parsed.ok) {
          const friendly = formatImportantDateApiError(parsed.error);
          setError(friendly);
          setFieldErrors(
            validateImportantDateFields({
              label: draft.label,
              date: draft.date,
              time: draft.time,
            })
          );
          setIsSaving(false);
          return;
        }

        const response = await authenticatedFetch(apiBase(ownerKind, ownerId), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: parsed.data.label,
            date: parsed.data.date,
            time: parsed.data.time,
            notes: parsed.data.notes,
            ...(ownerKind === 'lead'
              ? { leadId: ownerId }
              : { clientId: ownerId }),
          }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Failed to create important date'
          );
        }
      } else {
        const parsed = parseImportantDateUpdateInput({
          label: draft.label.trim(),
          date: draft.date.trim(),
          time: draft.time.trim() || null,
          notes: draft.notes.trim() || null,
        });
        if (!parsed.ok) {
          setError(formatImportantDateApiError(parsed.error));
          setFieldErrors(
            validateImportantDateFields({
              label: draft.label,
              date: draft.date,
              time: draft.time,
            })
          );
          setIsSaving(false);
          return;
        }

        const response = await authenticatedFetch(
          `${apiBase(ownerKind, ownerId)}/${editorTarget}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label: draft.label.trim(),
              date: draft.date.trim(),
              time: draft.time.trim() || null,
              notes: draft.notes.trim() || null,
            }),
          }
        );
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            typeof data.error === 'string'
              ? data.error
              : 'Failed to update important date'
          );
        }
      }

      closeEditor();
      await loadDates();
      onChanged?.();
    } catch (err) {
      setError(
        formatImportantDateApiError(
          err instanceof Error ? err.message : 'Failed to save important date'
        )
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(dateId: string | undefined) {
    if (!dateId || !canEdit || isDeleting || isSaving) {
      return;
    }
    if (!window.confirm('Delete this important date?')) {
      return;
    }

    setIsDeleting(true);
    setError(null);
    try {
      const response = await authenticatedFetch(
        `${apiBase(ownerKind, ownerId)}/${dateId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to delete important date'
        );
      }
      if (editorTarget === dateId) {
        closeEditor();
      }
      await loadDates();
      onChanged?.();
    } catch (err) {
      setError(
        formatImportantDateApiError(
          err instanceof Error ? err.message : 'Failed to delete important date'
        )
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const isEditorOpen = editorTarget !== null;
  const busy = isSaving || isDeleting;

  return (
    <div className={className}>
      {(showHeading || (canEdit && !isEditorOpen)) && (
        <div className="mb-2 flex items-center justify-between gap-2">
          {showHeading ? (
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Important Dates
            </dt>
          ) : (
            <span />
          )}
          {canEdit && !isEditorOpen && (
            <button
              type="button"
              onClick={openCreate}
              disabled={busy || isLoading}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Add date
            </button>
          )}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-2 flex flex-col gap-2 rounded-md border border-red-100 bg-red-50 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs text-red-700">{error}</p>
          {initialDates === undefined ? (
            <button
              type="button"
              onClick={() => void loadDates()}
              disabled={isLoading}
              className="shrink-0 self-start rounded border border-red-200 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              Retry
            </button>
          ) : null}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading important dates">
          <div className="h-14 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-14 animate-pulse rounded-lg bg-gray-100" />
        </div>
      ) : dates.length === 0 && !isEditorOpen ? (
        <dd className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center sm:text-left">
          <EmptyMuted label="No important dates">
            No important dates scheduled yet.
          </EmptyMuted>
          {canEdit ? (
            <p className="mt-1 text-xs text-gray-400">
              Add a date, optional time, and notes.
            </p>
          ) : null}
        </dd>
      ) : (
        <ul className="space-y-2">
          {dates.map((entry, index) => {
            const parts = formatImportantDateCardParts(entry);
            const isEditingThis = editorTarget === entry.id;

            return (
              <li
                key={entry.id ?? `${entry.label}-${entry.date}-${index}`}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2.5"
              >
                {isEditingThis ? (
                  <form
                    onSubmit={(formEvent) => void handleSave(formEvent)}
                    className="space-y-2"
                  >
                    <ImportantDateFields
                      draft={draft}
                      onChange={updateDraft}
                      disabled={isSaving}
                      fieldErrors={fieldErrors}
                    />
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={closeEditor}
                        disabled={isSaving}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {entry.label?.trim() || 'Untitled'}
                      </p>
                      <p className="mt-0.5 text-sm text-gray-700">
                        {parts.dateLabel}
                        <span className="text-gray-400"> · </span>
                        <span
                          className={
                            parts.hasTime
                              ? 'text-gray-700'
                              : 'text-gray-400'
                          }
                        >
                          {parts.timeLabel}
                        </span>
                      </p>
                      {entry.notes?.trim() ? (
                        <p className="mt-1 text-xs text-gray-500">
                          {entry.notes.trim()}
                        </p>
                      ) : null}
                    </div>
                    {canEdit && entry.id ? (
                      <div className="flex shrink-0 gap-3 sm:gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(entry)}
                          disabled={isEditorOpen || busy}
                          className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry.id)}
                          disabled={isEditorOpen || busy}
                          className="text-xs text-red-600 hover:text-red-700 disabled:opacity-40"
                        >
                          {isDeleting ? 'Deleting…' : 'Delete'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editorTarget === 'new' && canEdit && (
        <form
          onSubmit={(formEvent) => void handleSave(formEvent)}
          className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
        >
          <ImportantDateFields
            draft={draft}
            onChange={updateDraft}
            disabled={isSaving}
            fieldErrors={fieldErrors}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeEditor}
              disabled={isSaving}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
