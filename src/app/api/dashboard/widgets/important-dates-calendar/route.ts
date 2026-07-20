import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import {
  fetchImportantDatesCalendarEvents,
  parseImportantDatesCalendarQuery,
} from '@/lib/importantDatesCalendar';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/widgets/important-dates-calendar
 *
 * Query:
 * - startDate (YYYY-MM-DD, required)
 * - endDate (YYYY-MM-DD, required)
 * - recordType=CLIENT|LEAD|ALL (optional, default ALL)
 * - assignedUserId (optional, SUPER_ADMIN only)
 * - search (optional — label, notes, client/lead name or company)
 *
 * Visibility is enforced server-side (SUPER_ADMIN = all; others = assigned /
 * deal-participant owners only).
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseImportantDatesCalendarQuery(searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const result = await timeRouteHandler(
    'GET /api/dashboard/widgets/important-dates-calendar',
    () =>
      fetchImportantDatesCalendarEvents(
        { id: auth.user.id, role: auth.user.role },
        parsed.data
      ),
    { payloadCategory: 'dashboard-widget' }
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result.data);
}
