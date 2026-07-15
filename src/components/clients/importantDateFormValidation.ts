/**
 * Client-side field validation messages for Important Dates forms.
 * Keeps UX copy clear; server validation remains the source of truth on submit.
 */

import {
  combineDateAndOptionalTime,
} from '@/lib/importantDateValidation';

export type ImportantDateFieldErrors = {
  label?: string;
  date?: string;
  time?: string;
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns per-field messages for missing label/date or invalid time.
 * Empty object ⇒ no client-side field errors.
 */
export function validateImportantDateFields(input: {
  label: string;
  date: string;
  time?: string | null;
}): ImportantDateFieldErrors {
  const errors: ImportantDateFieldErrors = {};
  const label = input.label.trim();
  const date = input.date.trim();
  const time = input.time?.trim() || null;

  if (!label) {
    errors.label = 'Label is required.';
  }

  if (!date) {
    errors.date = 'Date is required.';
  } else if (!DATE_ONLY_RE.test(date)) {
    errors.date = 'Enter a valid date.';
  } else {
    const combined = combineDateAndOptionalTime(date, time);
    if (!combined.ok) {
      if (combined.error.startsWith('time')) {
        errors.time = 'Enter a valid time (HH:mm).';
      } else if (combined.error.startsWith('date')) {
        errors.date = 'Enter a valid date.';
      } else {
        errors.date = 'Enter a valid date and time.';
      }
    }
  }

  if (date && DATE_ONLY_RE.test(date) && time) {
    const combined = combineDateAndOptionalTime(date, time);
    if (!combined.ok && combined.error.startsWith('time')) {
      errors.time = 'Enter a valid time (HH:mm).';
    }
  }

  return errors;
}

export function hasImportantDateFieldErrors(
  errors: ImportantDateFieldErrors
): boolean {
  return Boolean(errors.label || errors.date || errors.time);
}

/**
 * Map API / parseImportantDate* error strings into friendlier UI copy when possible.
 */
export function formatImportantDateApiError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return 'Something went wrong. Please try again.';
  }

  const lower = trimmed.toLowerCase();
  if (lower.includes('label') && lower.includes('required')) {
    return 'Label is required.';
  }
  if (lower.includes('date') && lower.includes('required')) {
    return 'Date is required.';
  }
  if (lower.includes('time must') || lower.includes('time is')) {
    return 'Enter a valid time (HH:mm).';
  }
  if (lower.startsWith('important date.')) {
    return formatImportantDateApiError(trimmed.slice('important date.'.length));
  }
  if (/^importantDates\[\d+]\./i.test(trimmed)) {
    return formatImportantDateApiError(
      trimmed.replace(/^importantDates\[\d+]\./i, '')
    );
  }

  return trimmed;
}
