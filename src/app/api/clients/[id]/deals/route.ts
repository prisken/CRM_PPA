import {
  AssignmentRole,
  DealStatus,
  DealType,
  UserRole,
} from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  canViewClientDeals,
  getClientOr404,
  getAuthenticatedUserFromRequest,
  logClientSystemEvent,
  requireDealCreateAccess,
} from '@/lib/authHelpers';
import {
  createCommissionReturnablesForWonDeal,
} from '@/lib/commissionReturnables';
import { listClientDealsForClient360 } from '@/lib/clientDeals';
import {
  dealResponseSelect,
  formatDealResponse,
  parseMoneyValue,
} from '@/lib/dealCalculations';
import {
  buildDefaultParticipantsForDeal,
  parseDealType,
  resolveExplicitDealParticipants,
  toParticipantCreateInput,
  type NormalizedDealParticipant,
} from '@/lib/dealParticipants';
import { timeAsync, timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

async function resolveDealParticipants({
  clientId,
  dealType,
  totalCommission,
  status,
  rawParticipants,
}: {
  clientId: string;
  dealType: DealType;
  totalCommission: number;
  status: DealStatus;
  rawParticipants: unknown;
}): Promise<
  { participants: NormalizedDealParticipant[] } | { error: string; details?: string[] }
> {
  const hasExplicitParticipants =
    Array.isArray(rawParticipants) && rawParticipants.length > 0;

  if (hasExplicitParticipants) {
    return resolveExplicitDealParticipants({
      rawParticipants,
      totalCommission,
      status,
    });
  }

  const assignments = await prisma.clientAssignment.findMany({
    where: { clientId },
    select: { userId: true, role: true },
  });

  const relationshipAssignment = assignments.find(
    (assignment) => assignment.role === AssignmentRole.RELATIONSHIP
  );
  const followUpAssignment = assignments.find(
    (assignment) => assignment.role === AssignmentRole.ACCOUNT_SERVICE
  );
  const doctorAssignments = assignments.filter(
    (assignment) => assignment.role === AssignmentRole.DOCTOR
  );

  const participants = buildDefaultParticipantsForDeal({
    dealType,
    totalCommission,
    currentRelationshipAssignment: relationshipAssignment ?? null,
    currentFollowUpAssignment: followUpAssignment ?? null,
    selectedDoctors: doctorAssignments,
  });

  return { participants };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const auth = await timeAsync('client360:deals:auth', () =>
    getAuthenticatedUserFromRequest(request)
  );
  if (auth.error) {
    return auth.error;
  }

  // Phase 2G: list view only needs canView — avoid getDealAccessForClient's
  // SUPER_ADMIN findMany of all deal ids (manageableDealIds unused on this route).
  const canView = await timeAsync('client360:deals:access', () =>
    canViewClientDeals(auth.user.id, auth.user.role, clientId)
  );
  if (!canView) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = await timeRouteHandler(
    `GET /api/clients/${clientId}/deals`,
    async () => {
      return timeAsync(
        'client360:deals',
        async () => {
          const deals = await listClientDealsForClient360(clientId);

          // Existence check only when the list is empty and access did not prove the
          // client exists (SUPER_ADMIN bypass). Assigned/participant canView implies
          // a live client row — skip the extra Client round-trip.
          if (deals.length === 0 && auth.user.role === UserRole.SUPER_ADMIN) {
            const clientCheck = await timeAsync(
              'client360:deals:clientLookup',
              () => getClientOr404(clientId)
            );
            if (clientCheck.error) {
              return null;
            }
          }

          return {
            client_id: clientId,
            deals,
          };
        },
        (result) => ({
          found: result !== null,
          dealCount: result?.deals.length ?? 0,
        })
      );
    },
    {
      payloadCategory: 'deals',
      getMeta: (result) => ({
        found: result !== null,
        dealCount: result?.deals.length ?? 0,
        dealListView: 'summary',
      }),
    }
  );

  if (!payload) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;
  const auth = await requireDealCreateAccess(clientId, request);
  if (auth.error) {
    return auth.error;
  }

  const clientCheck = await getClientOr404(clientId);
  if (clientCheck.error) {
    return clientCheck.error;
  }

  const body = await request.json();
  const name = body.name?.trim();

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const dealValueResult = parseMoneyValue(
    body.dealValue ?? body.deal_value,
    'dealValue'
  );
  if ('error' in dealValueResult) {
    return NextResponse.json({ error: dealValueResult.error }, { status: 400 });
  }

  const totalCommissionResult = parseMoneyValue(
    body.totalCommission ?? body.total_commission ?? body.grossProfit ?? body.gross_profit,
    'totalCommission'
  );
  if ('error' in totalCommissionResult) {
    return NextResponse.json({ error: totalCommissionResult.error }, { status: 400 });
  }

  const status = body.status ?? DealStatus.PROPOSED;
  if (!Object.values(DealStatus).includes(status)) {
    return NextResponse.json({ error: 'Invalid deal status' }, { status: 400 });
  }

  const dealType = parseDealType(body.dealType ?? body.deal_type, DealType.CUSTOM);
  if (!dealType) {
    return NextResponse.json({ error: 'Invalid deal type' }, { status: 400 });
  }

  const participantsResult = await resolveDealParticipants({
    clientId,
    dealType,
    totalCommission: totalCommissionResult.value,
    status,
    rawParticipants: body.participants,
  });
  if ('error' in participantsResult) {
    return NextResponse.json(
      {
        error: participantsResult.error,
        ...(participantsResult.details
          ? { details: participantsResult.details }
          : {}),
      },
      { status: 400 }
    );
  }

  const deal = await prisma.$transaction(async (tx) =>
    tx.deal.create({
      data: {
        clientId,
        name,
        dealValue: dealValueResult.value,
        totalCommission: totalCommissionResult.value,
        dealType,
        status,
        participants: {
          create: toParticipantCreateInput(participantsResult.participants),
        },
      },
      select: dealResponseSelect,
    })
  );

  if (deal.status === DealStatus.WON) {
    await createCommissionReturnablesForWonDeal({
      dealId: deal.id,
      clientId,
      totalCommission: Number(deal.totalCommission),
    });
  }

  await logClientSystemEvent(
    clientId,
    `Deal created: ${deal.name} (${status})`,
    auth.user.id
  );

  return NextResponse.json(formatDealResponse(deal), { status: 201 });
}
