/**
 * Hit major API routes and print client-side timings.
 * Server-side `[perf]` logs appear in the dev server terminal when PERF_LOGGING_ENABLED=true.
 *
 * Run: PERF_LOGGING_ENABLED=true npm run dev
 * Then: npx tsx scripts/profile-api-routes.ts
 */
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { signAuthToken } from '../lib/jwt';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

type TimedRoute = {
  label: string;
  path: string;
  role: UserRole;
};

const ROUTES: TimedRoute[] = [
  { label: 'Standard dashboard (legacy monolith)', path: '/api/dashboard/standard', role: UserRole.STANDARD_USER },
  { label: 'Widget: assigned clients', path: '/api/dashboard/widgets/assigned-clients', role: UserRole.STANDARD_USER },
  { label: 'Widget: open tasks', path: '/api/dashboard/widgets/open-tasks', role: UserRole.STANDARD_USER },
  { label: 'Widget: activity feed', path: '/api/dashboard/widgets/activity-feed', role: UserRole.STANDARD_USER },
  { label: 'Widget: performance metrics', path: '/api/dashboard/widgets/performance-metrics', role: UserRole.STANDARD_USER },
  { label: 'Super admin activity feed', path: '/api/dashboard/superadmin', role: UserRole.SUPER_ADMIN },
  { label: 'Admin KPIs', path: '/api/admin/dashboard-kpis', role: UserRole.SUPER_ADMIN },
  { label: 'Admin funnel', path: '/api/admin/funnel-data', role: UserRole.SUPER_ADMIN },
  { label: 'Admin revenue (month)', path: '/api/admin/revenue-tracker?groupBy=month', role: UserRole.SUPER_ADMIN },
  { label: 'Admin leaderboards', path: '/api/admin/leaderboards', role: UserRole.SUPER_ADMIN },
  { label: 'Admin pipeline', path: '/api/admin/pipeline', role: UserRole.SUPER_ADMIN },
  { label: 'Admin reconciliation', path: '/api/admin/all-commission-returnable', role: UserRole.SUPER_ADMIN },
  { label: 'Admin users', path: '/api/admin/users', role: UserRole.SUPER_ADMIN },
  { label: 'My commission returnables', path: '/api/me/commission-returnable', role: UserRole.STANDARD_USER },
];

async function getToken(role: UserRole) {
  const user = await prisma.user.findFirst({
    where: { role, status: 'ACTIVE' },
    select: { id: true, email: true, role: true, name: true },
  });

  if (!user) {
    throw new Error(`No active ${role} user found`);
  }

  return signAuthToken(user);
}

async function timeRequest(label: string, path: string, token: string) {
  const start = performance.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  });
  const elapsed = Math.round(performance.now() - start);
  const status = res.status;
  let size = 0;
  try {
    const text = await res.text();
    size = text.length;
  } catch {
    size = 0;
  }

  return { label, path, status, elapsed, size };
}

async function main() {
  console.log(`Profiling API routes @ ${BASE_URL}\n`);

  const standardToken = await getToken(UserRole.STANDARD_USER);
  const adminToken = await getToken(UserRole.SUPER_ADMIN);

  const standardUser = await prisma.user.findFirst({
    where: { role: UserRole.STANDARD_USER, status: 'ACTIVE' },
    select: { id: true },
  });

  let clientId: string | null = null;
  if (standardUser) {
    const assignment = await prisma.clientAssignment.findFirst({
      where: { userId: standardUser.id },
      select: { clientId: true },
    });
    clientId = assignment?.clientId ?? null;
  }

  const results = [];

  for (const route of ROUTES) {
    const token = route.role === UserRole.SUPER_ADMIN ? adminToken : standardToken;
    results.push(await timeRequest(route.label, route.path, token));
  }

  if (clientId) {
    results.push(
      await timeRequest(
        'Client 360 workspace (strategy-tasks)',
        `/api/clients/${clientId}/workspace?tab=strategy-tasks`,
        standardToken
      )
    );
    results.push(
      await timeRequest(
        'Client 360 workspace (activity-notes)',
        `/api/clients/${clientId}/workspace?tab=activity-notes`,
        adminToken
      )
    );
  }

  results.sort((a, b) => b.elapsed - a.elapsed);

  console.log('Client-side round-trip (sorted slowest first):\n');
  console.log('ms     status  bytes   route');
  console.log('----   ------  -----   -----');
  for (const row of results) {
    const flag = row.elapsed >= 500 ? ' ⚠️' : row.elapsed >= 200 ? ' ~' : '';
    console.log(
      `${String(row.elapsed).padStart(4)}   ${String(row.status).padStart(3)}   ${String(row.size).padStart(5)}   ${row.label}${flag}`
    );
  }

  console.log('\nCheck the dev server terminal for server-side `[perf]` lines (route:... and cache:...).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
