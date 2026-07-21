import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import {
  authorizeClientDetailsEdit,
  getClientOr404,
  logClientSystemEvent,
} from '@/lib/authHelpers';
import {
  clientContactSelect,
  parseClientContactInput,
  replaceClientContacts,
  resolveContactsFromRecords,
} from '@/lib/clientContacts';
import {
  logImportantDateEvent,
  importantDateLogFieldsFromRecord,
} from '@/lib/importantDateActivity';
import {
  classifyImportantDateRecordType,
  dtoToCreateManyInput,
  formatImportantDateRecord,
  importantDateRecordSelect,
  parseImportantDatesReplaceInput,
  toLegacyImportantDatesJson,
  type ImportantDateDto,
} from '@/lib/importantDates';
import { prisma } from '@/lib/prisma';
import { runWriteTransaction } from '@/lib/prismaWrite';

function formatRouteError(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `prisma:${error.code}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown';
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;
    const auth = await authorizeClientDetailsEdit(request, clientId);
    if (auth.error) {
      return auth.error;
    }

    const clientCheck = await getClientOr404(clientId);
    if (clientCheck.error) {
      return clientCheck.error;
    }

    const body = await request.json();
    const {
      name,
      lead_source,
      company,
      contactInfo,
      roleInCompany,
      employeeCount,
      expectations,
      importantDates,
    } = body;

    if (name !== undefined && !name?.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }

    if (employeeCount !== undefined && employeeCount !== null) {
      const parsedCount = Number(employeeCount);
      if (!Number.isInteger(parsedCount) || parsedCount < 0) {
        return NextResponse.json(
          { error: 'employeeCount must be a non-negative integer' },
          { status: 400 }
        );
      }
    }

    const contactsParsed = parseClientContactInput(body);
    if (!contactsParsed.ok) {
      return NextResponse.json({ error: contactsParsed.error }, { status: 400 });
    }

    let sanitizedImportantDates: ImportantDateDto[] | undefined;
    let previousImportantDates: Array<{
      id: string;
      label: string;
      scheduledAt: Date;
      hasTime: boolean;
    }> = [];

    if (importantDates !== undefined) {
      const parsed = parseImportantDatesReplaceInput(clientId, body);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      sanitizedImportantDates = parsed.data.importantDates;
      previousImportantDates = await prisma.clientImportantDate.findMany({
        where: { clientId },
        select: {
          id: true,
          label: true,
          scheduledAt: true,
          hasTime: true,
        },
      });
    }

    const client = await runWriteTransaction(async (tx) => {
      if (sanitizedImportantDates !== undefined) {
        await tx.clientImportantDate.deleteMany({ where: { clientId } });
        if (sanitizedImportantDates.length > 0) {
          await tx.clientImportantDate.createMany({
            data: dtoToCreateManyInput(
              clientId,
              sanitizedImportantDates,
              auth.user.id
            ),
          });
        }
      }

      if (
        contactsParsed.data.emailsProvided ||
        contactsParsed.data.phonesProvided
      ) {
        await replaceClientContacts(tx, clientId, {
          emails: contactsParsed.data.emailsProvided
            ? contactsParsed.data.emails
            : undefined,
          phones: contactsParsed.data.phonesProvided
            ? contactsParsed.data.phones
            : undefined,
        });
      }

      return tx.client.update({
        where: { id: clientId },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(lead_source !== undefined && {
            leadSource: lead_source?.trim() || null,
          }),
          ...(company !== undefined && { company: company?.trim() || null }),
          ...(contactInfo !== undefined && {
            contactInfo: contactInfo?.trim() || null,
          }),
          ...(roleInCompany !== undefined && {
            roleInCompany: roleInCompany?.trim() || null,
          }),
          ...(employeeCount !== undefined && {
            employeeCount:
              employeeCount === null ? null : Number(employeeCount),
          }),
          ...(expectations !== undefined && {
            expectations: expectations?.trim() || null,
          }),
          ...(sanitizedImportantDates !== undefined && {
            importantDates: toLegacyImportantDatesJson(sanitizedImportantDates),
          }),
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          leadSource: true,
          company: true,
          contactInfo: true,
          roleInCompany: true,
          employeeCount: true,
          expectations: true,
          importantDates: true,
          lastModified: true,
          status: true,
          importantDateRecords: {
            orderBy: { scheduledAt: 'asc' },
            select: importantDateRecordSelect,
          },
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
            select: clientContactSelect,
          },
        },
      });
    });

    try {
      await logClientSystemEvent(
        clientId,
        'Client details updated',
        auth.user.id
      );
    } catch (logError) {
      console.error('Client details saved but activity log failed:', logError);
    }

    if (sanitizedImportantDates !== undefined) {
      const ownerKind =
        classifyImportantDateRecordType(client.status) === 'Lead'
          ? 'lead'
          : 'client';

      for (const previous of previousImportantDates) {
        try {
          await logImportantDateEvent({
            clientId,
            userId: auth.user.id,
            action: 'deleted',
            ownerKind,
            ...importantDateLogFieldsFromRecord(previous),
          });
        } catch (logError) {
          console.error('Important date delete log failed:', logError);
        }
      }

      for (const created of client.importantDateRecords) {
        try {
          await logImportantDateEvent({
            clientId,
            userId: auth.user.id,
            action: 'created',
            ownerKind,
            ...importantDateLogFieldsFromRecord(created),
          });
        } catch (logError) {
          console.error('Important date create log failed:', logError);
        }
      }
    }

    const importantDatesResponse =
      client.importantDateRecords.length > 0
        ? client.importantDateRecords.map(formatImportantDateRecord)
        : sanitizedImportantDates ?? [];

    const contacts = resolveContactsFromRecords(
      client.contacts,
      client.email,
      client.phone
    );

    return NextResponse.json({
      client_id: client.id,
      name: client.name,
      email: contacts.email,
      phone: contacts.phone,
      emails: contacts.emails,
      phones: contacts.phones,
      lead_source: client.leadSource,
      company: client.company,
      contactInfo: client.contactInfo,
      roleInCompany: client.roleInCompany,
      employeeCount: client.employeeCount,
      expectations: client.expectations,
      importantDates: importantDatesResponse,
      lastModified: client.lastModified.toISOString(),
    });
  } catch (error) {
    console.error('Failed to update client details:', formatRouteError(error), error);
    return NextResponse.json(
      { error: 'Failed to update client details' },
      { status: 500 }
    );
  }
}
