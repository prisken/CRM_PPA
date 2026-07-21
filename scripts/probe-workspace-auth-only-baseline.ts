/**
 * Phase 4B — compare workspace strategy-tasks full route vs auth-only baseline.
 *
 * Prerequisites:
 *   PERF_LOGGING_ENABLED=true npm run dev -- -p 3001
 *
 * Run:
 *   BASE_URL=http://localhost:3001 npx tsx scripts/probe-workspace-auth-only-baseline.ts
 *
 * Optional:
 *   CLIENT_ID=cmqv35szi0000jp04jaejps9j
 *   PERF_SERVER_LOG=/path/to/dev-server-terminal.txt
 *
 * Scenarios:
 *   denied STANDARD_USER full route     — auth/access denial floor
 *   assigned STANDARD_USER auth-only    — auth/access allow floor
 *   assigned STANDARD_USER full route   — auth/access + domain + map
 *   SUPER_ADMIN auth-only               — admin auth floor
 *   SUPER_ADMIN full route              — admin auth + domain + map
 */
import { AssignmentRole, UserRole, UserStatus } from '@prisma/client';
import { promises as fs } from 'fs';
import path from 'path';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

const BASE_URL =
  process.env.BASE_URL?.trim() ||
  process.env.TEST_BASE_URL?.trim() ||
  'http://localhost:3001';

const EMPTY_SAMPLE_CLIENT_ID =
  process.env.CLIENT_ID?.trim() || 'cmqv35szi0000jp04jaejps9j';

const TERMINALS_DIR = path.join(
  process.env.HOME ?? '',
  '.cursor/projects/Users-priskenlo-Crm-PPA-Ci/terminals'
);

type ScenarioLabel =
  | 'SUPER_ADMIN_auth_only'
  | 'SUPER_ADMIN_full'
  | 'STANDARD_USER_assigned_auth_only'
  | 'STANDARD_USER_assigned_full'
  | 'STANDARD_USER_denied_full';

type SpanRow = {
  op: string;
  durationMs: number;
  status: string;
  meta: Record<string, string>;
};

async function tokenFor(user: {
  id: string;
  email: string;
  role: UserRole;
  name: string | null;
}) {
  return signAuthToken({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });
}

function parsePerfLine(line: string): SpanRow | null {
  if (!line.includes('[perf]')) return null;
  const opMatch = line.match(/\bop=([^\s]+)/);
  const durationMatch = line.match(/\bdurationMs=(\d+)/);
  const statusMatch = line.match(/\bstatus=([^\s]+)/);
  if (!durationMatch || !statusMatch) return null;
  const meta: Record<string, string> = {};
  for (const m of line.matchAll(/\b([a-zA-Z][\w]*)=([^\s]+)/g)) {
    const key = m[1];
    if (
      key === 'method' ||
      key === 'op' ||
      key === 'route' ||
      key === 'status' ||
      key === 'durationMs'
    ) {
      continue;
    }
    meta[key] = m[2];
  }
  return {
    op: opMatch?.[1] ?? '-',
    durationMs: Number(durationMatch[1]),
    status: statusMatch[1],
    meta,
  };
}

async function findPerfLogPath(): Promise<string | null> {
  if (process.env.PERF_SERVER_LOG?.trim()) {
    return process.env.PERF_SERVER_LOG.trim();
  }
  try {
    const entries = await fs.readdir(TERMINALS_DIR);
    let best: { path: string; mtime: number } | null = null;
    for (const name of entries) {
      if (!name.endsWith('.txt')) continue;
      const full = path.join(TERMINALS_DIR, name);
      const text = await fs.readFile(full, 'utf8');
      if (!text.includes('3001') && !text.includes('PERF_LOGGING')) continue;
      if (!text.includes('[perf]')) continue;
      const st = await fs.stat(full);
      if (!best || st.mtimeMs > best.mtime) {
        best = { path: full, mtime: st.mtimeMs };
      }
    }
    return best?.path ?? null;
  } catch {
    return null;
  }
}

async function scrapeSpansForReqId(
  logPath: string,
  reqId: string
): Promise<SpanRow[]> {
  await new Promise((r) => setTimeout(r, 250));
  const text = await fs.readFile(logPath, 'utf8');
  return text
    .split('\n')
    .filter((l) => l.includes(`reqId=${reqId}`))
    .map(parsePerfLine)
    .filter((s): s is SpanRow => s !== null);
}

function pick(spans: SpanRow[], substring: string): SpanRow | undefined {
  return spans.find((s) => s.op.includes(substring));
}

