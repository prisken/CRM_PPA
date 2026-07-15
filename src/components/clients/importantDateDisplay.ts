import type { ImportantDate } from '@/components/clients/ClientDetailsWidget';

/**
 * Format YYYY-MM-DD for list display.
 * Always treats the calendar date as a UTC wall day (timeZone: 'UTC') so
 * date-only midnight timestamps never shift to the previous local day.
 */
export function formatImportantDateOnly(date: string): string {
  if (!date) {
    return '—';
  }

  const ymd = date.slice(0, 10);
  const parsed = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  // Match existing CRM short-date convention (e.g. tasks / strategy):
  // month short + day + year, browser locale for language/numbering.
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Format HH:mm for display; falls back to raw string.
 * Uses UTC so wall-clock times round-trip exactly as entered (no local TZ shift).
 */
export function formatImportantTimeOnly(time: string | null | undefined): string | null {
  const trimmed = time?.trim();
  if (!trimmed) {
    return null;
  }

  // Accept HH:mm or HH:mm:ss from storage / browsers
  const match = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) {
    return trimmed;
  }

  const probe = new Date(Date.UTC(2000, 0, 1, hours, minutes, 0, 0));
  return probe.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export function hasImportantDateTime(entry: ImportantDate): boolean {
  if (entry.hasTime === false) {
    return false;
  }
  return Boolean(entry.time?.trim());
}

/**
 * Compact list line after the label:
 * - with time → "Dec 1, 2026 · 2:30 PM"
 * - without → "Dec 1, 2026" (existing style; no "No time set" in compact line)
 */
export function formatImportantDateSummary(entry: ImportantDate): string {
  const dateLabel = formatImportantDateOnly(entry.date);
  const timeLabel = hasImportantDateTime(entry)
    ? formatImportantTimeOnly(entry.time)
    : null;

  if (timeLabel) {
    return `${dateLabel} · ${timeLabel}`;
  }

  return dateLabel;
}

/** Card / detail rows: date + time or muted "No time set". */
export function formatImportantDateCardParts(entry: ImportantDate): {
  dateLabel: string;
  timeLabel: string;
  hasTime: boolean;
} {
  const dateLabel = formatImportantDateOnly(entry.date);
  const hasTime = hasImportantDateTime(entry);
  const timeLabel = hasTime
    ? formatImportantTimeOnly(entry.time) ?? entry.time?.trim() ?? ''
    : 'No time set';

  return { dateLabel, timeLabel, hasTime };
}
