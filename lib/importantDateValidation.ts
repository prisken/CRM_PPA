/**
 * Hand-rolled validation for Client Important Dates (same pattern as strategy validation).
 * No Zod in this project.
 *
 * Leads and clients share Client rows — ownership is route `clientId`, not body `leadId`.
 */

export type ValidationSuccess<T> = { ok: true; data: T };
export type ValidationFailure = { ok: false; error: string };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export type ImportantDateInput = {
  id?: string;
  label: string;
  /** YYYY-MM-DD (required unless scheduledAt provided for legacy callers). */
  date: string;
  /** Optional HH:mm — omit/null for all-day (current UX). */
  time: string | null;
  notes: string | null;
  /** Combined UTC ISO from date + optional time. */
  scheduledAt: string;
  hasTime: boolean;
};

export type ImportantDatesReplaceInput = {
  /** Always the Client id (covers leads and clients). */
  clientId: string;
  importantDates: ImportantDateInput[];
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Accept HH:mm, H:mm, HH:mm:ss, H:mm:ss from browsers / pasted values. */
const TIME_LOOSE_RE = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;
const CUID_LIKE_RE = /^[a-z0-9_-]{8,}$/i;

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

/**
 * Normalize optional time to canonical HH:mm (or null when blank).
 * Strips seconds so `<input type="time">` values like `14:30:00` still work.
 */
export function normalizeImportantTime(
  time: string | null | undefined
): ValidationResult<string | null> {
  if (time === undefined || time === null) {
    return { ok: true, data: null };
  }

  const trimmed = String(time).trim();
  if (!trimmed) {
    return { ok: true, data: null };
  }

  const match = TIME_LOOSE_RE.exec(trimmed);
  if (!match) {
    return { ok: false, error: 'time must be HH:mm' };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return { ok: false, error: 'time must be a valid HH:mm' };
  }

  return { ok: true, data: `${pad2(hours)}:${pad2(minutes)}` };
}

function asTrimmedString(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim();
}

function isEmptyImportantDateRow(record: Record<string, unknown>) {
  const label = asTrimmedString(record.label || record.title);
  const date = asTrimmedString(record.date);
  const time = asTrimmedString(record.time);
  const notes = asTrimmedString(record.notes ?? record.details);
  const scheduledAt = asTrimmedString(record.scheduledAt ?? record.scheduled_at);
  return !label && !date && !time && !notes && !scheduledAt;
}

/**
 * Combine YYYY-MM-DD + optional HH:mm into a UTC Date.
 * Treats the user's entered calendar date/time as UTC wall-clock components
 * (no local timezone conversion) so the same day/time round-trips everywhere.
 * Missing/blank time ⇒ all-day at 00:00:00.000Z (backward compatible).
 */
export function combineDateAndOptionalTime(
  date: string,
  time: string | null | undefined
): ValidationResult<{ scheduledAt: Date; hasTime: boolean; date: string; time: string | null }> {
  if (!DATE_ONLY_RE.test(date)) {
    return { ok: false, error: 'date must be YYYY-MM-DD' };
  }

  const [year, month, day] = date.split('-').map(Number);
  const normalizedTime = normalizeImportantTime(time);
  if (!normalizedTime.ok) {
    return normalizedTime;
  }
  const trimmedTime = normalizedTime.data;

  if (!trimmedTime) {
    const scheduledAt = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    if (
      scheduledAt.getUTCFullYear() !== year ||
      scheduledAt.getUTCMonth() !== month - 1 ||
      scheduledAt.getUTCDate() !== day
    ) {
      return { ok: false, error: 'date is not a valid calendar date' };
    }

    return {
      ok: true,
      data: {
        scheduledAt,
        hasTime: false,
        date,
        time: null,
      },
    };
  }

  const [hours, minutes] = trimmedTime.split(':').map(Number);

  const scheduledAt = new Date(
    Date.UTC(year, month - 1, day, hours, minutes, 0, 0)
  );
  if (
    scheduledAt.getUTCFullYear() !== year ||
    scheduledAt.getUTCMonth() !== month - 1 ||
    scheduledAt.getUTCDate() !== day ||
    scheduledAt.getUTCHours() !== hours ||
    scheduledAt.getUTCMinutes() !== minutes
  ) {
    return { ok: false, error: 'date/time is not a valid date-time' };
  }

  return {
    ok: true,
    data: {
      scheduledAt,
      hasTime: true,
      date,
      time: trimmedTime,
    },
  };
}

/**
 * Derive date (+ optional time) from a combined ISO/scheduledAt string.
 * Supports legacy callers that only send scheduledAt.
 */
export function splitScheduledAt(
  value: string
): ValidationResult<{ date: string; time: string | null; hasTime: boolean; scheduledAt: Date }> {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: 'scheduledAt must be a valid ISO date-time' };
  }

  const date = [
    parsed.getUTCFullYear(),
    pad2(parsed.getUTCMonth() + 1),
    pad2(parsed.getUTCDate()),
  ].join('-');

  const hours = parsed.getUTCHours();
  const minutes = parsed.getUTCMinutes();
  const hasTime = hours !== 0 || minutes !== 0 || parsed.getUTCSeconds() !== 0;

  return {
    ok: true,
    data: {
      date,
      time: hasTime ? `${pad2(hours)}:${pad2(minutes)}` : null,
      hasTime,
      scheduledAt: parsed,
    },
  };
}

