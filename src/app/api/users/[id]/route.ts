import { NextResponse } from 'next/server';
import {
  requireSuperAdminFromRequest,
  verifyAdminPassword,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

function normalizeConfirmName(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getUserDisplayName(user: { name: string | null; email: string }) {
  return user.name?.trim() || user.email;
}

export async function DELETE(
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
      { error: 'You cannot permanently delete your own account' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmName = normalizeConfirmName(body.confirmName);

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
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

  const passwordCheck = await verifyAdminPassword(auth.user.email, password);
  if (!passwordCheck.valid) {
    return NextResponse.json({ error: passwordCheck.error }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);

  if (authDeleteError) {
    const message = authDeleteError.message.toLowerCase();
    if (!message.includes('not found') && !message.includes('user not found')) {
      return NextResponse.json(
        { error: authDeleteError.message || 'Failed to delete auth user' },
        { status: 500 }
      );
    }
  }

  await prisma.$transaction([
    prisma.commissionReturnable.deleteMany({ where: { userId: id } }),
    prisma.strategy.deleteMany({ where: { authorId: id } }),
    prisma.user.delete({ where: { id } }),
  ]);

  return NextResponse.json({ success: true, user_id: id });
}
