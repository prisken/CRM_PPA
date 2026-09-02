'use client';

/**
 * FundPlanWidget — Phase 4 (CRM). Lives on the Client 360 Review tab.
 * "Generate fund strategy": advisor picks A or B + risk tolerance + expected
 * return → calls the CRM fund-profiles API → funds engine (Railway) → stored
 * immutable snapshot + ranked recommendations, with accept/decline curation.
 */

import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';
import FundChaseBuilder from '@/components/clients/FundChaseBuilder';
import FundAllocationBuilder from '@/components/clients/FundAllocationBuilder';

type Rec = {
  id: string;
  fundCode: string;
  rank: number;
  score: number;
  verdict?: string | null;
  tag?: string | null;
  expected1Y?: number | null;
  maxDDPct?: number | null;
  yieldPct?: number | null;
  riskFit?: string | null;
  accepted?: boolean | null;
  note?: string | null;
  reason?: string | null;
  snapshot?: Record<string, unknown> | null;
};

type Profile = {
  id: string;
  strategy: string;
  riskMaxDD: number;
  expected1Y: number;
  minYield?: number | null;
  createdAt: string;
  planJson?: any;
  recommendations: Rec[];
};

const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';
const BTN =
  'rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60';
const CHIP = {
  FIT: 'bg-green-100 text-green-800',
  STRETCH: 'bg-amber-100 text-amber-800',
  MISMATCH: 'bg-red-100 text-red-800',
} as const;

