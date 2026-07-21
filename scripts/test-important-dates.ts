/**
 * Important Dates — time support, CRUD, and permission tests.
 *
 * Covers create with/without time, update time, date-only fetch/render helpers,
 * unauthorized create, assigned user access, and SUPER_ADMIN manage/view.
 *
 * Run: npm run test:important-dates
 * Or:  npx tsx scripts/test-important-dates.ts
 */
import {
  AssignmentRole,
  ClientStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import {
  formatImportantDateCardParts,
  formatImportantDateOnly,
  formatImportantDateSummary,
  hasImportantDateTime,
} from '../src/components/clients/importantDateDisplay';
import {
  canManageImportantDate,
  canViewAllImportantDates,
  canViewImportantDate,
} from '../lib/importantDatePermissions';
import {
  fetchImportantDatesCalendarEvents,
  parseImportantDatesCalendarQuery,
  buildUtcRangeFromDateOnly,
} from '../lib/importantDatesCalendar';
import {
  formatImportantDateRecord,
  getUtcDateOnly,
  getUtcTimeOnly,
  resolveImportantDatesForClient,
} from '../lib/importantDates';
import {
  combineDateAndOptionalTime,
  normalizeImportantTime,
  parseImportantDateInput,
  parseImportantDateUpdateInput,
} from '../lib/importantDateValidation';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import {
  GET as getImportantDates,
  POST as createImportantDate,
} from '../src/app/api/clients/[id]/important-dates/route';
import {
  PUT as updateImportantDate,
} from '../src/app/api/clients/[id]/important-dates/[dateId]/route';
import { GET as getCalendarEvents } from '../src/app/api/dashboard/widgets/important-dates-calendar/route';

const RUN_ID = Date.now();
const TEST_EMAIL_DOMAIN = 'example.test';

type TestResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const results: TestResult[] = [];

const created = {
  userIds: [] as string[],
  clientIds: [] as string[],
  importantDateIds: [] as string[],
};

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function createUser(key: string, role: UserRole) {
  const email = `important-dates-${key}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Important Dates ${key}`,
      role,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true, role: true, name: true },
  });
  created.userIds.push(user.id);
  return user;
}

