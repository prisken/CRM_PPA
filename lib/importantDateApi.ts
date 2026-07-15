import { NextResponse } from 'next/server';
import {
  authorizeClientDetailsEdit,
  getClientOr404,
  requireClientCoreReadAccess,
} from '@/lib/authHelpers';
import {
  logImportantDateEvent,
  importantDateLogFieldsFromRecord,
} from '@/lib/importantDateActivity';
import {
  buildScheduledAtFromDateAndTime,
  classifyImportantDateRecordType,
  formatImportantDateApiItem,
  getImportantDateForClient,
  getUtcDateOnly,
  getUtcTimeOnly,
  listImportantDatesForOwner,
  parseImportantDateCreateBody,
  parseImportantDateUpdateInput,
  syncLegacyImportantDatesJson,
  type ImportantDateOwnerKind,
} from '@/lib/importantDates';
import { prisma } from '@/lib/prisma';

async function requireOwner(ownerId: string) {
  return getClientOr404(ownerId);
}

async function requireExistingImportantDate(ownerId: string, dateId: string) {
  const record = await getImportantDateForClient(ownerId, dateId);
  if (!record) {
    return {
      error: NextResponse.json(
        { error: 'Important date not found' },
        { status: 404 }
      ),
    };
  }
  return { record };
}

function ownerPayload(
  ownerId: string,
  ownerKind: ImportantDateOwnerKind
): { leadId: string } | { client_id: string } {
  if (ownerKind === 'lead') {
    return { leadId: ownerId };
  }
  return { client_id: ownerId };
}

/**
 * Shared list handler for client and lead important-date routes.
 * Leads are Client rows — storage uses clientId; lead API exposes leadId.
 */
export async function handleListImportantDates(
  request: Request,
  ownerId: string,
  ownerKind: ImportantDateOwnerKind
) {
  try {
    const auth = await requireClientCoreReadAccess(ownerId, request);
    if (auth.error) {
      return auth.error;
    }

    const ownerCheck = await requireOwner(ownerId);
    if (ownerCheck.error) {
      return ownerCheck.error;
    }

    const { importantDates, recordType, dtos } =
      await listImportantDatesForOwner(ownerId);

    const items =
      importantDates.length > 0
        ? importantDates.map((entry) =>
            formatImportantDateApiItem(entry, {
              ownerId,
              ownerKind,
              recordType,
            })
          )
        : dtos.map((entry) =>
            formatImportantDateApiItem(entry, {
              ownerId,
              ownerKind,
              recordType,
            })
          );

    return NextResponse.json({
      ...ownerPayload(ownerId, ownerKind),
      recordType,
      importantDates: items,
    });
  } catch (error) {
    console.error('Failed to fetch important dates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch important dates' },
      { status: 500 }
    );
  }
}

