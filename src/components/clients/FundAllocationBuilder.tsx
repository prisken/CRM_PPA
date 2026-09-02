'use client';

/**
 * Plan A allocation — staged flow (per directive):
 *  1. Plan A chosen -> nothing shown, just "Generate funds"
 *  2. Click Generate -> ranked fund list appears (from funds site)
 *  3. Tick a fund + type its % (same row) -> joins selection
 *  4. Guidance until total = 100% ("add X% more" / "over by X%")
 *  5. At 100% -> THE REVEAL: combined weighted 1M / 3M / 1Y returns
 *  6. Save allocation
 */

import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type Candidate = {
  code: string;
  name?: string | null;
  score?: number | null;
  expected_1y?: number | null;
  ret_1m_pct?: number | null;
  ret_3m_pct?: number | null;
  max_dd_pct?: number | null;
  reason?: string | null;
};

const fmtP = (x: number | null | undefined, sign = true) =>
  x == null ? '—' : `${sign && x > 0 ? '+' : ''}${x.toFixed(1)}%`;

function Colored({ x }: { x: number | null | undefined }) {
  const cls = x == null ? 'text-gray-400' : x < 0 ? 'text-red-600' : x > 0 ? 'text-green-700' : 'text-gray-900';
  return <span className={cls}>{fmtP(x)}</span>;
}