/**
 * Validate one important-date object for create/replace.
 * Required: label, date (or scheduledAt for legacy combined payload).
 * Optional: time, notes, id.
 */
export function parseImportantDateInput(
  input: unknown,
  index?: number
): ValidationResult<ImportantDateInput> {
  const prefix =
    index === undefined ? 'important date' : `importantDates[${index}]`;

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: `${prefix} must be an object` };
  }

  const record = input as Record<string, unknown>;

  if (isEmptyImportantDateRow(record)) {
    return { ok: false, error: `${prefix} is empty` };
  }

  // Accept title as alias for label (create/update UX).
  const label = asTrimmedString(record.label || record.title);
  if (!label) {
    return { ok: false, error: `${prefix}.label is required` };
  }
  if (label.length > 500) {
    return { ok: false, error: `${prefix}.label must be at most 500 characters` };
  }

  let date = asTrimmedString(record.date);
  // Allow ISO datetime in date field (backward compatible)
  if (date.length > 10 && DATE_ONLY_RE.test(date.slice(0, 10))) {
    date = date.slice(0, 10);
  }

  const timeRaw =
    record.time === undefined || record.time === null
      ? null
      : asTrimmedString(record.time) || null;

  const notesRaw =
    record.notes === undefined || record.notes === null
      ? null
      : asTrimmedString(record.notes) || null;

  if (notesRaw && notesRaw.length > 5000) {
    return { ok: false, error: `${prefix}.notes must be at most 5000 characters` };
  }

  const scheduledAtRaw = asTrimmedString(
    record.scheduledAt ?? record.scheduled_at
  );

  let combined: {
    scheduledAt: Date;
    hasTime: boolean;
    date: string;
    time: string | null;
  };

  if (date) {
    const built = combineDateAndOptionalTime(date, timeRaw);
    if (!built.ok) {
      return { ok: false, error: `${prefix}.${built.error}` };
    }
    combined = built.data;
  } else if (scheduledAtRaw) {
    // Legacy / alternate: single scheduledAt
    const split = splitScheduledAt(scheduledAtRaw);
    if (!split.ok) {
      return { ok: false, error: `${prefix}.${split.error}` };
    }
    // Explicit time in payload overrides derived time when provided
    if (timeRaw) {
      const rebuilt = combineDateAndOptionalTime(split.data.date, timeRaw);
      if (!rebuilt.ok) {
        return { ok: false, error: `${prefix}.${rebuilt.error}` };
      }
      combined = rebuilt.data;
    } else {
      combined = {
        scheduledAt: split.data.scheduledAt,
        hasTime: split.data.hasTime,
        date: split.data.date,
        time: split.data.time,
      };
    }
  } else {
    return { ok: false, error: `${prefix}.date is required` };
  }

  const idRaw = record.id;
  if (idRaw !== undefined && idRaw !== null && idRaw !== '') {
    const id = asTrimmedString(idRaw);
    if (!CUID_LIKE_RE.test(id)) {
      return { ok: false, error: `${prefix}.id is invalid` };
    }
  }

  return {
    ok: true,
    data: {
      id:
        typeof record.id === 'string' && record.id.trim()
          ? record.id.trim()
          : undefined,
      label,
      date: combined.date,
      time: combined.time,
      notes: notesRaw,
      scheduledAt: combined.scheduledAt.toISOString(),
      hasTime: combined.hasTime,
    },
  };
}

