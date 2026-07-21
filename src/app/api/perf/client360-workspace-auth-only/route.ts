/**
 * Phase 4B — measurement-only: same auth/access as workspace strategy-tasks,
 * but no domain reads. Returns `{ ok: true }` after authorization.
 *
 * Gated: only available when `PERF_LOGGING_ENABLED=true` (404 otherwise).
 *
 * GET /api/perf/client360-workspace-auth-only?clientId=…
 *
 * Probe:
 *   BASE_URL=http://localhost:3001 npx tsx scripts/probe-workspace-auth-only-baseline.ts
 */
import { NextResponse } from 'next/server';
import { resolveClient360Context } from '@/lib/client360RequestContext';
import {
  createPerfRequestId,
  getPerfRequestContext,
  isPerfLoggingEnabled,
  logPerfOp,
  measureJsonBytes,
  runWithPerfContext,
} from '@/lib/performance';

export const dynamic = 'force-dynamic';

const STATIC_OK = { ok: true as const };

export async function GET(request: Request) {
  if (!isPerfLoggingEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const clientId = new URL(request.url).searchParams.get('clientId')?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: 'clientId query param required' },
      { status: 400 }
    );
  }

  const routeStart = performance.now();
  const reqId = createPerfRequestId('ao');
  const clientIdPrefix = clientId.slice(0, 8);

  return runWithPerfContext(
    {
      reqId,
      clientIdPrefix,
      sampleClass: 'auth-only-baseline',
      capability: 'workspace:view',
    },
    async () => {
      logPerfOp('perf:workspaceAuthOnly:received', 0, { phase: '4B' });

      const authAccessStart = performance.now();
      const resolved = await resolveClient360Context({
        clientId,
        request,
        capability: 'workspace:view',
        perfPrefix: 'perf:workspaceAuthOnly',
      });
      const authAccessMs = Math.round(performance.now() - authAccessStart);

      if (!resolved.ok) {
        const status = resolved.error.status;
        const accessOutcome =
          status === 401 ? 'unauthorized' : status === 403 ? 'denied' : 'error';
        const routeTotalMs = Math.round(performance.now() - routeStart);
        logPerfOp(
          'perf:workspaceAuthOnly:waterfall',
          routeTotalMs,
          {
            phase: '4B',
            accessOutcome,
            authAccessMs,
            domainMs: 0,
            serializeMs: 0,
            routeTotalMs,
            payloadBytes: 0,
            residualMs: Math.max(0, routeTotalMs - authAccessMs),
            floorHint: 'auth_access_only',
          },
          status
        );
        const denied = resolved.error;
        denied.headers.set('x-perf-req-id', reqId);
        return denied;
      }

      const ctx = getPerfRequestContext();
      if (ctx) {
        ctx.role = resolved.ctx.role;
      }

      const serializeStart = performance.now();
      const json = JSON.stringify(STATIC_OK);
      const serializeMs = Math.round(performance.now() - serializeStart);
      const payloadBytes =
        measureJsonBytes(STATIC_OK) ?? Buffer.byteLength(json, 'utf8');
      const routeTotalMs = Math.round(performance.now() - routeStart);
      const residualMs = Math.max(0, routeTotalMs - authAccessMs - serializeMs);

      logPerfOp('perf:workspaceAuthOnly:serialize', serializeMs, {
        payloadBytes,
      });

      logPerfOp(
        'perf:workspaceAuthOnly:waterfall',
        routeTotalMs,
        {
          phase: '4B',
          accessOutcome: 'allowed',
          role: resolved.ctx.role,
          authAccessMs,
          domainMs: 0,
          serializeMs,
          routeTotalMs,
          payloadBytes,
          residualMs,
          floorHint: 'auth_access_allow',
        },
        200
      );

      const response = new NextResponse(json, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'x-perf-req-id': reqId,
          'Cache-Control': 'no-store',
        },
      });
      return response;
    }
  );
}
