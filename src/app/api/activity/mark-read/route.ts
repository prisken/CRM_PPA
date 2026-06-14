import { NextResponse } from 'next/server';
import { markActivitiesAsRead } from '@/lib/activityFeed';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';

export async function POST(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const activityLogIds = body.activityLogIds;

  if (!Array.isArray(activityLogIds)) {
    return NextResponse.json(
      { error: 'activityLogIds must be an array' },
      { status: 400 }
    );
  }

  const validIds = activityLogIds.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  const result = await markActivitiesAsRead(auth.user.id, validIds);

  return NextResponse.json({
    success: true,
    marked: result.marked,
  });
}
