import {
  handleCreateImportantDate,
  handleListImportantDates,
} from '@/lib/importantDateApi';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clients/[id]/important-dates
 * List important dates (clients and leads share Client rows).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleListImportantDates(request, id, 'client');
}

/**
 * POST /api/clients/[id]/important-dates
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return handleCreateImportantDate(request, id, 'client');
}
