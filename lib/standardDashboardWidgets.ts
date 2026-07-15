import {
  AssignmentRole,
  ClientStatus,
  DealParticipantRole,
  DealStatus,
  TaskStatus,
} from '@prisma/client';
import { buildGroupedRecentActivity } from '@/lib/activityFeed';
import {
  formatAssignmentRoleLabel,
  CLIENT_TEAM_ASSIGNMENT_ROLES,
  formatClientTeamAssignmentRoleLabel,
  isClientTeamAssignmentRole,
} from '@/lib/constants';
import { formatClientStage } from '@/lib/clientStages';
import {
  calculateDealParticipantAmount,
  roundMoney,
} from '@/lib/dealParticipantCalculations';
import {
  fetchDealAggregatesByClientIds,
  getClientDealAggregates,
} from '@/lib/dashboardDealAggregates';
import { calculateMySecuredCommissionWithLegacyFallback } from '@/lib/dealParticipantCalculations';
import { prisma } from '@/lib/prisma';
import { timeAsync } from '@/lib/performance';
import {
  loadStandardDashboardContext,
  type StandardDashboardContext,
} from '@/lib/standardDashboardContext';

const RECENT_ACTIVITY_LIMIT = 15;
const DEAL_PARTICIPATION_LIMIT = 20;

const DEAL_STATUS_SORT_ORDER: Record<DealStatus, number> = {
  [DealStatus.WON]: 0,
  [DealStatus.PROPOSED]: 1,
  [DealStatus.ON_HOLD]: 2,
  [DealStatus.LOST]: 3,
};
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
  const [teamAssignmentRows, legacyDoctorRows] = await Promise.all([
    prisma.clientAssignment.findMany({
      where: {
        userId,
        role: { in: CLIENT_TEAM_ASSIGNMENT_ROLES },
      },
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
    }),
    prisma.clientAssignment.findMany({
      where: {
        userId,
        role: AssignmentRole.DOCTOR,
      },
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
    }),
  ]);

  if (teamAssignmentRows.length === 0 && legacyDoctorRows.length === 0) {
    return null;
  }

  const clientIds = [
    ...new Set([
      ...teamAssignmentRows.map((row) => row.clientId),
      ...legacyDoctorRows.map((row) => row.clientId),
    ]),
  ];
  const dealAggregates = await fetchDealAggregatesByClientIds(clientIds);

  return {
    teamAssignments: teamAssignmentRows.map((row) => ({
      clientId: row.clientId,
      role: row.role,
      clientName: row.client.name,
      clientStatus: row.client.status,
    })),
    legacyDoctorAssignments: legacyDoctorRows.map((row) => ({
      clientId: row.clientId,
      role: row.role,
      clientName: row.client.name,
      clientStatus: row.client.status,
    })),
    dealAggregates,
  };
}

type TeamAssignmentSourceRow = {
  clientId: string;
  role: AssignmentRole;
  clientName: string;
  clientStatus: ClientStatus;
};

function groupClientAssignmentsByClient(
  assignments: TeamAssignmentSourceRow[],
  dealAggregates: Awaited<ReturnType<typeof fetchDealAggregatesByClientIds>>,
  options: { legacyDoctor?: boolean } = {}
) {
  const grouped = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      clientStatus: ClientStatus;
      roles: AssignmentRole[];
    }
  >();

  for (const assignment of assignments) {
    if (!options.legacyDoctor && !isClientTeamAssignmentRole(assignment.role)) {
      continue;
    }

    if (options.legacyDoctor && assignment.role !== AssignmentRole.DOCTOR) {
      continue;
    }

    const existing = grouped.get(assignment.clientId);
    if (existing) {
      existing.roles.push(assignment.role);
      continue;
    }

    grouped.set(assignment.clientId, {
      clientId: assignment.clientId,
      clientName: assignment.clientName,
      clientStatus: assignment.clientStatus,
      roles: [assignment.role],
    });
  }

  return Array.from(grouped.values())
    .sort((left, right) => left.clientName.localeCompare(right.clientName))
    .map((entry) => {
      const aggregates = getClientDealAggregates(dealAggregates, entry.clientId);
      const roleLabels = options.legacyDoctor
        ? [formatAssignmentRoleLabel(AssignmentRole.DOCTOR)]
        : [...new Set(entry.roles.filter(isClientTeamAssignmentRole))].map((role) =>
            formatClientTeamAssignmentRoleLabel(role)
          );

      return {
        clientId: entry.clientId,
        clientName: entry.clientName,
        myRole: roleLabels.join(', '),
        myRoles: roleLabels,
        clientStatus: formatClientStage(entry.clientStatus),
        dealValue: aggregates.wonDealValue + aggregates.proposedDealValue,
      };
    });
}

