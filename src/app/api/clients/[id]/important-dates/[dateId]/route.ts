import {
  handleDeleteImportantDate,
  handleUpdateImportantDate,
} from '@/lib/importantDateApi';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/clients/[id]/important-dates/[dateId]
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; dateId: string }> }
) {
  const { id, dateId } = await params;
  return handleUpdateImportantDate(request, id, dateId, 'client');
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; dateId: string }> }
) {
  return PUT(request, context);
}

/**
 * DELETE /api/clients/[id]/important-dates/[dateId]
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; dateId: string }> }
) {
  const { id, dateId } = await params;
  return handleDeleteImportantDate(request, id, dateId, 'client');
}
