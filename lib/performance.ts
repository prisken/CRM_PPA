/**
 * Opt-in server performance instrumentation.
 *
 * Enable:
 *   PERF_LOGGING_ENABLED=true npm run dev
 *
 * Emits structured `[perf]` lines to the server console (method, route/op,
 * status, durationMs, optional payloadBytes / cache). Does not change
 * API response shapes or product behavior.
 *
 * Prisma slow queries (≥200ms) log in development or when
 * PERF_LOGGING_ENABLED=true — see `lib/prisma.ts`.
 */

type PerfMetaValue = string | number | boolean | null | undefined;

export type PerfMeta = Record<string, PerfMetaValue>;

/** Categories with payload size warning thresholds (bytes). */
export type PayloadCategory =
  | 'dashboard-widget'
  | 'client360-core'
  | 'deals'
  | 'lead-command-center'
  | 'strategy-planner'
  | 'admin-pipeline';

export const PAYLOAD_WARN_THRESHOLDS: Record<PayloadCategory, number> = {
  'dashboard-widget': 50 * 1024,
  'client360-core': 100 * 1024,
  deals: 150 * 1024,
  'lead-command-center': 250 * 1024,
  'strategy-planner': 200 * 1024,
  /** Unbounded master pipeline list — warn early as client volume grows. */
  'admin-pipeline': 150 * 1024,
};

const SLOW_PRISMA_QUERY_MS = 200;

export type TimeAsyncOptions<T> = {
  /** Extra fields merged into the log line after timing. */
  getMeta?: (result: T) => PerfMeta;
  /** When set, measures JSON byte size of the result and may warn. */
  payloadCategory?: PayloadCategory;
  /** Caller-provided cache outcome (e.g. admin analytics). */
  cache?: 'hit' | 'miss' | boolean;
};

export type TimeRouteOptions<T> = TimeAsyncOptions<T> & {
  /** Override method parsed from the route label (GET /api/...). */
  method?: string;
  /** HTTP status code when known (defaults to ok/error). */
  statusCode?: number;
};

export function isPerfLoggingEnabled(): boolean {
  return process.env.PERF_LOGGING_ENABLED === 'true';
}

/** Slow Prisma query logging: development OR PERF_LOGGING_ENABLED=true. */
export function shouldLogSlowPrismaQueries(): boolean {
  return (
    isPerfLoggingEnabled() || process.env.NODE_ENV === 'development'
  );
}

export function getSlowPrismaQueryThresholdMs(): number {
  return SLOW_PRISMA_QUERY_MS;
}

