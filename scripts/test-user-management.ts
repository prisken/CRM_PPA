/**
 * Integration tests for user management + dashboard auth.
 * Run: npx tsx scripts/test-user-management.ts
 */
import { UserRole, UserStatus } from '@prisma/client';
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

function getDisplayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

async function main() {
  console.log(`Testing against ${BASE_URL}\n`);

  const superAdmin = await prisma.user.findFirst({
    where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
    select: { id: true, email: true, role: true, name: true },
  });

  const standardUser = await prisma.user.findFirst({
    where: {
      role: UserRole.STANDARD_USER,
      status: UserStatus.ACTIVE,
      NOT: { email: { contains: 'deactivate-test' } },
    },
    select: { id: true, email: true, role: true, name: true },
  });

  if (!superAdmin || !standardUser) {
    record('setup', false, 'Missing super admin or standard user');
    printSummary();
    process.exit(1);
  }

  record('setup', true, `Admin=${superAdmin.email}, User=${standardUser.email}`);

  const adminToken = await signAuthToken(superAdmin);
  const standardToken = await signAuthToken(standardUser);

  // --- User list ---
  const usersRes = await authFetch('/api/admin/users', adminToken);
  const usersBody = await usersRes.json();
  record(
    'GET /api/admin/users',
    usersRes.ok &&
      Array.isArray(usersBody) &&
      usersBody.every(
        (u: Record<string, unknown>) =>
          typeof u.user_id === 'string' &&
          typeof u.email === 'string' &&
          typeof u.status === 'string'
      ),
    usersRes.ok
      ? `status ${usersRes.status}, count=${usersBody.length}`
      : `status ${usersRes.status}, error=${usersBody.error ?? 'unknown'}`
  );

  // --- Standard user forbidden on admin users ---
  const forbiddenUsersRes = await authFetch('/api/admin/users', standardToken);
  record(
    'GET /api/admin/users (standard user forbidden)',
    forbiddenUsersRes.status === 403,
    `status ${forbiddenUsersRes.status}`
  );

  // --- Dashboard widgets (standard user) ---
  const widgetPaths = [
    '/api/dashboard/widgets/assigned-clients',
    '/api/dashboard/widgets/open-tasks',
    '/api/dashboard/widgets/activity-feed',
    '/api/dashboard/widgets/performance-metrics',
  ];

  for (const path of widgetPaths) {
    const res = await authFetch(path, standardToken);
    const body = await res.json().catch(() => ({}));
    record(
      `GET ${path}`,
      res.ok,
      res.ok ? `status ${res.status}` : `status ${res.status}, error=${body.error ?? 'unknown'}`
    );
  }

  // --- Super admin dashboard ---
  const adminDashRes = await authFetch('/api/dashboard/superadmin', adminToken);
  const adminDashBody = await adminDashRes.json();
  record(
    'GET /api/dashboard/superadmin',
    adminDashRes.ok && Array.isArray(adminDashBody.recentActivity),
    adminDashRes.ok
      ? `status ${adminDashRes.status}, groups=${adminDashBody.recentActivity?.length ?? 0}`
      : `status ${adminDashRes.status}, error=${adminDashBody.error ?? 'unknown'}`
  );

  // --- Deactivate flow (use dedicated test user or temp deactivate standard user) ---
  const deactivateTarget = standardUser;
  const displayName = getDisplayName(deactivateTarget);

  const wrongNameRes = await authFetch(
    `/api/users/${deactivateTarget.id}/deactivate`,
    adminToken,
    {
      method: 'POST',
      body: JSON.stringify({ confirmName: 'wrong-name' }),
    }
  );
  record(
    'POST deactivate (wrong name rejected)',
    wrongNameRes.status === 400,
    `status ${wrongNameRes.status}`
  );

  const selfDeactivateRes = await authFetch(
    `/api/users/${superAdmin.id}/deactivate`,
    adminToken,
    {
      method: 'POST',
      body: JSON.stringify({ confirmName: getDisplayName(superAdmin) }),
    }
  );
  record(
    'POST deactivate (self blocked)',
    selfDeactivateRes.status === 400,
    `status ${selfDeactivateRes.status}`
  );

  const deactivateRes = await authFetch(
    `/api/users/${deactivateTarget.id}/deactivate`,
    adminToken,
    {
      method: 'POST',
      body: JSON.stringify({ confirmName: displayName }),
    }
  );
  const deactivateBody = await deactivateRes.json();
  record(
    'POST deactivate (success)',
    deactivateRes.ok && deactivateBody.status === 'DEACTIVATED',
    deactivateRes.ok
      ? `status ${deactivateRes.status}`
      : `status ${deactivateRes.status}, error=${deactivateBody.error ?? 'unknown'}`
  );

  const deactivatedToken = await signAuthToken(deactivateTarget);
  const blockedRes = await authFetch(
    '/api/dashboard/widgets/assigned-clients',
    deactivatedToken
  );
  const blockedBody = await blockedRes.json().catch(() => ({}));
  record(
    'Deactivated user blocked from API',
    blockedRes.status === 403 && blockedBody.error === 'Account deactivated',
    `status ${blockedRes.status}, error=${blockedBody.error ?? 'unknown'}`
  );

  await prisma.user.update({
    where: { id: deactivateTarget.id },
    data: { status: UserStatus.ACTIVE },
  });
  record('cleanup', true, `Reactivated ${deactivateTarget.email}`);

  const reactivatedRes = await authFetch(
    '/api/dashboard/widgets/assigned-clients',
    deactivatedToken
  );
  record(
    'Reactivated user can access API',
    reactivatedRes.ok,
    `status ${reactivatedRes.status}`
  );

  // --- Delete validation (no actual delete) ---
  const wrongPasswordRes = await authFetch(
    `/api/users/${deactivateTarget.id}`,
    adminToken,
    {
      method: 'DELETE',
      body: JSON.stringify({
        confirmName: displayName,
        password: 'definitely-wrong-password-123',
      }),
    }
  );
  record(
    'DELETE user (wrong password rejected)',
    wrongPasswordRes.status === 403,
    `status ${wrongPasswordRes.status}`
  );

  const selfDeleteRes = await authFetch(`/api/users/${superAdmin.id}`, adminToken, {
    method: 'DELETE',
    body: JSON.stringify({
      confirmName: getDisplayName(superAdmin),
      password: 'any-password',
    }),
  });
  record(
    'DELETE user (self blocked)',
    selfDeleteRes.status === 400,
    `status ${selfDeleteRes.status}`
  );

  // --- Pages ---
  for (const path of ['/admin/users', '/admin', '/dashboard']) {
    const pageRes = await fetch(`${BASE_URL}${path}`);
    record(
      `GET ${path} page`,
      pageRes.status === 200 || pageRes.status === 307,
      `status ${pageRes.status}`
    );
  }

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
