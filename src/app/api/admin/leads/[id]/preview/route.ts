import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { fetchLeadCommandCenterPreview } from '@/lib/leadCommandCenter';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const { id } = await params;

  try {
    const payload = await timeRouteHandler(
      `GET /api/admin/leads/${id}/preview`,
      async () => {
        const lead = await fetchLeadCommandCenterPreview(id);
        if (!lead) {
          return null;
        }

        return { lead };
      },
      {
        payloadCategory: 'lead-command-center',
        getMeta: (result) => ({
          clientId: id,
          found: result !== null,
        }),
      }
    );

    if (!payload) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error(`GET /api/admin/leads/${id}/preview failed:`, error);
    const message =
      error instanceof Error ? error.message : 'Failed to load lead preview';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
