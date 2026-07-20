import { AssignmentRole, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export type DashboardClient = {
  client_id: string;
  name: string;
  company: string | null;
  contactInfo: string | null;
  status: string;
  pendingNotifications: boolean;
  createdAt: Date;
  lastModified: Date;
  userRoleForThisClient: AssignmentRole | null;
};

function mapClient(
  client: {
    id: string;
    name: string;
    company: string | null;
    contactInfo: string | null;
    status: string;
    pendingNotifications: boolean;
    createdAt: Date;
    lastModified: Date;
  },
  userRoleForThisClient: AssignmentRole | null
): DashboardClient {
  return {
    client_id: client.id,
    name: client.name,
    company: client.company,
    contactInfo: client.contactInfo,
    status: client.status,
    pendingNotifications: client.pendingNotifications,
    createdAt: client.createdAt,
    lastModified: client.lastModified,
    userRoleForThisClient,
  };
}

/** Legacy dashboard list — Bearer or session; rejects deactivated users. */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const dbUser = auth.user;

  // Super admins see every client (no per-client assignment role)
  if (dbUser.role === UserRole.SUPER_ADMIN) {
    const clients = await prisma.client.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      clients.map((client) => mapClient(client, null))
    );
  }

  // Standard users: fetch clients via client_assignments junction table
  const assignments = await prisma.clientAssignment.findMany({
    where: { userId: dbUser.id },
    include: { client: true },
    orderBy: { client: { createdAt: 'desc' } },
  });

  const clients: DashboardClient[] = assignments.map((assignment) =>
    mapClient(assignment.client, assignment.role)
  );

  return NextResponse.json(clients);
}
