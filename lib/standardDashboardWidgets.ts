import {
  AssignmentRole,
  ClientStatus,
  TaskStatus,
} from '@prisma/client';
import { buildGroupedRecentActivity } from '@/lib/activityFeed';
import {
  calculateIndividualRoleShare,
  getRoleOccupancy,
} from '@/lib/commissionCalculations';
import { formatAssignmentRole } from '@/lib/commissionRates';
import { formatClientStage } from '@/lib/clientStages';
import {
  fetchDealAggregatesByClientIds,
  getClientDealAggregates,
} from '@/lib/dashboardDealAggregates';
import { prisma } from '@/lib/prisma';
import { timeAsync } from '@/lib/performance';
import {
  loadStandardDashboardContext,
  type StandardDashboardContext,
} from '@/lib/standardDashboardContext';

const RECENT_ACTIVITY_LIMIT = 15;
const OPEN_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
];

async function fetchAssignedClientIds(userId: string) {
  const rows = await prisma.clientAssignment.findMany({
    where: { userId },
    select: { clientId: true },
    distinct: ['clientId'],
  });

  return rows.map((row) => row.clientId);
}

async function loadAssignedClientsSource(userId: string) {
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
    return null;
  }

  const clientIds = [...new Set(assignmentRows.map((row) => row.clientId))];
  const dealAggregates = await fetchDealAggregatesByClientIds(clientIds);

  return {
    assignments: assignmentRows.map((row) => ({
      clientId: row.clientId,
      role: row.role,
      clientName: row.client.name,
      clientStatus: row.client.status,
    })),
    dealAggregates,
  };
}

export async function buildAssignedClientsWidget(
  userId: string,
  context?: StandardDashboardContext
) {
  return timeAsync(
    'widget:buildAssignedClientsWidget',
    async () => {
      if (context) {
        if (context.assignments.length === 0) {
          return { assignedClients: [] };
        }

        return {
          assignedClients: context.assignments.map((assignment) => {
            const aggregates = getClientDealAggregates(
              context.dealAggregates,
              assignment.clientId
            );

            return {
              clientId: assignment.clientId,
              clientName: assignment.clientName,
              myRole: formatAssignmentRole(assignment.role),
              clientStatus: formatClientStage(assignment.clientStatus),
              dealValue: aggregates.wonDealValue + aggregates.proposedDealValue,
            };
          }),
        };
      }

      const source = await loadAssignedClientsSource(userId);
      if (!source) {
        return { assignedClients: [] };
      }

      return {
        assignedClients: source.assignments.map((assignment) => {
          const aggregates = getClientDealAggregates(
            source.dealAggregates,
            assignment.clientId
          );

          return {
            clientId: assignment.clientId,
            clientName: assignment.clientName,
            myRole: formatAssignmentRole(assignment.role),
            clientStatus: formatClientStage(assignment.clientStatus),
            dealValue: aggregates.wonDealValue + aggregates.proposedDealValue,
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

export async function buildOpenTasksWidget(
  userId: string,
  context?: StandardDashboardContext
) {
  return timeAsync(
    'widget:buildOpenTasksWidget',
    async () => {
      const clientIds = context?.clientIds ?? (await fetchAssignedClientIds(userId));

      if (clientIds.length === 0) {
        return { openTasks: [] };
      }

      const openTasks = await prisma.task.findMany({
        where: {
          assigneeId: userId,
          status: { in: OPEN_TASK_STATUSES },
          clientId: { in: clientIds },
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

export async function buildActivityFeedWidget(
  userId: string,
  context?: StandardDashboardContext
) {
  return timeAsync(
    'widget:buildActivityFeedWidget',
    async () => {
      if (context && context.clientIds.length === 0) {
        return { recentActivity: [] };
      }

      const recentActivity = await buildGroupedRecentActivity(userId, {
        clientIds: context?.clientIds,
        assignedUserId: context ? undefined : userId,
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

export async function buildPerformanceMetricsWidget(
  userId: string,
  context?: StandardDashboardContext
) {
  return timeAsync(
    'widget:buildPerformanceMetricsWidget',
    async () => {
      const dashboardContext =
        context ?? (await loadStandardDashboardContext(userId));

      if (dashboardContext.assignments.length === 0) {
        return {
          hasAnyAssignment: false,
          performanceMetrics: {
            totalActiveClients: 0,
            totalPipelineValue: 0,
            mySecuredCommission: 0,
          },
        };
      }

      let totalActiveClients = 0;
      let totalPipelineValue = 0;
      let mySecuredCommission = 0;

      for (const assignment of dashboardContext.assignments) {
        const aggregates = getClientDealAggregates(
          dashboardContext.dealAggregates,
          assignment.clientId
        );
        const roleOccupancy = getRoleOccupancy(
          dashboardContext.roleOccupancyMap,
          assignment.clientId,
          assignment.role
        );
        const individualShare = calculateIndividualRoleShare(
          assignment.role as AssignmentRole,
          roleOccupancy
        );

        totalPipelineValue += aggregates.proposedDealValue;
        mySecuredCommission += aggregates.wonCommission * individualShare;

        if (assignment.clientStatus === ClientStatus.ACTIVE_CLIENT) {
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
