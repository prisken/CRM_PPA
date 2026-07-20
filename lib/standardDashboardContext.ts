import { AssignmentRole, ClientStatus } from '@prisma/client';
import { buildRoleOccupancyMap } from '@/lib/commissionCalculations';
import {
  fetchDealAggregatesByClientIds,
  fetchWonDealsWithParticipantsByClientIds,
  type DashboardWonDealForCommission,
} from '@/lib/dashboardDealAggregates';
import { prisma } from '@/lib/prisma';
import { timeAsync } from '@/lib/performance';

export type StandardDashboardAssignment = {
  clientId: string;
  role: AssignmentRole;
  clientName: string;
  clientStatus: ClientStatus;
};

export type StandardDashboardContext = {
  assignments: StandardDashboardAssignment[];
  clientIds: string[];
  dealAggregates: Awaited<ReturnType<typeof fetchDealAggregatesByClientIds>>;
  wonDeals: DashboardWonDealForCommission[];
  roleOccupancyMap: Map<string, number>;
};

export async function loadStandardDashboardContext(
  userId: string
): Promise<StandardDashboardContext> {
  return timeAsync('dashboard:loadContext', async () => {
    const assignmentRows = await prisma.clientAssignment.findMany({
      where: { userId },
      select: {
        role: true,
        clientId: true,
        client: {
          select: {
            name: true,
            status: true,
          },
        },
      },
      orderBy: { client: { name: 'asc' } },
    });

    if (assignmentRows.length === 0) {
      return {
        assignments: [],
        clientIds: [],
        dealAggregates: new Map(),
        wonDeals: [],
        roleOccupancyMap: new Map(),
      };
    }

    const clientIds = [...new Set(assignmentRows.map((row) => row.clientId))];

    const [dealAggregates, wonDeals, allClientAssignments] = await Promise.all([
      fetchDealAggregatesByClientIds(clientIds),
      fetchWonDealsWithParticipantsByClientIds(clientIds),
      prisma.clientAssignment.findMany({
        where: { clientId: { in: clientIds } },
        select: { clientId: true, role: true },
      }),
    ]);

    return {
      assignments: assignmentRows.map((row) => ({
        clientId: row.clientId,
        role: row.role,
        clientName: row.client.name,
        clientStatus: row.client.status,
      })),
      clientIds,
      dealAggregates,
      wonDeals,
      roleOccupancyMap: buildRoleOccupancyMap(allClientAssignments),
    };
  });
}
