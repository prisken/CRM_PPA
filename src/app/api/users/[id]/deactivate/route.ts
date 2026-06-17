import { UserStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

function normalizeConfirmName(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getUserDisplayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  if (auth.user.id === id) {
    return NextResponse.json(
      { error: 'You cannot deactivate your own account' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const confirmName = normalizeConfirmName(body.confirmName);

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, status: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const displayName = getUserDisplayName(existing);

  if (confirmName !== displayName) {
    return NextResponse.json(
      { error: 'User name confirmation does not match' },
      { status: 400 }
    );
  }

  if (existing.status === UserStatus.DEACTIVATED) {
    return NextResponse.json(
      { error: 'User is already deactivated' },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { status: UserStatus.DEACTIVATED },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    user_id: updated.id,
    userName: getUserDisplayName(updated),
    email: updated.email,
    role: updated.role,
    status: updated.status,
    createdAt: updated.createdAt,
  });
}
