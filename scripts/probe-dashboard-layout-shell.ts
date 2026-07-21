/**
 * Lightweight dashboard-layout shell probe (post sidebar redesign).
 *
 * Purpose: document + lightly verify the **Home vs module** fetch contract.
 * Does **not** invent performance baselines or time full browser page paints.
 *
 * ## What this measures
 *
 * 1. **Source contract (always, no server):** Home views must not import heavy
 *    workspace modules or call widget/pipeline APIs in source.
 * 2. **Optional HTTP (needs running app):** round-trip timings for the *allowed*
 *    Home shell APIs only (`/api/me/assignments`, `/api/admin/dashboard-kpis`).
 *    Module APIs remain covered by `scripts/profile-api-routes.ts`.
 *
 * ## What this does NOT measure
 *
 * - Whether a real browser session on `/dashboard` / `/admin` fires extra XHRs
 *   (use Network panel — checklist printed below).
 * - Client 360 / LCC / RSC paint (use existing Client 360 probes + profile-api-routes).
 *
 * ## Run
 *
 *   # Source contract only (no server):
 *   npx tsx scripts/probe-dashboard-layout-shell.ts
 *
 *   # + Home API timings (server required):
 *   PERF_LOGGING_ENABLED=true npm run dev -- -p 3001
 *   BASE_URL=http://localhost:3001 npx tsx scripts/probe-dashboard-layout-shell.ts
 *
 *   npm run probe:dashboard-shell
 *
 * See docs/DATABASE_AND_UI_REFERENCE.md → Measuring workspace shell loads.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { UserRole } from '@prisma/client';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

const BASE_URL =
  process.env.BASE_URL?.trim() ||
  process.env.TEST_BASE_URL?.trim() ||
  'http://localhost:3001';

const ROOT = path.join(__dirname, '..');

/** APIs allowed on standard `/dashboard` Home first paint (besides auth/profile). */
const STANDARD_HOME_ALLOWED = ['/api/me/assignments'] as const;

/** APIs that must NOT fire on standard Home. */
const STANDARD_HOME_FORBIDDEN = [
  '/api/dashboard/widgets/assigned-clients',
  '/api/dashboard/widgets/open-tasks',
  '/api/dashboard/widgets/activity-feed',
  '/api/dashboard/widgets/important-dates-calendar',
  '/api/dashboard/widgets/deal-participation',
  '/api/dashboard/widgets/performance-metrics',
  '/api/me/commission-returnable',
  '/api/dashboard/standard',
] as const;

/** APIs allowed on admin `/admin` Home first paint (besides auth/profile). */
const ADMIN_HOME_ALLOWED = ['/api/admin/dashboard-kpis'] as const;

/** APIs that must NOT fire on admin Home. */
const ADMIN_HOME_FORBIDDEN = [
  '/api/admin/pipeline',
  '/api/dashboard/widgets/important-dates-calendar',
  '/api/dashboard/superadmin',
  '/api/admin/funnel-data',
  '/api/admin/revenue-tracker',
  '/api/admin/leaderboards',
] as const;

type CheckResult = { name: string; ok: boolean; detail: string };

function record(results: CheckResult[], name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

async function readSrc(relativePath: string): Promise<string> {
  return fs.readFile(path.join(ROOT, relativePath), 'utf8');
}

function assertNoSubstring(
  source: string,
  needle: string,
  fileLabel: string
): string | null {
  if (source.includes(needle)) {
    return `${fileLabel} must not contain ${JSON.stringify(needle)}`;
  }
  return null;
}

async function runSourceContracts(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  const dashboardHome = await readSrc(
    'src/components/dashboard/DashboardHomeView.tsx'
  );
  const adminHome = await readSrc('src/components/admin/AdminHomeView.tsx');
  const standardShell = await readSrc(
    'src/components/dashboard/StandardUserDashboardPage.tsx'
  );
  const adminShell = await readSrc(
    'src/components/admin/SuperAdminDashboardPage.tsx'
  );

  record(
    results,
    'standard Home has no widget fetches',
    !STANDARD_HOME_FORBIDDEN.some((api) => dashboardHome.includes(api)) &&
      !dashboardHome.includes('fetch('),
    'DashboardHomeView is presentational (no fetch / no widget API strings)'
  );

  record(
    results,
    'standard Home does not import module views',
    !dashboardHome.includes('standardDashboardViews') &&
      !dashboardHome.includes('MyClientsWidget') &&
      !dashboardHome.includes('ImportantDatesCalendarWidget'),
    'DashboardHomeView stays free of widget module imports'
  );

  const adminHomeForbiddenHit = ADMIN_HOME_FORBIDDEN.find((api) =>
    adminHome.includes(api)
  );
  record(
    results,
    'admin Home only references KPI snapshot API',
    adminHome.includes('/api/admin/dashboard-kpis') && !adminHomeForbiddenHit,
    adminHomeForbiddenHit
      ? `unexpected ${adminHomeForbiddenHit}`
      : 'AdminHomeView fetches dashboard-kpis only'
  );

  record(
    results,
    'admin Home does not import heavy modules',
    !adminHome.includes("from '@/components/admin/adminDashboardViews'") &&
      !adminHome.includes("from '@/components/admin/MasterPipelineView'") &&
      !adminHome.includes("from '@/components/admin/ConversionFunnelChart'") &&
      !adminHome.includes("from '@/components/admin/RevenueTrackerChart'") &&
      !adminHome.includes("from '@/components/admin/Leaderboards'") &&
      !adminHome.includes(
        "from '@/components/dashboard/ImportantDatesCalendarWidget'"
      ) &&
      !adminHome.includes("import('") &&
      !adminHome.includes('import("'),
    'AdminHomeView has no heavy widget/module imports'
  );

  record(
    results,
    'standard shell lazy-loads modules',
    standardShell.includes("import('@/components/dashboard/standardDashboardViews'") &&
      standardShell.includes("activeView === 'home'") &&
      standardShell.includes('DashboardHomeView'),
    'StandardUserDashboardPage uses dynamic modules + home mount gate'
  );

  const standardShellForbiddenImport = assertNoSubstring(
    standardShell,
    "from '@/components/dashboard/standardDashboardViews'",
    'StandardUserDashboardPage'
  );
  record(
    results,
    'standard shell does not static-import module file',
    standardShellForbiddenImport == null,
    standardShellForbiddenImport ?? 'modules only via next/dynamic'
  );

  record(
    results,
    'admin shell lazy-loads modules',
    adminShell.includes("import('@/components/admin/adminDashboardViews'") &&
      adminShell.includes("activeView === 'home'") &&
      adminShell.includes('AdminHomeView'),
    'SuperAdminDashboardPage uses dynamic modules + home mount gate'
  );

  const adminShellForbiddenImport = assertNoSubstring(
    adminShell,
    "from '@/components/admin/adminDashboardViews'",
    'SuperAdminDashboardPage'
  );
  record(
    results,
    'admin shell does not static-import module file',
    adminShellForbiddenImport == null,
    adminShellForbiddenImport ?? 'modules only via next/dynamic'
  );

  return results;
}

async function tokenForRole(role: UserRole): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { role, status: 'ACTIVE' },
    select: { id: true, email: true, role: true, name: true },
  });
  if (!user) {
    return null;
  }
  return signAuthToken(user);
}

