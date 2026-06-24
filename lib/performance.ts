type PerfMetaValue = string | number | boolean | null | undefined;

export type PerfMeta = Record<string, PerfMetaValue>;

export function isPerfLoggingEnabled(): boolean {
  return process.env.PERF_LOGGING_ENABLED === 'true';
}

function formatMeta(meta?: PerfMeta): string {
  if (!meta) {
    return '';
  }

  const parts = Object.entries(meta)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`);

  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function logPerf(
  operation: string,
  durationMs: number,
  status: 'ok' | 'error',
  meta?: PerfMeta
) {
  if (!isPerfLoggingEnabled()) {
    return;
  }

  console.info(
    `[perf] ${operation} ${durationMs}ms status=${status}${formatMeta(meta)}`
  );
}

/**
 * Times an async operation. When PERF_LOGGING_ENABLED is not true, runs fn with no overhead beyond one env check.
 */
export async function timeAsync<T>(
  operation: string,
  fn: () => Promise<T>,
  getMeta?: (result: T) => PerfMeta
): Promise<T> {
  if (!isPerfLoggingEnabled()) {
    return fn();
  }

  const start = performance.now();

  try {
    const result = await fn();
    const durationMs = Math.round(performance.now() - start);
    logPerf(operation, durationMs, 'ok', getMeta?.(result));
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - start);
    logPerf(operation, durationMs, 'error');
    throw error;
  }
}

/**
 * Times a route handler's main work (after auth). Use operation names like `route:GET /api/admin/pipeline`.
 */
export async function timeRouteHandler<T>(
  route: string,
  handler: () => Promise<T>,
  getMeta?: (result: T) => PerfMeta
): Promise<T> {
  return timeAsync(`route:${route}`, handler, getMeta);
}
