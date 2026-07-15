/**
 * Important Dates Calendar Widget — backend/API visibility tests.
 *
 * Covers SUPER_ADMIN vs assigned STANDARD_USER scoping, date-range filters,
 * event DTO shape, and CLIENT + LEAD events appearing together.
 *
 * Note: this CRM has no separate ADMIN UserRole — SUPER_ADMIN is the
 * admin-level role with unrestricted calendar visibility.
 *
 * Run: npm run test:important-dates-calendar
 * Or:  npx tsx scripts/test-important-dates-calendar.ts
 */
import {
  AssignmentRole,
  ClientStatus,
  UserRole,
  UserStatus,
} from '@prisma/client';
import type { ImportantDatesCalendarEvent } from '../lib/importantDatesCalendar';
import {
  fetchImportantDatesCalendarEvents,
} from '../lib/importantDatesCalendar';
import { signAuthToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
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
  const email = `imp-cal-${key}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`;
  const user = await prisma.user.create({
    data: {
      email,
      name: `Imp Cal ${key}`,
      role,
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true, role: true, name: true },
  });
  created.userIds.push(user.id);
  return user;
}

async function createOwner(
  label: string,
  status: ClientStatus
) {
  const owner = await prisma.client.create({
    data: {
      name: `IMP CAL ${label} ${RUN_ID}`,
      email: `imp-cal-${label.toLowerCase()}-${RUN_ID}@${TEST_EMAIL_DOMAIN}`,
      company: `Imp Cal Co ${RUN_ID}`,
      status,
    },
    select: { id: true, name: true, status: true },
  });
  created.clientIds.push(owner.id);
  return owner;
}

