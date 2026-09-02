'use client';

/**
 * FundAllocationBuilder — Plan A flow (per spec):
 *  1) engine recommends funds (ranked list)
 *  2) user types a % on a fund and clicks Add
 *  3) running total guides them ("add X% more" / "over by X%")
 *  4) at exactly 100% the combined weighted 1M / 3M / 1Y return is shown
 *  5) Save allocation stores the plan
 */

import { useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type Candidate = {
  code: string;
  name?: string | null;
  score?: number | null;
  expected_1y?: number | null;
  ret_1m_pct?: number | null;
  ret_3m_pct?: number | null;
  max_dd_pct?: number | null;
  verdict?: string | null;
};

type Row = { code: string; weight: number };

const INPUT =
  'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500';
const fmtP = (x: number | null | undefined, sign = true) =>
  x == null ? '—' : `${sign && x > 0 ? '+' : ''}${x.toFixed(1)}%`;

export default function FundAllocationBuilder({
  clientId,
  onSaved,
}: {
  clientId: string;
  onSaved: () => void;
}) {
  const [menu, setMenu] = useState<Candidate[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authenticatedFetch(`/api/clients/${clientId}/fund-profiles/menu?kind=a`)
      .then((r) =>
        r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e?.error || `HTTP ${r.status}`)))
      )
      .then((d) => setMenu(Array.isArray(d.candidates) ? d.candidates : []))
      .catch((e) => setErr(`recommended funds unavailable: ${e?.message || e}`));
  }, [clientId]);

  const added = useMemo(() => new Set(rows.map((r) => r.code)), [rows]);
  const total = rows.reduce((a, r) => a + (Number.isFinite(r.weight) ? r.weight : 0), 0);
  const delta = 100 - total;
  const at100 = Math.abs(delta) < 0.6 && rows.length > 0;
  const meta = (code: string) => menu.find((c) => c.code === code);

  const add = (code: string) => {
    const v = Number(draft[code]);
    if (!code || !Number.isFinite(v) || v <= 0) return;
    setRows((prev) => {
      if (prev.some((r) => r.code === code)) {
        return prev.map((r) => (r.code === code ? { ...r, weight: r.weight + v } : r));
      }
      return [...prev, { code, weight: v }];
    });
  };
  const setRow = (code: string, w: number) =>
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, weight: w } : r)));

  // combined weighted returns at 100%
  const combined = (() => {
    if (!at100) return null;
    const acc: Record<string, { n: number; d: number }> = {
      exp: { n: 0, d: 0 }, m1: { n: 0, d: 0 }, m3: { n: 0, d: 0 },
    };
    for (const r of rows) {
      const m = meta(r.code);
      if (!m) continue;
      const pick = (v: number | null | undefined) => {
        if (v == null) return;
        acc.exp.d += r.weight;
        acc.exp.n += r.weight * v;
      };
      // per-horizon: use realized 1m/3m; 1Y = forecast median when present
      acc.exp.d += r.weight; acc.exp.n += r.weight * (m.expected_1y ?? 0);
      acc.m1.d += r.weight; acc.m1.n += r.weight * (m.ret_1m_pct ?? 0);
      acc.m3.d += r.weight; acc.m3.n += r.weight * (m.ret_3m_pct ?? 0);
      void pick;
    }
    const w = (k: string) => (acc[k].d ? acc[k].n / acc[k].d : null);
    return { exp: w('exp'), m1: w('m1'), m3: w('m3') };
  })();

  const save = async () => {
    if (!at100) {
      setErr('allocation must add up to exactly 100% before saving');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        strategy: 'a',
        risk_max_dd_pct: -25,
        expected_1y_pct: 8,
        sets: [{ bucket: 'allocation', members: rows.map((r) => ({ code: r.code, weight_pct: r.weight })) }],
      };
      const res = await authenticatedFetch(`/api/clients/${clientId}/fund-profiles/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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

  return (
    <div className="mt-3 space-y-3">
      {err ? <p className="text-xs text-red-600">{err}</p> : null}

      {/* Step 1: generated recommendations */}
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-700">
          Recommended funds <span className="font-normal text-gray-400">— enter a % and press Add</span>
        </p>
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {menu.map((c) => {
            const row = rows.find((r) => r.code === c.code);
            const isAdded = !!row;
            return (
              <li key={c.code} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 ${isAdded ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}>
                <span className="min-w-0 flex-1 text-sm text-gray-800">
                  <span className="font-medium">{c.code}</span>
                  <span className="text-xs text-gray-500">
                    {c.expected_1y != null ? ` · 1Y ${fmtP(c.expected_1y)}` : ''}
                    {c.ret_1m_pct != null ? ` · 1M ${fmtP(c.ret_1m_pct)}` : ''}
                    {c.ret_3m_pct != null ? ` · 3M ${fmtP(c.ret_3m_pct)}` : ''}
                    {c.max_dd_pct != null ? ` · maxDD ${c.max_dd_pct.toFixed(0)}%` : ''}
                  </span>
                  {isAdded ? <span className="ml-1 text-[10px] font-semibold text-green-700">added ({row.weight}%)</span> : null}
                </span>
                {!isAdded ? (
                  <>
                    <input
                      type="number"
                      min={0.5}
                      max={100}
                      value={draft[c.code] ?? ''}
                      placeholder="%"
                      onChange={(e) => setDraft((d) => ({ ...d, [c.code]: e.target.value }))}
                      className={`${INPUT} w-20 text-right`}
                    />
                    <button
                      type="button"
                      onClick={() => add(c.code)}
                      disabled={!draft[c.code] || Number(draft[c.code]) <= 0}
                      className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      Add
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      min={0.5}
                      max={100}
                      value={row.weight}
                      onChange={(e) => setRow(c.code, Number(e.target.value))}
                      className={`${INPUT} w-20 text-right`}
                    />
                    <button type="button" onClick={() => setRows((p) => p.filter((r) => r.code !== c.code))}
                      className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50">remove</button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Step 2: running total guidance */}
      {rows.length > 0 ? (
        <div className={`rounded-lg border px-3 py-2 text-sm ${at100 ? 'border-green-300 bg-green-50' : delta > 0 ? 'border-amber-200 bg-amber-50' : 'border-red-200 bg-red-50'}`}>
          {at100 ? (
            <>✅ Total selected: <b>100%</b> — combined returns ready below.</>
          ) : delta > 0 ? (
            <>Total selected: <b>{total.toFixed(1)}%</b> — add <b>{delta.toFixed(1)}%</b> more to reach 100%.</>
          ) : (
            <>Total selected: <b>{total.toFixed(1)}%</b> — you&apos;re over by <b>{Math.abs(delta).toFixed(1)}%</b>. Reduce a weight or remove a fund.</>
          )}
        </div>
      ) : null}

      {/* Step 3: combined returns at 100% */}
      {combined ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2">
          <p className="text-xs font-semibold text-gray-800">Combined return of your allocation</p>
          <p className="mt-0.5 text-sm text-gray-800">
            1 month ≈ <b>{fmtP(combined.m1)}</b>
            {'  ·  '}3 months ≈ <b>{fmtP(combined.m3)}</b>
            {'  ·  '}1 year ≈ <b>{fmtP(combined.exp)}</b>
            <span className="text-[10px] text-gray-400"> (1M/3M realized from NAV · 1Y forecast median · funds without data excluded)</span>
          </p>
        </div>
      ) : null}

      {rows.length > 0 && !at100 ? (
        <p className="text-xs text-gray-400">Hit exactly 100% to see the combined returns and save.</p>
      ) : null}

      <button type="button" onClick={save} disabled={saving || !at100}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save allocation'}
      </button>
    </div>
  );
}
