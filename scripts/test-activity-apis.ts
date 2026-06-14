/**
 * One-off integration test for dashboard activity APIs.
 * Run: npx tsx scripts/test-activity-apis.ts
 */
import { UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { signAuthToken } from '../lib/jwt';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';

type TestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: TestResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  const icon = ok ? 'PASS' : 'FAIL';
  console.log(`[${icon}] ${name}: ${detail}`);
}

function isGroupedActivityShape(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  return data.every((group) => {
    if (!group || typeof group !== 'object') return false;
    const g = group as Record<string, unknown>;
    if (typeof g.clientId !== 'string' || typeof g.clientName !== 'string') return false;
    if (!Array.isArray(g.activities)) return false;
    return g.activities.every((activity) => {
      if (!activity || typeof activity !== 'object') return false;
      const a = activity as Record<string, unknown>;
      return (
        typeof a.activityId === 'string' &&
        typeof a.log === 'string' &&
        typeof a.timestamp === 'string' &&
        typeof a.isUnread === 'boolean'
      );
    });
  });
}

async function authFetch(path: string, token: string, init?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function main() {
  console.log(`Testing against ${BASE_URL}\n`);

  const [standardUser, superAdmin] = await Promise.all([
    prisma.user.findFirst({
      where: { role: UserRole.STANDARD_USER },
      select: { id: true, email: true, role: true, name: true },
    }),
    prisma.user.findFirst({
      where: { role: UserRole.SUPER_ADMIN },
      select: { id: true, email: true, role: true, name: true },
    }),
  ]);

  if (!standardUser) {
    record('setup', false, 'No STANDARD_USER found in database');
  } else {
    record('setup', true, `Standard user: ${standardUser.email}`);
  }

  if (!superAdmin) {
    record('setup', false, 'No SUPER_ADMIN found in database');
  } else {
    record('setup', true, `Super admin: ${superAdmin.email}`);
  }

  if (!standardUser || !superAdmin) {
    printSummary();
    process.exit(1);
  }

  const standardToken = await signAuthToken(standardUser);
  const adminToken = await signAuthToken(superAdmin);

  // Standard dashboard
  const standardRes = await authFetch('/api/dashboard/standard', standardToken);
  const standardBody = await standardRes.json();
  record(
    'GET /api/dashboard/standard',
    standardRes.ok && isGroupedActivityShape(standardBody.recentActivity),
    standardRes.ok
      ? `status ${standardRes.status}, groups=${standardBody.recentActivity?.length ?? 0}`
      : `status ${standardRes.status}, error=${standardBody.error ?? 'unknown'}`
  );

  // Super admin dashboard
  const adminRes = await authFetch('/api/dashboard/superadmin', adminToken);
  const adminBody = await adminRes.json();
  record(
    'GET /api/dashboard/superadmin',
    adminRes.ok && isGroupedActivityShape(adminBody.recentActivity),
    adminRes.ok
      ? `status ${adminRes.status}, groups=${adminBody.recentActivity?.length ?? 0}`
      : `status ${adminRes.status}, error=${adminBody.error ?? 'unknown'}`
  );

  // Forbidden: standard user on superadmin endpoint
  const forbiddenRes = await authFetch('/api/dashboard/superadmin', standardToken);
  record(
    'GET /api/dashboard/superadmin (standard user forbidden)',
    forbiddenRes.status === 403,
    `status ${forbiddenRes.status}`
  );

  // Mark as read
  const unreadIds =
    (standardBody.recentActivity as Array<{
      activities: Array<{ activityId: string; isUnread: boolean }>;
    }> | undefined)
      ?.flatMap((group) =>
        group.activities.filter((a) => a.isUnread).map((a) => a.activityId)
      )
      .slice(0, 3) ?? [];

  if (unreadIds.length === 0) {
    record(
      'POST /api/activity/mark-read',
      true,
      'skipped — no unread activities for standard user (endpoint still tested with empty array)'
    );
    const emptyMarkRes = await authFetch('/api/activity/mark-read', standardToken, {
      method: 'POST',
      body: JSON.stringify({ activityLogIds: [] }),
    });
    const emptyMarkBody = await emptyMarkRes.json();
    record(
      'POST /api/activity/mark-read (empty array)',
      emptyMarkRes.ok && emptyMarkBody.success === true,
      `status ${emptyMarkRes.status}, marked=${emptyMarkBody.marked}`
    );
  } else {
    const markRes = await authFetch('/api/activity/mark-read', standardToken, {
      method: 'POST',
      body: JSON.stringify({ activityLogIds: unreadIds }),
    });
    const markBody = await markRes.json();
    record(
      'POST /api/activity/mark-read',
      markRes.ok && markBody.success === true && markBody.marked > 0,
      `status ${markRes.status}, marked=${markBody.marked}, ids=${unreadIds.length}`
    );

    const standardRes2 = await authFetch('/api/dashboard/standard', standardToken);
    const standardBody2 = await standardRes2.json();
    const stillUnread = (
      standardBody2.recentActivity as Array<{
        activities: Array<{ activityId: string; isUnread: boolean }>;
      }>
    )
      ?.flatMap((group) => group.activities)
      .filter((a) => unreadIds.includes(a.activityId) && a.isUnread);

    record(
      'Read status persisted',
      (stillUnread?.length ?? 0) === 0,
      `${stillUnread?.length ?? 0} marked items still unread after mark-read`
    );
  }

  // Page routes
  const dashboardPage = await fetch(`${BASE_URL}/dashboard`);
  record(
    'GET /dashboard page',
    dashboardPage.status === 200 || dashboardPage.status === 307,
    `status ${dashboardPage.status}`
  );

  const adminPage = await fetch(`${BASE_URL}/admin`);
  record(
    'GET /admin page',
    adminPage.status === 200 || adminPage.status === 307,
    `status ${adminPage.status}`
  );

  printSummary();
  await prisma.$disconnect();
}

function printSummary() {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error('Test run failed:', error);
  await prisma.$disconnect();
  process.exit(1);
});