export default function FundAllocationBuilder({
  clientId,
  onSaved,
}: {
  clientId: string;
  onSaved: () => void;
}) {
  const [stage, setStage] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [menu, setMenu] = useState<Candidate[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [weights, setWeights] = useState<Record<string, number>>({}); // code -> %
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setStage('loading');
    setErr(null);
    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/fund-profiles/menu?kind=a`);
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error || `HTTP ${res.status}`);
      }
      const d = await res.json();
      setMenu(Array.isArray(d.candidates) ? d.candidates : []);
      setStage('ready');
    } catch (e) {
      setErr(`could not generate funds: ${e instanceof Error ? e.message : e}`);
      setStage('idle');
    }
  };

  const selected = [...selectedCodes];
  const total = selected.reduce((a, c) => a + (weights[c] || 0), 0);
  const unfilled = selected.filter((c) => !(weights[c] > 0));
  const delta = 100 - total;
  const at100 = unfilled.length === 0 && Math.abs(delta) < 0.6 && selected.length > 0;

  const toggle = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };
  const setWeight = (code: string, v: number) => {
    setWeights((w) => ({ ...w, [code]: Number.isFinite(v) && v > 0 ? Math.min(100, v) : 0 }));
  };

  const meta = (code: string) => menu.find((c) => c.code === code);

  // combined weighted returns at exactly 100%
  const combined = (() => {
    if (!at100 || menu.length === 0) return null;
    const acc = { m1: { n: 0, d: 0 }, m3: { n: 0, d: 0 }, y1: { n: 0, d: 0 }, dd: { n: 0, d: 0 } };
    for (const code of selected) {
      const w = weights[code] || 0;
      const m = meta(code);
      if (!m) continue;
      for (const key of ['m1', 'm3', 'y1'] as const) {
        const v = key === 'y1' ? m.expected_1y : key === 'm1' ? m.ret_1m_pct : m.ret_3m_pct;
        if (v != null) { acc[key].n += w * v; acc[key].d += w; }
      }
      if (m.max_dd_pct != null) { acc.dd.n += w * m.max_dd_pct; acc.dd.d += w; }
    }
    const wAvg = (k: keyof typeof acc) => (acc[k].d ? acc[k].n / acc[k].d : null);
    return { m1: wAvg('m1'), m3: wAvg('m3'), y1: wAvg('y1'), dd: wAvg('dd') };
  })();

  const save = async () => {
    if (!at100) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/fund-profiles/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategy: 'a',
          risk_max_dd_pct: -25,
          expected_1y_pct: 8,
          sets: [{ bucket: 'allocation', members: selected.map((code) => ({ code, weight_pct: weights[code] || 0 })) }],
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- stage: idle — nothing generated yet ---------- */
  if (stage === 'idle') {
    return (
      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4 text-center">
        {err ? <p className="mb-2 text-xs text-red-600">{err}</p> : null}
        <p className="text-sm text-gray-600">No funds generated yet.</p>
        <button
          type="button"
          onClick={generate}
          className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Generate funds
        </button>
      </div>
    );
  }

  if (stage === 'loading') {
    return <div className="mt-3 h-24 animate-pulse rounded-lg bg-gray-100" />;
  }

  /* ---------- stage: ready — list + pick/% + guidance + reveal ---------- */
  return (
    <div className="mt-3 space-y-3">
      {err ? <p className="text-xs text-red-600">{err}</p> : null}

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">
          {menu.length} funds generated{' '}
          <span className="font-normal text-gray-400">— tick the ones you want and enter each %</span>
        </p>
        <button type="button" onClick={generate} className="text-xs font-medium text-blue-600 hover:underline">
          Regenerate
        </button>
      </div>

      <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
        {menu.map((c) => {
          const w = weights[c.code] ?? 0;
          const inSel = selectedCodes.has(c.code);
          return (
            <li
              key={c.code}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${inSel ? 'border-green-200 bg-green-50/60' : 'border-gray-200'}`}
            >
              <input
                type="checkbox"
                checked={inSel}
                onChange={() => toggle(c.code)}
                className="h-4 w-4 accent-blue-600"
              />
              <span className="min-w-0 flex-1 text-sm text-gray-800">
                <span className="font-medium">{c.code}</span>
                <span className="text-xs text-gray-500">
                  {c.expected_1y != null ? ` · 1Y ${fmtP(c.expected_1y)}` : ''}
                  {c.ret_1m_pct != null ? ` · 1M ${fmtP(c.ret_1m_pct)}` : ''}
                  {c.ret_3m_pct != null ? ` · 3M ${fmtP(c.ret_3m_pct)}` : ''}
                  {c.max_dd_pct != null ? ` · maxDD ${c.max_dd_pct.toFixed(0)}%` : ''}
                </span>
                {c.reason ? <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">{c.reason}</span> : null}
              </span>
              <input
                type="number"
                min={0.5}
                max={100}
                placeholder="%"
                disabled={!inSel}
                value={inSel ? (w || '') : ''}
                onChange={(e) => setWeight(c.code, Number(e.target.value))}
                className={`w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm text-gray-900 outline-none focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400`}
              />
              <span className="w-4 text-xs text-gray-400">%</span>
            </li>
          );
        })}
      </ul>

      {selected.length > 0 ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            at100
              ? 'border-green-300 bg-green-50'
              : unfilled.length > 0
                ? 'border-amber-200 bg-amber-50'
                : delta > 0
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-red-200 bg-red-50'
          }`}
        >
          {at100 ? (
            <>Selected: <b>100%</b> — combined returns below.</>
          ) : unfilled.length > 0 ? (
            <>Enter the % for: <b>{unfilled.join(', ')}</b></>
          ) : delta > 0 ? (
            <>Selected: <b>{total.toFixed(1)}%</b> — pick again or add <b>{delta.toFixed(1)}%</b> more to reach 100%.</>
          ) : (
            <>Selected: <b>{total.toFixed(1)}%</b> — over by <b>{Math.abs(delta).toFixed(1)}%</b>. Reduce a % or untick a fund.</>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Select funds and enter their % — the total must reach 100%.</p>
      )}

      {combined ? (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Combined return of your allocation</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            1M <Colored x={combined.m1} />
            <span className="mx-2 text-gray-300">·</span>
            3M <Colored x={combined.m3} />
            <span className="mx-2 text-gray-300">·</span>
            1Y <Colored x={combined.y1} />
          </p>
          {combined.dd != null ? (
            <p className="mt-0.5 text-sm text-gray-700">
              Average risk (weighted max drawdown): <b className="text-gray-900">{fmtP(combined.dd, false)}</b>{' '}
              <span className="text-xs text-gray-500">— {Math.abs(combined.dd) <= 12 ? 'low risk' : Math.abs(combined.dd) <= 20 ? 'medium risk' : 'high risk'}</span>
            </p>
          ) : null}
          <p className="mt-0.5 text-[10px] text-gray-400">1M/3M realised from NAV · 1Y forecast median · funds without data excluded</p>
          <button type="button" onClick={save} disabled={saving}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save this allocation'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
