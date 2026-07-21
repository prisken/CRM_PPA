import { NextResponse } from 'next/server';
import {
  buildActivityNotesWorkspace,
  client360ActivitySelect,
  loadStrategyTasksWorkspace,
} from '@/lib/client360';
import { resolveClient360Context } from '@/lib/client360RequestContext';
import { prisma } from '@/lib/prisma';
import {
  createPerfRequestId,
  getPerfRequestContext,
  isPerfLoggingEnabled,
  logPerfOp,
  logPerfRoute,
  measureJsonBytes,
  runWithPerfContext,
  timeAsync,
  timeRouteHandler,
} from '@/lib/performance';

export const dynamic = 'force-dynamic';

const VALID_TABS = new Set(['strategy-tasks', 'activity', 'activity-notes']);

/**
 * Phase 2N/3A: auth/access via resolveClient360Context (`workspace:view`).
 * Phase 3D: strategy-tasks domain via loadStrategyTasksWorkspace — Client +
 * Tasks + legacy Strategy take-1 in parallel (one pooler wall RTT).
 * Phase 4A: request-scoped PERF reqId + strategy-tasks waterfall summary.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tab = new URL(request.url).searchParams.get('tab') ?? 'strategy-tasks';

  if (tab === 'strategy-tasks') {
    return getStrategyTasksWorkspace(request, id);
  }

  const resolved = await resolveClient360Context({
    clientId: id,
    request,
    capability: 'workspace:view',
    perfPrefix: 'client360:workspace',
  });
  if (!resolved.ok) {
    return resolved.error;
  }

  if (!VALID_TABS.has(tab)) {
    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
  }

  const payload = await timeRouteHandler(
    `GET /api/clients/${id}/workspace?tab=activity-notes`,
    async () => {
      return timeAsync(
        'client360:workspace:activityNotes',
        async () => {
          const client = await timeAsync(
            'client360:workspace:activityNotes:query',
            () =>
              prisma.client.findUnique({
                where: { id },
                select: client360ActivitySelect,
              })
          );

          if (!client) {
            return null;
          }

          return timeAsync('client360:workspace:activityNotes:map', async () =>
            buildActivityNotesWorkspace(client)
          );
        },
        (result) => ({
          found: result !== null,
          activityCount: result?.activityLog.length ?? 0,
        })
      );
    },
    {
      payloadCategory: 'client360-core',
      getMeta: (result) => ({
        found: result !== null,
        activityCount: result?.activityLog.length ?? 0,
      }),
    }
  );

  if (!payload) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}

async function getStrategyTasksWorkspace(request: Request, clientId: string) {
  const routeStart = performance.now();
  const reqId = createPerfRequestId('ws');
  const clientIdPrefix = clientId.slice(0, 8);
  const sampleClass = 'empty-strategy-tasks';

  return runWithPerfContext(
    {
      reqId,
      clientIdPrefix,
      sampleClass,
      capability: 'workspace:view',
    },
    async () => {
      logPerfOp('client360:workspace:strategyTasks:received', 0, {
        phase: '4A',
      });

      const authAccessStart = performance.now();
      const resolved = await resolveClient360Context({
        clientId,
        request,
        capability: 'workspace:view',
        perfPrefix: 'client360:workspace',
      });
      const authAccessMs = Math.round(performance.now() - authAccessStart);

      if (!resolved.ok) {
        const status = resolved.error.status;
        const accessOutcome =
          status === 401 ? 'unauthorized' : status === 403 ? 'denied' : 'error';
        const routeTotalMs = Math.round(performance.now() - routeStart);
        logPerfOp(
          'client360:workspace:strategyTasks:waterfall',
          routeTotalMs,
          {
            phase: '4A',
            accessOutcome,
            authAccessMs,
            domainMs: 0,
            serializeMs: 0,
            routeTotalMs,
            payloadBytes: 0,
            residualMs: Math.max(0, routeTotalMs - authAccessMs),
            floorHint:
              accessOutcome === 'denied'
                ? 'auth+access_only'
                : 'auth_or_error',
          },
          status
        );
        return withPerfReqIdHeader(resolved.error, reqId);
      }

      const ctx = getPerfRequestContext();
      if (ctx) {
        ctx.role = resolved.ctx.role;
      }

      const domainStart = performance.now();
      const payload = await loadStrategyTasksWorkspace(clientId);
      const domainMs = Math.round(performance.now() - domainStart);

      if (!payload) {
        const routeTotalMs = Math.round(performance.now() - routeStart);
        logPerfOp(
          'client360:workspace:strategyTasks:waterfall',
          routeTotalMs,
          {
            phase: '4A',
            accessOutcome: 'allowed',
            role: resolved.ctx.role,
            authAccessMs,
            domainMs,
            serializeMs: 0,
            routeTotalMs,
            payloadBytes: 0,
            residualMs: Math.max(0, routeTotalMs - authAccessMs - domainMs),
            floorHint: 'client_missing',
          },
          404
        );
        return withPerfReqIdHeader(
          NextResponse.json({ error: 'Client not found' }, { status: 404 }),
          reqId
        );
      }

      const serializeStart = performance.now();
      const json = JSON.stringify(payload);
      const serializeMs = Math.round(performance.now() - serializeStart);
      const payloadBytes =
        measureJsonBytes(payload) ?? Buffer.byteLength(json, 'utf8');
      const routeTotalMs = Math.round(performance.now() - routeStart);
      const residualMs = Math.max(
        0,
        routeTotalMs - authAccessMs - domainMs - serializeMs
      );

      logPerfOp('client360:workspace:strategyTasks:serialize', serializeMs, {
        payloadBytes,
      });

      logPerfOp(
        'client360:workspace:strategyTasks:waterfall',
        routeTotalMs,
        {
          phase: '4A',
          accessOutcome: 'allowed',
          role: resolved.ctx.role,
          authAccessMs,
          domainMs,
          serializeMs,
          routeTotalMs,
          payloadBytes,
          residualMs,
          floorHint:
            domainMs >= authAccessMs
              ? 'domain_pooler_rtt'
              : 'auth_access_direct',
        },
        200
      );

      logPerfRoute(
        `GET /api/clients/${clientId}/workspace?tab=strategy-tasks`,
        routeTotalMs,
        {
          payloadBytes,
          payloadCategory: 'client360-core',
          found: true,
          taskCount: payload.tasks.length,
        },
        200
      );

      return withPerfReqIdHeader(
        new NextResponse(json, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
        reqId
      );
    }
  );
}

/** Correlation header for Phase 4A probes — only when PERF logging is on. */
function withPerfReqIdHeader(
  response: NextResponse,
  reqId: string
): NextResponse {
  if (isPerfLoggingEnabled()) {
    response.headers.set('x-perf-req-id', reqId);
  }
  return response;
}
