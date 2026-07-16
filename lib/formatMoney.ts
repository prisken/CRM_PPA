/**
 * Format monetary amounts without currency labels (no $, USD, US$).
 * Values are plain locale-formatted numbers.
 */

export type FormatMoneyOptions = {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

function resolveFractionDigits(options?: FormatMoneyOptions) {
  const maximumFractionDigits = options?.maximumFractionDigits ?? 2;
  const minimumFractionDigits =
    options?.minimumFractionDigits ?? Math.min(2, maximumFractionDigits);

  return { maximumFractionDigits, minimumFractionDigits };
}

/**
 * Returns a locale-formatted amount, or null when the value is missing/invalid.
 */
export function formatMoney(
  value: number | null | undefined,
  options?: FormatMoneyOptions
): string | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  const { maximumFractionDigits, minimumFractionDigits } =
    resolveFractionDigits(options);

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/** Always returns a string; missing/invalid values become "—". */
export function displayMoney(
  value: number | null | undefined,
  options?: FormatMoneyOptions
): string {
  return formatMoney(value, options) ?? '—';
}

/** Always returns a string; missing/invalid values become "0" / "0.00". */
export function formatMoneyRequired(
  value: number | null | undefined,
  options?: FormatMoneyOptions
): string {
  const { maximumFractionDigits, minimumFractionDigits } =
    resolveFractionDigits(options);

  if (value === null || value === undefined || Number.isNaN(value)) {
    return new Intl.NumberFormat(undefined, {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(0);
  }

  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}
