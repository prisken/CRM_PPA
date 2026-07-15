import { NextResponse } from 'next/server';
import {
  authorizeClientDetailsEdit,
  getClientOr404,
  logClientSystemEvent,
} from '@/lib/authHelpers';
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
      email,
      phone,
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

    let sanitizedImportantDates: ImportantDateDto[] | undefined;
    let previousImportantDates: Array<{
      id: string;
      label: string;
      scheduledAt: Date;
      hasTime: boolean;
    }> = [];

    if (importantDates !== undefined) {
      // clientId from route covers Client and Lead rows. Rejects mismatched body clientId/leadId.
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

    const client = await prisma.$transaction(async (tx) => {
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

      return tx.client.update({
        where: { id: clientId },
        data: {
          ...(name !== undefined && { name: name.trim() }),
          ...(email !== undefined && { email: email?.trim() || null }),
          ...(phone !== undefined && { phone: phone?.trim() || null }),
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
            // Keep legacy JSON in sync for rollback / older readers.
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
        },
      });
    });

    await logClientSystemEvent(
      clientId,
      'Client details updated',
      auth.user.id
    );

    if (sanitizedImportantDates !== undefined) {
      const ownerKind =
        classifyImportantDateRecordType(client.status) === 'Lead'
          ? 'lead'
          : 'client';

      for (const previous of previousImportantDates) {
        await logImportantDateEvent({
          clientId,
          userId: auth.user.id,
          action: 'deleted',
          ownerKind,
          ...importantDateLogFieldsFromRecord(previous),
        });
      }

      for (const created of client.importantDateRecords) {
        await logImportantDateEvent({
          clientId,
          userId: auth.user.id,
          action: 'created',
          ownerKind,
          ...importantDateLogFieldsFromRecord(created),
        });
      }
    }

    const importantDatesResponse =
      client.importantDateRecords.length > 0
        ? client.importantDateRecords.map(formatImportantDateRecord)
        : sanitizedImportantDates ?? [];

    return NextResponse.json({
      client_id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone,
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
    console.error('Failed to update client details:', error);
    return NextResponse.json(
      { error: 'Failed to update client details' },
      { status: 500 }
    );
  }
}
