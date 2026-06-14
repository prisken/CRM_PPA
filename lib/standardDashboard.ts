import {
  AssignmentRole,
  ClientStatus,
  TaskStatus,
  type Client,
  type Deal,
} from '@prisma/client';
import { buildGroupedRecentActivity } from '@/lib/activityFeed';
import {
  COMMISSION_RATES,
  formatAssignmentRole,
} from '@/lib/commissionRates';
import { formatClientStage } from '@/lib/clientStages';
import { prisma } from '@/lib/prisma';

const RECENT_ACTIVITY_LIMIT = 15;
const OPEN_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
];

function resolveClientDealValue(
  client: Pick<Client, 'dealValue'>,
  deals: Pick<Deal, 'dealValue'>[]
) {
  if (client.dealValue !== null && client.dealValue !== undefined) {
    return Number(client.dealValue);
  }

  return deals.reduce((total, deal) => total + Number(deal.dealValue), 0);
}

function resolveClientGrossProfit(deals: Pick<Deal, 'grossProfit'>[]) {
  if (deals.length === 0) {
    return 0;
  }

  return Number(deals[0].grossProfit);
}

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
              grossProfit: true,
            },
          },
        },
      },
    },
    orderBy: { client: { name: 'asc' } },
  });

  const clientIds = assignments.map((assignment) => assignment.clientId);

  const [openTasks, recentActivity] = await Promise.all([
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
  ]);

  const assignedClients = assignments.map((assignment) => {
    const dealValue = resolveClientDealValue(
      assignment.client,
      assignment.client.deals
    );

    return {
      clientId: assignment.client.id,
      clientName: assignment.client.name,
      myRole: formatAssignmentRole(assignment.role),
      clientStatus: formatClientStage(assignment.client.status),
      dealValue,
    };
  });

  let totalActiveClients = 0;
  let totalPipelineValue = 0;
  let myPotentialCommission = 0;

  for (const assignment of assignments) {
    const dealValue = resolveClientDealValue(
      assignment.client,
      assignment.client.deals
    );
    const grossProfit = resolveClientGrossProfit(assignment.client.deals);
    const commissionRate = COMMISSION_RATES[assignment.role as AssignmentRole];

    totalPipelineValue += dealValue;
    myPotentialCommission += grossProfit * commissionRate;

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
      myPotentialCommission: Math.round(myPotentialCommission),
    },
  };
}