async function timeGet(
  label: string,
  apiPath: string,
  token: string
): Promise<{ label: string; path: string; status: number | 'SKIP'; elapsed: number; bytes: number; note?: string }> {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${apiPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await res.text();
    return {
      label,
      path: apiPath,
      status: res.status,
      elapsed: Math.round(performance.now() - start),
      bytes: Buffer.byteLength(text, 'utf8'),
    };
  } catch (error) {
    return {
      label,
      path: apiPath,
      status: 'SKIP',
      elapsed: Math.round(performance.now() - start),
      bytes: 0,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(BASE_URL, { method: 'GET' });
    return res.status > 0;
  } catch {
    return false;
  }
}

function printManualChecklist() {
  console.log('\n--- Manual Network checklist (browser) ---');
  console.log('1. Hard-refresh /dashboard (Home). Expect ONLY:');
  for (const api of STANDARD_HOME_ALLOWED) {
    console.log(`   - ${api}`);
  }
  console.log('   Must NOT appear:');
  for (const api of STANDARD_HOME_FORBIDDEN) {
    console.log(`   - ${api}`);
  }
  console.log('2. Hard-refresh /admin (Home). Expect ONLY:');
  for (const api of ADMIN_HOME_ALLOWED) {
    console.log(`   - ${api}`);
  }
  console.log('   Must NOT appear:');
  for (const api of ADMIN_HOME_FORBIDDEN) {
    console.log(`   - ${api}`);
  }
  console.log(
    '3. Open one ?view= module; confirm only that module’s API(s) appear.'
  );
  console.log(
    '4. With PERF_LOGGING_ENABLED=true, match server [perf] durationMs for those routes.'
  );
  console.log(
    'Module route microbench (not Home contract): npm run profile:api'
  );
}

async function main() {
  console.log('Dashboard layout shell probe\n');
  console.log(`BASE_URL=${BASE_URL}\n`);

  console.log('=== Source contract (no invented timings) ===\n');
  const sourceResults = await runSourceContracts();
  const sourceFailed = sourceResults.filter((r) => !r.ok);

  printManualChecklist();

  console.log('\n=== Optional Home API round-trips ===\n');
  const reachable = await serverReachable();
  if (!reachable) {
    console.log(
      `[SKIP] Server not reachable at ${BASE_URL} — source contract still ran.`
    );
    console.log(
      'Start the app, then re-run with BASE_URL set to time Home shell APIs.'
    );
  } else {
    const standardToken = await tokenForRole(UserRole.STANDARD_USER);
    const adminToken = await tokenForRole(UserRole.SUPER_ADMIN);

    if (!standardToken) {
      console.log('[SKIP] No ACTIVE STANDARD_USER for /api/me/assignments');
    } else {
      const row = await timeGet(
        'Standard Home shell: assignments',
        '/api/me/assignments',
        standardToken
      );
      console.log(
        `${String(row.elapsed).padStart(4)} ms  status=${row.status}  bytes=${row.bytes}  ${row.label}`
      );
      console.log(`         ${row.path}${row.note ? ` (${row.note})` : ''}`);
    }

    if (!adminToken) {
      console.log('[SKIP] No ACTIVE SUPER_ADMIN for /api/admin/dashboard-kpis');
    } else {
      const row = await timeGet(
        'Admin Home shell: dashboard-kpis',
        '/api/admin/dashboard-kpis',
        adminToken
      );
      console.log(
        `${String(row.elapsed).padStart(4)} ms  status=${row.status}  bytes=${row.bytes}  ${row.label}`
      );
      console.log(`         ${row.path}${row.note ? ` (${row.note})` : ''}`);
    }

    console.log(
      '\nThese timings are single-run client round-trips for Home-allowed APIs only.'
    );
    console.log(
      'They do not prove the browser page avoids forbidden APIs — use Network checklist.'
    );
  }

  console.log('\n=== Summary ===');
  console.log(
    `Source contract: ${sourceResults.length - sourceFailed.length}/${sourceResults.length} passed`
  );

  if (sourceFailed.length > 0) {
    console.error('\nFAIL: Home source contract broken.');
    process.exit(1);
  }

  console.log('PASS: Home source contract holds.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