function BPlanSetsView({
  profile,
  returnsMap,
  acceptingId,
  onAccept,
}: {
  profile: Profile;
  returnsMap: Record<string, any>;
  acceptingId: string | null;
  onAccept: (profileId: string, rec: Rec, accepted: boolean) => void;
}) {
  const recByCode: Record<string, Rec> = {};
  for (const r of profile.recommendations) recByCode[r.fundCode] = r;
  const fmtR = (d: any) => {
    if (!d) return null;
    const w = d.windows || {};
    const bits = [];
    if (d.since_pick_pct != null) bits.push(`since pick ${d.since_pick_pct > 0 ? '+' : ''}${d.since_pick_pct.toFixed(1)}%`);
    for (const [k, v] of Object.entries(w)) {
      if (v != null) bits.push(`${k} ${(v as number) > 0 ? '+' : ''}${(v as number).toFixed(1)}%`);
    }
    return bits.length ? bits.join(' · ') : null;
  };
  const pj: any = profile.planJson;
  const sets: any[] = pj?.sets || [];
  if (pj?.kind === 'a') {
    const members: any[] = pj?.allocation || [];
    let eN=0,eD=0,dN=0,dD=0;
    for (const m of members) {
      if (m.expected_1y != null){eN+=m.weight_pct*m.expected_1y;eD+=m.weight_pct;}
      if (m.max_dd_pct != null){dN+=m.weight_pct*m.max_dd_pct;dD+=m.weight_pct;}
    }
    return (
      <div className="mt-3 space-y-1.5">
        {eD ? <p className="text-xs text-gray-600">Portfolio expected 1Y ≈ <span className="font-semibold text-gray-900">{(eN/eD)>0?'+':''}{(eN/eD).toFixed(1)}%</span>{dD ? <> · weighted max DD ≈ <span className="font-semibold text-gray-900">{(dN/dD).toFixed(0)}%</span></> : null}</p> : null}
        {members.map((m: any, i: number) => {
          const rec = recByCode[m.code];
          const r = returnsMap[m.code];
          const perf = rec?.accepted === true ? fmtR(r) : null;
          return (
            <div key={`${m.code}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-gray-900">
                  {m.code} <span className="font-normal text-gray-500">· {m.weight_pct}%</span>
                </span>
                <span className="block text-xs text-gray-500">
                  {m.expected_1y != null ? `exp 1Y ${m.expected_1y > 0 ? '+' : ''}${m.expected_1y.toFixed(1)}% · ` : ''}
                  {m.max_dd_pct != null ? `maxDD ${m.max_dd_pct.toFixed(0)}%` : ''}
                  {perf ? <span className="ml-1 font-medium text-gray-700">| {perf}</span> : null}
                </span>
              </span>
              {rec ? (
                rec.accepted === true ? (
                  <button type="button" onClick={() => onAccept(profile.id, rec, false)} disabled={acceptingId === rec.id}
                    className="rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-200">✓ Accepted</button>
                ) : (
                  <button type="button" onClick={() => onAccept(profile.id, rec, true)} disabled={acceptingId === rec.id}
                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Accept</button>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      {sets.map((set) => (
        <div key={set.set} className="rounded-lg border border-gray-200 p-2.5">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-xs font-bold text-gray-800">Set {set.set}</span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              {set.bucket}
            </span>
            <span className="ml-auto text-[11px] text-gray-400">sums to 100%</span>
          </div>
          {set.members.map((m: any, i: number) => {
            const rec = recByCode[m.code];
            const r = returnsMap[m.code];
            const perf = rec?.accepted === true ? fmtR(r) : null;
            return (
              <div key={`${m.code}-${i}`} className="flex flex-wrap items-center gap-2 border-t border-gray-100 py-1.5 first:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900">
                    {m.code} <span className="font-normal text-gray-500">· {m.weight_pct}%</span>
                    {m.promised_pct != null ? (
                      <span className="ml-1 text-green-700">· div {m.promised_pct.toFixed(1)}%</span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {m.bucket === 'stabiliser' ? 'stabilising slice leg' : `record bucket ${m.bucket}`}
                    {m.note ? ` · ${m.note}` : ''}
                    {perf ? <span className="ml-1 font-medium text-gray-700">| {perf}</span> : null}
                  </span>
                </span>
                {rec ? (
                  rec.accepted === true ? (
                    <button type="button" onClick={() => onAccept(profile.id, rec, false)} disabled={acceptingId === rec.id}
                      className="rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-200">
                      ✓ Accepted
                    </button>
                  ) : (
                    <button type="button" onClick={() => onAccept(profile.id, rec, true)} disabled={acceptingId === rec.id}
                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      Accept
                    </button>
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function FundPlanWidget({ clientId }: { clientId: string }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [strategy, setStrategy] = useState<'a' | 'b'>('a');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [openReasons, setOpenReasons] = useState<Set<string>>(new Set());

  const toggleReason = (id: string) =>
    setOpenReasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authenticatedFetch(
        `/api/clients/${clientId}/fund-profiles`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setProfiles(Array.isArray(d.profiles) ? d.profiles : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load plans');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);



  const latest = profiles[0];

  // actual returns (since pick + 1M/3M/1Y) for accepted funds
  const [returnsMap, setReturnsMap] = useState<Record<string, any>>({});
  useEffect(() => {
    let dead = false;
    if (!latest) return;
    const accepted = latest.recommendations.filter((r) => r.accepted === true);
    if (accepted.length === 0) return;
    const pick = (latest.createdAt || '').slice(0, 10);
    Promise.all(
      accepted.map((r) =>
        authenticatedFetch(`/api/fund-returns/${r.fundCode}?pick=${pick}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((d) => {
            if (!dead && d && !d.error) {
              setReturnsMap((m) => ({ ...m, [r.fundCode]: d }));
            }
          })
          .catch(() => {})
      )
    );
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);

  const setAccepted = async (profileId: string, rec: Rec, accepted: boolean) => {
    setAcceptingId(rec.id);
    try {
      const res = await authenticatedFetch(
        `/api/clients/${clientId}/fund-profiles/${profileId}/recommendations/${rec.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accepted }),
        }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } finally {
      setAcceptingId(null);
    }
  };
  const older = profiles.slice(1);

  return (
    <section className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Fund strategy (ILAS)
          </h3>
          <p className="text-xs text-gray-500">
            A/B strategy pick from the fund engine — decision support, stored as
            an immutable snapshot
          </p>
        </div>
      </div>

      {/* Step 0: choose the plan */}
      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Plan</span>
          <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white text-sm">
            {(['a', 'b'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStrategy(s)}
                className={`px-4 py-2 font-medium ${
                  strategy === s ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {s === 'a' ? 'A · Growth' : 'B · Dividend'}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-gray-400">
            {strategy === 'a'
              ? 'growth allocation — tick funds, add %, total must reach 100%'
              : 'dividend chase — build sets (each sums to 100%)'}
          </span>
        </div>
      </div>

      {strategy === 'a' ? (
        <FundAllocationBuilder clientId={clientId} onSaved={load} />
      ) : (
        <FundChaseBuilder clientId={clientId} onSaved={load} />
      )}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <div className="mt-3 h-20 animate-pulse rounded-lg bg-gray-100" />
      ) : null}

      {/* Latest plan */}
      {latest ? (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full bg-blue-100 px-2 py-0.5 font-semibold text-blue-700">
              Strategy {latest.strategy === 'a' ? 'A · Growth' : 'B · Dividend'}
            </span>
            <span>
              {new Date(latest.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <span>
              DD {latest.riskMaxDD}% · 1Y ≥ {latest.expected1Y}%
              {latest.minYield != null ? ` · yield ≥ ${latest.minYield}%` : ''}
            </span>
            <span className="ml-auto font-medium text-gray-700">
              {latest.recommendations.filter((r) => r.accepted === true).length}
              /{latest.recommendations.length} accepted
            </span>
          </div>
          <div className="mt-3">
            {(() => {
              const groups: Record<string, Rec[]> = {};
              for (const r of latest.recommendations) {
                const k = r.tag || 'growth';
                (groups[k] = groups[k] || []).push(r);
              }
              const headers: Record<string, string> = {
                core: 'Dividend core — 70%',
                slice: 'Capital-stabilising slice — 30%',
                growth: 'Growth picks',
              };
              const subs: Record<string, string> = {
                core: 'the stable income base, picked once and held',
                slice: 'the flexible defensive band',
                growth: 'dark-horse growers (strategy A)',
              };
              return Object.entries(groups).map(([tag, recs]) => (
                <div key={tag} className="mt-3 first:mt-0">
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-gray-800">
                      {headers[tag] || tag}
                    </span>
                    <span className="text-[11px] text-gray-400">
                      {recs.length} · {subs[tag] || ''}
                    </span>
                  </div>
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {recs.map((r) => (
                      <li
                        key={r.id}
                        className="px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-6 text-xs font-semibold text-gray-400">
                            #{r.rank}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900">
                              {r.fundCode} · {r.verdict ?? ''}
                            </span>
                            <span className="block text-xs text-gray-500">
                              score {r.score.toFixed(2)}
                              {r.expected1Y != null
                                ? ` · exp 1Y +${r.expected1Y.toFixed(1)}%`
                                : ''}
                              {r.maxDDPct != null
                                ? ` · max DD ${r.maxDDPct.toFixed(0)}%`
                                : ''}
                              {r.yieldPct != null ? ` · yield ${r.yieldPct.toFixed(1)}%` : ''}
                            </span>
                            {r.reason ? (
                              <button
                                type="button"
                                onClick={() => toggleReason(r.id)}
                                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                              >
                                {openReasons.has(r.id) ? '▾ Hide why' : '▸ Why this fund'}
                              </button>
                            ) : null}
                            {r.reason && openReasons.has(r.id) ? (
                              <span className="mt-1 block text-xs leading-snug text-gray-500">
                                {r.reason}
                              </span>
                            ) : null}
                          </span>
                          {r.riskFit ? (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                CHIP[r.riskFit as keyof typeof CHIP] ?? 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {r.riskFit}
                            </span>
                          ) : null}
                          <div className="flex gap-1.5">
                            {r.accepted === true ? (
                              <button
                                type="button"
                                onClick={() => setAccepted(latest.id, r, false)}
                                disabled={acceptingId === r.id}
                                className="rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-200"
                              >
                                ✓ Accepted
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setAccepted(latest.id, r, true)}
                                disabled={acceptingId === r.id}
                                className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                              >
                                Accept
                              </button>
                            )}
                            {r.accepted === false ? (
                              <button
                                type="button"
                                onClick={() => setAccepted(latest.id, r, true)}
                                disabled={acceptingId === r.id}
                                className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                              >
                                Declined · undo
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ));
            })()}
          </div>
        </div>
      ) : (
        !loading && (
          <p className="mt-3 text-sm text-gray-400">
            No fund strategy plan yet — generate one above.
          </p>
        )
      )}

      {/* History */}
      {older.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-500 hover:text-gray-700">
            Past plans ({older.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {older.map((p) => (
              <li key={p.id} className="text-xs text-gray-500">
                {new Date(p.createdAt).toLocaleDateString('en-GB')} · Strategy{' '}
                {p.strategy.toUpperCase()} ·{' '}
                {p.recommendations.filter((r) => r.accepted === true).length}/
                {p.recommendations.length} accepted
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
