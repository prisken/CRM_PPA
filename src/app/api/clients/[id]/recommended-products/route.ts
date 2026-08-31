import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { PRODUCTS } from '@/lib/recommendationEngine';

export const dynamic = 'force-dynamic';

/**
 * GET/PUT /api/clients/[id]/recommended-products
 * The rep's curated product shortlist for this client. Freely add/remove —
 * products must exist in the catalog; duplicates rejected; order preserved.
 */
async function gate(request: Request, clientId: string) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return { error: auth.error };
  const { canReadClientCore } = await import('@/lib/authHelpers');
  const allowed = await canReadClientCore(auth.user.id, auth.user.role, clientId);
  if (!allowed) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user: auth.user };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await gate(request, id);
  if (g.error) return g.error;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, recommendedProducts: true },
  });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const names = Array.isArray(client.recommendedProducts)
    ? (client.recommendedProducts as string[])
    : [];
  return NextResponse.json({ products: names });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const g = await gate(request, id);
  if (g.error) return g.error;

  let body: { products?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.products)) {
    return NextResponse.json({ error: 'products must be an array' }, { status: 400 });
  }

  const names = body.products.map((n) => String(n).trim()).filter(Boolean);
  const known = new Set(PRODUCTS.map((p) => p.name));
  const unknown = names.filter((n) => !known.has(n));
  if (unknown.length) {
    return NextResponse.json({ error: `Unknown products: ${unknown.join(', ')}` }, { status: 400 });
  }
  // dedupe preserving order
  const deduped = [...new Set(names)];

  const client = await prisma.client.update({
    where: { id },
    data: { recommendedProducts: deduped },
    select: { id: true, recommendedProducts: true },
  });
  return NextResponse.json({ products: client.recommendedProducts });
}
