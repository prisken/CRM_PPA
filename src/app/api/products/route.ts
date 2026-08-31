import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { listProducts } from '@/lib/recommendationEngine';

export const dynamic = 'force-dynamic';

/**
 * GET /api/products — the product catalog (for the reverse-target picker).
 * Optional ?search= to filter by name/category.
 */
export async function GET(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return auth.error;

  const search = (new URL(request.url).searchParams.get('search') || '').toLowerCase();
  let products = listProducts();
  if (search) {
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search)
    );
  }
  return NextResponse.json({ count: products.length, products });
}
