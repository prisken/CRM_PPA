import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const notification = await prisma.notification.findUnique({
    where: { notificationId: id },
  });

  if (!notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }

  if (notification.recipientUserId !== auth.user.id) {
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
