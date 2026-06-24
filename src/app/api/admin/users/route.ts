import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';

function getUserDisplayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const users = await timeRouteHandler('GET /api/admin/users', async () => {
    const rows = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return rows.map((user) => ({
      user_id: user.id,
      userName: getUserDisplayName(user),
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
    }));
  }, (result) => ({ userCount: result.length }));

  return NextResponse.json(users);
}
