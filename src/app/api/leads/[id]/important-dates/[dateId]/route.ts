import {
  handleDeleteImportantDate,
  handleUpdateImportantDate,
} from '@/lib/importantDateApi';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/leads/[id]/important-dates/[dateId]
 * Update label/date/time/notes for a lead important date.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; dateId: string }> }
) {
  const { id: leadId, dateId } = await params;
  return handleUpdateImportantDate(request, leadId, dateId, 'lead');
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; dateId: string }> }
) {
  return PUT(request, context);
}

/**
 * DELETE /api/leads/[id]/important-dates/[dateId]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; dateId: string }> }
) {
  const { id: leadId, dateId } = await params;
  return handleDeleteImportantDate(request, leadId, dateId, 'lead');
}
