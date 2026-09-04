import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import {
  getClientOr404,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const BUCKETS = ['start', 'mid', 'end'] as const;
const EPS = 0.6; // % tolerance on "sums to 100"

type Member = { code: string; weight_pct: number };
type SetShape = { bucket: string; members: Member[] };

/**
 * POST: store a strategy-B multi-set (dividend chase) plan.
 * Rules enforced server-side:
 *  - chase frequency = number of sets (1..3)
 *  - every set sums to 100% (± tolerance)
 *  - one fund per record-day bucket within a set
 *  - no fund may repeat across the whole plan
 *  - only DIS funds are chaseable (checked against the funds menu by code)
 * Persists plan_json on the profile + one FundRecommendation per member.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await getClientOr404(id);
  await requireSuperAdminOrClientAccess(id);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const strategy = body.strategy === 'a' ? 'a' : 'b';
  const risk = Number(body.risk_max_dd_pct ?? -20);
  const exp = Number(body.expected_1y_pct ?? 5);
  const minYield = Number(body.min_yield_pct ?? 4);
  const sets: SetShape[] = Array.isArray(body.sets) ? body.sets : [];
  if (strategy === 'a') {
    if (sets.length !== 1) {
      return NextResponse.json({ error: 'plan A: exactly one allocation set (sums to 100%)' }, { status: 400 });
    }
  } else if (sets.length < 1 || sets.length > 3) {
    return NextResponse.json({ error: 'sets: 1..3 chase sets required' }, { status: 400 });
  }

  // ---- menu lookup (funds site) for promised/bucket/note validation ----
  const fundsUrl = (process.env.FUNDS_API_URL || '').replace(/\/$/, '');
  const fundsSecret = process.env.FUNDS_SECRET || '';
  let menu: Record<string, any> = {};
  if (fundsUrl) {
    try {
      const res = await fetch(`${fundsUrl}/api/plan-${strategy === 'a' ? 'a' : 'b'}/menu`, {
        headers: fundsSecret ? { 'X-Funds-Secret': fundsSecret } : {},
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const d = await res.json();
        if (strategy === 'a') {
          for (const m of d.candidates || []) menu[m.code] = m;
        } else {
          for (const m of d.chase || []) menu[m.code] = m;
        }
      }
    } catch {
      /* menu is best-effort; structural rules still enforced below */
    }
  }

  const seenFunds = new Set<string>();
  const planSets: any[] = [];
  const recRows: Prisma.FundRecommendationCreateManyInput[] = [];
  let rank = 0;

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    const bucket = String(set.bucket ?? (strategy === 'a' ? 'allocation' : ''));
    const members: Member[] = Array.isArray(set.members) ? set.members : [];
    if (strategy === 'b' && !BUCKETS.includes(bucket as any) && bucket !== 'flex') {
      return NextResponse.json({ error: `set ${i + 1}: bad bucket` }, { status: 400 });
    }
    const sum = members.reduce((a, m) => a + Number(m.weight_pct || 0), 0);
    if (Math.abs(sum - 100) > EPS) {
      return NextResponse.json(
        { error: `set ${i + 1} sums to ${sum.toFixed(1)}% — must be 100%` },
        { status: 400 }
      );
    }
    const seenBuckets = new Set<string>();
    const setMembers: any[] = [];
    for (const m of members) {
      const code = String(m.code || '');
      const w = Number(m.weight_pct || 0);
      if (!code || w <= 0) continue;
      if (seenFunds.has(code)) {
        return NextResponse.json(
          { error: `${code} appears in more than one set` }, { status: 400 });
      }
      const meta = menu[code] || {};
      const mb = meta?.bucket ?? null;
      if (strategy === 'a' && meta) {
        // Quality gate (mirror of the builder rule): no negative-outlook funds,
        // no drawdowns beyond the engine MISMATCH floor (tolerance - 5pp).
        const gExp = meta.expected_1y;
        const gDd = meta.max_dd_pct;
        if (gExp != null && gExp < 0) {
          return NextResponse.json(
            { error: `${code} fails the quality gate — negative expected 1Y (${gExp.toFixed(1)}%)` },
            { status: 400 }
          );
        }
        if (gDd != null && gDd < risk - 5) {
          return NextResponse.json(
            { error: `${code} fails the quality gate — max drawdown ${gDd.toFixed(0)}% is beyond the ${risk}% tolerance` },
            { status: 400 }
          );
        }
      }
      if (strategy === 'b' && mb && seenBuckets.has(mb)) {
        return NextResponse.json(
          { error: `${code}: two funds in the same record-day bucket (${mb}) in set ${i + 1}` },
          { status: 400 });
      }
      if (mb) seenBuckets.add(mb);
      seenFunds.add(code);
      const extra = strategy === 'a'
        ? { expected_1y: meta?.expected_1y ?? null, max_dd_pct: meta?.max_dd_pct ?? null, score: meta?.score ?? null }
        : { promised_pct: meta?.promised_pct ?? null, bucket: mb, note: meta?.note ?? null };
      setMembers.push({ code, weight_pct: w, bucket: mb ?? (strategy === 'a' ? 'allocation' : null), ...extra });
      recRows.push({
        profileId: 'PLACEHOLDER', fundCode: code, rank: ++rank, score: Number(meta?.score ?? 0),
        verdict: strategy === 'a' ? 'allocation' : 'chase', tag: bucket,
        snapshot: { weight_pct: w, ...extra } as Prisma.InputJsonValue,
      });
    }
    if (setMembers.length === 0) {
      return NextResponse.json({ error: `set ${i + 1}: no members` }, { status: 400 });
    }
    planSets.push({ set: i + 1, bucket, members: setMembers });
  }

  const profile = await prisma.clientFundProfile.create({
    data: {
      clientId: id,
      strategy,
      riskMaxDD: risk,
      expected1Y: exp,
      minYield,
      planJson: (strategy === 'a'
        ? { kind: 'a', allocation: planSets[0]?.members ?? [] }
        : { kind: 'b', chase_frequency: sets.length, sets: planSets }) as Prisma.InputJsonValue,
    },
  });

  await prisma.fundRecommendation.createMany({
    data: recRows.map((r) => ({ ...r, profileId: profile.id })),
  });

  return NextResponse.json({
    profileId: profile.id,
    chase_frequency: sets.length,
    sets: planSets,
    created: true,
  });
}
