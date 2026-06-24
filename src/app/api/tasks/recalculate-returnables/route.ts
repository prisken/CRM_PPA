import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { recalculateReturnablesForUserOnClient } from '@/lib/commissionReturnables';

export async function POST(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json().catch(() => ({}));
  const userId = body.userId ?? body.user_id;
  const clientId = body.clientId ?? body.client_id;

  if (!userId || !clientId) {
    return NextResponse.json(
      { error: 'userId and clientId are required' },
      { status: 400 }
    );
  }

  try {
    await recalculateReturnablesForUserOnClient(userId, clientId);
    return NextResponse.json({ success: true, userId, clientId });
  } catch (error) {
    console.error(
      `Failed to recalculate commission returnables for user ${userId} on client ${clientId}.`,
      error
    );
    return NextResponse.json(
      { error: 'Failed to recalculate commission returnables' },
      { status: 500 }
    );
  }
}
