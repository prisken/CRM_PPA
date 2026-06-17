import { AssignmentRole, ClientStatus, UserRole, UserStatus } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
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
    select: { id: true, role: true, email: true, status: true },
  });

  if (!dbUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  if (dbUser.status !== UserStatus.ACTIVE) {
    return {
      error: NextResponse.json({ error: 'Account deactivated' }, { status: 403 }),
    };
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
    select: { id: true, role: true, name: true, email: true, status: true },
  });

  if (!dbUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  if (dbUser.status !== UserStatus.ACTIVE) {
    return {
      error: NextResponse.json({ error: 'Account deactivated' }, { status: 403 }),
    };
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
        select: { id: true, role: true, name: true, email: true, status: true },
      });

      if (dbUser) {
        if (dbUser.status !== UserStatus.ACTIVE) {
          return {
            error: NextResponse.json({ error: 'Account deactivated' }, { status: 403 }),
          };
        }

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

export async function authorizeClientDetailsEdit(request: Request, clientId: string) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth;
  }

  if (auth.user.role === UserRole.SUPER_ADMIN) {
    return auth;
  }

  if (auth.user.role === UserRole.STANDARD_USER) {
    const assignment = await hasClientAssignment(
      auth.user.id,
      clientId,
      [AssignmentRole.RELATIONSHIP]
    );

    if (assignment) {
      return { ...auth, assignment };
    }
  }

  return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
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

export async function verifyAdminPassword(email: string, password: string) {
  if (!password?.trim()) {
    return { valid: false as const, error: 'Password is required' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return { valid: false as const, error: 'Auth is not configured' };
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { valid: false as const, error: 'Incorrect password' };
  }

  return { valid: true as const };
}

export { canAssignmentRoleChangePipelineStatus } from '@/lib/pipelinePermissions';

export function authorizeInteractionOwner(
  userId: string,
  userRole: UserRole,
  interactionUserId: string
) {
  if (userRole === UserRole.SUPER_ADMIN || userId === interactionUserId) {
    return { authorized: true as const };
  }

  return {
    authorized: false as const,
    error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
  };
}

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
