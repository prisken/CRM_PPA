import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Slim assignee row for master pipeline cards + assignee filter. */
export type AdminPipelineAssignedUser = {
  user_id: string;
  userName: string;
};

/** Card/list DTO for GET /api/admin/pipeline. */
export type AdminPipelineClient = {
  client_id: string;
  name: string;
  company: string | null;
  status: string;
  assignedUsers: AdminPipelineAssignedUser[];
};

/** Explicit select — only fields needed to build {@link AdminPipelineClient}. */
export const adminPipelineClientSelect = {
  id: true,
  name: true,
  company: true,
  status: true,
  clientAssignments: {
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.ClientSelect;

type AdminPipelineClientRow = Prisma.ClientGetPayload<{
  select: typeof adminPipelineClientSelect;
}>;

export function mapAdminPipelineClient(
  client: AdminPipelineClientRow
): AdminPipelineClient {
  return {
    client_id: client.id,
    name: client.name,
    company: client.company,
    status: client.status,
    assignedUsers: client.clientAssignments.map((assignment) => ({
      user_id: assignment.user.id,
      userName: assignment.user.name ?? assignment.user.email,
    })),
  };
}

export async function fetchAdminPipelineClients(): Promise<AdminPipelineClient[]> {
  const clients = await prisma.client.findMany({
    select: adminPipelineClientSelect,
    orderBy: { createdAt: 'desc' },
  });

  return clients.map(mapAdminPipelineClient);
}
