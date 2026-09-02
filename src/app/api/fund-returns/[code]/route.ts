import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';

export const dynamic = 'force-dynamic';

const FUNDS_URL = (process.env.FUNDS_API_URL || '').replace(/\/$/, '');
const FUNDS_SECRET = process.env.FUNDS_SECRET || '';

/** Proxy: actual returns (since pick + 1M/3M/1Y) for an accepted fund. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const user = await getAuthenticatedUserFromRequest(_request);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const { code } = await params;
  if (!FUNDS_URL) {
    return NextResponse.json({ error: 'FUNDS_API_URL not configured' }, { status: 503 });
  }
  const url = new URL(`${FUNDS_URL}/api/fund/returns/${encodeURIComponent(code)}`);
  url.searchParams.set('pick', new URL(_request.url).searchParams.get('pick') || '');
  try {
    const res = await fetch(url.toString(), {
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
