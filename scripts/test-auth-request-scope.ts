/**
 * Phase 3A/3B — request-local auth memoization + auth User shape.
 *
 * Verifies:
 * - getAuthenticatedUserFromRequest pays User lookup once per Request
 * - returned auth user has the expected select shape
 * - valid JWT for a missing User returns 404 without session fallback
 *
 * Run: npm run test:auth-request-scope
 * Or:  npx tsx scripts/test-auth-request-scope.ts
 */
import { ClientStatus, UserRole, UserStatus } from '@prisma/client';
import {
  authUserSelect,
  getAuthenticatedUserFromRequest,
  hasClientAssignment,
} from '../lib/authHelpers';
import { authUserPrisma } from '../lib/authUserPrisma';
import { requireStrategyViewAccess } from '../lib/clientStrategyPermissions';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

const RUN_ID = Date.now();
const TEST_EMAIL_DOMAIN = 'example.test';

type TestResult = { name: string; ok: boolean; detail: string };
const results: TestResult[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const email = `auth-scope-${RUN_ID}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Auth Scope ${RUN_ID}`,
      role: UserRole.SUPER_ADMIN,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true, role: true, name: true, status: true },
  });

  const client = await prisma.client.create({
    data: {
      name: `AUTH SCOPE CLIENT ${RUN_ID}`,
      email: `auth-scope-client-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      status: ClientStatus.NEW_LEAD,
    },
    select: { id: true },
  });

  const missingUserId = `missing-user-${RUN_ID}`;

  try {
    assert(
      Object.keys(authUserSelect).sort().join(',') ===
        'email,id,name,role,status',
      `unexpected authUserSelect keys: ${Object.keys(authUserSelect).join(',')}`
    );
    record(
      'authUserSelect is id,role,name,email,status (no joins)',
      true,
      Object.keys(authUserSelect).join(',')
    );

    const token = await signAuthToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    const request = new Request('http://localhost/api/test-auth-scope', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const originalFindUnique = authUserPrisma.user.findUnique.bind(
      authUserPrisma.user
    );
    let userLookupCount = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (authUserPrisma.user as any).findUnique = async (...args: unknown[]) => {
      userLookupCount += 1;
      return (originalFindUnique as (...a: unknown[]) => unknown)(...args);
    };

    try {
      const first = await getAuthenticatedUserFromRequest(request);
      assert(!first.error, 'first auth should succeed');
      assert(first.user?.id === user.id, 'first auth user id');
      assert(first.user?.role === user.role, 'auth role');
      assert(first.user?.email === user.email, 'auth email');
      assert(first.user?.name === user.name, 'auth name');
      assert(first.user?.status === UserStatus.ACTIVE, 'auth status ACTIVE');
      record(
        'auth user shape includes id,role,name,email,status',
        true,
        `id=${first.user!.id.slice(0, 8)}… role=${first.user!.role}`
      );

      const afterFirst = userLookupCount;
      assert(
        afterFirst === 1,
        `expected 1 user lookup after first auth, got ${afterFirst}`
      );

      const second = await getAuthenticatedUserFromRequest(request);
      assert(!second.error, 'second auth should succeed');
      assert(second.user?.id === user.id, 'second auth user id');
      assert(
        userLookupCount === afterFirst,
        `second auth on same Request must not re-query User (lookups=${userLookupCount})`
      );

      record(
        'same Request: second getAuthenticatedUserFromRequest skips User lookup',
        true,
        `lookups=${userLookupCount}`
      );

      const otherRequest = new Request('http://localhost/api/test-auth-scope-2', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const third = await getAuthenticatedUserFromRequest(otherRequest);
      assert(!third.error, 'third auth should succeed');
      record(
        'same Bearer token on new Request: auth still succeeds',
        true,
        `lookups=${userLookupCount} (token cache may share User row)`
      );

      const beforeStrategy = userLookupCount;
      const strategy = await requireStrategyViewAccess(client.id, request, {
        user: first.user!,
      });
      assert(!strategy.error, 'strategy view with passed user');
      assert(
        userLookupCount === beforeStrategy,
        `requireStrategyViewAccess({ user }) must not call auth User lookup (lookups=${userLookupCount})`
      );
      record(
        'requireStrategyViewAccess with pre-resolved user skips auth lookup',
        true,
        `lookups unchanged at ${userLookupCount}`
      );

      const assignA = await hasClientAssignment(user.id, client.id);
      const assignB = await hasClientAssignment(user.id, client.id);
      assert(
        (assignA?.assignmentId ?? null) === (assignB?.assignmentId ?? null),
        'assignment cache returns same shape'
      );
      record(
        'hasClientAssignment repeated calls return consistent result',
        true,
        `assignment=${assignA?.assignmentId ?? 'none'}`
      );
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (authUserPrisma.user as any).findUnique = originalFindUnique;
    }

    const missingToken = await signAuthToken({
      id: missingUserId,
      email: `missing-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      role: UserRole.STANDARD_USER,
      name: 'Missing',
    });
    const missingRequest = new Request(
      'http://localhost/api/test-auth-missing-user',
      { headers: { Authorization: `Bearer ${missingToken}` } }
    );
    const missing = await getAuthenticatedUserFromRequest(missingRequest);
    assert(Boolean(missing.error), 'missing User must error');
    assert(
      missing.error?.status === 404,
      `expected 404 for missing User, got ${missing.error?.status}`
    );
    record(
      'valid JWT + missing User returns 404 without session fallback',
      true,
      `status=${missing.error?.status}`
    );
  } finally {
    await prisma.client.delete({ where: { id: client.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
  }
}

main()
  .then(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(
      `\nSummary: ${results.length - failed.length}/${results.length} passed`
    );
    if (failed.length > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    if (authUserPrisma !== prisma) {
      await authUserPrisma.$disconnect().catch(() => undefined);
    }
  });