/**
 * Validate importantDates array for Client details replace.
 * Skips blank rows (UI “add date” placeholders). Empty array is allowed (clear all).
 */
export function parseImportantDatesArray(
  value: unknown
): ValidationResult<ImportantDateInput[]> {
  if (value === undefined || value === null) {
    return { ok: true, data: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, error: 'importantDates must be an array' };
  }

  const data: ImportantDateInput[] = [];

  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      if (isEmptyImportantDateRow(entry as Record<string, unknown>)) {
        continue;
      }
    }

    const parsed = parseImportantDateInput(entry, index);
    if (!parsed.ok) {
      return parsed;
    }
    data.push(parsed.data);
  }

  return { ok: true, data };
}

/**
 * Validate replace payload including owning clientId (leads use the same Client id).
 * Rejects body leadId/clientId mismatches when present.
 */
export function parseImportantDatesReplaceInput(
  clientIdFromRoute: string,
  body: unknown
): ValidationResult<ImportantDatesReplaceInput> {
  if (!clientIdFromRoute?.trim()) {
    return { ok: false, error: 'clientId is required' };
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be an object' };
  }

  const record = body as Record<string, unknown>;

  if (record.leadId !== undefined && record.leadId !== null) {
    const leadId = asTrimmedString(record.leadId);
    if (leadId && leadId !== clientIdFromRoute) {
      return {
        ok: false,
        error: 'leadId must match the client route id (leads are Client records)',
      };
    }
  }

  if (record.clientId !== undefined && record.clientId !== null) {
    const bodyClientId = asTrimmedString(record.clientId);
    if (bodyClientId && bodyClientId !== clientIdFromRoute) {
      return {
        ok: false,
        error: 'clientId in body must match the route client id',
      };
    }
  }

  if (!('importantDates' in record)) {
    return {
      ok: false,
      error: 'importantDates is required when validating important date updates',
    };
  }

  const parsedDates = parseImportantDatesArray(record.importantDates);
  if (!parsedDates.ok) {
    return parsedDates;
  }

  return {
    ok: true,
    data: {
      clientId: clientIdFromRoute,
      importantDates: parsedDates.data,
    },
  };
}

/**
 * Partial update for a single important date.
 * At least one of label/title, date, time, notes, scheduledAt must be present.
 * Omitting time keeps existing time unless date/scheduledAt rebuild without time.
 * Sending `time: null` or `""` clears time (all-day).
 */
