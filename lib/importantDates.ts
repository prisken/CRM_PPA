import type { ClientImportantDate, ClientStatus, Prisma } from '@prisma/client';
import {
  combineDateAndOptionalTime,
  parseImportantDatesArray,
  type ImportantDateInput,
} from '@/lib/importantDateValidation';
import { prisma } from '@/lib/prisma';

/**
 * API / UI shape kept backward compatible with legacy JSON `{ label, date }`.
 * New fields: id, time, notes, scheduledAt, hasTime.
 */
export type ImportantDateDto = ImportantDateInput;

export type ImportantDateRecordLike = Pick<
  ClientImportantDate,
  'id' | 'label' | 'scheduledAt' | 'hasTime' | 'notes'
> &
  Partial<
    Pick<ClientImportantDate, 'createdByUserId' | 'createdAt' | 'updatedAt'>
  >;

export type ImportantDateOwnerKind = 'client' | 'lead';

export type ImportantDateApiItem = ImportantDateDto & {
  leadId?: string;
  clientId?: string;
  recordType?: 'Lead' | 'Client';
  createdByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

/** Extract YYYY-MM-DD from scheduledAt using UTC components (all-day safe). */
export function getUtcDateOnly(scheduledAt: Date): string {
  return [
    scheduledAt.getUTCFullYear(),
    pad2(scheduledAt.getUTCMonth() + 1),
    pad2(scheduledAt.getUTCDate()),
  ].join('-');
}

/** Extract HH:mm from scheduledAt using UTC components. */
export function getUtcTimeOnly(scheduledAt: Date): string {
  return `${pad2(scheduledAt.getUTCHours())}:${pad2(scheduledAt.getUTCMinutes())}`;
}

export function buildScheduledAtFromDateAndTime(
  date: string,
  time: string | null | undefined
): { scheduledAt: Date; hasTime: boolean } | { error: string } {
  const combined = combineDateAndOptionalTime(date, time);
  if (!combined.ok) {
    return { error: combined.error };
  }

  return {
    scheduledAt: combined.data.scheduledAt,
    hasTime: combined.data.hasTime,
  };
}

export function formatImportantDateRecord(
  record: ImportantDateRecordLike
): ImportantDateDto {
  const date = getUtcDateOnly(record.scheduledAt);
  return {
    id: record.id,
    label: record.label,
    date,
    time: record.hasTime ? getUtcTimeOnly(record.scheduledAt) : null,
    notes: record.notes ?? null,
    scheduledAt: record.scheduledAt.toISOString(),
    hasTime: record.hasTime,
  };
}

/** API response shape — includes owner id aliases + audit fields for lead/client routes. */
export function formatImportantDateApiItem(
  record: ImportantDateRecordLike | ImportantDateDto,
  options: {
    ownerId: string;
    ownerKind: ImportantDateOwnerKind;
    recordType?: 'Lead' | 'Client';
  }
): ImportantDateApiItem {
  const isOrmRecord =
    typeof (record as ImportantDateRecordLike).scheduledAt !== 'string' &&
    (record as ImportantDateRecordLike).scheduledAt instanceof Date;

  const base = isOrmRecord
    ? formatImportantDateRecord(record as ImportantDateRecordLike)
    : (record as ImportantDateDto);

  const orm = isOrmRecord ? (record as ImportantDateRecordLike) : null;

  return {
    ...base,
    ...(options.ownerKind === 'lead'
      ? { leadId: options.ownerId }
      : { clientId: options.ownerId }),
    ...(options.recordType ? { recordType: options.recordType } : {}),
    ...(orm && 'createdByUserId' in orm
      ? { createdByUserId: orm.createdByUserId ?? null }
      : {}),
    ...(orm?.createdAt instanceof Date
      ? { createdAt: orm.createdAt.toISOString() }
      : {}),
    ...(orm?.updatedAt instanceof Date
      ? { updatedAt: orm.updatedAt.toISOString() }
      : {}),
  };
}

/** Legacy JSON array → DTOs (date-only; used as fallback before/alongside table). */
export function normalizeLegacyImportantDatesJson(
  value: Prisma.JsonValue | null | undefined
): ImportantDateDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const results: ImportantDateDto[] = [];

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue;
    }

    const label = String(entry.label ?? '').trim();
    const dateRaw = String(entry.date ?? '').trim();
    const date = dateRaw.slice(0, 10);
    const timeFromField =
      entry.time === undefined || entry.time === null
        ? null
        : String(entry.time).trim();
    const timeFromIso =
      !timeFromField && dateRaw.length >= 16
        ? dateRaw.slice(11, 16)
        : null;
    // Midnight from ISO date-only strings stays all-day; explicit `time: "00:00"` keeps a time.
    const candidateTime =
      timeFromField ||
      (timeFromIso && timeFromIso !== '00:00' ? timeFromIso : null);

    if (!label && !date) {
      continue;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      continue;
    }

    const built = buildScheduledAtFromDateAndTime(date, candidateTime);
    if ('error' in built) {
      continue;
    }

    const time = built.hasTime ? getUtcTimeOnly(built.scheduledAt) : null;
    const notesRaw =
      entry.notes === undefined || entry.notes === null
        ? null
        : String(entry.notes).trim();

    results.push({
      label: label || 'Untitled',
      date,
      time,
      notes: notesRaw || null,
      scheduledAt: built.scheduledAt.toISOString(),
      hasTime: built.hasTime,
    });
  }

  return results;
}