function formatMeta(meta?: PerfMeta): string {
  if (!meta) {
    return '';
  }

  const parts = Object.entries(meta)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${String(value)}`);

  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function parseRouteLabel(routeLabel: string): {
  method: string;
  route: string;
} {
  const match = routeLabel.trim().match(
    /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)$/i
  );
  if (match) {
    return { method: match[1].toUpperCase(), route: match[2].trim() };
  }
  return { method: '-', route: routeLabel.trim() };
}

function normalizeCache(
  cache: TimeAsyncOptions<unknown>['cache']
): 'hit' | 'miss' | undefined {
  if (cache === undefined) {
    return undefined;
  }
  if (cache === true || cache === 'hit') {
    return 'hit';
  }
  if (cache === false || cache === 'miss') {
    return 'miss';
  }
  return undefined;
}

/**
 * Best-effort UTF-8 JSON size. Returns undefined if value cannot be measured
 * safely (e.g. circular structure, BigInt, Response).
 */
export function measureJsonBytes(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  try {
    if (typeof Response !== 'undefined' && value instanceof Response) {
      return undefined;
    }
    const json = JSON.stringify(value);
    if (typeof json !== 'string') {
      return undefined;
    }
    return Buffer.byteLength(json, 'utf8');
  } catch {
    return undefined;
  }
}

export function warnIfPayloadLarge(
  category: PayloadCategory,
  payloadBytes: number,
  routeOrOp: string
): void {
  if (!isPerfLoggingEnabled()) {
    return;
  }

  const threshold = PAYLOAD_WARN_THRESHOLDS[category];
  if (payloadBytes <= threshold) {
    return;
  }

  console.warn(
    `[perf:warn] payloadBytes=${payloadBytes} threshold=${threshold} category=${category} route=${routeOrOp}`
  );
}

function buildPayloadMeta(
  category: PayloadCategory | undefined,
  result: unknown,
  routeOrOp: string
): PerfMeta {
  if (!category) {
    return {};
  }

  const payloadBytes = measureJsonBytes(result);
  if (payloadBytes === undefined) {
    return {};
  }

  warnIfPayloadLarge(category, payloadBytes, routeOrOp);
  return { payloadBytes, payloadCategory: category };
}

function logStructuredPerf(fields: {
  method?: string;
  route?: string;
  op?: string;
  status: string | number;
  durationMs: number;
  meta?: PerfMeta;
}): void {
  if (!isPerfLoggingEnabled()) {
    return;
  }

  const method = fields.method ?? '-';
  const label = fields.route
    ? `route=${fields.route}`
    : `op=${fields.op ?? '-'}`;

  console.info(
    `[perf] method=${method} ${label} status=${fields.status} durationMs=${fields.durationMs}${formatMeta(fields.meta)}`
  );
}

/** Log a slow Prisma query without binding parameter values. */
export function logSlowPrismaQuery(durationMs: number, query: string): void {
  if (!shouldLogSlowPrismaQueries()) {
    return;
  }

  if (durationMs < SLOW_PRISMA_QUERY_MS) {
    return;
  }

  // Query text uses $1/$2 placeholders — do not append Prisma `params`
  // (may contain emails, phones, tokens).
  const compact = query.replace(/\s+/g, ' ').trim().slice(0, 500);
  console.info(
    `[perf] method=- op=prisma:query status=slow durationMs=${durationMs} query="${compact}"`
  );
}

function isOptionsObject<T>(
  value: unknown
): value is TimeAsyncOptions<T> | TimeRouteOptions<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ('getMeta' in value ||
      'payloadCategory' in value ||
      'cache' in value ||
      'method' in value ||
      'statusCode' in value)
  );
}

function resolveAsyncOptions<T>(
  third?: ((result: T) => PerfMeta) | TimeAsyncOptions<T>
): TimeAsyncOptions<T> {
  if (!third) {
    return {};
  }
  if (typeof third === 'function') {
    return { getMeta: third };
  }
  if (isOptionsObject<T>(third)) {
    return third;
  }
  return {};
}

/**
 * Times an async operation. When PERF_LOGGING_ENABLED is not true, runs fn
 * with no overhead beyond one env check.
 *
 * Third argument may be a legacy `getMeta` callback or an options object.
 */
export async function timeAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  getMetaOrOptions?: ((result: T) => PerfMeta) | TimeAsyncOptions<T>
): Promise<T> {
  if (!isPerfLoggingEnabled()) {
    return fn();
  }

  const options = resolveAsyncOptions(getMetaOrOptions);
  const start = performance.now();

  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    const cache = normalizeCache(options.cache);
    logStructuredPerf({
      op: operation,
      status: 'ok',
      durationMs,
      meta: {
        ...buildPayloadMeta(options.payloadCategory, result, operation),
        ...(cache ? { cache } : {}),
        ...options.getMeta?.(result),
      },
    });
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    logStructuredPerf({
      op: operation,
      status: 'error',
      durationMs,
      meta: cacheMetaOnly(options.cache),
    });
    throw error;
  }
}

function cacheMetaOnly(
  cache: TimeAsyncOptions<unknown>['cache']
): PerfMeta | undefined {
  const normalized = normalizeCache(cache);
  return normalized ? { cache: normalized } : undefined;
}

/**
 * Times a route handler's main work (after auth).
 *
 * Route label examples: `GET /api/admin/pipeline`, `GET /api/admin/leads`.
 * Third argument may be a legacy `getMeta` callback or {@link TimeRouteOptions}.
 */
export async function timeRouteHandler<T>(
  routeLabel: string,
  handler: () => Promise<T>,
  getMetaOrOptions?: ((result: T) => PerfMeta) | TimeRouteOptions<T>
): Promise<T> {
  if (!isPerfLoggingEnabled()) {
    return handler();
  }

  const options =
    typeof getMetaOrOptions === 'function'
      ? ({ getMeta: getMetaOrOptions } satisfies TimeRouteOptions<T>)
      : getMetaOrOptions ?? {};

  const parsed = parseRouteLabel(routeLabel);
  const method = options.method ?? parsed.method;
  const route = parsed.route;
  const start = performance.now();

  try {
    const result = await handler();
    const durationMs = Math.round(performance.now() - start);
    const cache = normalizeCache(options.cache);
    const status = options.statusCode ?? 'ok';

    logStructuredPerf({
      method,
      route,
      status,
      durationMs,
      meta: {
        ...buildPayloadMeta(options.payloadCategory, result, route),
        ...(cache ? { cache } : {}),
        ...options.getMeta?.(result),
      },
    });
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    logStructuredPerf({
      method,
      route,
      status: options.statusCode ?? 'error',
      durationMs,
      meta: cacheMetaOnly(options.cache),
    });
    throw error;
  }
}