function buildAssignedClientsWidgetPayload(
  teamAssignments: TeamAssignmentSourceRow[],
  legacyDoctorAssignments: TeamAssignmentSourceRow[],
  dealAggregates: Awaited<ReturnType<typeof fetchDealAggregatesByClientIds>>
) {
  const assignedClients = groupClientAssignmentsByClient(
    teamAssignments,
    dealAggregates
  );
  const legacyRows = groupClientAssignmentsByClient(
    legacyDoctorAssignments,
    dealAggregates,
    { legacyDoctor: true }
  );

  return {
    assignedClients,
    ...(legacyRows.length > 0
      ? { legacyDoctorAssignments: legacyRows }
      : {}),
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
        const teamAssignments = context.assignments.filter((assignment) =>
          isClientTeamAssignmentRole(assignment.role)
        );
        const legacyDoctorAssignments = context.assignments.filter(
          (assignment) => assignment.role === AssignmentRole.DOCTOR
        );

        if (teamAssignments.length === 0 && legacyDoctorAssignments.length === 0) {
          return { assignedClients: [] };
        }

        return buildAssignedClientsWidgetPayload(
          teamAssignments,
          legacyDoctorAssignments,
          context.dealAggregates
        );
      }

      const source = await loadAssignedClientsSource(userId);
      if (!source) {
        return { assignedClients: [] };
      }

      return buildAssignedClientsWidgetPayload(
        source.teamAssignments,
        source.legacyDoctorAssignments,
        source.dealAggregates
      );
    },
    (result) => ({
      userId,
      assignmentCount: result.assignedClients.length,
    })
  );
}

export async function buildDealParticipationWidget(userId: string) {
  return timeAsync(
    'widget:buildDealParticipationWidget',
    async () => {
      const participantRows = await prisma.dealParticipant.findMany({
        where: { userId },
        select: {
          role: true,
          commissionPercent: true,
          commissionAmount: true,
          isCommissionable: true,
          deal: {
            select: {
              id: true,
              name: true,
              status: true,
              dealType: true,
              updatedAt: true,
              totalCommission: true,
              clientId: true,
              client: {
                select: {
                  name: true,
                  company: true,
                },
              },
            },
          },
        },
      });

      if (participantRows.length === 0) {
        return { deals: [] };
      }

      type DealParticipationGroup = {
        dealId: string;
        dealName: string;
        clientId: string;
        clientName: string;
        status: DealStatus;
        dealType: string;
        updatedAt: Date;
        myRoles: Set<DealParticipantRole>;
        myCommissionPercent: number;
        myCommissionAmount: number;
      };

      const groupedDeals = new Map<string, DealParticipationGroup>();

      for (const row of participantRows) {
        const deal = row.deal;
        const existing = groupedDeals.get(deal.id);

        const participantAmount = calculateDealParticipantAmount(
          deal.totalCommission,
          row
        );
        const participantPercent = Number(row.commissionPercent);

        if (!existing) {
          groupedDeals.set(deal.id, {
            dealId: deal.id,
            dealName: deal.name,
            clientId: deal.clientId,
            clientName: deal.client.company?.trim() || deal.client.name,
            status: deal.status,
            dealType: deal.dealType,
            updatedAt: deal.updatedAt,
            myRoles: new Set([row.role]),
            myCommissionPercent: participantPercent,
            myCommissionAmount: participantAmount,
          });
          continue;
        }

        existing.myRoles.add(row.role);
        existing.myCommissionPercent += participantPercent;
        existing.myCommissionAmount += participantAmount;

        if (deal.updatedAt > existing.updatedAt) {
          existing.updatedAt = deal.updatedAt;
        }
      }

      const deals = Array.from(groupedDeals.values())
        .sort((left, right) => {
          const statusDiff =
            DEAL_STATUS_SORT_ORDER[left.status] -
            DEAL_STATUS_SORT_ORDER[right.status];

          if (statusDiff !== 0) {
            return statusDiff;
          }

          return right.updatedAt.getTime() - left.updatedAt.getTime();
        })
        .slice(0, DEAL_PARTICIPATION_LIMIT)
        .map((deal) => ({
          dealId: deal.dealId,
          dealName: deal.dealName,
          clientId: deal.clientId,
          clientName: deal.clientName,
          status: deal.status,
          dealType: deal.dealType,
          myRoles: Array.from(deal.myRoles).sort(),
          myCommissionPercent: roundMoney(deal.myCommissionPercent),
          myCommissionAmount: roundMoney(deal.myCommissionAmount),
        }));

      return { deals };
    },
    (result) => ({
      userId,
      dealCount: result.deals.length,
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

      for (const assignment of dashboardContext.assignments) {
        const aggregates = getClientDealAggregates(
          dashboardContext.dealAggregates,
          assignment.clientId
        );

        totalPipelineValue += aggregates.proposedDealValue;

        if (assignment.clientStatus === ClientStatus.ACTIVE_CLIENT) {
          totalActiveClients += 1;
        }
      }

      const mySecuredCommission = calculateMySecuredCommissionWithLegacyFallback(
        userId,
        dashboardContext.wonDeals.map((deal) => ({
          id: deal.id,
          clientId: deal.clientId,
          totalCommission: deal.totalCommission,
          status: DealStatus.WON,
          participants: deal.participants.map((participant) => ({
            id: participant.id,
            userId: participant.userId,
            role: participant.role,
            commissionPercent: participant.commissionPercent,
            commissionAmount: participant.commissionAmount,
            isCommissionable: participant.isCommissionable,
          })),
        })),
        dashboardContext.assignments.map((assignment) => ({
          clientId: assignment.clientId,
          role: assignment.role as AssignmentRole,
        })),
        dashboardContext.roleOccupancyMap
      );

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
