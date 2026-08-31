import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import {
  findProductBySlug,
  matchClientsForProduct,
} from '@/lib/recommendationEngine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products/[slug]/matching-clients — REVERSE TARGET.
 * Pick a product → see which clients in the CRM are the best fit.
 * Only clients with profile traits are scored. ?top=20
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return auth.error;

  const prod = findProductBySlug(slug);
  if (!prod) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const top = Math.min(
    Math.max(parseInt(new URL(request.url).searchParams.get('top') || '20', 10) || 20, 1),
    50
  );

  const clients = await prisma.client.findMany({
    select: { id: true, name: true, company: true, profileTraits: true },
  });
  const lite = clients
    .filter((c) => Array.isArray(c.profileTraits) && (c.profileTraits as string[]).length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      traits: c.profileTraits as string[],
    }));

  const matches = matchClientsForProduct(prod.name, lite).slice(0, top);

  return NextResponse.json({
    product: { slug, name: prod.name, category: prod.category, price_tier: prod.price_tier || 'mid' },
    scored_clients: lite.length,
    count: matches.length,
    matches,
  });
}