function summarize(
  label: ScenarioLabel,
  kind: 'auth_only' | 'full',
  clientMs: number,
  httpStatus: number,
  payloadBytes: number,
  spans: SpanRow[]
) {
  const waterfall =
    pick(spans, 'workspaceAuthOnly:waterfall') ??
    pick(spans, 'strategyTasks:waterfall');
  const auth =
    pick(spans, 'workspaceAuthOnly:auth') ?? pick(spans, 'workspace:auth');
  const userLookup = pick(spans, 'auth:userLookup');
  const access =
    pick(spans, 'workspaceAuthOnly:access') ??
    pick(spans, 'workspace:access');
  const assignment = pick(spans, 'access:assignment');
  const domain = pick(spans, 'strategyTasks:domain');
  const serialize =
    pick(spans, 'workspaceAuthOnly:serialize') ??
    pick(spans, 'strategyTasks:serialize');

  return {
    label,
    kind,
    clientMs,
    httpStatus,
    payloadBytes,
    role: waterfall?.meta.role ?? access?.meta.role,
    accessOutcome: waterfall?.meta.accessOutcome,
    floorHint: waterfall?.meta.floorHint,
    reqId: waterfall?.meta.reqId,
    authMs: auth?.durationMs,
    userLookupMs: userLookup?.durationMs,
    userLookupTransport: userLookup?.meta.transport,
    accessMs: access?.durationMs,
    accessDirectMs: assignment?.durationMs ?? (access?.durationMs === 0 ? 0 : undefined),
    accessTransport: assignment?.meta.transport ?? access?.meta.transport,
    domainMs:
      domain?.durationMs ??
      (waterfall?.meta.domainMs !== undefined
        ? Number(waterfall.meta.domainMs)
        : kind === 'auth_only'
          ? 0
          : undefined),
    serializeMs: serialize?.durationMs ?? Number(waterfall?.meta.serializeMs),
    routeTotalMs:
      waterfall?.durationMs ?? Number(waterfall?.meta.routeTotalMs),
    residualMs: waterfall?.meta.residualMs
      ? Number(waterfall.meta.residualMs)
      : undefined,
    nestedSpanCount: spans.length,
  };
}

async function hitWarm(
  label: ScenarioLabel,
  kind: 'auth_only' | 'full',
  token: string,
  clientId: string,
  logPath: string | null
) {
  const url =
    kind === 'auth_only'
      ? `${BASE_URL}/api/perf/client360-workspace-auth-only?clientId=${encodeURIComponent(clientId)}`
      : `${BASE_URL}/api/clients/${clientId}/workspace?tab=strategy-tasks`;

  await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  await new Promise((r) => setTimeout(r, 80));

  const t0 = performance.now();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  const clientMs = Math.round(performance.now() - t0);
  const payloadBytes = Buffer.byteLength(body, 'utf8');
  const reqId = res.headers.get('x-perf-req-id');

  let spans: SpanRow[] = [];
  if (logPath && reqId) {
    spans = await scrapeSpansForReqId(logPath, reqId);
  }

  return summarize(label, kind, clientMs, res.status, payloadBytes, spans);
}

