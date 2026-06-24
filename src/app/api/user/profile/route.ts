import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const auth = await getAuthenticatedUserFromRequest(request);
    if (auth.error) {
      return auth.error;
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: auth.user.id },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 });
  }
}
