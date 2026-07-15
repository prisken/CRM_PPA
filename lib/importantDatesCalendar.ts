import {
  AssignmentRole,
  ClientStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import {
  canViewAllImportantDates,
  getAccessibleOwnerIdsForImportantDates,
  type ImportantDatePermissionUser,
} from '@/lib/importantDatePermissions';
import {
  classifyImportantDateRecordType,
  getUtcDateOnly,
  getUtcTimeOnly,
} from '@/lib/importantDates';
import { prisma } from '@/lib/prisma';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type CalendarRecordTypeFilter = 'CLIENT' | 'LEAD' | 'ALL';
export type CalendarRecordType = 'CLIENT' | 'LEAD';

export type ImportantDatesCalendarEvent = {
  id: string;
  title: string;
  label: string;
  scheduledAt: string;
  date: string;
  time: string | null;
  recordType: CalendarRecordType;
  recordId: string;
  recordName: string;
  notes: string | null;
  canManage: boolean;
  /** Display name of creator when known. */
  createdByName: string | null;
};

export type ImportantDatesCalendarQuery = {
  startDate: string;
  endDate: string;
  recordType?: CalendarRecordTypeFilter;
  assignedUserId?: string | null;
  search?: string | null;
};

export type ImportantDatesCalendarResult = {
  startDate: string;
  endDate: string;
  recordType: CalendarRecordTypeFilter;
  events: ImportantDatesCalendarEvent[];
};

const CLIENT_STATUSES: ClientStatus[] = [ClientStatus.ACTIVE_CLIENT];
const LEAD_STATUSES: ClientStatus[] = [
  ClientStatus.NEW_LEAD,
  ClientStatus.CONTACTED,
  ClientStatus.NURTURING,
  ClientStatus.STRATEGY_SESSION,
  ClientStatus.ARCHIVED,
];

const MAX_CALENDAR_EVENTS = 1000;

export function toCalendarRecordType(
  status: ClientStatus | string
): CalendarRecordType {
  return classifyImportantDateRecordType(status) === 'Client' ? 'CLIENT' : 'LEAD';
}

/**
 * Inclusive UTC day range from YYYY-MM-DD start/end.
 * End is exclusive next calendar day at 00:00:00.000Z.
 */
export function buildUtcRangeFromDateOnly(
  startDate: string,
  endDate: string
): { ok: true; rangeStart: Date; rangeEndExclusive: Date } | { ok: false; error: string } {
  if (!DATE_ONLY_RE.test(startDate)) {
    return { ok: false, error: 'startDate must be YYYY-MM-DD' };
  }
  if (!DATE_ONLY_RE.test(endDate)) {
    return { ok: false, error: 'endDate must be YYYY-MM-DD' };
  }

  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);

  const rangeStart = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0, 0));
  const endDay = new Date(Date.UTC(ey, em - 1, ed, 0, 0, 0, 0));
  // Inclusive end date: exclusive bound is start of the next UTC calendar day.
  // Use setUTCDate so month/year rollover stays valid (e.g. Jan 31 → Feb 1).
  const rangeEndExclusive = new Date(endDay);
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);

  if (
    rangeStart.getUTCFullYear() !== sy ||
    rangeStart.getUTCMonth() !== sm - 1 ||
    rangeStart.getUTCDate() !== sd
  ) {
    return { ok: false, error: 'startDate is not a valid calendar date' };
  }

  if (
    endDay.getUTCFullYear() !== ey ||
    endDay.getUTCMonth() !== em - 1 ||
    endDay.getUTCDate() !== ed
  ) {
    return { ok: false, error: 'endDate is not a valid calendar date' };
  }

  if (rangeEndExclusive.getTime() <= rangeStart.getTime()) {
    return {
      ok: false,
      error: 'endDate must be on or after startDate',
    };
  }

  // Max window ~366 days to protect the calendar endpoint
  const maxMs = 366 * 24 * 60 * 60 * 1000;
  if (rangeEndExclusive.getTime() - rangeStart.getTime() > maxMs) {
    return { ok: false, error: 'Date range must be at most 366 days' };
  }

  return { ok: true, rangeStart, rangeEndExclusive };
}

export function parseImportantDatesCalendarQuery(
  searchParams: URLSearchParams
):
  | { ok: true; data: ImportantDatesCalendarQuery }
  | { ok: false; error: string } {
  const startDate = (searchParams.get('startDate') ?? '').trim();
  const endDate = (searchParams.get('endDate') ?? '').trim();

  if (!startDate) {
    return { ok: false, error: 'startDate is required' };
  }
  if (!endDate) {
    return { ok: false, error: 'endDate is required' };
  }

  const range = buildUtcRangeFromDateOnly(startDate, endDate);
  if (!range.ok) {
    return range;
  }

  const recordTypeRaw = (searchParams.get('recordType') ?? 'ALL')
    .trim()
    .toUpperCase();
  const recordType =
    recordTypeRaw === '' ? 'ALL' : (recordTypeRaw as CalendarRecordTypeFilter);

  if (recordType !== 'CLIENT' && recordType !== 'LEAD' && recordType !== 'ALL') {
    return {
      ok: false,
      error: 'recordType must be CLIENT, LEAD, or ALL',
    };
  }

  const assignedUserIdRaw = searchParams.get('assignedUserId');
  const assignedUserId =
    assignedUserIdRaw === null || assignedUserIdRaw.trim() === ''
      ? null
      : assignedUserIdRaw.trim();

  const searchRaw = searchParams.get('search');
  const search =
    searchRaw === null || searchRaw.trim() === ''
      ? null
      : searchRaw.trim().slice(0, 200);

  return {
    ok: true,
    data: {
      startDate,
      endDate,
      recordType,
      assignedUserId,
      search,
    },
  };
}

