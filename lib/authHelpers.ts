import { AssignmentRole, ClientStatus, UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import {
  canAssignmentRoleChangePipelineStatus,
} from '@/lib/pipelinePermissions';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function requireSuperAdmin() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const user = session?.user;

  if (sessionError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true },
  });

  if (!dbUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  if (dbUser.role !== UserRole.SUPER_ADMIN) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user: dbUser };
}

export async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  const user = session?.user;

  if (sessionError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, name: true, email: true },
  });

  if (!dbUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  return { user: dbUser };
}

export async function getAuthenticatedUserFromRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    try {
      const { verifyAuthToken } = await import('@/lib/jwt');
      const payload = await verifyAuthToken(token);

      const dbUser = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { id: true, role: true, name: true, email: true },
      });

      if (dbUser) {
        return { user: dbUser };
      }
    } catch {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
  }

  return getAuthenticatedUser();
}

export async function requireSuperAdminFromRequest(request?: Request) {
  const auth = request
    ? await getAuthenticatedUserFromRequest(request)
    : await getAuthenticatedUser();

  if (auth.error) {
    return auth;
  }

  if (auth.user.role !== UserRole.SUPER_ADMIN) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

export async function requireStandardUser(request?: Request) {
  const auth = request
    ? await getAuthenticatedUserFromRequest(request)
    : await getAuthenticatedUser();

  if (auth.error) {
    return auth;
  }

  if (auth.user.role !== UserRole.STANDARD_USER) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

export async function getClientOr404(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true },
  });

  if (!client) {
    return { error: NextResponse.json({ error: 'Client not found' }, { status: 404 }) };
  }

  return { client };
}

export async function hasClientAssignment(
  userId: string,
  clientId: string,
  roles?: AssignmentRole[]
) {
  const assignment = await prisma.clientAssignment.findFirst({
    where: {
      clientId,
      userId,
      ...(roles ? { role: { in: roles } } : {}),
    },
    select: { assignmentId: true, role: true },
  });

  return assignment;
}

export async function requireSuperAdminOrClientRole(
  clientId: string,
  roles: AssignmentRole[]
) {
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth;
  }

  if (auth.user.role === UserRole.SUPER_ADMIN) {
    return auth;
  }

  const assignment = await hasClientAssignment(auth.user.id, clientId, roles);
  if (!assignment) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ...auth, assignment };
}

export async function requireSuperAdminOrClientAccess(clientId: string) {
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth;
  }

  if (auth.user.role === UserRole.SUPER_ADMIN) {
    return auth;
  }

  const assignment = await hasClientAssignment(auth.user.id, clientId);
  if (!assignment) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ...auth, assignment };
}

export async function logClientSystemEvent(
  clientId: string,
  content: string,
  userId?: string
) {
  await prisma.clientActivityLog.create({
    data: {
      clientId,
      type: 'SYSTEM',
      content,
      userId: userId ?? null,
    },
  });
}

export { canAssignmentRoleChangePipelineStatus } from '@/lib/pipelinePermissions';

export async function authorizePipelineStatusChange(
  userId: string,
  userRole: UserRole,
  clientId: string,
  currentStatus: ClientStatus
) {
  if (userRole === UserRole.SUPER_ADMIN) {
    return { authorized: true as const };
  }

  if (userRole !== UserRole.STANDARD_USER) {
    return {
      authorized: false as const,
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  const assignments = await prisma.clientAssignment.findMany({
    where: { clientId, userId },
    select: { role: true },
  });

  if (assignments.length === 0) {
    return {
      authorized: false as const,
      error: NextResponse.json(
        { error: 'You are not assigned to this client' },
        { status: 403 }
      ),
    };
  }

  const canChange = assignments.some((assignment) =>
    canAssignmentRoleChangePipelineStatus(assignment.role, currentStatus)
  );

  if (!canChange) {
    return {
      authorized: false as const,
      error: NextResponse.json(
        {
          error:
            'Your assignment role does not allow changing the pipeline stage from the current status',
        },
        { status: 403 }
      ),
    };
  }

  return { authorized: true as const };
}
