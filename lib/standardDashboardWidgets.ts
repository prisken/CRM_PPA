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
import {
  calculateCommittedValue,
  calculatePotentialValue,
} from '@/lib/dealCalculations';
import { prisma } from '@/lib/prisma';

const RECENT_ACTIVITY_LIMIT = 15;
const OPEN_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
];

export async function getUserAssignmentClientIds(userId: string) {
  const assignments = await prisma.clientAssignment.findMany({
    where: { userId },
    select: { clientId: true },
  });

  return assignments.map((assignment) => assignment.clientId);
}

export async function buildAssignedClientsWidget(userId: string) {
  const assignments = await prisma.clientAssignment.findMany({
    where: { userId },
    include: {
      client: {
        include: {
          deals: {
            orderBy: { createdAt: 'asc' },
            select: {
              dealValue: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: { client: { name: 'asc' } },
  });

  return {
    assignedClients: assignments.map((assignment) => {
      const committedValue = calculateCommittedValue(assignment.client.deals);
      const potentialValue = calculatePotentialValue(assignment.client.deals);

      return {
        clientId: assignment.client.id,
        clientName: assignment.client.name,
        myRole: formatAssignmentRole(assignment.role),
        clientStatus: formatClientStage(assignment.client.status),
        dealValue: committedValue + potentialValue,
      };
    }),
  };
}

export async function buildOpenTasksWidget(userId: string) {
  const clientIds = await getUserAssignmentClientIds(userId);

  if (clientIds.length === 0) {
    return { openTasks: [] };
  }

  const openTasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      clientId: { in: clientIds },
      status: { in: OPEN_TASK_STATUSES },
    },
    include: {
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
}

export async function buildActivityFeedWidget(userId: string) {
  const clientIds = await getUserAssignmentClientIds(userId);

  if (clientIds.length === 0) {
    return { recentActivity: [] };
  }

  const recentActivity = await buildGroupedRecentActivity(userId, {
    clientIds,
    totalLimit: RECENT_ACTIVITY_LIMIT,
  });

  return { recentActivity };
}

export async function buildPerformanceMetricsWidget(userId: string) {
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
}
