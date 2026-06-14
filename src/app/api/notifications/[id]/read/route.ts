import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const notification = await prisma.notification.findUnique({
    where: { notificationId: id },
  });

  if (!notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }

  if (notification.recipientUserId !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updated = await prisma.notification.update({
    where: { notificationId: id },
    data: { isRead: true },
  });

  return NextResponse.json({
    notification_id: updated.notificationId,
    recipient_user_id: updated.recipientUserId,
    sender_user_id: updated.senderUserId,
    message: updated.message,
    linked_client_id: updated.linkedClientId,
    is_read: updated.isRead,
    timestamp: updated.timestamp,
  });
}
