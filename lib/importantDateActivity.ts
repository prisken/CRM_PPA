import { logClientSystemEvent } from '@/lib/authHelpers';
import {
  getUtcDateOnly,
  getUtcTimeOnly,
  type ImportantDateOwnerKind,
} from '@/lib/importantDates';

export type ImportantDateActivityAction = 'created' | 'updated' | 'deleted';

type LogImportantDateEventInput = {
  /** Always the Client row id (leads share Client). */
  clientId: string;
  userId: string;
  action: ImportantDateActivityAction;
  importantDateId: string;
  label: string;
  /** UTC wall YYYY-MM-DD */
  date: string;
  /** UTC wall HH:mm, or null for all-day */
  time: string | null;
  /** Affects which owner key is written into the message (clientId vs leadId). */
  ownerKind?: ImportantDateOwnerKind;
};

function formatScheduleForLog(date: string, time: string | null): string {
  if (time?.trim()) {
    return `${date} ${time.trim()}`;
  }
  return `${date} (all-day)`;
}

/**
 * Logs Important Date mutations via the existing ClientActivityLog SYSTEM feed.
 *
 * Same pattern as `logClientStrategyEvent`:
 * - clientId + userId stored as columns
 * - content is a human message plus structured ids for audit
 */
export async function logImportantDateEvent(input: LogImportantDateEventInput) {
  const {
    clientId,
    userId,
    action,
    importantDateId,
    label,
    date,
    time,
    ownerKind = 'client',
  } = input;

  const trimmedLabel = label.trim() || 'Untitled';
  const schedule = formatScheduleForLog(date, time);
  const ownerKey = ownerKind === 'lead' ? 'leadId' : 'clientId';

  const content =
    `Important date ${action}: ${trimmedLabel} · ${schedule} ` +
    `(${ownerKey}: ${clientId}; importantDateId: ${importantDateId}; ` +
    `userId: ${userId}; action: ${action})`;

  await logClientSystemEvent(clientId, content, userId);
}

/** Build log fields from an ORM / DTO-like important-date row. */
export function importantDateLogFieldsFromRecord(record: {
  id: string;
  label: string;
  scheduledAt: Date;
  hasTime: boolean;
}): Pick<
  LogImportantDateEventInput,
  'importantDateId' | 'label' | 'date' | 'time'
> {
  return {
    importantDateId: record.id,
    label: record.label,
    date: getUtcDateOnly(record.scheduledAt),
    time: record.hasTime ? getUtcTimeOnly(record.scheduledAt) : null,
  };
}
