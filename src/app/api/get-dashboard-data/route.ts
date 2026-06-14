import { AssignmentRole, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

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

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true },
  });

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

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
    where: { userId: user.id },
    include: { client: true },
    orderBy: { client: { createdAt: 'desc' } },
  });

  const clients: DashboardClient[] = assignments.map((assignment) =>
    mapClient(assignment.client, assignment.role)
  );

  return NextResponse.json(clients);
}