export function resolveImportantDatesForClient(input: {
  records?: ImportantDateRecordLike[] | null;
  legacyJson?: Prisma.JsonValue | null;
}): ImportantDateDto[] {
  if (input.records && input.records.length > 0) {
    return [...input.records]
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .map(formatImportantDateRecord);
  }

  return normalizeLegacyImportantDatesJson(input.legacyJson);
}

/**
 * Validate + sanitize incoming API/form payloads.
 * Accepts legacy `{ label, date }` and extended `{ id?, label, date, time?, notes? }`.
 * Time is optional (all-day when omitted). Label and date are required for non-empty rows.
 */
export function sanitizeImportantDatesInput(
  value: unknown
): { ok: true; data: ImportantDateDto[] } | { ok: false; error: string } {
  return parseImportantDatesArray(value);
}

/** Mirror table rows back to legacy JSON shape for the deprecated Client.importantDates column. */
export function toLegacyImportantDatesJson(
  entries: ImportantDateDto[]
): Prisma.InputJsonValue {
  return entries.map((entry) => {
    const payload: Record<string, string> = {
      label: entry.label,
      date: entry.date,
    };
    if (entry.time) {
      payload.time = entry.time;
    }
    if (entry.notes) {
      payload.notes = entry.notes;
    }
    return payload;
  });
}

export function dtoToCreateManyInput(
  clientId: string,
  entries: ImportantDateDto[],
  userId: string
): Prisma.ClientImportantDateCreateManyInput[] {
  return entries.map((entry) => {
    const built = buildScheduledAtFromDateAndTime(entry.date, entry.time);
    if ('error' in built) {
      throw new Error(built.error);
    }

    return {
      clientId,
      label: entry.label,
      scheduledAt: built.scheduledAt,
      hasTime: built.hasTime,
      notes: entry.notes,
      createdByUserId: userId,
      updatedByUserId: userId,
    };
  });
}

/** Lead vs Client label for calendar: ACTIVE_CLIENT → Client; other non-archived → Lead. */
export function classifyImportantDateRecordType(
  status: ClientStatus | string
): 'Lead' | 'Client' {
  return status === 'ACTIVE_CLIENT' ? 'Client' : 'Lead';
}

export const importantDateRecordSelect = {
  id: true,
  label: true,
  scheduledAt: true,
  hasTime: true,
  notes: true,
} satisfies Prisma.ClientImportantDateSelect;

export const importantDateApiSelect = {
  id: true,
  label: true,
  scheduledAt: true,
  hasTime: true,
  notes: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientImportantDateSelect;

export {
  combineDateAndOptionalTime,
  importantDateCreateSchema,
  importantDateUpdateSchema,
  importantDatesArraySchema,
  parseImportantDateCreateBody,
  parseImportantDateInput,
  parseImportantDateUpdateInput,
  parseImportantDatesArray,
  parseImportantDatesReplaceInput,
} from '@/lib/importantDateValidation';

export type { ImportantDateInput } from '@/lib/importantDateValidation';

type TxClient = Prisma.TransactionClient;

/** Load + format important dates for a client (table preferred, legacy JSON fallback). */
export async function listImportantDatesForClient(
  clientId: string,
  db: TxClient | typeof prisma = prisma
): Promise<ImportantDateDto[]> {
  const [records, client] = await Promise.all([
    db.clientImportantDate.findMany({
      where: { clientId },
      orderBy: { scheduledAt: 'asc' },
      select: importantDateApiSelect,
    }),
    db.client.findUnique({
      where: { id: clientId },
      select: { importantDates: true },
    }),
  ]);

  return resolveImportantDatesForClient({
    records,
    legacyJson: client?.importantDates ?? null,
  });
}

/**
 * List for API routes — includes Lead vs Client classification for calendar later.
 * ownerId is always a Client.id (leads share the Client model).
 */
export async function listImportantDatesForOwner(
  ownerId: string,
  db: TxClient | typeof prisma = prisma
): Promise<{
  importantDates: ImportantDateRecordLike[];
  recordType: 'Lead' | 'Client';
  dtos: ImportantDateDto[];
}> {
  const [records, client] = await Promise.all([
    db.clientImportantDate.findMany({
      where: { clientId: ownerId },
      orderBy: { scheduledAt: 'asc' },
      select: importantDateApiSelect,
    }),
    db.client.findUnique({
      where: { id: ownerId },
      select: { importantDates: true, status: true },
    }),
  ]);

  const recordType = classifyImportantDateRecordType(
    client?.status ?? 'NEW_LEAD'
  );

  if (records.length > 0) {
    return {
      importantDates: records,
      recordType,
      dtos: records.map(formatImportantDateRecord),
    };
  }

  const dtos = normalizeLegacyImportantDatesJson(client?.importantDates ?? null);
  return {
    importantDates: [],
    recordType,
    dtos,
  };
}

/** Keep deprecated Client.importantDates JSON mirrored after single-row mutations. */
export async function syncLegacyImportantDatesJson(
  clientId: string,
  db: TxClient | typeof prisma = prisma
): Promise<ImportantDateDto[]> {
  const records = await db.clientImportantDate.findMany({
    where: { clientId },
    orderBy: { scheduledAt: 'asc' },
    select: importantDateRecordSelect,
  });
  const dtos = records.map(formatImportantDateRecord);
  await db.client.update({
    where: { id: clientId },
    data: { importantDates: toLegacyImportantDatesJson(dtos) },
  });
  return dtos;
}

export async function getImportantDateForClient(
  clientId: string,
  dateId: string,
  db: TxClient | typeof prisma = prisma
) {
  const record = await db.clientImportantDate.findFirst({
    where: { id: dateId, clientId },
    select: importantDateApiSelect,
  });

  if (!record) {
    return null;
  }

  return record;
}