export async function handleCreateImportantDate(
  request: Request,
  ownerId: string,
  ownerKind: ImportantDateOwnerKind
) {
  try {
    const auth = await authorizeClientDetailsEdit(request, ownerId);
    if (auth.error) {
      return auth.error;
    }

    const ownerCheck = await requireOwner(ownerId);
    if (ownerCheck.error) {
      return ownerCheck.error;
    }

    const body = await request.json().catch(() => null);
    const parsed = parseImportantDateCreateBody(ownerId, body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const built = buildScheduledAtFromDateAndTime(
      parsed.data.date,
      parsed.data.time
    );
    if ('error' in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    const owner = await prisma.client.findUnique({
      where: { id: ownerId },
      select: { status: true },
    });
    const recordType = classifyImportantDateRecordType(owner?.status ?? 'NEW_LEAD');

    const created = await prisma.$transaction(async (tx) => {
      const record = await tx.clientImportantDate.create({
        data: {
          clientId: ownerId,
          label: parsed.data.label,
          scheduledAt: built.scheduledAt,
          hasTime: built.hasTime,
          notes: parsed.data.notes,
          createdByUserId: auth.user.id,
          updatedByUserId: auth.user.id,
        },
        select: {
          id: true,
          label: true,
          scheduledAt: true,
          hasTime: true,
          notes: true,
          createdByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await syncLegacyImportantDatesJson(ownerId, tx);
      return record;
    });

    await logImportantDateEvent({
      clientId: ownerId,
      userId: auth.user.id,
      action: 'created',
      ownerKind,
      ...importantDateLogFieldsFromRecord(created),
    });

    return NextResponse.json(
      {
        ...ownerPayload(ownerId, ownerKind),
        recordType,
        importantDate: formatImportantDateApiItem(created, {
          ownerId,
          ownerKind,
          recordType,
        }),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create important date:', error);
    return NextResponse.json(
      { error: 'Failed to create important date' },
      { status: 500 }
    );
  }
}

export async function handleUpdateImportantDate(
  request: Request,
  ownerId: string,
  dateId: string,
  ownerKind: ImportantDateOwnerKind
) {
  try {
    const auth = await authorizeClientDetailsEdit(request, ownerId);
    if (auth.error) {
      return auth.error;
    }

    const ownerCheck = await requireOwner(ownerId);
    if (ownerCheck.error) {
      return ownerCheck.error;
    }

    const existingCheck = await requireExistingImportantDate(ownerId, dateId);
    if (existingCheck.error) {
      return existingCheck.error;
    }
    const existing = existingCheck.record;

    const body = await request.json().catch(() => null);
    const parsed = parseImportantDateUpdateInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    let nextLabel = existing.label;
    let nextNotes = existing.notes;
    let nextScheduledAt = existing.scheduledAt;
    let nextHasTime = existing.hasTime;

    if (parsed.data.label !== undefined) {
      nextLabel = parsed.data.label;
    }
    if (parsed.data.notes !== undefined) {
      nextNotes = parsed.data.notes;
    }

    const scheduleTouched =
      parsed.data.date !== undefined ||
      parsed.data.time !== undefined ||
      parsed.data.scheduledAt !== undefined ||
      parsed.data.clearTime === true;

    if (scheduleTouched) {
      const existingDate = getUtcDateOnly(existing.scheduledAt);
      const existingTime = existing.hasTime
        ? getUtcTimeOnly(existing.scheduledAt)
        : null;

      const nextDate = parsed.data.date ?? existingDate;
      let nextTime: string | null;
      if (parsed.data.clearTime) {
        nextTime = null;
      } else if (parsed.data.time !== undefined) {
        nextTime = parsed.data.time;
      } else {
        nextTime =
          parsed.data.hasTime !== undefined
            ? parsed.data.time ?? null
            : existingTime;
      }

      const built = buildScheduledAtFromDateAndTime(nextDate, nextTime);
      if ('error' in built) {
        return NextResponse.json({ error: built.error }, { status: 400 });
      }
      nextScheduledAt = built.scheduledAt;
      nextHasTime = built.hasTime;
    }

    const owner = await prisma.client.findUnique({
      where: { id: ownerId },
      select: { status: true },
    });
    const recordType = classifyImportantDateRecordType(owner?.status ?? 'NEW_LEAD');

    const updated = await prisma.$transaction(async (tx) => {
      const record = await tx.clientImportantDate.update({
        where: { id: dateId },
        data: {
          label: nextLabel,
          notes: nextNotes,
          scheduledAt: nextScheduledAt,
          hasTime: nextHasTime,
          updatedByUserId: auth.user.id,
        },
        select: {
          id: true,
          label: true,
          scheduledAt: true,
          hasTime: true,
          notes: true,
          createdByUserId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await syncLegacyImportantDatesJson(ownerId, tx);
      return record;
    });

    await logImportantDateEvent({
      clientId: ownerId,
      userId: auth.user.id,
      action: 'updated',
      ownerKind,
      ...importantDateLogFieldsFromRecord(updated),
    });

    return NextResponse.json({
      ...ownerPayload(ownerId, ownerKind),
      recordType,
      importantDate: formatImportantDateApiItem(updated, {
        ownerId,
        ownerKind,
        recordType,
      }),
    });
  } catch (error) {
    console.error('Failed to update important date:', error);
    return NextResponse.json(
      { error: 'Failed to update important date' },
      { status: 500 }
    );
  }
}

export async function handleDeleteImportantDate(
  request: Request,
  ownerId: string,
  dateId: string,
  ownerKind: ImportantDateOwnerKind
) {
  try {
    const auth = await authorizeClientDetailsEdit(request, ownerId);
    if (auth.error) {
      return auth.error;
    }

    const ownerCheck = await requireOwner(ownerId);
    if (ownerCheck.error) {
      return ownerCheck.error;
    }

    const existingCheck = await requireExistingImportantDate(ownerId, dateId);
    if (existingCheck.error) {
      return existingCheck.error;
    }

    const existing = existingCheck.record;

    await prisma.$transaction(async (tx) => {
      await tx.clientImportantDate.delete({ where: { id: dateId } });
      await syncLegacyImportantDatesJson(ownerId, tx);
    });

    await logImportantDateEvent({
      clientId: ownerId,
      userId: auth.user.id,
      action: 'deleted',
      ownerKind,
      ...importantDateLogFieldsFromRecord(existing),
    });

    return NextResponse.json({
      ...ownerPayload(ownerId, ownerKind),
      deleted: true,
      id: dateId,
    });
  } catch (error) {
    console.error('Failed to delete important date:', error);
    return NextResponse.json(
      { error: 'Failed to delete important date' },
      { status: 500 }
    );
  }
}
