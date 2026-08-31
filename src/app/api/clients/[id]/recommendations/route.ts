import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import {
  scoreClientDiverse,
  compareCategory,
  suitabilityStars,
  salesPlan,
  type Recommendation,
} from '@/lib/recommendationEngine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/clients/[id]/recommendations?top=5
 * Category-diverse top-N (one product per category), each with fit + sales
 * plan, plus per-category comparison rows (differences + suitability stars)
 * so the rep can compare alternatives within a category.
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
    select: { id: true, name: true, profileTraits: true, recommendedProducts: true },
  });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const traits = Array.isArray(client.profileTraits)
    ? (client.profileTraits as string[])
    : [];

  const { recommendations, by_category } = scoreClientDiverse(traits, top);

  const withPlans = recommendations.map((r) => ({
    ...r,
    stars: suitabilityStars(r.score),
    sales_plan: salesPlan(r, client.name || 'Client'),
  }));

  // per-category comparisons for the categories represented in the top-N
  const comparisons: Record<string, ReturnType<typeof compareCategory>> = {};
  for (const cat of Object.keys(by_category)) {
    const rows = by_category[cat];
    if (rows && rows.length >= 1) {
      comparisons[cat] = compareCategory(cat, rows);
    }
  }

  return NextResponse.json({
    client_id: client.id,
    client_name: client.name,
    traits,
    count: withPlans.length,
    recommendations: withPlans,
    by_category,
    comparisons,
    recommended_products: Array.isArray(client.recommendedProducts)
      ? (client.recommendedProducts as string[])
      : [],
  });
}
