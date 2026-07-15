import {
  handleCreateImportantDate,
  handleListImportantDates,
} from '@/lib/importantDateApi';

export const dynamic = 'force-dynamic';

/**
 * GET /api/leads/[id]/important-dates
 *
 * Leads are Client rows — `id` is the Client id (= leadId). Same storage
 * as client important dates (`client_important_dates.client_id`).
 * Responses expose `leadId` for lead-facing callers / calendar.
 *
 * Auth: core read (super admin, any assignment, or deal participant).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  return handleListImportantDates(request, leadId, 'lead');
}

/**
 * POST /api/leads/[id]/important-dates
 *
 * Body: label|title, date, optional time, optional notes|details,
 * optional leadId/clientId (must match route).
 * Auth: SUPER_ADMIN or RELATIONSHIP assignee.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;
  return handleCreateImportantDate(request, leadId, 'lead');
}