export function parseImportantDateUpdateInput(
  input: unknown
): ValidationResult<{
  label?: string;
  date?: string;
  time?: string | null;
  notes?: string | null;
  scheduledAt?: string;
  hasTime?: boolean;
  clearTime?: boolean;
}> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, error: 'Request body must be an object' };
  }

  const record = input as Record<string, unknown>;
  const hasLabel = 'label' in record || 'title' in record;
  const hasDate = 'date' in record;
  const hasTime = 'time' in record;
  const hasNotes = 'notes' in record || 'details' in record;
  const hasScheduledAt = 'scheduledAt' in record || 'scheduled_at' in record;

  if (!hasLabel && !hasDate && !hasTime && !hasNotes && !hasScheduledAt) {
    return {
      ok: false,
      error: 'At least one of label, date, time, notes, or scheduledAt is required',
    };
  }

  const result: {
    label?: string;
    date?: string;
    time?: string | null;
    notes?: string | null;
    scheduledAt?: string;
    hasTime?: boolean;
    clearTime?: boolean;
  } = {};

  if (hasLabel) {
    const label = asTrimmedString(record.label || record.title);
    if (!label) {
      return { ok: false, error: 'label cannot be empty' };
    }
    if (label.length > 500) {
      return { ok: false, error: 'label must be at most 500 characters' };
    }
    result.label = label;
  }

  if (hasNotes) {
    const notesSource =
      record.notes !== undefined ? record.notes : record.details;
    const notes =
      notesSource === undefined || notesSource === null
        ? null
        : asTrimmedString(notesSource) || null;
    if (notes && notes.length > 5000) {
      return { ok: false, error: 'notes must be at most 5000 characters' };
    }
    result.notes = notes;
  }

  if (hasDate || hasTime || hasScheduledAt) {
    let date = hasDate ? asTrimmedString(record.date) : '';
    if (date.length > 10 && DATE_ONLY_RE.test(date.slice(0, 10))) {
      date = date.slice(0, 10);
    }

    const timeProvided = hasTime;
    const timeRaw = !timeProvided
      ? undefined
      : record.time === null || record.time === ''
        ? null
        : asTrimmedString(record.time) || null;

    const scheduledAtRaw = hasScheduledAt
      ? asTrimmedString(record.scheduledAt ?? record.scheduled_at)
      : '';

    if (date) {
      // If only date changes and time not sent, treat as all-day until merged with existing in route.
      // Callers that send both date+time get full combine here.
      if (timeProvided) {
        const built = combineDateAndOptionalTime(date, timeRaw);
        if (!built.ok) {
          return built;
        }
        result.date = built.data.date;
        result.time = built.data.time;
        result.hasTime = built.data.hasTime;
        result.scheduledAt = built.data.scheduledAt.toISOString();
        result.clearTime = !built.data.hasTime;
      } else {
        if (!DATE_ONLY_RE.test(date)) {
          return { ok: false, error: 'date must be YYYY-MM-DD' };
        }
        const built = combineDateAndOptionalTime(date, null);
        if (!built.ok) {
          return built;
        }
        result.date = date;
        // time not in payload — route merges with existing hasTime/time
      }
    } else if (scheduledAtRaw) {
      const split = splitScheduledAt(scheduledAtRaw);
      if (!split.ok) {
        return split;
      }
      if (timeProvided) {
        const rebuilt = combineDateAndOptionalTime(split.data.date, timeRaw);
        if (!rebuilt.ok) {
          return rebuilt;
        }
        result.date = rebuilt.data.date;
        result.time = rebuilt.data.time;
        result.hasTime = rebuilt.data.hasTime;
        result.scheduledAt = rebuilt.data.scheduledAt.toISOString();
        result.clearTime = !rebuilt.data.hasTime;
      } else {
        result.date = split.data.date;
        result.time = split.data.time;
        result.hasTime = split.data.hasTime;
        result.scheduledAt = split.data.scheduledAt.toISOString();
      }
    } else if (timeProvided) {
      // Time-only update: validate format; route combines with existing date.
      if (timeRaw === null) {
        result.time = null;
        result.hasTime = false;
        result.clearTime = true;
      } else {
        const probe = combineDateAndOptionalTime('2000-01-01', timeRaw);
        if (!probe.ok) {
          return { ok: false, error: probe.error };
        }
        result.time = timeRaw;
        result.hasTime = true;
        result.clearTime = false;
      }
    } else {
      return { ok: false, error: 'date is required when updating schedule fields' };
    }
  }

  return { ok: true, data: result };
}

/**
 * Create body: label/title + date/time (+ optional notes).
 * Accepts optional clientId/leadId which must match routeClientId when present.
 */
export function parseImportantDateCreateBody(
  routeClientId: string,
  body: unknown
): ValidationResult<ImportantDateInput> {
  if (!routeClientId?.trim()) {
    return { ok: false, error: 'clientId is required' };
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be an object' };
  }

  const record = body as Record<string, unknown>;

  if (record.leadId !== undefined && record.leadId !== null) {
    const leadId = asTrimmedString(record.leadId);
    if (leadId && leadId !== routeClientId) {
      return {
        ok: false,
        error: 'leadId must match the client route id (leads are Client records)',
      };
    }
  }

  if (record.clientId !== undefined && record.clientId !== null) {
    const bodyClientId = asTrimmedString(record.clientId);
    if (bodyClientId && bodyClientId !== routeClientId) {
      return {
        ok: false,
        error: 'clientId in body must match the route client id',
      };
    }
  }

  // Map details → notes for create convenience
  const payload =
    record.notes === undefined && record.details !== undefined
      ? { ...record, notes: record.details }
      : record;

  return parseImportantDateInput(payload);
}

export const importantDateCreateSchema = {
  parse: (input: unknown) => parseImportantDateInput(input),
};

export const importantDateUpdateSchema = {
  parse: (input: unknown) => parseImportantDateUpdateInput(input),
};

export const importantDatesArraySchema = {
  parse: (input: unknown) => parseImportantDatesArray(input),
};
