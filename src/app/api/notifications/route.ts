import { UserRole } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSupabaseServerClient } from '@/lib/supabaseServer';

async function getAuthenticatedUser() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true },
  });

  if (!dbUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };
  }

  return { user: dbUser };
}

export async function GET() {
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth.error;
  }

  const notifications = await prisma.notification.findMany({
    where: { recipientUserId: auth.user.id },
    orderBy: { timestamp: 'desc' },
    include: {
      sender: {
        select: { id: true, name: true, email: true },
      },
      client: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json(
    notifications.map((notification) => ({
      notification_id: notification.notificationId,
      recipient_user_id: notification.recipientUserId,
      sender_user_id: notification.senderUserId,
      sender_name: notification.sender.name ?? notification.sender.email,
      message: notification.message,
      linked_client_id: notification.linkedClientId,
      linked_client_name: notification.client?.name ?? null,
      is_read: notification.isRead,
      timestamp: notification.timestamp,
    }))
  );
}

export async function POST(request: Request) {
  const auth = await getAuthenticatedUser();
  if (auth.error) {
    return auth.error;
  }

  if (auth.user.role !== UserRole.SUPER_ADMIN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { recipient_ids, message, client_id } = body;

  if (!Array.isArray(recipient_ids) || recipient_ids.length === 0) {
    return NextResponse.json(
      { error: 'recipient_ids must be a non-empty array' },
      { status: 400 }
    );
  }

  if (!message?.trim()) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  if (client_id) {
    const client = await prisma.client.findUnique({ where: { id: client_id } });
    if (!client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }
  }

  const recipients = await prisma.user.findMany({
    where: { id: { in: recipient_ids } },
    select: { id: true },
  });

  if (recipients.length !== recipient_ids.length) {
    return NextResponse.json(
      { error: 'One or more recipient IDs are invalid' },
      { status: 400 }
    );
  }

  const notifications = await prisma.$transaction(
    recipient_ids.map((recipientId: string) =>
      prisma.notification.create({
        data: {
          recipientUserId: recipientId,
          senderUserId: auth.user.id,
          message: message.trim(),
          linkedClientId: client_id ?? null,
        },
      })
    )
  );

  return NextResponse.json(
    {
      sent: notifications.length,
      notifications: notifications.map((notification) => ({
        notification_id: notification.notificationId,
        recipient_user_id: notification.recipientUserId,
        sender_user_id: notification.senderUserId,
        message: notification.message,
        linked_client_id: notification.linkedClientId,
        is_read: notification.isRead,
        timestamp: notification.timestamp,
      })),
    },
    { status: 201 }
  );
}
