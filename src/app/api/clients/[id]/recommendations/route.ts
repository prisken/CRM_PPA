import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import {
  scoreClient,
  salesPlan,
  type Recommendation,
} from '@/lib/recommendationEngine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clients/[id]/recommendations
 * Runs the product matching engine over the client's stored profile traits.
 * Optional query: ?top=5
 * Returns top recommendations with features, fit, and sales plan + script.
 */

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return auth.error;

  const { canReadClientCore } = await import('@/lib/authHelpers');
  const allowed = await canReadClientCore(auth.user.id, auth.user.role, id);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const top = Math.min(
    Math.max(parseInt(new URL(request.url).searchParams.get('top') || '5', 10) || 5, 1),
    10
  );

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true, profileTraits: true },
  });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const traits = Array.isArray(client.profileTraits)
    ? (client.profileTraits as string[])
    : [];

  const recs: Recommendation[] = scoreClient(traits, top);
  const withPlans = recs.map((r) => ({
    ...r,
    sales_plan: salesPlan(r, client.name || 'Client'),
  }));

  return NextResponse.json({
    client_id: client.id,
    client_name: client.name,
    traits,
    count: withPlans.length,
    recommendations: withPlans,
  });
}
