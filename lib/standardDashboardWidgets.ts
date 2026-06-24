import {
  AssignmentRole,
  ClientStatus,
  DealStatus,
  TaskStatus,
} from '@prisma/client';
import { buildGroupedRecentActivity } from '@/lib/activityFeed';
import {
  buildRoleOccupancyMap,
  calculateIndividualRoleShare,
  getRoleOccupancy,
} from '@/lib/commissionCalculations';
import { formatAssignmentRole } from '@/lib/commissionRates';
import { formatClientStage } from '@/lib/clientStages';
import { prisma } from '@/lib/prisma';
import { timeAsync } from '@/lib/performance';

const RECENT_ACTIVITY_LIMIT = 15;
const OPEN_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
];

async function userHasClientAssignments(userId: string) {
  const assignment = await prisma.clientAssignment.findFirst({
    where: { userId },
    select: { assignmentId: true },
  });

  return assignment !== null;
}

function buildDealValueMaps(
  wonDealTotals: { clientId: string; _sum: { dealValue: unknown } }[],
  proposedDealTotals: { clientId: string; _sum: { dealValue: unknown } }[]
) {
  const committedValueByClient = new Map(
    wonDealTotals.map((entry) => [
      entry.clientId,
      Number(entry._sum.dealValue ?? 0),
    ])
  );
  const potentialValueByClient = new Map(
    proposedDealTotals.map((entry) => [
      entry.clientId,
      Number(entry._sum.dealValue ?? 0),
    ])
  );

  return { committedValueByClient, potentialValueByClient };
}

export async function buildAssignedClientsWidget(userId: string) {
  return timeAsync(
    'widget:buildAssignedClientsWidget',
    async () => {
      const assignments = await prisma.clientAssignment.findMany({
        where: { userId },
        select: {
          role: true,
          client: {
            select: {
              id: true,
              name: true,
              status: true,
            },
          },
        },
        orderBy: { client: { name: 'asc' } },
      });

      if (assignments.length === 0) {
        return { assignedClients: [] };
      }

      const clientIds = [...new Set(assignments.map((assignment) => assignment.client.id))];

      const [wonDealTotals, proposedDealTotals] = await Promise.all([
        prisma.deal.groupBy({
          by: ['clientId'],
          where: {
            clientId: { in: clientIds },
            status: DealStatus.WON,
          },
          _sum: {
            dealValue: true,
          },
        }),
        prisma.deal.groupBy({
          by: ['clientId'],
          where: {
            clientId: { in: clientIds },
            status: DealStatus.PROPOSED,
          },
          _sum: {
            dealValue: true,
          },
        }),
      ]);

      const { committedValueByClient, potentialValueByClient } = buildDealValueMaps(
        wonDealTotals,
        proposedDealTotals
      );

      return {
        assignedClients: assignments.map((assignment) => {
          const committedValue =
            committedValueByClient.get(assignment.client.id) ?? 0;
          const potentialValue =
            potentialValueByClient.get(assignment.client.id) ?? 0;

          return {
            clientId: assignment.client.id,
            clientName: assignment.client.name,
            myRole: formatAssignmentRole(assignment.role),
            clientStatus: formatClientStage(assignment.client.status),
            dealValue: committedValue + potentialValue,
          };
        }),
      };
    },
    (result) => ({
      userId,
      assignmentCount: result.assignedClients.length,
    })
  );
}

export async function buildOpenTasksWidget(userId: string) {
  return timeAsync(
    'widget:buildOpenTasksWidget',
    async () => {
      const openTasks = await prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { in: OPEN_TASK_STATUSES },
          client: {
            clientAssignments: {
              some: { userId },
            },
          },
        },
        select: {
          id: true,
          clientId: true,
          title: true,
          description: true,
          dueDate: true,
          client: {
            select: { name: true, company: true },
          },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      });

      return {
        openTasks: openTasks.map((task) => ({
          taskId: task.id,
          clientId: task.clientId,
          description: task.description?.trim() || task.title,
          clientName: task.client.company ?? task.client.name,
          dueDate: task.dueDate?.toISOString() ?? null,
        })),
      };
    },
    (result) => ({
      userId,
      taskCount: result.openTasks.length,
    })
  );
}

export async function buildActivityFeedWidget(userId: string) {
  return timeAsync(
    'widget:buildActivityFeedWidget',
    async () => {
      const hasAssignments = await userHasClientAssignments(userId);

      if (!hasAssignments) {
        return { recentActivity: [] };
      }

      const recentActivity = await buildGroupedRecentActivity(userId, {
        assignedUserId: userId,
        totalLimit: RECENT_ACTIVITY_LIMIT,
      });

      return { recentActivity };
    },
    (result) => ({
      userId,
      groupCount: result.recentActivity.length,
    })
  );
}

export async function buildPerformanceMetricsWidget(userId: string) {
  return timeAsync(
    'widget:buildPerformanceMetricsWidget',
    async () => {
      const assignments = await prisma.clientAssignment.findMany({
        where: { userId },
        select: {
          clientId: true,
          role: true,
          client: {
            select: { status: true },
          },
        },
      });

      if (assignments.length === 0) {
        return {
          hasAnyAssignment: false,
          performanceMetrics: {
            totalActiveClients: 0,
            totalPipelineValue: 0,
            mySecuredCommission: 0,
          },
        };
      }

      const clientIds = [...new Set(assignments.map((assignment) => assignment.clientId))];

      const [wonDealTotals, proposedDealTotals, clientRoleAssignments] = await Promise.all([
        prisma.deal.groupBy({
          by: ['clientId'],
          where: {
            clientId: { in: clientIds },
            status: DealStatus.WON,
          },
          _sum: {
            totalCommission: true,
          },
        }),
        prisma.deal.groupBy({
          by: ['clientId'],
          where: {
            clientId: { in: clientIds },
            status: DealStatus.PROPOSED,
          },
          _sum: {
            dealValue: true,
          },
        }),
        prisma.clientAssignment.findMany({
          where: { clientId: { in: clientIds } },
          select: { clientId: true, role: true },
        }),
      ]);

      const wonCommissionByClient = new Map(
        wonDealTotals.map((entry) => [
          entry.clientId,
          Number(entry._sum.totalCommission ?? 0),
        ])
      );
      const proposedValueByClient = new Map(
        proposedDealTotals.map((entry) => [
          entry.clientId,
          Number(entry._sum.dealValue ?? 0),
        ])
      );
      const roleOccupancyMap = buildRoleOccupancyMap(clientRoleAssignments);

      let totalActiveClients = 0;
      let totalPipelineValue = 0;
      let mySecuredCommission = 0;

      for (const assignment of assignments) {
        const wonCommissionTotal = wonCommissionByClient.get(assignment.clientId) ?? 0;
        const roleOccupancy = getRoleOccupancy(
          roleOccupancyMap,
          assignment.clientId,
          assignment.role
        );
        const individualShare = calculateIndividualRoleShare(
          assignment.role as AssignmentRole,
          roleOccupancy
        );

        totalPipelineValue += proposedValueByClient.get(assignment.clientId) ?? 0;
        mySecuredCommission += wonCommissionTotal * individualShare;

        if (assignment.client.status === ClientStatus.ACTIVE_CLIENT) {
          totalActiveClients += 1;
        }
      }

      return {
        hasAnyAssignment: true,
        performanceMetrics: {
          totalActiveClients,
          totalPipelineValue: Math.round(totalPipelineValue),
          mySecuredCommission: Math.round(mySecuredCommission),
        },
      };
    },
    (result) => ({
      userId,
      hasAnyAssignment: result.hasAnyAssignment,
    })
  );
}
