import {
  AssignmentRole,
  ClientStatus,
  TaskStatus,
} from '@prisma/client';
import { buildGroupedRecentActivity } from '@/lib/activityFeed';
import {
  buildRoleOccupancyMap,
  calculateAssignmentSecuredCommission,
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

export async function buildStandardDashboard(userId: string) {
  const assignments = await prisma.clientAssignment.findMany({
    where: { userId },
    include: {
      client: {
        include: {
          deals: {
            orderBy: { createdAt: 'asc' },
            select: {
              dealValue: true,
              totalCommission: true,
              status: true,
            },
          },
        },
      },
    },
    orderBy: { client: { name: 'asc' } },
  });

  const clientIds = assignments.map((assignment) => assignment.clientId);

  const [openTasks, recentActivity, clientRoleAssignments] = await Promise.all([
    clientIds.length === 0
      ? Promise.resolve([])
      : prisma.task.findMany({
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
        }),
    buildGroupedRecentActivity(userId, {
      clientIds,
      totalLimit: RECENT_ACTIVITY_LIMIT,
      perSourceLimit: RECENT_ACTIVITY_LIMIT,
    }),
    clientIds.length === 0
      ? Promise.resolve([])
      : prisma.clientAssignment.findMany({
          where: { clientId: { in: clientIds } },
          select: { clientId: true, role: true },
        }),
  ]);

  const roleOccupancyMap = buildRoleOccupancyMap(clientRoleAssignments);

  const assignedClients = assignments.map((assignment) => {
    const committedValue = calculateCommittedValue(assignment.client.deals);
    const potentialValue = calculatePotentialValue(assignment.client.deals);

    return {
      clientId: assignment.client.id,
      clientName: assignment.client.name,
      myRole: formatAssignmentRole(assignment.role),
      clientStatus: formatClientStage(assignment.client.status),
      dealValue: committedValue + potentialValue,
    };
  });

  let totalActiveClients = 0;
  let totalPipelineValue = 0;
  let mySecuredCommission = 0;

  for (const assignment of assignments) {
    const potentialValue = calculatePotentialValue(assignment.client.deals);
    const roleOccupancy = getRoleOccupancy(
      roleOccupancyMap,
      assignment.clientId,
      assignment.role
    );

    totalPipelineValue += potentialValue;
    mySecuredCommission += calculateAssignmentSecuredCommission(
      assignment.client.deals,
      assignment.role as AssignmentRole,
      roleOccupancy
    );

    if (assignment.client.status === ClientStatus.ACTIVE_CLIENT) {
      totalActiveClients += 1;
    }
  }

  return {
    assignedClients,
    openTasks: openTasks.map((task) => ({
      taskId: task.id,
      clientId: task.clientId,
      description: task.description?.trim() || task.title,
      clientName: task.client.company ?? task.client.name,
      dueDate: task.dueDate?.toISOString() ?? null,
    })),
    recentActivity,
    performanceMetrics: {
      totalActiveClients,
      totalPipelineValue: Math.round(totalPipelineValue),
      mySecuredCommission: Math.round(mySecuredCommission),
    },
  };
}
