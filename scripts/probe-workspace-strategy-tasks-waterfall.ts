/**
 * Phase 4A — warm-path timing waterfall for Client 360 workspace strategy-tasks.
 *
 * Prerequisites:
 *   PERF_LOGGING_ENABLED=true npm run dev -- -p 3001
 *
 * Run:
 *   BASE_URL=http://localhost:3001 npx tsx scripts/probe-workspace-strategy-tasks-waterfall.ts
 *
 * Optional:
 *   CLIENT_ID=cmqv35szi0000jp04jaejps9j  (empty strategy-tasks sample)
 *   PERF_SERVER_LOG=/path/to/dev-server-terminal.txt
 *
 * Prints SUPER_ADMIN / STANDARD_USER assigned / STANDARD_USER denied waterfalls
 * correlated by `x-perf-req-id` ↔ server `[perf] ... reqId=...` lines.
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

const TERMINALS_DIR =
  process.env.PERF_SERVER_LOG?.trim() ||
  path.join(
    process.env.HOME ?? '',
    '.cursor/projects/Users-priskenlo-Crm-PPA-Ci/terminals'
  );

type RoleLabel =
  | 'SUPER_ADMIN'
  | 'STANDARD_USER_assigned'
  | 'STANDARD_USER_denied';

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
  if (!line.includes('[perf]')) {
    return null;
  }
  const opMatch = line.match(/\bop=([^\s]+)/);
  const routeMatch = line.match(/\broute=([^\s]+)/);
  const durationMatch = line.match(/\bdurationMs=(\d+)/);
  const statusMatch = line.match(/\bstatus=([^\s]+)/);
  if (!durationMatch || !statusMatch) {
    return null;
  }
  const op = opMatch?.[1] ?? (routeMatch ? `route:${routeMatch[1]}` : '-');
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
    op,
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
      if (!text.includes('3001') && !text.includes('PERF_LOGGING')) {
        continue;
      }
      if (!text.includes('[perf]')) {
        continue;
      }
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
  // Allow Next to flush console.
  await new Promise((r) => setTimeout(r, 250));
  const text = await fs.readFile(logPath, 'utf8');
  const lines = text.split('\n').filter((l) => l.includes(`reqId=${reqId}`));
  return lines
    .map(parsePerfLine)
    .filter((s): s is SpanRow => s !== null);
}

function pickSpan(spans: SpanRow[], substring: string): SpanRow | undefined {
  return spans.find((s) => s.op.includes(substring));
}

function formatWaterfall(
  label: RoleLabel,
  clientMs: number,
  httpStatus: number,
  payloadBytes: number,
  spans: SpanRow[]
) {
  const waterfall = pickSpan(spans, 'strategyTasks:waterfall');
  const received = pickSpan(spans, 'strategyTasks:received');
  const auth = pickSpan(spans, 'workspace:auth');
  const userLookup = pickSpan(spans, 'auth:userLookup');
  const access = pickSpan(spans, 'workspace:access');
  const assignment = pickSpan(spans, 'access:assignment');
  const dealPart = pickSpan(spans, 'access:dealParticipant');
  const domain = pickSpan(spans, 'strategyTasks:domain');
  const parallel = pickSpan(spans, 'strategyTasks:parallelBase');
  const clientScalar = pickSpan(spans, 'strategyTasks:clientScalar');
  const tasks = pickSpan(spans, 'strategyTasks:tasks');
  const legacy = pickSpan(spans, 'strategyTasks:legacyStrategy');
  const map = pickSpan(spans, 'strategyTasks:map');
  const serialize = pickSpan(spans, 'strategyTasks:serialize');

  const accessDirect =
    assignment ?? dealPart ?? (access?.durationMs === 0 ? access : undefined);

  return {
    label,
    clientMs,
    httpStatus,
    payloadBytes,
    role: waterfall?.meta.role ?? userLookup?.meta.role ?? access?.meta.role,
    sampleClass: waterfall?.meta.sampleClass ?? received?.meta.sampleClass,
    accessOutcome: waterfall?.meta.accessOutcome,
    floorHint: waterfall?.meta.floorHint,
    reqId: waterfall?.meta.reqId ?? received?.meta.reqId,
    spans: {
      'request received': received?.durationMs ?? 0,
      'auth/session total': auth?.durationMs,
      'auth:userLookup': userLookup?.durationMs,
      'auth:userLookup transport': userLookup?.meta.transport,
      'access total': access?.durationMs,
      'access direct check': accessDirect?.durationMs,
      'access direct transport':
        accessDirect?.meta.transport ?? access?.meta.transport,
      'access direct op': accessDirect?.op,
      'domain total': domain?.durationMs ?? Number(waterfall?.meta.domainMs),
      'domain parallelBase': parallel?.durationMs,
      'domain clientScalar': clientScalar?.durationMs,
      'domain tasks': tasks?.durationMs,
      'domain legacyStrategy': legacy?.durationMs,
      'domain map': map?.durationMs,
      'domain transport': domain?.meta.transport ?? parallel?.meta.transport,
      'response serialize/json':
        serialize?.durationMs ?? Number(waterfall?.meta.serializeMs),
      'route total (server)':
        waterfall?.durationMs ?? Number(waterfall?.meta.routeTotalMs),
      residualMs: waterfall?.meta.residualMs
        ? Number(waterfall.meta.residualMs)
        : undefined,
    },
    nestedSpanCount: spans.length,
  };
}

async function hitWarm(
  label: RoleLabel,
  token: string,
  clientId: string,
  logPath: string | null
) {
  const url = `${BASE_URL}/api/clients/${clientId}/workspace?tab=strategy-tasks`;
  // Warm
  await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  await new Promise((r) => setTimeout(r, 100));

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
  } else if (logPath) {
    // Fallback: last waterfall for this sample in the last ~80 lines of [perf]
    await new Promise((r) => setTimeout(r, 250));
    const text = await fs.readFile(logPath, 'utf8');
    const perfLines = text.split('\n').filter((l) => l.includes('[perf]'));
    const recent = perfLines.slice(-120);
    const lastWaterfall = [...recent]
      .reverse()
      .find((l) => l.includes('strategyTasks:waterfall'));
    const fallbackReq = lastWaterfall?.match(/reqId=([^\s]+)/)?.[1];
    if (fallbackReq) {
      spans = recent
        .filter((l) => l.includes(`reqId=${fallbackReq}`))
        .map(parsePerfLine)
        .filter((s): s is SpanRow => s !== null);
    }
  }

  return formatWaterfall(label, clientMs, res.status, payloadBytes, spans);
}

async function main() {
  const logPath = await findPerfLogPath();
  console.log(
    JSON.stringify({
      phase: '4A',
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

  const assignedOnSample =
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
    : assignedOnSample?.clientId ?? EMPTY_SAMPLE_CLIENT_ID;

  const assignedUser = assignedOnSample?.user;

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
    await hitWarm('SUPER_ADMIN', await tokenFor(admin), clientId, logPath)
  );

  if (assignedUser) {
    results.push(
      await hitWarm(
        'STANDARD_USER_assigned',
        await tokenFor(assignedUser),
        clientId,
        logPath
      )
    );
  } else {
    results.push({
      label: 'STANDARD_USER_assigned',
      skipped: true,
      reason: 'no assigned STANDARD_USER',
    });
  }

  if (outsider) {
    results.push(
      await hitWarm(
        'STANDARD_USER_denied',
        await tokenFor(outsider),
        clientId,
        logPath
      )
    );
  } else {
    results.push({
      label: 'STANDARD_USER_denied',
      skipped: true,
      reason: 'no unassigned STANDARD_USER',
    });
  }

  for (const row of results) {
    console.log(JSON.stringify(row, null, 2));
  }

  // Compact ASCII waterfalls for the plan doc.
  console.log('\n--- Phase 4A warm waterfalls (compact) ---\n');
  for (const row of results) {
    if ('skipped' in row && row.skipped) {
      console.log(`${row.label}: skipped`);
      continue;
    }
    const r = row as ReturnType<typeof formatWaterfall>;
    const s = r.spans;
    console.log(`${r.label}  (http ${r.httpStatus}, client ${r.clientMs}ms, ${r.payloadBytes}B)`);
    console.log(`  accessOutcome=${r.accessOutcome} floorHint=${r.floorHint} sampleClass=${r.sampleClass}`);
    console.log(`  request received          ${s['request received']}ms`);
    console.log(`  auth/session total        ${s['auth/session total'] ?? '—'}ms`);
    console.log(
      `  auth:userLookup           ${s['auth:userLookup'] ?? '—'}ms  transport=${s['auth:userLookup transport'] ?? '—'}`
    );
    console.log(`  access total              ${s['access total'] ?? '—'}ms`);
    console.log(
      `  access direct check       ${s['access direct check'] ?? '—'}ms  transport=${s['access direct transport'] ?? '—'} (${s['access direct op'] ?? '—'})`
    );
    console.log(
      `  domain total              ${s['domain total'] ?? '—'}ms  transport=${s['domain transport'] ?? '—'}`
    );
    console.log(`    parallelBase            ${s['domain parallelBase'] ?? '—'}ms`);
    console.log(`    clientScalar            ${s['domain clientScalar'] ?? '—'}ms`);
    console.log(`    tasks                   ${s['domain tasks'] ?? '—'}ms`);
    console.log(`    legacyStrategy          ${s['domain legacyStrategy'] ?? '—'}ms`);
    console.log(`    map                     ${s['domain map'] ?? '—'}ms`);
    console.log(`  response serialize/json   ${s['response serialize/json'] ?? '—'}ms`);
    console.log(
      `  route total               ${s['route total (server)'] ?? '—'}ms  residual=${s.residualMs ?? '—'}ms`
    );
    console.log('');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
