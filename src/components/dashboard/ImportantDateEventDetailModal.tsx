'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  formatImportantDateOnly,
  formatImportantTimeOnly,
} from '@/components/clients/importantDateDisplay';
import {
  formatImportantDateApiError,
  hasImportantDateFieldErrors,
  validateImportantDateFields,
  type ImportantDateFieldErrors,
} from '@/components/clients/importantDateFormValidation';
import CompactPill from '@/components/ui/CompactPill';
import ConfirmActionModal from '@/components/ui/ConfirmActionModal';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import type { ImportantDatesCalendarEvent } from '@/lib/importantDatesCalendar';
import { parseImportantDateUpdateInput } from '@/lib/importantDateValidation';

type ImportantDateEventDetailModalProps = {
  event: ImportantDatesCalendarEvent | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

function apiBase(event: ImportantDatesCalendarEvent) {
  return event.recordType === 'LEAD'
    ? `/api/leads/${event.recordId}/important-dates`
    : `/api/clients/${event.recordId}/important-dates`;
}

function DetailRow({
  label,
  children,
  emphasize = false,
}: {
  label: string;
  children: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd
        className={`mt-1 ${
          emphasize
            ? 'text-base font-semibold text-gray-900'
            : 'text-sm text-gray-900'
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

export default function ImportantDateEventDetailModal({
  event,
  isOpen,
  onClose,
  onChanged,
}: ImportantDateEventDetailModalProps) {
  if (!isOpen || !event) {
    return null;
  }

  return (
    <ImportantDateEventDetailModalInner
      key={event.id}
      event={event}
      onClose={onClose}
      onChanged={onChanged}
    />
  );
}

function ImportantDateEventDetailModalInner({
  event,
  onClose,
  onChanged,
}: {
  event: ImportantDatesCalendarEvent;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [label, setLabel] = useState(event.label || event.title || '');
  const [date, setDate] = useState(event.date || '');
  const [time, setTime] = useState(event.time?.trim() || '');
  const [notes, setNotes] = useState(event.notes ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ImportantDateFieldErrors>({});
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(keyboardEvent: KeyboardEvent) {
      if (keyboardEvent.key === 'Escape' && !isSaving && !isDeleting) {
        if (confirmDeleteOpen) {
          setConfirmDeleteOpen(false);
          return;
        }
        if (mode === 'edit') {
          setMode('view');
          return;
        }
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, isSaving, isDeleting, confirmDeleteOpen, onClose]);

  async function handleSave(formEvent: React.FormEvent) {
    formEvent.preventDefault();
    if (!event.canManage || isSaving) {
      return;
    }

    const nextFieldErrors = validateImportantDateFields({
      label,
      date,
      time,
    });
    if (hasImportantDateFieldErrors(nextFieldErrors)) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    const parsed = parseImportantDateUpdateInput({
      label: label.trim(),
      date: date.trim(),
      time: time.trim() || null,
      notes: notes.trim() || null,
    });
    if (!parsed.ok) {
      setError(formatImportantDateApiError(parsed.error));
      setFieldErrors(
        validateImportantDateFields({ label, date, time })
      );
      return;
    }

    setIsSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const response = await authenticatedFetch(
        `${apiBase(event)}/${event.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            label: label.trim(),
            date: date.trim(),
            time: time.trim() || null,
            notes: notes.trim() || null,
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

      onChanged?.();
      onClose();
    } catch (err) {
      setError(
        formatImportantDateApiError(
          err instanceof Error ? err.message : 'Failed to update important date'
        )
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!event.canManage) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await authenticatedFetch(
        `${apiBase(event)}/${event.id}`,
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

      setConfirmDeleteOpen(false);
      onChanged?.();
      onClose();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Failed to delete important date'
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const recordLabel = event.recordType === 'CLIENT' ? 'Client' : 'Lead';
  const timeDisplay = event.time
    ? formatImportantTimeOnly(event.time) ?? event.time
    : 'No time set';
  const recordHref = `/clients/${event.recordId}`;

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
        <div className="flex min-h-full items-center justify-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="important-date-event-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6"
          >
            {mode === 'edit' && event.canManage ? (
              <>
                <h3
                  id="important-date-event-title"
                  className="text-lg font-semibold text-gray-900"
                >
                  Edit Important Date
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Update the label, date, optional time, and notes.
                </p>

                <form onSubmit={(e) => void handleSave(e)} className="mt-5 space-y-4">
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
                          setFieldErrors((current) => ({
                            ...current,
                            label: undefined,
                          }));
                        }
                      }}
                      required
                      disabled={isSaving}
                      aria-invalid={Boolean(fieldErrors.label)}
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
                            setFieldErrors((current) => ({
                              ...current,
                              date: undefined,
                            }));
                          }
                        }}
                        required
                        disabled={isSaving}
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
                            setFieldErrors((current) => ({
                              ...current,
                              time: undefined,
                            }));
                          }
                        }}
                        disabled={isSaving}
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
                      disabled={isSaving}
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
                      onClick={() => {
                        setMode('view');
                        setLabel(event.label || event.title || '');
                        setDate(event.date || '');
                        setTime(event.time?.trim() || '');
                        setNotes(event.notes ?? '');
                        setError(null);
                        setFieldErrors({});
                      }}
                      disabled={isSaving}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Important date
                    </p>
                    <h3
                      id="important-date-event-title"
                      className="mt-1 text-xl font-semibold text-gray-900"
                    >
                      {event.label || event.title}
                    </h3>
                  </div>
                  <CompactPill
                    tone={event.recordType === 'CLIENT' ? 'blue' : 'yellow'}
                    size="sm"
                  >
                    {recordLabel}
                  </CompactPill>
                </div>

                <dl className="mt-5 space-y-4">
                  <DetailRow label="Date" emphasize>
                    {formatImportantDateOnly(event.date)}
                  </DetailRow>
                  <DetailRow label="Time" emphasize>
                    <span
                      className={
                        event.time
                          ? 'tabular-nums text-gray-900'
                          : 'font-normal text-gray-400'
                      }
                    >
                      {timeDisplay}
                    </span>
                  </DetailRow>
                  <DetailRow label={recordLabel}>
                    <Link
                      href={recordHref}
                      className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      {event.recordName}
                    </Link>
                  </DetailRow>
                  {event.notes?.trim() ? (
                    <DetailRow label="Notes">
                      <p className="whitespace-pre-wrap text-sm text-gray-800">
                        {event.notes.trim()}
                      </p>
                    </DetailRow>
                  ) : null}
                  {event.createdByName ? (
                    <DetailRow label="Created by">
                      {event.createdByName}
                    </DetailRow>
                  ) : null}
                </dl>

                {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    href={recordHref}
                    className="inline-flex justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                  >
                    Open {recordLabel} 360
                  </Link>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                    >
                      Close
                    </button>
                    {event.canManage ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setMode('edit');
                          }}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100"
                        >
                          Edit Important Date
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDeleteOpen(true);
                          }}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 active:bg-red-800"
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmActionModal
        isOpen={confirmDeleteOpen}
        title="Delete important date?"
        description={
          <>
            This will permanently remove{' '}
            <span className="font-medium text-gray-900">
              {event.label || event.title}
            </span>{' '}
            for {event.recordName}.
          </>
        }
        confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
        tone="danger"
        isSubmitting={isDeleting}
        error={deleteError}
        onClose={() => {
          if (!isDeleting) {
            setConfirmDeleteOpen(false);
          }
        }}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
