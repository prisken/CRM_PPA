import { AssignmentRole, ClientStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  canAccessClientHierarchy,
  getAuthenticatedUserFromRequest,
  logClientSystemEvent,
  requireClientEmployeeLeadCreateAccess,
} from '@/lib/authHelpers';
import { loadCompanyHierarchyApiPayload } from '@/lib/client360';
import { timeAsync, timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: clientId } = await params;

    const auth = await timeAsync('client360:hierarchy:auth', () =>
      getAuthenticatedUserFromRequest(request)
    );
    if (auth.error) {
      return auth.error;
    }

    const allowed = await timeAsync('client360:hierarchy:access', () =>
      canAccessClientHierarchy(auth.user.id, auth.user.role, clientId)
    );
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Phase 2F: one combined SQL for target client + colleagues (no clientLookup).
    // 404 vs 403: missing client still 404 for allowed callers (e.g. SUPER_ADMIN);
    // outsiders without assignment remain 403 above (existence not revealed).
    const payload = await timeRouteHandler(
      `GET /api/clients/${clientId}/employees`,
      async () => loadCompanyHierarchyApiPayload(clientId),
      {
        getMeta: (result) => ({
          found: result !== null,
          colleagueCount: result?.colleagueCount ?? 0,
          colleaguesReturned: result?.colleagues.length ?? 0,
        }),
      }
    );

    if (!payload) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Failed to load company hierarchy:', error);
    return NextResponse.json(
      { error: 'Failed to load company hierarchy' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: employerClientId } = await params;
    const auth = await requireClientEmployeeLeadCreateAccess(
      employerClientId,
      request
    );
    if (auth.error) {
      return auth.error;
    }

    const body = await request.json();
    const fullName = body.fullName?.trim();
    const roleInCompany = body.roleInCompany?.trim();

    if (!fullName) {
      return NextResponse.json({ error: 'fullName is required' }, { status: 400 });
    }

    if (!roleInCompany) {
      return NextResponse.json(
        { error: 'roleInCompany is required' },
        { status: 400 }
      );
    }

    const employer = await prisma.client.findUnique({
      where: { id: employerClientId },
      select: { id: true, name: true, company: true },
    });

    if (!employer) {
      return NextResponse.json(
        { error: 'Employer client not found' },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.client.create({
        data: {
          name: fullName,
          roleInCompany,
          company: employer.company,
          status: ClientStatus.NEW_LEAD,
        },
      });

      const assignment = await tx.clientAssignment.create({
        data: {
          clientId: lead.id,
          userId: auth.user.id,
          role: AssignmentRole.RELATIONSHIP,
        },
      });

      return { lead, assignment };
    });

    await logClientSystemEvent(
      result.lead.id,
      `Employee lead created from ${employer.name}`,
      auth.user.id
    );

    return NextResponse.json(
      {
        client_id: result.lead.id,
        name: result.lead.name,
        company: result.lead.company,
        roleInCompany: result.lead.roleInCompany,
        status: result.lead.status,
        employer_client_id: employer.id,
        assignment_id: result.assignment.assignmentId,
        createdAt: result.lead.createdAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create employee lead:', error);
    return NextResponse.json(
      { error: 'Failed to create employee lead' },
      { status: 500 }
    );
  }
}