async function main() {
  const logPath = await findPerfLogPath();
  console.log(
    JSON.stringify({
      phase: '4B',
      baseUrl: BASE_URL,
      sampleClientId: EMPTY_SAMPLE_CLIENT_ID,
      perfLog: logPath,
    })
  );

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
    select: { id: true, email: true, role: true, name: true },
  });

  const assignment = await prisma.clientAssignment.findFirst({
    where: {
      clientId: EMPTY_SAMPLE_CLIENT_ID,
      role: AssignmentRole.RELATIONSHIP,
      user: { role: UserRole.STANDARD_USER, status: UserStatus.ACTIVE },
    },
    select: {
      clientId: true,
      user: { select: { id: true, email: true, role: true, name: true } },
    },
  });

  const fallbackAssignment =
    assignment ??
    (await prisma.clientAssignment.findFirst({
      where: {
        role: AssignmentRole.RELATIONSHIP,
        user: { role: UserRole.STANDARD_USER, status: UserStatus.ACTIVE },
        client: { status: { not: 'ARCHIVED' } },
      },
      select: {
        clientId: true,
        user: { select: { id: true, email: true, role: true, name: true } },
      },
    }));

  const clientId = assignment
    ? EMPTY_SAMPLE_CLIENT_ID
    : (fallbackAssignment?.clientId ?? EMPTY_SAMPLE_CLIENT_ID);
  const assignedUser = fallbackAssignment?.user;

  const outsider = await prisma.user.findFirst({
    where: {
      role: UserRole.STANDARD_USER,
      status: UserStatus.ACTIVE,
      ...(assignedUser ? { id: { not: assignedUser.id } } : {}),
      clientAssignments: { none: { clientId } },
    },
    select: { id: true, email: true, role: true, name: true },
  });

  if (!admin) {
    console.log(JSON.stringify({ error: 'no SUPER_ADMIN' }));
    return;
  }

  const results = [];

  results.push(
    await hitWarm(
      'SUPER_ADMIN_auth_only',
      'auth_only',
      await tokenFor(admin),
      clientId,
      logPath
    )
  );
  results.push(
    await hitWarm(
      'SUPER_ADMIN_full',
      'full',
      await tokenFor(admin),
      clientId,
      logPath
    )
  );

  if (assignedUser) {
    results.push(
      await hitWarm(
        'STANDARD_USER_assigned_auth_only',
        'auth_only',
        await tokenFor(assignedUser),
        clientId,
        logPath
      )
    );
    results.push(
      await hitWarm(
        'STANDARD_USER_assigned_full',
        'full',
        await tokenFor(assignedUser),
        clientId,
        logPath
      )
    );
  }

  if (outsider) {
    results.push(
      await hitWarm(
        'STANDARD_USER_denied_full',
        'full',
        await tokenFor(outsider),
        clientId,
        logPath
      )
    );
  }

  for (const row of results) {
    console.log(JSON.stringify(row, null, 2));
  }

  const byLabel = Object.fromEntries(
    results.map((r) => [r.label, r])
  ) as Record<string, (typeof results)[0]>;

  const adminAuth = byLabel.SUPER_ADMIN_auth_only;
  const adminFull = byLabel.SUPER_ADMIN_full;
  const assignedAuth = byLabel.STANDARD_USER_assigned_auth_only;
  const assignedFull = byLabel.STANDARD_USER_assigned_full;
  const denied = byLabel.STANDARD_USER_denied_full;

  console.log('\n--- Phase 4B baseline comparison (compact) ---\n');
  console.log(
    'Scenario                              clientMs  routeTotal  auth  access  domain  bytes  status'
  );
  for (const r of results) {
    console.log(
      `${r.label.padEnd(38)} ${String(r.clientMs).padStart(7)}  ${String(r.routeTotalMs ?? '—').padStart(10)}  ${String(r.authMs ?? '—').padStart(4)}  ${String(r.accessMs ?? '—').padStart(6)}  ${String(r.domainMs ?? '—').padStart(6)}  ${String(r.payloadBytes).padStart(5)}  ${r.httpStatus}`
    );
  }

  if (adminAuth && adminFull) {
    const delta =
      (adminFull.routeTotalMs ?? adminFull.clientMs) -
      (adminAuth.routeTotalMs ?? adminAuth.clientMs);
    console.log(
      `\nSUPER_ADMIN domain delta (full − auth-only): ~${delta}ms (server route)`
    );
  }
  if (assignedAuth && assignedFull) {
    const delta =
      (assignedFull.routeTotalMs ?? assignedFull.clientMs) -
      (assignedAuth.routeTotalMs ?? assignedAuth.clientMs);
    console.log(
      `STANDARD_USER assigned domain delta (full − auth-only): ~${delta}ms (server route)`
    );
  }
  if (denied) {
    console.log(
      `STANDARD_USER denied floor (full route, no domain): route~${denied.routeTotalMs ?? '—'}ms client~${denied.clientMs}ms`
    );
  }

  const domainShareAdmin =
    adminFull?.domainMs != null && adminFull.routeTotalMs
      ? Math.round((adminFull.domainMs / adminFull.routeTotalMs) * 100)
      : null;
  const domainShareAssigned =
    assignedFull?.domainMs != null && assignedFull.routeTotalMs
      ? Math.round((assignedFull.domainMs / assignedFull.routeTotalMs) * 100)
      : null;

  console.log('\nVerdict hints:');
  if (domainShareAdmin != null) {
    console.log(
      `  SUPER_ADMIN full: domain ≈ ${domainShareAdmin}% of route total (auth-only floor ~${adminAuth?.routeTotalMs ?? '—'}ms)`
    );
  }
  if (domainShareAssigned != null) {
    console.log(
      `  assigned STANDARD_USER full: domain ≈ ${domainShareAssigned}% of route total (auth-only floor ~${assignedAuth?.routeTotalMs ?? '—'}ms)`
    );
  }
  console.log(
    '  If full ≈ auth-only + domain and residual≈0, remaining totals are domain-dominated (pooler RTT), not map/serialize/runtime.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