async function createClient(
  label: string,
  status: ClientStatus = ClientStatus.ACTIVE_CLIENT
) {
  const client = await prisma.client.create({
    data: {
      name: `IMPORTANT DATES ${label} ${RUN_ID}`,
      email: `important-dates-${label.toLowerCase()}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      company: `Important Dates Co ${RUN_ID}`,
      status,
    },
    select: { id: true, name: true, status: true },
  });
  created.clientIds.push(client.id);
  return client;
}

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

function authRequest(path: string, token: string, init?: RequestInit) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function cleanup() {
  try {
    if (created.importantDateIds.length > 0) {
      await prisma.clientImportantDate.deleteMany({
        where: { id: { in: created.importantDateIds } },
      });
    }

    if (created.clientIds.length > 0) {
      await prisma.clientImportantDate.deleteMany({
        where: { clientId: { in: created.clientIds } },
      });
      await prisma.clientActivityLog.deleteMany({
        where: { clientId: { in: created.clientIds } },
      });
      await prisma.clientAssignment.deleteMany({
        where: { clientId: { in: created.clientIds } },
      });
      await prisma.client.deleteMany({
        where: { id: { in: created.clientIds } },
      });
    }
  } catch (error) {
    // Table may not exist yet if migration hasn't been applied — still clean users/clients.
    console.warn('Important-date cleanup skipped/partial:', error);
    if (created.clientIds.length > 0) {
      await prisma.clientAssignment.deleteMany({
        where: { clientId: { in: created.clientIds } },
      }).catch(() => undefined);
      await prisma.clientActivityLog.deleteMany({
        where: { clientId: { in: created.clientIds } },
      }).catch(() => undefined);
      await prisma.client.deleteMany({
        where: { id: { in: created.clientIds } },
      }).catch(() => undefined);
    }
  }

  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: created.userIds } },
    });
  }
}

async function main() {
  console.log(`Important Dates tests @ ${new Date().toISOString()}`);
  console.log(`Run ID: ${RUN_ID}\n`);

  // --- Validation / combine helpers ---
  {
    const withTime = combineDateAndOptionalTime('2026-07-15', '14:30');
    record(
      'combineDateAndOptionalTime (date + time)',
      withTime.ok &&
        withTime.data.hasTime === true &&
        withTime.data.scheduledAt.toISOString() ===
          '2026-07-15T14:30:00.000Z',
      withTime.ok ? withTime.data.scheduledAt.toISOString() : withTime.error
    );

    const dateOnly = combineDateAndOptionalTime('2026-07-15', null);
    record(
      'combineDateAndOptionalTime (date only)',
      dateOnly.ok &&
        dateOnly.data.hasTime === false &&
        dateOnly.data.time === null &&
        dateOnly.data.scheduledAt.toISOString() ===
          '2026-07-15T00:00:00.000Z',
      dateOnly.ok ? 'all-day UTC midnight' : dateOnly.error
    );

    const parsedWithTime = parseImportantDateInput({
      label: 'Kickoff',
      date: '2026-07-20',
      time: '09:15',
      notes: 'Bring docs',
    });
    record(
      'parseImportantDateInput (date + time)',
      parsedWithTime.ok &&
        parsedWithTime.data.hasTime &&
        parsedWithTime.data.time === '09:15',
      parsedWithTime.ok ? parsedWithTime.data.scheduledAt : parsedWithTime.error
    );

    const parsedDateOnly = parseImportantDateInput({
      label: 'Renewal',
      date: '2026-08-01',
    });
    record(
      'parseImportantDateInput (date only)',
      parsedDateOnly.ok &&
        !parsedDateOnly.data.hasTime &&
        parsedDateOnly.data.time === null,
      parsedDateOnly.ok ? 'ok' : parsedDateOnly.error
    );

    const updateTime = parseImportantDateUpdateInput({ time: '16:45' });
    record(
      'parseImportantDateUpdateInput (time only)',
      updateTime.ok && updateTime.data.time === '16:45',
      updateTime.ok ? 'ok' : updateTime.error
    );

    const seconds = normalizeImportantTime('14:30:00');
    record(
      'normalizeImportantTime strips seconds',
      seconds.ok && seconds.data === '14:30',
      seconds.ok ? String(seconds.data) : seconds.error
    );

    const withSeconds = combineDateAndOptionalTime('2026-07-15', '14:30:00');
    record(
      'combineDateAndOptionalTime accepts HH:mm:ss',
      withSeconds.ok &&
        withSeconds.data.time === '14:30' &&
        withSeconds.data.scheduledAt.toISOString() ===
          '2026-07-15T14:30:00.000Z',
      withSeconds.ok ? withSeconds.data.scheduledAt.toISOString() : withSeconds.error
    );

    const range = buildUtcRangeFromDateOnly('2026-07-01', '2026-07-31');
    const jul1 = new Date('2026-07-01T00:00:00.000Z');
    const jul31Late = new Date('2026-07-31T23:59:00.000Z');
    const aug1 = new Date('2026-08-01T00:00:00.000Z');
    record(
      'Date range includes start and end calendar days (UTC exclusive end)',
      range.ok &&
        jul1 >= range.rangeStart &&
        jul1 < range.rangeEndExclusive &&
        jul31Late >= range.rangeStart &&
        jul31Late < range.rangeEndExclusive &&
        !(aug1 >= range.rangeStart && aug1 < range.rangeEndExclusive) &&
        range.rangeEndExclusive.toISOString() === '2026-08-01T00:00:00.000Z',
      range.ok
        ? `${range.rangeStart.toISOString()} → ${range.rangeEndExclusive.toISOString()}`
        : range.error
    );

    // Date-only midnight must keep calendar day (no local-day-before shift).
    const dateOnlyDisplay = formatImportantDateOnly('2026-07-15');
    const utcSafe = new Date('2026-07-15T00:00:00.000Z').toLocaleDateString(
      undefined,
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }
    );
    record(
      'Date-only display uses UTC wall day (no local shift)',
      dateOnlyDisplay === utcSafe && /\b15\b/.test(dateOnlyDisplay),
      `display=${dateOnlyDisplay}`
    );

    const recordTimed = formatImportantDateRecord({
      id: 'tmp',
      label: 'Call',
      scheduledAt: new Date('2026-07-15T14:30:00.000Z'),
      hasTime: true,
      notes: null,
    });
    record(
      'Stored timed record round-trips date/time via UTC components',
      recordTimed.date === '2026-07-15' &&
        recordTimed.time === '14:30' &&
        getUtcDateOnly(new Date(recordTimed.scheduledAt)) === '2026-07-15' &&
        getUtcTimeOnly(new Date(recordTimed.scheduledAt)) === '14:30',
      JSON.stringify(recordTimed)
    );
  }

  // --- Display helpers for date-only + timed ---
  {
    const timed = {
      label: 'Call',
      date: '2026-07-15',
      time: '14:30',
      hasTime: true,
    };
    const dateOnly = {
      label: 'Anniversary',
      date: '2026-12-01',
      time: null,
      hasTime: false,
    };

    record(
      'display has time',
      hasImportantDateTime(timed) === true &&
        formatImportantDateSummary(timed).includes('·'),
      formatImportantDateSummary(timed)
    );

    const cardParts = formatImportantDateCardParts(dateOnly);
    record(
      'display date-only shows No time set',
      !hasImportantDateTime(dateOnly) &&
        cardParts.hasTime === false &&
        cardParts.timeLabel === 'No time set' &&
        formatImportantDateOnly(dateOnly.date).length > 0,
      `${cardParts.dateLabel} · ${cardParts.timeLabel}`
    );
  }

  const [superAdmin, relationshipUser, outsider] = await Promise.all([
    createUser('admin', UserRole.SUPER_ADMIN),
    createUser('relationship', UserRole.STANDARD_USER),
    createUser('outsider', UserRole.STANDARD_USER),
  ]);

  const client = await createClient('CLIENT', ClientStatus.ACTIVE_CLIENT);
  const lead = await createClient('LEAD', ClientStatus.NEW_LEAD);

  await prisma.clientAssignment.create({
    data: {
      clientId: client.id,
      userId: relationshipUser.id,
      role: AssignmentRole.RELATIONSHIP,
    },
  });

  await prisma.clientAssignment.create({
    data: {
      clientId: lead.id,
      userId: relationshipUser.id,
      role: AssignmentRole.RELATIONSHIP,
    },
  });

  const adminToken = await tokenFor(superAdmin);
  const relationshipToken = await tokenFor(relationshipUser);
  const outsiderToken = await tokenFor(outsider);

  // --- Permission helpers ---
  record(
    'canViewAllImportantDates (SUPER_ADMIN)',
    canViewAllImportantDates(superAdmin) === true,
    'true'
  );
  record(
    'canViewAllImportantDates (STANDARD_USER)',
    canViewAllImportantDates(relationshipUser) === false,
    'false'
  );

  record(
    'canViewImportantDate (assigned)',
    await canViewImportantDate(relationshipUser, { clientId: client.id }),
    'allowed'
  );
  record(
    'canViewImportantDate (outsider)',
    !(await canViewImportantDate(outsider, { clientId: client.id })),
    'denied'
  );

  record(
    'canManageImportantDate SUPER_ADMIN',
    await canManageImportantDate(superAdmin, 'Client', client.id),
    'allowed'
  );
  record(
    'canManageImportantDate assigned RELATIONSHIP',
    await canManageImportantDate(relationshipUser, 'Client', client.id),
    'allowed'
  );
  record(
    'canManageImportantDate outsider',
    !(await canManageImportantDate(outsider, 'Client', client.id)),
    'denied'
  );

  // Phase 2I.1: 403-first list GET — no existence leak; admin missing → 404
  {
    const missingClientId = `missing-client-dates-${RUN_ID}`;
    const outsiderListExisting = await getImportantDates(
      authRequest(
        `/api/clients/${client.id}/important-dates`,
        outsiderToken
      ),
      { params: Promise.resolve({ id: client.id }) }
    );
    record(
      'GET /important-dates (outsider existing client 403)',
      outsiderListExisting.status === 403,
      `status ${outsiderListExisting.status}`
    );

    const outsiderListMissing = await getImportantDates(
      authRequest(
        `/api/clients/${missingClientId}/important-dates`,
        outsiderToken
      ),
      { params: Promise.resolve({ id: missingClientId }) }
    );
    record(
      'GET /important-dates (outsider missing client 403)',
      outsiderListMissing.status === 403,
      `status ${outsiderListMissing.status}`
    );

    const adminListMissing = await getImportantDates(
      authRequest(
        `/api/clients/${missingClientId}/important-dates`,
        adminToken
      ),
      { params: Promise.resolve({ id: missingClientId }) }
    );
    const adminMissingBody = (await adminListMissing.json()) as {
      error?: string;
    };
    record(
      'GET /important-dates (SUPER_ADMIN missing client 404)',
      adminListMissing.status === 404 &&
        adminMissingBody.error === 'Client not found',
      `status ${adminListMissing.status} error=${adminMissingBody.error ?? ''}`
    );
  }

  // --- 1. Create with date + time (assigned user) ---
  let timedDateId = '';
  {
    const req = authRequest(
      `/api/clients/${client.id}/important-dates`,
      relationshipToken,
      {
        method: 'POST',
        body: JSON.stringify({
          label: 'Kickoff call',
          date: '2026-07-15',
          time: '14:30',
          notes: 'Bring checklist',
          clientId: client.id,
        }),
      }
    );
    const res = await createImportantDate(req, {
      params: Promise.resolve({ id: client.id }),
    });
    const body = await res.json();
    const ok =
      res.status === 201 &&
      body.importantDate?.hasTime === true &&
      body.importantDate?.time === '14:30' &&
      body.importantDate?.scheduledAt === '2026-07-15T14:30:00.000Z';
    if (ok && body.importantDate?.id) {
      timedDateId = body.importantDate.id;
      created.importantDateIds.push(timedDateId);
    }
    record(
      'Create important date with date and time',
      ok,
      ok ? timedDateId : JSON.stringify(body)
    );
  }

  // --- 2. Create date-only ---
  let dateOnlyId = '';
  {
    const req = authRequest(
      `/api/clients/${client.id}/important-dates`,
      relationshipToken,
      {
        method: 'POST',
        body: JSON.stringify({
          label: 'Contract anniversary',
          date: '2026-12-01',
        }),
      }
    );
    const res = await createImportantDate(req, {
      params: Promise.resolve({ id: client.id }),
    });
    const body = await res.json();
    const ok =
      res.status === 201 &&
      body.importantDate?.hasTime === false &&
      body.importantDate?.time === null &&
      body.importantDate?.date === '2026-12-01';
    if (ok && body.importantDate?.id) {
      dateOnlyId = body.importantDate.id;
      created.importantDateIds.push(dateOnlyId);
    }
    record(
      'Create important date with date only',
      ok,
      ok ? dateOnlyId : JSON.stringify(body)
    );
  }

  // --- 3. Update important date time ---
  {
    if (!dateOnlyId) {
      record(
        'Update important date time',
        false,
        'skipped — date-only create failed'
      );
    } else {
      const req = authRequest(
        `/api/clients/${client.id}/important-dates/${dateOnlyId}`,
        relationshipToken,
        {
          method: 'PUT',
          body: JSON.stringify({
            time: '10:00',
          }),
        }
      );
      const res = await updateImportantDate(req, {
        params: Promise.resolve({ id: client.id, dateId: dateOnlyId }),
      });
      const body = await res.json();
      const ok =
        res.status === 200 &&
        body.importantDate?.hasTime === true &&
        body.importantDate?.time === '10:00' &&
        body.importantDate?.date === '2026-12-01' &&
        body.importantDate?.scheduledAt === '2026-12-01T10:00:00.000Z';
      record(
        'Update important date time',
        ok,
        ok ? body.importantDate.scheduledAt : JSON.stringify(body)
      );
    }
  }

  // --- 4. Existing date-only records still fetch/render ---
  {
    // Seed a raw all-day row (as if migrated from JSON)
    const legacy = await prisma.clientImportantDate.create({
      data: {
        clientId: client.id,
        label: 'Legacy all-day',
        scheduledAt: new Date(Date.UTC(2026, 5, 1, 0, 0, 0, 0)),
        hasTime: false,
        notes: null,
        createdByUserId: superAdmin.id,
      },
      select: {
        id: true,
        label: true,
        scheduledAt: true,
        hasTime: true,
        notes: true,
      },
    });
    created.importantDateIds.push(legacy.id);

    const formatted = formatImportantDateRecord(legacy);
    record(
      'Date-only record format helper',
      formatted.date === '2026-06-01' &&
        formatted.time === null &&
        formatted.hasTime === false,
      JSON.stringify(formatted)
    );

    const resolved = resolveImportantDatesForClient({
      records: [legacy],
      legacyJson: null,
    });
    record(
      'Date-only record resolveImportantDatesForClient',
      resolved.length === 1 &&
        resolved[0].date === '2026-06-01' &&
        resolved[0].time === null,
      JSON.stringify(resolved[0])
    );

    const listReq = authRequest(
      `/api/clients/${client.id}/important-dates`,
      relationshipToken
    );
    const listRes = await getImportantDates(listReq, {
      params: Promise.resolve({ id: client.id }),
    });
    const listBody = await listRes.json();
    const legacyInList = (listBody.importantDates ?? []).find(
      (entry: { id?: string }) => entry.id === legacy.id
    );
    record(
      'Date-only record fetch via API',
      listRes.status === 200 &&
        legacyInList?.hasTime === false &&
        legacyInList?.time === null &&
        legacyInList?.date === '2026-06-01',
      legacyInList ? JSON.stringify(legacyInList) : `status ${listRes.status}`
    );
  }

  // --- 5. Unauthorized cannot create for unassigned ---
  {
    const req = authRequest(
      `/api/clients/${client.id}/important-dates`,
      outsiderToken,
      {
        method: 'POST',
        body: JSON.stringify({
          label: 'Should fail',
          date: '2026-09-01',
          time: '11:00',
        }),
      }
    );
    const res = await createImportantDate(req, {
      params: Promise.resolve({ id: client.id }),
    });
    record(
      'Unauthorized user cannot create for unassigned client',
      res.status === 403,
      `status ${res.status}`
    );
  }

  // --- 6. Assigned user can create/view (lead) ---
  {
    const createReq = authRequest(
      `/api/clients/${lead.id}/important-dates`,
      relationshipToken,
      {
        method: 'POST',
        body: JSON.stringify({
          label: 'Lead follow-up',
          date: '2026-07-22',
          time: '15:00',
          leadId: lead.id,
        }),
      }
    );
    const createRes = await createImportantDate(createReq, {
      params: Promise.resolve({ id: lead.id }),
    });
    const createBody = await createRes.json();
    const createdOk =
      createRes.status === 201 && Boolean(createBody.importantDate?.id);
    if (createdOk) {
      created.importantDateIds.push(createBody.importantDate.id);
    }
    record(
      'Assigned user can create for assigned lead',
      createdOk,
      createdOk ? createBody.importantDate.id : JSON.stringify(createBody)
    );

    const listReq = authRequest(
      `/api/clients/${lead.id}/important-dates`,
      relationshipToken
    );
    const listRes = await getImportantDates(listReq, {
      params: Promise.resolve({ id: lead.id }),
    });
    const listBody = await listRes.json();
    record(
      'Assigned user can view assigned lead dates',
      listRes.status === 200 &&
        Array.isArray(listBody.importantDates) &&
        listBody.importantDates.some(
          (entry: { label?: string }) => entry.label === 'Lead follow-up'
        ),
      `count=${listBody.importantDates?.length ?? 0}`
    );
  }

  // --- 7. SUPER_ADMIN view/manage ---
  {
    const manageOk = await canManageImportantDate(
      superAdmin,
      'Lead',
      lead.id
    );
    record('SUPER_ADMIN canManageImportantDate', manageOk, 'allowed');

    const listReq = authRequest(
      `/api/clients/${client.id}/important-dates`,
      adminToken
    );
    const listRes = await getImportantDates(listReq, {
      params: Promise.resolve({ id: client.id }),
    });
    const listBody = await listRes.json();
    record(
      'SUPER_ADMIN can list client important dates',
      listRes.status === 200 &&
        Array.isArray(listBody.importantDates) &&
        listBody.importantDates.length > 0,
      `count=${listBody.importantDates?.length ?? 0}`
    );

    const updateReq = authRequest(
      `/api/clients/${client.id}/important-dates/${timedDateId}`,
      adminToken,
      {
        method: 'PUT',
        body: JSON.stringify({
          label: 'Kickoff call (admin edit)',
          date: '2026-07-15',
          time: '16:00',
        }),
      }
    );
    if (!timedDateId) {
      record(
        'SUPER_ADMIN can update important date time',
        false,
        'skipped — timed create failed'
      );
    } else {
      const updateRes = await updateImportantDate(updateReq, {
        params: Promise.resolve({ id: client.id, dateId: timedDateId }),
      });
      const updateBody = await updateRes.json();
      record(
        'SUPER_ADMIN can update important date time',
        updateRes.status === 200 &&
          updateBody.importantDate?.time === '16:00' &&
          updateBody.importantDate?.label === 'Kickoff call (admin edit)',
        updateRes.status === 200
          ? updateBody.importantDate?.scheduledAt
          : JSON.stringify(updateBody)
      );
    }

    const calParsed = parseImportantDatesCalendarQuery(
      new URLSearchParams({
        startDate: '2026-07-01',
        endDate: '2026-07-31',
        recordType: 'ALL',
      })
    );
    assert(calParsed.ok, 'calendar query parse failed');
    const cal = await fetchImportantDatesCalendarEvents(
      superAdmin,
      calParsed.data
    );
    record(
      'SUPER_ADMIN calendar includes timed events',
      cal.ok &&
        (!timedDateId ||
          cal.data.events.some(
            (event) =>
              event.id === timedDateId &&
              event.time === '16:00' &&
              event.canManage === true
          )),
      cal.ok
        ? `events=${cal.data.events.length}`
        : `${cal.status} ${cal.error}`
    );

    const calHttp = await getCalendarEvents(
      authRequest(
        '/api/dashboard/widgets/important-dates-calendar?startDate=2026-07-01&endDate=2026-07-31',
        adminToken
      )
    );
    const calBody = await calHttp.json();
    record(
      'SUPER_ADMIN calendar HTTP widget',
      calHttp.status === 200 && Array.isArray(calBody.events),
      `count=${calBody.events?.length ?? 0}`
    );

    // Outsider calendar must not see this client's events
    const outsiderCal = await fetchImportantDatesCalendarEvents(outsider, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'ALL',
    });
    record(
      'Outsider calendar excludes unassigned client events',
      outsiderCal.ok &&
        !outsiderCal.data.events.some((event) => event.recordId === client.id),
      outsiderCal.ok
        ? `events=${outsiderCal.data.events.length}`
        : outsiderCal.error
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);

  await cleanup();

  assert(failed === 0, `${failed} important dates test(s) failed`);
  console.log('\nPASS');
}

main()
  .catch(async (error) => {
    console.error('Important dates tests failed:', error);
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error('Cleanup failed:', cleanupError);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
