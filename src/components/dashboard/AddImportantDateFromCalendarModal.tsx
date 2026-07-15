'use client';

import { AssignmentRole } from '@prisma/client';
import { useEffect, useMemo, useState } from 'react';
import {
  formatImportantDateApiError,
  hasImportantDateFieldErrors,
  validateImportantDateFields,
  type ImportantDateFieldErrors,
} from '@/components/clients/importantDateFormValidation';
import { classifyImportantDateRecordType } from '@/lib/importantDateRecordType';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import { parseImportantDateInput } from '@/lib/importantDateValidation';

type ClientSearchResult = {
  clientId: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
};

type RecordTypeChoice = 'CLIENT' | 'LEAD';

type AssignmentOption = {
  assignment_id: string;
  client_id: string;
  clientName: string;
  clientStatus: string;
  role: string;
};

type AddImportantDateFromCalendarModalProps = {
  isOpen: boolean;
  isSuperAdmin: boolean;
  /** Prefill date (YYYY-MM-DD) when opening from calendar. */
  initialDate?: string;
  onClose: () => void;
  onCreated: () => void;
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function todayYmd() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function matchesRecordType(status: string, recordType: RecordTypeChoice) {
  const kind = classifyImportantDateRecordType(status);
  return recordType === 'CLIENT' ? kind === 'Client' : kind === 'Lead';
}

function createApiPath(recordType: RecordTypeChoice, ownerId: string) {
  return recordType === 'LEAD'
    ? `/api/leads/${ownerId}/important-dates`
    : `/api/clients/${ownerId}/important-dates`;
}

export default function AddImportantDateFromCalendarModal({
  isOpen,
  isSuperAdmin,
  initialDate,
  onClose,
  onCreated,
}: AddImportantDateFromCalendarModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <AddImportantDateFromCalendarModalInner
      key={`${initialDate ?? 'today'}-${isSuperAdmin ? 'sa' : 'std'}`}
      isSuperAdmin={isSuperAdmin}
      initialDate={initialDate}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function AddImportantDateFromCalendarModalInner({
  isSuperAdmin,
  initialDate,
  onClose,
  onCreated,
}: {
  isSuperAdmin: boolean;
  initialDate?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [recordType, setRecordType] = useState<RecordTypeChoice>('CLIENT');
  const [ownerId, setOwnerId] = useState('');
  const [ownerQuery, setOwnerQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ClientSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(initialDate || todayYmd());
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ImportantDateFieldErrors>({});
  const [ownerError, setOwnerError] = useState<string | null>(null);

  useEffect(() => {
    if (isSuperAdmin) {
      return;
    }

    let cancelled = false;

    void (async () => {
      await Promise.resolve();
      if (cancelled) {
        return;
      }
      setAssignmentsLoading(true);
      try {
        const response = await authenticatedFetch('/api/me/assignments');
        if (!response.ok) {
          throw new Error('Failed to load assignments');
        }
        const data = await response.json();
        if (!cancelled) {
          setAssignments(
            Array.isArray(data.assignments) ? data.assignments : []
          );
        }
      } catch {
        if (!cancelled) {
          setAssignments([]);
        }
      } finally {
        if (!cancelled) {
          setAssignmentsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!isSuperAdmin) {
      return;
    }

    const query = ownerQuery.trim();
    let cancelled = false;

    if (query.length < 1) {
      void Promise.resolve().then(() => {
        if (!cancelled) {
          setSearchResults([]);
          setSearchLoading(false);
        }
      });
      return () => {
        cancelled = true;
      };
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setSearchLoading(true);
        try {
          const response = await authenticatedFetch(
            `/api/search/clients?q=${encodeURIComponent(query)}`
          );
          if (!response.ok) {
            throw new Error('Search failed');
          }
          const data = await response.json();
          if (!cancelled) {
            const clients = Array.isArray(data.clients)
              ? (data.clients as ClientSearchResult[])
              : [];
            setSearchResults(
              clients.filter((client) =>
                matchesRecordType(client.status, recordType)
              )
            );
          }
        } catch {
          if (!cancelled) {
            setSearchResults([]);
          }
        } finally {
          if (!cancelled) {
            setSearchLoading(false);
          }
        }
      })();
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [isSuperAdmin, ownerQuery, recordType]);

  const relationshipOwners = useMemo(
    () =>
      assignments
        .filter(
          (assignment) =>
            assignment.role === AssignmentRole.RELATIONSHIP &&
            matchesRecordType(assignment.clientStatus, recordType)
        )
        .map((assignment) => ({
          id: assignment.client_id,
          name: assignment.clientName,
        }))
        // Dedupe multi-role rows (unlikely for RELATIONSHIP alone but safe)
        .filter(
          (owner, index, list) =>
            list.findIndex((item) => item.id === owner.id) === index
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [assignments, recordType]
  );

  const selectedSearchOwner = searchResults.find(
    (client) => client.clientId === ownerId
  );

  function changeRecordType(next: RecordTypeChoice) {
    setRecordType(next);
    setOwnerId('');
    setOwnerQuery('');
    setSearchResults([]);
    setOwnerError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    let nextOwnerError: string | null = null;
    if (!ownerId) {
      nextOwnerError =
        recordType === 'CLIENT' ? 'Select a client.' : 'Select a lead.';
    }

    const nextFieldErrors = validateImportantDateFields({
      label,
      date,
      time,
    });

    setOwnerError(nextOwnerError);
    setFieldErrors(nextFieldErrors);

    if (nextOwnerError || hasImportantDateFieldErrors(nextFieldErrors)) {
      setError(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const parsed = parseImportantDateInput({
        label: label.trim(),
        date: date.trim(),
        time: time.trim() || null,
        notes: notes.trim() || null,
        ...(recordType === 'LEAD'
          ? { leadId: ownerId }
          : { clientId: ownerId }),
      });
      if (!parsed.ok) {
        setError(formatImportantDateApiError(parsed.error));
        setFieldErrors(
          validateImportantDateFields({ label, date, time })
        );
        setIsSubmitting(false);
        return;
      }

      const body =
        recordType === 'LEAD'
          ? {
              leadId: ownerId,
              label: parsed.data.label,
              date: parsed.data.date,
              time: parsed.data.time,
              notes: parsed.data.notes,
            }
          : {
              clientId: ownerId,
              label: parsed.data.label,
              date: parsed.data.date,
              time: parsed.data.time,
              notes: parsed.data.notes,
            };

      const response = await authenticatedFetch(
        createApiPath(recordType, ownerId),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Failed to create important date'
        );
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(
        formatImportantDateApiError(
          err instanceof Error ? err.message : 'Failed to create important date'
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const entityLabel = recordType === 'CLIENT' ? 'Client' : 'Lead';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-important-date-title"
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
        >
          <h3
            id="add-important-date-title"
            className="text-lg font-semibold text-gray-900"
          >
            Add Important Date
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Create a date for a client or lead you can manage.
          </p>

          <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Record type <span className="text-red-600">*</span>
              </label>
              <select
                value={recordType}
                onChange={(e) =>
                  changeRecordType(e.target.value as RecordTypeChoice)
                }
                disabled={isSubmitting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="CLIENT">Client</option>
                <option value="LEAD">Lead</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {entityLabel} <span className="text-red-600">*</span>
              </label>

              {isSuperAdmin ? (
                <div className="space-y-2">
                  <input
                    type="search"
                    value={ownerQuery}
                    onChange={(e) => {
                      setOwnerQuery(e.target.value);
                      setOwnerId('');
                      setOwnerError(null);
                    }}
                    disabled={isSubmitting}
                    placeholder={`Search ${entityLabel.toLowerCase()} by name…`}
                    aria-invalid={Boolean(ownerError)}
                    className={`w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                      ownerError
                        ? 'border-red-300'
                        : 'border-gray-300'
                    }`}
                  />
                  {searchLoading ? (
                    <p className="text-xs text-gray-500">Searching…</p>
                  ) : null}
                  {ownerId && selectedSearchOwner ? (
                    <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      Selected: {selectedSearchOwner.name}
                      {selectedSearchOwner.company
                        ? ` · ${selectedSearchOwner.company}`
                        : ''}
                    </p>
                  ) : null}
                  {searchResults.length > 0 ? (
                    <ul className="max-h-40 overflow-auto rounded-lg border border-gray-200">
                      {searchResults.map((client) => (
                        <li key={client.clientId}>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => {
                              setOwnerId(client.clientId);
                              setOwnerQuery(client.name);
                              setOwnerError(null);
                            }}
                            className={`flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-60 ${
                              ownerId === client.clientId ? 'bg-blue-50' : ''
                            }`}
                          >
                            <span className="font-medium text-gray-900">
                              {client.name}
                            </span>
                            <span className="text-xs text-gray-500">
                              {[client.company, client.email]
                                .filter(Boolean)
                                .join(' · ') || client.status}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : ownerQuery.trim() && !searchLoading ? (
                    <p className="text-xs text-gray-500">
                      No matching {entityLabel.toLowerCase()}s.
                    </p>
                  ) : null}
                </div>
              ) : assignmentsLoading ? (
                <p className="text-sm text-gray-500">Loading…</p>
              ) : relationshipOwners.length === 0 ? (
                <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  No {entityLabel.toLowerCase()}s assigned to you as Relationship.
                </p>
              ) : (
                <select
                  value={ownerId}
                  onChange={(e) => {
                    setOwnerId(e.target.value);
                    setOwnerError(null);
                  }}
                  disabled={isSubmitting}
                  required
                  aria-invalid={Boolean(ownerError)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                    ownerError ? 'border-red-300' : 'border-gray-300'
                  }`}
                >
                  <option value="">Select {entityLabel.toLowerCase()}…</option>
                  {relationshipOwners.map((owner) => (
                    <option key={owner.id} value={owner.id}>
                      {owner.name}
                    </option>
                  ))}
                </select>
              )}
              {ownerError ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {ownerError}
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Label <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  if (fieldErrors.label) {
                    setFieldErrors((current) => ({ ...current, label: undefined }));
                  }
                }}
                required
                disabled={isSubmitting}
                aria-invalid={Boolean(fieldErrors.label)}
                placeholder="e.g. Contract renewal"
                className={`w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                  fieldErrors.label ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {fieldErrors.label ? (
                <p className="mt-1 text-xs text-red-600" role="alert">
                  {fieldErrors.label}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Date <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (fieldErrors.date) {
                      setFieldErrors((current) => ({ ...current, date: undefined }));
                    }
                  }}
                  required
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.date)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                    fieldErrors.date ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {fieldErrors.date ? (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {fieldErrors.date}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Time (optional)
                </label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value);
                    if (fieldErrors.time) {
                      setFieldErrors((current) => ({ ...current, time: undefined }));
                    }
                  }}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.time)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60 ${
                    fieldErrors.time ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {!time.trim() && !fieldErrors.time ? (
                  <p className="mt-1 text-[11px] text-gray-400">No time set</p>
                ) : null}
                {fieldErrors.time ? (
                  <p className="mt-1 text-xs text-red-600" role="alert">
                    {fieldErrors.time}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={isSubmitting}
                placeholder="Details for this date"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  (!isSuperAdmin && relationshipOwners.length === 0)
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? 'Saving…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
