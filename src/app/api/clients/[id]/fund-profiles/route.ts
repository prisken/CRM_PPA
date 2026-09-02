import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import {
  getClientOr404,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const FUNDS_URL = (process.env.FUNDS_API_URL || '').replace(/\/$/, '');
const FUNDS_SECRET = process.env.FUNDS_SECRET || '';

function num(v: unknown, name: string, lo: number, hi: number, def: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, n));
}

/** POST: create a fund strategy plan for this client. Calls the funds engine
 *  (/api/client-plan) with numbers only (no client PII), stores the immutable
 *  snapshot + ranked recommendations. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getClientOr404(id);
  await requireSuperAdminOrClientAccess(id);

  if (!FUNDS_URL) {
    return NextResponse.json(
      { error: 'FUNDS_API_URL not configured on the server' },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const strategy = body.strategy === 'b' ? 'b' : 'a';
  const risk = num(body.risk_max_dd_pct, 'risk_max_dd_pct', -80, -0.5, -25);
  const exp = num(body.expected_1y_pct, 'expected_1y_pct', 0, 40, 8);
  const minYield =
    body.min_yield_pct === undefined || body.min_yield_pct === null
      ? undefined
      : num(body.min_yield_pct, 'min_yield_pct', 0, 15, 4);

  const engineBody: Record<string, unknown> = {
    strategy,
    risk_max_dd_pct: risk,
    expected_1y_pct: exp,
  };
  if (minYield !== undefined) engineBody.min_yield_pct = minYield;

  let plan: { recommendations?: unknown[]; excluded_mismatch?: number };
  try {
    const res = await fetch(`${FUNDS_URL}/api/client-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(FUNDS_SECRET ? { 'X-Funds-Secret': FUNDS_SECRET } : {}),
      },
      body: JSON.stringify(engineBody),
      signal: AbortSignal.timeout(90000),
      cache: 'no-store',
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `funds engine error ${res.status}`, detail: detail.slice(0, 400) },
        { status: 502 }
      );
    }
    plan = await res.json();
  } catch (e) {
    return NextResponse.json(
      { error: 'funds engine unreachable', detail: String(e).slice(0, 200) },
      { status: 502 }
    );
  }

  const recsIn = Array.isArray(plan.recommendations) ? plan.recommendations : [];
  if (recsIn.length === 0) {
    return NextResponse.json(
      { error: 'engine returned no recommendations' },
      { status: 502 }
    );
  }

  const profile = await prisma.clientFundProfile.create({
    data: {
      clientId: id,
      strategy,
      riskMaxDD: risk,
      expected1Y: exp,
      minYield: minYield ?? null,
    },
  });

  await prisma.fundRecommendation.createMany({
    data: recsIn.map((r: any, i: number) => ({
      profileId: profile.id,
      fundCode: String(r.code ?? ''),
      rank: i + 1,
      score: Number(r.score ?? 0),
      verdict: r.verdict ? String(r.verdict) : null,
      tag: r.tag ? String(r.tag) : null,
      expected1Y: r.expected != null ? Number(r.expected) : null,
      maxDDPct: r.max_dd_pct != null ? Number(r.max_dd_pct) : null,
      yieldPct: r.yield != null ? Number(r.yield) : null,
      riskFit: r.risk_fit ? String(r.risk_fit) : null,
      snapshot: JSON.parse(JSON.stringify(r)) as Prisma.InputJsonValue,
    })),
  });

  return NextResponse.json({
    profileId: profile.id,
    recommendations: plan.recommendations,
    snapshot: (plan as any).snapshot ?? null,
    excluded_mismatch: plan.excluded_mismatch ?? 0,
  });
}

/** GET: past fund strategy plans for this client (newest first). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getClientOr404(id);
  await requireSuperAdminOrClientAccess(id);

  const profiles = await prisma.clientFundProfile.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      recommendations: { orderBy: { rank: 'asc' } },
    },
  });
  // surface the plain-English reason stored in each immutable snapshot
  const out = profiles.map((p) => ({
    ...p,
    recommendations: p.recommendations.map((r: any) => ({
      ...r,
      reason: ((r.snapshot as any)?.reason as string | undefined) ?? null,
    })),
  }));
  return NextResponse.json({ profiles: out });
}
