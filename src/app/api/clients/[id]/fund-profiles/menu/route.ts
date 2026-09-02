import { NextResponse } from 'next/server';
import {
  getClientOr404,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';

export const dynamic = 'force-dynamic';

const FUNDS_URL = (process.env.FUNDS_API_URL || '').replace(/\/$/, '');
const FUNDS_SECRET = process.env.FUNDS_SECRET || '';

/** Proxy: DIS chase universe + stabilising slice pool from the funds engine. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getClientOr404(id);
  await requireSuperAdminOrClientAccess(id);
  if (!FUNDS_URL) {
    return NextResponse.json({ error: 'FUNDS_API_URL not configured' }, { status: 503 });
  }
  const kind = new URL(request.url).searchParams.get('kind') === 'a' ? 'a' : 'b';
  try {
    const res = await fetch(`${FUNDS_URL}/api/plan-${kind}/menu`, {
      headers: FUNDS_SECRET ? { 'X-Funds-Secret': FUNDS_SECRET } : {},
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const d = await res.json();
    return NextResponse.json(d, { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { error: 'funds engine unreachable', detail: String(e).slice(0, 200) },
      { status: 502 }
    );
  }
}