async function resolveOwnerIdFilter(
  user: ImportantDatePermissionUser,
  query: ImportantDatesCalendarQuery
): Promise<
  | { ok: true; ownerIds: string[] | null }
  | { ok: false; error: string; status: number }
> {
  const accessible = await getAccessibleOwnerIdsForImportantDates(user);

  if (query.assignedUserId) {
    if (!canViewAllImportantDates(user)) {
      return {
        ok: false,
        error: 'assignedUserId is only allowed for admin users',
        status: 403,
      };
    }

    const assignedRows = await prisma.clientAssignment.findMany({
      where: { userId: query.assignedUserId },
      select: { clientId: true },
    });
    const assignedIds = [...new Set(assignedRows.map((row) => row.clientId))];

    if (accessible === null) {
      return { ok: true, ownerIds: assignedIds };
    }

    const allowed = new Set(accessible);
    return {
      ok: true,
      ownerIds: assignedIds.filter((id) => allowed.has(id)),
    };
  }

  return { ok: true, ownerIds: accessible };
}

function statusFilterForRecordType(
  recordType: CalendarRecordTypeFilter
): ClientStatus[] | undefined {
  if (recordType === 'CLIENT') {
    return CLIENT_STATUSES;
  }
  if (recordType === 'LEAD') {
    return LEAD_STATUSES;
  }
  return undefined;
}

/**
 * Fetch calendar events for the Important Dates widget.
 * Always scopes by visibility; never returns inaccessible owners.
 */
export async function fetchImportantDatesCalendarEvents(
  user: ImportantDatePermissionUser,
  query: ImportantDatesCalendarQuery
): Promise<
  | { ok: true; data: ImportantDatesCalendarResult }
  | { ok: false; error: string; status: number }
> {
  const range = buildUtcRangeFromDateOnly(query.startDate, query.endDate);
  if (!range.ok) {
    return { ok: false, error: range.error, status: 400 };
  }

  const ownerFilter = await resolveOwnerIdFilter(user, query);
  if (!ownerFilter.ok) {
    return ownerFilter;
  }

  if (ownerFilter.ownerIds !== null && ownerFilter.ownerIds.length === 0) {
    return {
      ok: true,
      data: {
        startDate: query.startDate,
        endDate: query.endDate,
        recordType: query.recordType ?? 'ALL',
        events: [],
      },
    };
  }

  const statuses = statusFilterForRecordType(query.recordType ?? 'ALL');
  const search = query.search?.trim() || null;

  const searchAwareWhere: Prisma.ClientImportantDateWhereInput = {
    scheduledAt: {
      gte: range.rangeStart,
      lt: range.rangeEndExclusive,
    },
    ...(ownerFilter.ownerIds !== null
      ? { clientId: { in: ownerFilter.ownerIds } }
      : {}),
    ...(search
      ? {
          AND: [
            {
              client: {
                ...(statuses ? { status: { in: statuses } } : {}),
              },
            },
            {
              OR: [
                { label: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
                {
                  client: {
                    name: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  client: {
                    company: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            },
          ],
        }
      : {
          client: {
            ...(statuses ? { status: { in: statuses } } : {}),
          },
        }),
  };

  const rows = await prisma.clientImportantDate.findMany({
    where: searchAwareWhere,
    orderBy: [{ scheduledAt: 'asc' }, { label: 'asc' }],
    take: MAX_CALENDAR_EVENTS,
    select: {
      id: true,
      label: true,
      scheduledAt: true,
      hasTime: true,
      notes: true,
      clientId: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      client: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });

  const ownerIdsInResults = [...new Set(rows.map((row) => row.clientId))];

  let manageableOwnerIds = new Set<string>();
  if (user.role === UserRole.SUPER_ADMIN) {
    manageableOwnerIds = new Set(ownerIdsInResults);
  } else if (ownerIdsInResults.length > 0) {
    const relationshipRows = await prisma.clientAssignment.findMany({
      where: {
        userId: user.id,
        role: AssignmentRole.RELATIONSHIP,
        clientId: { in: ownerIdsInResults },
      },
      select: { clientId: true },
    });
    manageableOwnerIds = new Set(relationshipRows.map((row) => row.clientId));
  }

  const events: ImportantDatesCalendarEvent[] = rows.map((row) => {
    const date = getUtcDateOnly(row.scheduledAt);
    const time = row.hasTime ? getUtcTimeOnly(row.scheduledAt) : null;
    const recordType = toCalendarRecordType(row.client.status);
    const label = row.label;
    const recordName = row.client.name;
    const createdByName = row.createdBy
      ? row.createdBy.name?.trim() || row.createdBy.email
      : null;

    return {
      id: row.id,
      title: label,
      label,
      scheduledAt: row.scheduledAt.toISOString(),
      date,
      time,
      recordType,
      recordId: row.client.id,
      recordName,
      notes: row.notes ?? null,
      canManage: manageableOwnerIds.has(row.clientId),
      createdByName,
    };
  });

  return {
    ok: true,
    data: {
      startDate: query.startDate,
      endDate: query.endDate,
      recordType: query.recordType ?? 'ALL',
      events,
    },
  };
}
