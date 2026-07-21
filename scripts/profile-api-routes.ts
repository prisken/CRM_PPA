/**
 * Hit major CRM API hot paths and print client-side round-trip timings.
 *
 * ## Auth / token setup
 *
 * Uses **local JWT Bearer tokens** via `signAuthToken` for the first ACTIVE
 * `STANDARD_USER` and `SUPER_ADMIN` rows in the DB pointed at by `DATABASE_URL`.
 * No production credentials are embedded. Requires:
 * - `DATABASE_URL` (Prisma)
 * - JWT signing secret used by `lib/jwt` (same as the running app)
 * - A running Next.js server at `BASE_URL`
 *
 * Optional overrides (never commit secrets — IDs only):
 * - `PROFILE_LEAD_ID` — LCC preview client id
 * - `PROFILE_CLIENT_ID` — Client 360 / strategy client id
 * - `PROFILE_STRATEGY_PLAN_ID` — strategy plan id (needs client id)
 * - `PROFILE_DEAL_ID` — deal detail id (optional; discovered from newest deal)
 * - `PROFILE_DEALS_CLIENT_ID` — Client 360 deals list client (prefer a client with deals)
 * - `PROFILE_SEARCH_Q` — search query string (default discovered from a name)
 *
 * Admin KPI cold path is measured via uncached lib call (not HTTP cache bypass).
 * Client 360 full RSC HTML is not timed here — see server `[perf] client360:rscPageLoad`.
 * Phase 2L/2M: probing `GET …/source-records` here is a **route** microbench only.
 * Client 360 first paint must not call source-records until the aside card expands.
 *
 * Dashboard Home fetch *contract* (Home must not call all widgets / pipeline):
 *   `npx tsx scripts/probe-dashboard-layout-shell.ts` (or `npm run probe:dashboard-shell`).
 *
 * ## Server-side perf logs
 *
 *   PERF_LOGGING_ENABLED=true npm run dev
 *
 * Example:
 *   [perf] method=GET route=/api/admin/leads status=ok durationMs=412 payloadBytes=182340 ...
 *
 * ## Run
 *
 *   # Terminal 1 — app (this repo often uses 3001)
 *   PERF_LOGGING_ENABLED=true npm run dev -- -p 3001
 *
 *   # Terminal 2
 *   BASE_URL=http://localhost:3001 npx tsx scripts/profile-api-routes.ts
 *
 * Defaults: `BASE_URL` or `TEST_BASE_URL`, else `http://localhost:3001`.
 */
import { UserRole } from '@prisma/client';
import { loadAdminDashboardKpisUncached } from '../lib/adminAnalyticsCache';
import { prisma } from '../lib/prisma';
import { signAuthToken } from '../lib/jwt';

const BASE_URL =
  process.env.BASE_URL?.trim() ||
  process.env.TEST_BASE_URL?.trim() ||
  'http://localhost:3001';

type TimedRoute = {
  label: string;
  path: string;
  role: UserRole;
};

type TimedResult = {
  label: string;
  path: string;
  status: number | 'SKIP';
  elapsed: number;
  bytes: number;
  note?: string;
};

/** Static routes that do not need discovered ids. */
const STATIC_ROUTES: TimedRoute[] = [
  {
    label: 'Standard Home shell: assignments',
    path: '/api/me/assignments',
    role: UserRole.STANDARD_USER,
  },
  {
    label: 'Standard dashboard (legacy monolith)',
    path: '/api/dashboard/standard',
    role: UserRole.STANDARD_USER,
  },
  {
    label: 'Widget: assigned clients',
    path: '/api/dashboard/widgets/assigned-clients',
    role: UserRole.STANDARD_USER,
  },
  {
    label: 'Widget: open tasks',
    path: '/api/dashboard/widgets/open-tasks',
    role: UserRole.STANDARD_USER,
  },
  {
    label: 'Widget: deal participation',
    path: '/api/dashboard/widgets/deal-participation',
    role: UserRole.STANDARD_USER,
  },
  {
    label: 'Widget: activity feed',
    path: '/api/dashboard/widgets/activity-feed',
    role: UserRole.STANDARD_USER,
  },
  {
    label: 'Widget: performance metrics',
    path: '/api/dashboard/widgets/performance-metrics',
    role: UserRole.STANDARD_USER,
  },
  {
    label: 'Super admin activity feed',
    path: '/api/dashboard/superadmin',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'Admin funnel',
    path: '/api/admin/funnel-data',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'Admin revenue (month)',
    path: '/api/admin/revenue-tracker?groupBy=month',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'Admin leaderboards',
    path: '/api/admin/leaderboards',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'Admin pipeline',
    path: '/api/admin/pipeline',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'Admin pipeline (mode=legacy)',
    path: '/api/admin/pipeline?mode=legacy',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'Admin all commission returnable',
    path: '/api/admin/all-commission-returnable',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'Admin users',
    path: '/api/admin/users',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'My commission returnables',
    path: '/api/me/commission-returnable',
    role: UserRole.STANDARD_USER,
  },
  {
    label: 'LCC inbox (limit=50)',
    path: '/api/admin/leads?limit=50',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'LCC inbox (needsAttention)',
    path: '/api/admin/leads?limit=50&needsAttention=true',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'LCC inbox (duplicateEmail)',
    path: '/api/admin/leads?limit=50&duplicateEmail=true',
    role: UserRole.SUPER_ADMIN,
  },
  {
    label: 'LCC duplicates panel',
    path: '/api/admin/leads/duplicates',
    role: UserRole.SUPER_ADMIN,
  },
];

function utcMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const endDate = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate };
}

async function getTokenForRole(role: UserRole): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { role, status: 'ACTIVE' },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!user) {
    return null;
  }
  return signAuthToken(user);
}

async function timeRequest(
  label: string,
  path: string,
  token: string
): Promise<TimedResult> {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    const elapsed = Math.round(performance.now() - start);
    const text = await res.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    return { label, path, status: res.status, elapsed, bytes };
  } catch (error) {
    const elapsed = Math.round(performance.now() - start);
    const message = error instanceof Error ? error.message : String(error);
    return {
      label,
      path,
      status: 'SKIP',
      elapsed,
      bytes: 0,
      note: `request failed: ${message}`,
    };
  }
}

function skip(label: string, path: string, note: string): TimedResult {
  return { label, path, status: 'SKIP', elapsed: 0, bytes: 0, note };
}

async function discoverSampleIds(): Promise<{
  leadId: string | null;
  clientId: string | null;
  strategyPlanId: string | null;
  dealId: string | null;
  /** Client used for deals list profiling (prefer dealful). */
  dealsClientId: string | null;
  primaryClientDealCount: number;
  dealsClientDealCount: number;
  assignedUserId: string | null;
  searchQ: string;
}> {
  const envLead = process.env.PROFILE_LEAD_ID?.trim() || null;
  const envClient = process.env.PROFILE_CLIENT_ID?.trim() || null;
  const envPlan = process.env.PROFILE_STRATEGY_PLAN_ID?.trim() || null;
  const envDeal = process.env.PROFILE_DEAL_ID?.trim() || null;
  const envDealsClient = process.env.PROFILE_DEALS_CLIENT_ID?.trim() || null;
  const envSearch = process.env.PROFILE_SEARCH_Q?.trim();

  const [lead, plan, namedClient, assignedUser, latestDeal] = await Promise.all([
    envLead
      ? Promise.resolve({ id: envLead })
      : prisma.client.findFirst({
          where: { status: { not: 'ARCHIVED' } },
          orderBy: { lastModified: 'desc' },
          select: { id: true },
        }),
    envPlan && envClient
      ? Promise.resolve({ id: envPlan, clientId: envClient })
      : prisma.clientStrategyPlan.findFirst({
          orderBy: { updatedAt: 'desc' },
          select: { id: true, clientId: true },
        }),
    prisma.client.findFirst({
      where: { name: { not: '' } },
      orderBy: { lastModified: 'desc' },
      select: { id: true, name: true },
    }),
    prisma.user.findFirst({
      where: { role: UserRole.STANDARD_USER, status: 'ACTIVE' },
      select: { id: true },
    }),
    // Deterministic dealful sample: most recently updated deal.
    prisma.deal.findFirst({
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true, clientId: true },
    }),
  ]);

  let clientId = envClient;
  if (!clientId && plan?.clientId) {
    clientId = plan.clientId;
  }
  if (!clientId) {
    const assignment = await prisma.clientAssignment.findFirst({
      select: { clientId: true },
    });
    clientId = assignment?.clientId ?? namedClient?.id ?? null;
  }

  let dealId = envDeal;
  let dealsClientId = envDealsClient;

  if (envDeal) {
    const envDealRow = await prisma.deal.findUnique({
      where: { id: envDeal },
      select: { id: true, clientId: true },
    });
    if (envDealRow) {
      dealId = envDealRow.id;
      if (!dealsClientId) {
        dealsClientId = envDealRow.clientId;
      }
    }
  }

  if (!dealsClientId && latestDeal) {
    dealsClientId = latestDeal.clientId;
  }
  if (!dealId && latestDeal && latestDeal.clientId === dealsClientId) {
    dealId = latestDeal.id;
  }
  if (!dealId && dealsClientId) {
    const dealOnDealsClient = await prisma.deal.findFirst({
      where: { clientId: dealsClientId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    dealId = dealOnDealsClient?.id ?? null;
  }

  // If primary client already has deals and no explicit deals client, reuse it.
  const [primaryClientDealCount, dealsClientDealCount] = await Promise.all([
    clientId
      ? prisma.deal.count({ where: { clientId } })
      : Promise.resolve(0),
    dealsClientId
      ? prisma.deal.count({ where: { clientId: dealsClientId } })
      : Promise.resolve(0),
  ]);

  if (!dealsClientId && primaryClientDealCount > 0 && clientId) {
    dealsClientId = clientId;
  }

  const searchQ =
    envSearch ||
    namedClient?.name?.trim().slice(0, 3) ||
    'a';

  return {
    leadId: lead?.id ?? null,
    clientId,
    strategyPlanId: plan?.id ?? envPlan,
    dealId,
    dealsClientId,
    primaryClientDealCount,
    dealsClientDealCount,
    assignedUserId: assignedUser?.id ?? null,
    searchQ,
  };
}

async function main() {
  console.log(`Profiling API routes @ ${BASE_URL}\n`);
  console.log(
    'Auth: Bearer JWT from local ACTIVE STANDARD_USER / SUPER_ADMIN (DATABASE_URL).'
  );
  console.log(
    'Optional: PROFILE_LEAD_ID, PROFILE_CLIENT_ID, PROFILE_STRATEGY_PLAN_ID, PROFILE_DEAL_ID, PROFILE_DEALS_CLIENT_ID, PROFILE_SEARCH_Q\n'
  );

  const [standardToken, adminToken, samples] = await Promise.all([
    getTokenForRole(UserRole.STANDARD_USER),
    getTokenForRole(UserRole.SUPER_ADMIN),
    discoverSampleIds(),
  ]);

  if (!standardToken) {
    console.warn('No ACTIVE STANDARD_USER — skipping standard-user routes.');
  }
  if (!adminToken) {
    console.warn('No ACTIVE SUPER_ADMIN — skipping admin routes.');
  }

  console.log('Discovered samples:', {
    leadId: samples.leadId ?? '(none)',
    clientId: samples.clientId ?? '(none)',
    strategyPlanId: samples.strategyPlanId ?? '(none)',
    dealId: samples.dealId ?? '(none)',
    dealsClientId: samples.dealsClientId ?? '(none)',
    primaryClientDealCount: samples.primaryClientDealCount,
    dealsClientDealCount: samples.dealsClientDealCount,
    assignedUserId: samples.assignedUserId ?? '(none)',
    searchQ: samples.searchQ,
  });
  if (!samples.dealsClientId || samples.dealsClientDealCount < 1) {
    console.log(
      'Deals profiling: no dealful client found — dealful deals-list measurement will be SKIPPED.'
    );
  } else {
    console.log(
      `Deals profiling: dealful client ${samples.dealsClientId} has ${samples.dealsClientDealCount} deal(s).`
    );
  }
  console.log('');

  const results: TimedResult[] = [];

  // Admin KPI cold path (lib, bypasses unstable_cache) then warm HTTP hits.
  {
    const start = performance.now();
    try {
      const kpis = await loadAdminDashboardKpisUncached();
      const elapsed = Math.round(performance.now() - start);
      const bytes = Buffer.byteLength(JSON.stringify(kpis), 'utf8');
      results.push({
        label: 'Admin KPIs (cold lib)',
        path: 'lib:loadAdminDashboardKpisUncached',
        status: 200,
        elapsed,
        bytes,
        note: 'bypasses unstable_cache',
      });
    } catch (error) {
      const elapsed = Math.round(performance.now() - start);
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        label: 'Admin KPIs (cold lib)',
        path: 'lib:loadAdminDashboardKpisUncached',
        status: 'SKIP',
        elapsed,
        bytes: 0,
        note: message,
      });
    }

    if (adminToken) {
      results.push(
        await timeRequest(
          'Admin KPIs (HTTP warm #1)',
          '/api/admin/dashboard-kpis',
          adminToken
        )
      );
      results.push(
        await timeRequest(
          'Admin KPIs (HTTP warm #2)',
          '/api/admin/dashboard-kpis',
          adminToken
        )
      );
    } else {
      results.push(
        skip(
          'Admin KPIs (HTTP warm)',
          '/api/admin/dashboard-kpis',
          'no ACTIVE SUPER_ADMIN'
        )
      );
    }
  }

  for (const route of STATIC_ROUTES) {
    const token =
      route.role === UserRole.SUPER_ADMIN ? adminToken : standardToken;
    if (!token) {
      results.push(
        skip(route.label, route.path, `no ACTIVE ${route.role} user`)
      );
      continue;
    }
    results.push(await timeRequest(route.label, route.path, token));
  }

  const { startDate, endDate } = utcMonthRange();
  const calendarPath = `/api/dashboard/widgets/important-dates-calendar?startDate=${startDate}&endDate=${endDate}&recordType=ALL`;
  if (standardToken) {
    results.push(
      await timeRequest(
        'Widget: important dates calendar (assigned user)',
        calendarPath,
        standardToken
      )
    );
  } else {
    results.push(
      skip(
        'Widget: important dates calendar (assigned user)',
        calendarPath,
        'no ACTIVE STANDARD_USER'
      )
    );
  }

  if (adminToken && samples.assignedUserId) {
    const adminAssignedCalendar = `${calendarPath}&assignedUserId=${encodeURIComponent(samples.assignedUserId)}`;
    results.push(
      await timeRequest(
        'Widget: important dates calendar (admin→assignedUserId)',
        adminAssignedCalendar,
        adminToken
      )
    );
  } else {
    results.push(
      skip(
        'Widget: important dates calendar (admin→assignedUserId)',
        `${calendarPath}&assignedUserId=…`,
        !adminToken
          ? 'no ACTIVE SUPER_ADMIN'
          : 'no ACTIVE STANDARD_USER to use as assignedUserId'
      )
    );
  }

  const searchPath = `/api/search/clients?q=${encodeURIComponent(samples.searchQ)}`;
  if (adminToken) {
    results.push(
      await timeRequest('Global search (admin)', searchPath, adminToken)
    );
  } else if (standardToken) {
    results.push(
      await timeRequest('Global search (standard)', searchPath, standardToken)
    );
  } else {
    results.push(skip('Global search', searchPath, 'no authenticated user'));
  }

  if (samples.leadId && adminToken) {
    results.push(
      await timeRequest(
        'LCC lead preview',
        `/api/admin/leads/${samples.leadId}/preview`,
        adminToken
      )
    );
  } else {
    results.push(
      skip(
        'LCC lead preview',
        '/api/admin/leads/{id}/preview',
        samples.leadId
          ? 'no ACTIVE SUPER_ADMIN'
          : 'no lead id (set PROFILE_LEAD_ID or seed clients)'
      )
    );
  }

  if (samples.clientId) {
    // Prefer super admin — discovered clients may not be assigned to the standard user.
    const workspaceToken = adminToken ?? standardToken;
    if (workspaceToken) {
      results.push(
        await timeRequest(
          'Client 360 core',
          `/api/clients/${samples.clientId}`,
          workspaceToken
        )
      );
      results.push(
        await timeRequest(
          'Client 360 hierarchy (employees)',
          `/api/clients/${samples.clientId}/employees`,
          workspaceToken
        )
      );
      results.push(
        await timeRequest(
          'Client 360 important dates',
          `/api/clients/${samples.clientId}/important-dates`,
          workspaceToken
        )
      );
      results.push(
        await timeRequest(
          'Client 360 source records',
          `/api/clients/${samples.clientId}/source-records`,
          workspaceToken
        )
      );

      // Empty / primary-client deals list (historical baseline when primary has 0 deals).
      if (samples.primaryClientDealCount === 0) {
        results.push(
          await timeRequest(
            'Client deals list (empty)',
            `/api/clients/${samples.clientId}/deals`,
            workspaceToken
          )
        );
      }

      // Representative deals list: client with ≥1 deal (deterministic latest-deal client).
      if (samples.dealsClientId && samples.dealsClientDealCount > 0) {
        results.push(
          await timeRequest(
            'Client deals list (dealful)',
            `/api/clients/${samples.dealsClientId}/deals`,
            workspaceToken
          )
        );
      } else {
        results.push(
          skip(
            'Client deals list (dealful)',
            '/api/clients/{id}/deals',
            'no client with deals in DB (set PROFILE_DEALS_CLIENT_ID or seed deals)'
          )
        );
      }

      results.push(
        await timeRequest(
          'Client 360 workspace (strategy-tasks)',
          `/api/clients/${samples.clientId}/workspace?tab=strategy-tasks`,
          workspaceToken
        )
      );
      results.push(
        await timeRequest(
          'Client 360 workspace (activity-notes)',
          `/api/clients/${samples.clientId}/workspace?tab=activity-notes`,
          workspaceToken
        )
      );

      results.push(
        await timeRequest(
          'Client deal participant-users',
          `/api/clients/${samples.clientId}/deals/participant-users`,
          workspaceToken
        )
      );

      if (samples.dealId && samples.dealsClientId) {
        results.push(
          await timeRequest(
            'Client deal detail',
            `/api/clients/${samples.dealsClientId}/deals/${samples.dealId}`,
            workspaceToken
          )
        );
      } else {
        results.push(
          skip(
            'Client deal detail',
            '/api/clients/{id}/deals/{dealId}',
            'no deal id (set PROFILE_DEAL_ID or seed deals)'
          )
        );
      }
    }
  } else {
    results.push(
      skip(
        'Client 360 APIs',
        '/api/clients/{id}/…',
        'no client id (set PROFILE_CLIENT_ID or seed assignments)'
      )
    );
  }

  if (samples.clientId) {
    const planToken = adminToken ?? standardToken;
    if (planToken) {
      results.push(
        await timeRequest(
          'Strategy plan list',
          `/api/clients/${samples.clientId}/strategy-plans`,
          planToken
        )
      );
    } else {
      results.push(
        skip(
          'Strategy plan list',
          `/api/clients/${samples.clientId}/strategy-plans`,
          'no authenticated user'
        )
      );
    }
  } else {
    results.push(
      skip(
        'Strategy plan list',
        '/api/clients/{id}/strategy-plans',
        'no client id (set PROFILE_CLIENT_ID or seed assignments)'
      )
    );
  }

  if (samples.clientId && samples.strategyPlanId) {
    const planToken = adminToken ?? standardToken;
    if (planToken) {
      results.push(
        await timeRequest(
          'Strategy plan detail',
          `/api/clients/${samples.clientId}/strategy-plans/${samples.strategyPlanId}`,
          planToken
        )
      );
    } else {
      results.push(
        skip(
          'Strategy plan detail',
          `/api/clients/${samples.clientId}/strategy-plans/${samples.strategyPlanId}`,
          'no authenticated user'
        )
      );
    }
  } else {
    results.push(
      skip(
        'Strategy plan detail',
        '/api/clients/{id}/strategy-plans/{planId}',
        'no strategy plan (set PROFILE_CLIENT_ID + PROFILE_STRATEGY_PLAN_ID or seed a plan)'
      )
    );
  }

  results.sort((a, b) => {
    if (a.status === 'SKIP' && b.status !== 'SKIP') return 1;
    if (b.status === 'SKIP' && a.status !== 'SKIP') return -1;
    return b.elapsed - a.elapsed;
  });

  console.log('Client-side round-trip (sorted slowest first):\n');
  console.log('ms     status  bytes    route');
  console.log('----   ------  -------  -----');
  for (const row of results) {
    const status =
      row.status === 'SKIP' ? 'SKIP' : String(row.status).padStart(3);
    const flag =
      row.status === 'SKIP'
        ? ''
        : row.elapsed >= 500
          ? ' ⚠️'
          : row.elapsed >= 200
            ? ' ~'
            : '';
    const note = row.note ? `  (${row.note})` : '';
    console.log(
      `${String(row.elapsed).padStart(4)}   ${status.padStart(6)}  ${String(row.bytes).padStart(7)}  ${row.label}${flag}${note}`
    );
    if (row.path && row.status !== 'SKIP') {
      console.log(`              ${row.path}`);
    }
  }

  console.log(
    '\nCheck the dev server terminal for server-side `[perf]` lines (route + payloadBytes).'
  );
  console.log(
    'Client 360 full RSC: open a client page with PERF_LOGGING_ENABLED and look for client360:rscPageLoad.'
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