async function createImportantDate(input: {
  clientId: string;
  createdByUserId: string;
  label: string;
  scheduledAt: Date;
  hasTime: boolean;
  notes?: string | null;
}) {
  const row = await prisma.clientImportantDate.create({
    data: {
      clientId: input.clientId,
      createdByUserId: input.createdByUserId,
      label: input.label,
      scheduledAt: input.scheduledAt,
      hasTime: input.hasTime,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });
  created.importantDateIds.push(row.id);
  return row;
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

function authRequest(path: string, token: string) {
  return new Request(`http://localhost${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

function eventById(
  events: ImportantDatesCalendarEvent[],
  id: string
): ImportantDatesCalendarEvent | undefined {
  return events.find((event) => event.id === id);
}

function hasEventIds(
  events: ImportantDatesCalendarEvent[],
  ids: string[]
): boolean {
  const set = new Set(events.map((event) => event.id));
  return ids.every((id) => set.has(id));
}

function hasNoneOf(
  events: ImportantDatesCalendarEvent[],
  ids: string[]
): boolean {
  const set = new Set(events.map((event) => event.id));
  return ids.every((id) => !set.has(id));
}

function eventShapeOk(
  event: ImportantDatesCalendarEvent | undefined,
  expected: {
    label: string;
    date: string;
    time: string | null;
    scheduledAt: string;
    recordType: 'CLIENT' | 'LEAD';
    recordId: string;
    recordName: string;
    notes: string | null;
    canManage: boolean;
  }
): boolean {
  if (!event) return false;
  return (
    typeof event.title === 'string' &&
    event.title === expected.label &&
    event.label === expected.label &&
    event.scheduledAt === expected.scheduledAt &&
    event.date === expected.date &&
    event.time === expected.time &&
    event.recordType === expected.recordType &&
    event.recordId === expected.recordId &&
    event.recordName === expected.recordName &&
    event.notes === expected.notes &&
    event.canManage === expected.canManage
  );
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
    console.warn('Calendar test cleanup skipped/partial:', error);
    if (created.clientIds.length > 0) {
      await prisma.clientAssignment
        .deleteMany({ where: { clientId: { in: created.clientIds } } })
        .catch(() => undefined);
      await prisma.clientActivityLog
        .deleteMany({ where: { clientId: { in: created.clientIds } } })
        .catch(() => undefined);
      await prisma.client
        .deleteMany({ where: { id: { in: created.clientIds } } })
        .catch(() => undefined);
    }
  }

  if (created.userIds.length > 0) {
    await prisma.user.deleteMany({
      where: { id: { in: created.userIds } },
    });
  }
}

async function main() {
  console.log(`Important Dates Calendar tests @ ${new Date().toISOString()}`);
  console.log(`Run ID: ${RUN_ID}\n`);

  const [superAdmin, assignedUser, outsider] = await Promise.all([
    createUser('admin', UserRole.SUPER_ADMIN),
    createUser('assigned', UserRole.STANDARD_USER),
    createUser('outsider', UserRole.STANDARD_USER),
  ]);

  const assignedClient = await createOwner(
    'ASSIGNED-CLIENT',
    ClientStatus.ACTIVE_CLIENT
  );
  const assignedLead = await createOwner('ASSIGNED-LEAD', ClientStatus.NEW_LEAD);
  const unassignedClient = await createOwner(
    'UNASSIGNED-CLIENT',
    ClientStatus.ACTIVE_CLIENT
  );
  const unassignedLead = await createOwner(
    'UNASSIGNED-LEAD',
    ClientStatus.CONTACTED
  );

  await prisma.clientAssignment.createMany({
    data: [
      {
        clientId: assignedClient.id,
        userId: assignedUser.id,
        role: AssignmentRole.RELATIONSHIP,
      },
      {
        clientId: assignedLead.id,
        userId: assignedUser.id,
        role: AssignmentRole.RELATIONSHIP,
      },
    ],
  });

  const assignedClientDate = await createImportantDate({
    clientId: assignedClient.id,
    createdByUserId: assignedUser.id,
    label: 'Client review meeting',
    scheduledAt: new Date('2026-07-15T14:30:00.000Z'),
    hasTime: true,
    notes: 'Bring contract draft',
  });
  const assignedLeadDate = await createImportantDate({
    clientId: assignedLead.id,
    createdByUserId: assignedUser.id,
    label: 'Lead follow-up call',
    scheduledAt: new Date('2026-07-20T09:00:00.000Z'),
    hasTime: true,
    notes: 'Confirm strategy session',
  });
  const unassignedClientDate = await createImportantDate({
    clientId: unassignedClient.id,
    createdByUserId: superAdmin.id,
    label: 'Unassigned client renewal',
    scheduledAt: new Date('2026-07-16T00:00:00.000Z'),
    hasTime: false,
    notes: null,
  });
  const unassignedLeadDate = await createImportantDate({
    clientId: unassignedLead.id,
    createdByUserId: superAdmin.id,
    label: 'Unassigned lead milestone',
    scheduledAt: new Date('2026-07-18T11:15:00.000Z'),
    hasTime: true,
    notes: 'Internal only',
  });
  const outOfRangeAssignedDate = await createImportantDate({
    clientId: assignedClient.id,
    createdByUserId: assignedUser.id,
    label: 'August anniversary',
    scheduledAt: new Date('2026-08-15T00:00:00.000Z'),
    hasTime: false,
    notes: 'Outside July window',
  });

  const julyInRangeIds = [
    assignedClientDate.id,
    assignedLeadDate.id,
    unassignedClientDate.id,
    unassignedLeadDate.id,
  ];
  const assignedJulyIds = [assignedClientDate.id, assignedLeadDate.id];
  const unassignedJulyIds = [
    unassignedClientDate.id,
    unassignedLeadDate.id,
  ];

  const adminToken = await tokenFor(superAdmin);
  const assignedToken = await tokenFor(assignedUser);
  const outsiderToken = await tokenFor(outsider);

  // --- 1. SUPER_ADMIN can fetch all client + lead dates in range ---
  {
    const result = await fetchImportantDatesCalendarEvents(superAdmin, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'ALL',
    });
    assert(result.ok, 'SUPER_ADMIN calendar fetch failed');
    const events = result.data.events;
    const ok =
      hasEventIds(events, julyInRangeIds) &&
      !eventById(events, outOfRangeAssignedDate.id) &&
      eventById(events, assignedClientDate.id)?.recordType === 'CLIENT' &&
      eventById(events, assignedLeadDate.id)?.recordType === 'LEAD' &&
      eventById(events, unassignedClientDate.id)?.recordType === 'CLIENT' &&
      eventById(events, unassignedLeadDate.id)?.recordType === 'LEAD' &&
      events
        .filter((event) => julyInRangeIds.includes(event.id))
        .every((event) => event.canManage === true);
    record(
      'SUPER_ADMIN can fetch all client and lead important dates in range',
      ok,
      `matched=${julyInRangeIds.filter((id) => eventById(events, id)).length}/4`
    );

    const httpRes = await getCalendarEvents(
      authRequest(
        '/api/dashboard/widgets/important-dates-calendar?startDate=2026-07-01&endDate=2026-07-31&recordType=ALL',
        adminToken
      )
    );
    const httpBody = await httpRes.json();
    record(
      'SUPER_ADMIN calendar HTTP returns all fixture events in range',
      httpRes.status === 200 &&
        Array.isArray(httpBody.events) &&
        hasEventIds(httpBody.events, julyInRangeIds),
      `status=${httpRes.status} count=${httpBody.events?.length ?? 0}`
    );
  }

  // --- 2. Regular user: assigned clients only ---
  {
    const result = await fetchImportantDatesCalendarEvents(assignedUser, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'CLIENT',
    });
    assert(result.ok, 'assigned CLIENT calendar fetch failed');
    const events = result.data.events;
    const ok =
      Boolean(eventById(events, assignedClientDate.id)) &&
      hasNoneOf(events, [
        assignedLeadDate.id,
        unassignedClientDate.id,
        unassignedLeadDate.id,
      ]);
    record(
      'Regular user only receives important dates for assigned clients',
      ok,
      `events=${events.length}`
    );
  }

  // --- 3. Regular user: assigned leads only ---
  {
    const result = await fetchImportantDatesCalendarEvents(assignedUser, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'LEAD',
    });
    assert(result.ok, 'assigned LEAD calendar fetch failed');
    const events = result.data.events;
    const ok =
      Boolean(eventById(events, assignedLeadDate.id)) &&
      hasNoneOf(events, [
        assignedClientDate.id,
        unassignedClientDate.id,
        unassignedLeadDate.id,
      ]);
    record(
      'Regular user only receives important dates for assigned leads',
      ok,
      `events=${events.length}`
    );
  }

  // --- 4. Regular user does not receive unassigned ---
  {
    const result = await fetchImportantDatesCalendarEvents(assignedUser, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'ALL',
    });
    assert(result.ok, 'assigned ALL calendar fetch failed');
    const events = result.data.events;
    record(
      'Regular user does not receive unassigned client/lead important dates',
      hasEventIds(events, assignedJulyIds) &&
        hasNoneOf(events, unassignedJulyIds),
      `assigned=${assignedJulyIds.filter((id) => eventById(events, id)).length} unassignedLeak=${unassignedJulyIds.filter((id) => eventById(events, id)).length}`
    );

    const outsiderResult = await fetchImportantDatesCalendarEvents(outsider, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'ALL',
    });
    assert(outsiderResult.ok, 'outsider calendar fetch failed');
    record(
      'Unassigned regular user receives none of the fixture important dates',
      hasNoneOf(outsiderResult.data.events, [
        ...julyInRangeIds,
        outOfRangeAssignedDate.id,
      ]),
      `events=${outsiderResult.data.events.length}`
    );

    const outsiderHttp = await getCalendarEvents(
      authRequest(
        '/api/dashboard/widgets/important-dates-calendar?startDate=2026-07-01&endDate=2026-07-31',
        outsiderToken
      )
    );
    const outsiderBody = await outsiderHttp.json();
    record(
      'Unassigned regular user calendar HTTP excludes fixtures',
      outsiderHttp.status === 200 &&
        Array.isArray(outsiderBody.events) &&
        hasNoneOf(outsiderBody.events, julyInRangeIds),
      `status=${outsiderHttp.status}`
    );
  }

  // --- 5. Date range filtering ---
  {
    const narrow = await fetchImportantDatesCalendarEvents(superAdmin, {
      startDate: '2026-07-14',
      endDate: '2026-07-15',
      recordType: 'ALL',
    });
    assert(narrow.ok, 'narrow range fetch failed');
    record(
      'Date range filtering includes in-range day and excludes later July fixtures',
      Boolean(eventById(narrow.data.events, assignedClientDate.id)) &&
        hasNoneOf(narrow.data.events, [
          assignedLeadDate.id,
          unassignedClientDate.id,
          unassignedLeadDate.id,
          outOfRangeAssignedDate.id,
        ]),
      `events=${narrow.data.events.length}`
    );

    const august = await fetchImportantDatesCalendarEvents(assignedUser, {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      recordType: 'ALL',
    });
    assert(august.ok, 'august range fetch failed');
    record(
      'Date range filtering returns out-of-July assigned date in August window',
      Boolean(eventById(august.data.events, outOfRangeAssignedDate.id)) &&
        hasNoneOf(august.data.events, julyInRangeIds),
      `events=${august.data.events.length}`
    );

    const julyHttp = await getCalendarEvents(
      authRequest(
        '/api/dashboard/widgets/important-dates-calendar?startDate=2026-07-15&endDate=2026-07-15',
        assignedToken
      )
    );
    const julyBody = await julyHttp.json();
    record(
      'Date range filtering via calendar HTTP (single day)',
      julyHttp.status === 200 &&
        Array.isArray(julyBody.events) &&
        Boolean(eventById(julyBody.events, assignedClientDate.id)) &&
        hasNoneOf(julyBody.events, [
          assignedLeadDate.id,
          outOfRangeAssignedDate.id,
        ]),
      `status=${julyHttp.status} count=${julyBody.events?.length ?? 0}`
    );
  }

  // --- 6. Event response shape ---
  {
    const result = await fetchImportantDatesCalendarEvents(assignedUser, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'ALL',
    });
    assert(result.ok, 'shape calendar fetch failed');
    const clientEvent = eventById(result.data.events, assignedClientDate.id);
    const leadEvent = eventById(result.data.events, assignedLeadDate.id);

    record(
      'Event response includes label/title, scheduledAt/date/time, record fields, notes, canManage (client)',
      eventShapeOk(clientEvent, {
        label: 'Client review meeting',
        date: '2026-07-15',
        time: '14:30',
        scheduledAt: '2026-07-15T14:30:00.000Z',
        recordType: 'CLIENT',
        recordId: assignedClient.id,
        recordName: assignedClient.name,
        notes: 'Bring contract draft',
        canManage: true,
      }),
      clientEvent ? JSON.stringify(clientEvent) : 'missing'
    );

    record(
      'Event response includes label/title, scheduledAt/date/time, record fields, notes, canManage (lead)',
      eventShapeOk(leadEvent, {
        label: 'Lead follow-up call',
        date: '2026-07-20',
        time: '09:00',
        scheduledAt: '2026-07-20T09:00:00.000Z',
        recordType: 'LEAD',
        recordId: assignedLead.id,
        recordName: assignedLead.name,
        notes: 'Confirm strategy session',
        canManage: true,
      }),
      leadEvent ? JSON.stringify(leadEvent) : 'missing'
    );

    const adminResult = await fetchImportantDatesCalendarEvents(superAdmin, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'ALL',
    });
    assert(adminResult.ok, 'admin shape fetch failed');
    const dateOnly = eventById(
      adminResult.data.events,
      unassignedClientDate.id
    );
    record(
      'Event response supports date-only (time null) with notes null',
      eventShapeOk(dateOnly, {
        label: 'Unassigned client renewal',
        date: '2026-07-16',
        time: null,
        scheduledAt: '2026-07-16T00:00:00.000Z',
        recordType: 'CLIENT',
        recordId: unassignedClient.id,
        recordName: unassignedClient.name,
        notes: null,
        canManage: true,
      }),
      dateOnly ? JSON.stringify(dateOnly) : 'missing'
    );
  }

  // --- 7. Lead + client both appear when data exists ---
  {
    const result = await fetchImportantDatesCalendarEvents(assignedUser, {
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      recordType: 'ALL',
    });
    assert(result.ok, 'combined calendar fetch failed');
    const events = result.data.events;
    const clientEvent = eventById(events, assignedClientDate.id);
    const leadEvent = eventById(events, assignedLeadDate.id);
    record(
      'Lead and client important dates both appear if data exists',
      Boolean(clientEvent) &&
        Boolean(leadEvent) &&
        clientEvent?.recordType === 'CLIENT' &&
        leadEvent?.recordType === 'LEAD',
      `client=${Boolean(clientEvent)} lead=${Boolean(leadEvent)}`
    );

    const httpRes = await getCalendarEvents(
      authRequest(
        '/api/dashboard/widgets/important-dates-calendar?startDate=2026-07-01&endDate=2026-07-31&recordType=ALL',
        assignedToken
      )
    );
    const httpBody = await httpRes.json();
    record(
      'Lead and client important dates both appear via calendar HTTP',
      httpRes.status === 200 &&
        hasEventIds(httpBody.events ?? [], assignedJulyIds) &&
        eventById(httpBody.events ?? [], assignedClientDate.id)?.recordType ===
          'CLIENT' &&
        eventById(httpBody.events ?? [], assignedLeadDate.id)?.recordType ===
          'LEAD',
      `status=${httpRes.status}`
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed`);

  await cleanup();

  assert(failed === 0, `${failed} important dates calendar test(s) failed`);
  console.log('\nPASS');
}

main()
  .catch(async (error) => {
    console.error('Important dates calendar tests failed:', error);
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
