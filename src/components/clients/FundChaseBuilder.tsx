'use client';

/**
 * FundChaseBuilder — Plan B dividend-chase set builder.
 * Chase frequency (1-3) = number of portfolios/sets; every set sums to 100%.
 * Each set: one chase fund (record-day bucket start/mid/end, one per set) +
 * optional stabilising-slice fund. Funds without record dates stay selectable
 * but carry the "record dates not available" note. Same fund cannot repeat.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type ChaseFund = {
  code: string;
  name?: string | null;
  promised_pct?: number | null;
  bucket?: string | null;
  note?: string | null;
  score?: number | null;
  yield?: number | null;
};
type SliceFund = { code: string; name?: string | null; score?: number | null };
type Menu = { chase: ChaseFund[]; slice_pool: SliceFund[] };

const INPUT =
  'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500';
const BUCKET_ORDER = ['start', 'mid', 'end'] as const;

export default function FundChaseBuilder({
  clientId,
  onSaved,
}: {
  clientId: string;
  onSaved: () => void;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [freq, setFreq] = useState(3);
  const [rows, setRows] = useState<
    Array<{ chase: string; chaseW: number; slice: string; sliceW: number; hasSlice: boolean }>
  >(() => Array.from({ length: 3 }, () => ({ chase: '', chaseW: 70, slice: '', sliceW: 30, hasSlice: false })));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authenticatedFetch(`/api/clients/${clientId}/fund-profiles/menu`)
      .then((r) =>
        r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e?.error || `HTTP ${r.status}`)))
      )
      .then(setMenu)
      .catch((e) => setErr(`chase menu unavailable: ${e?.message || e}`));
  }, [clientId]);

  useEffect(() => {
    setRows((prev) => {
      const next = Array.from({ length: freq }, (_, i) => prev[i] ?? { chase: '', chaseW: 70, slice: '', sliceW: 30, hasSlice: false });
      return next;
    });
  }, [freq]);

  const setRow = (i: number, patch: Partial<{ chase: string; chaseW: number; slice: string; sliceW: number; hasSlice: boolean }>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const usedCodes = useMemo(() => {
    const used = new Set<string>();
    for (const r of rows) {
      if (r.chase) used.add(r.chase);
      if (r.hasSlice && r.slice) used.add(r.slice);
    }
    return used;
  }, [rows]);

  const optionsFor = (rowIdx: number, includeSlice: boolean) => {
    if (!menu) return [];
    if (includeSlice) {
      return menu.slice_pool.filter((s) => !usedCodes.has(s.code) || rows[rowIdx].slice === s.code);
    }
    const bucket = BUCKET_ORDER[rowIdx] ?? 'start';
    const inBucket = menu.chase.filter((c) => c.bucket === bucket);
    const pool = inBucket.length > 0 ? inBucket : menu.chase;
    return pool.filter((c) => !usedCodes.has(c.code) || rows[rowIdx].chase === c.code);
  };

  const sums = rows.slice(0, freq).map((r) => (r.chase ? (r.hasSlice ? r.chaseW + r.sliceW : r.chaseW) : 0));
  const allOk = sums.every((s) => Math.abs(s - 100) < 0.6) && rows.slice(0, freq).every((r) => r.chase);

  const save = async () => {
    if (!allOk) {
      setErr('every set must sum to 100% with a chase fund chosen');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        risk_max_dd_pct: -20,
        expected_1y_pct: 5,
        min_yield_pct: 4,
        sets: rows.slice(0, freq).map((r, i) => ({
          bucket: BUCKET_ORDER[i] ?? 'flex',
          members: [
            { code: r.chase, weight_pct: r.hasSlice ? r.chaseW : 100 },
            ...(r.hasSlice && r.slice
              ? [{ code: r.slice, weight_pct: r.sliceW }]
              : []),
          ],
        })),
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

  const fmtFund = (c: ChaseFund | SliceFund, chase: boolean) => {
    const f = c as ChaseFund;
    const p = chase && f.promised_pct != null ? ` · ${f.promised_pct.toFixed(1)}%` : '';
    const n = chase && f.note ? ` · ${f.note}` : '';
    const b = chase && f.bucket ? ` [${f.bucket}]` : '';
    return `${c.code}${b}${p}${n}`;
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-600">Chases per month:</span>
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setFreq(n)}
            className={`rounded-md px-3 py-1 text-sm font-medium ${
              freq === n ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {n}×
          </button>
        ))}
        <span className="text-[11px] text-gray-400">max 3 · each set = one portfolio summing to 100%</span>
      </div>

      {Array.from({ length: freq }).map((_, i) => {
        const r = rows[i];
        const sum = sums[i];
        const chaseOpts = optionsFor(i, false);
        const sliceOpts = optionsFor(i, true);
        const ok = Math.abs(sum - 100) < 0.6;
        return (
          <div key={i} className="rounded-lg border border-gray-200 p-2.5">
            <div className="mb-1.5 flex items-baseline gap-2">
              <span className="text-xs font-bold text-gray-800">Set {i + 1}</span>
              <span className="text-[11px] text-gray-400">
                target record bucket: {BUCKET_ORDER[i] ?? 'flex'}
              </span>
              <span className={`ml-auto text-xs font-semibold ${ok ? 'text-green-600' : 'text-red-600'}`}>
                {r.chase ? `${sum.toFixed(1)}%` : '—'} / 100%
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={r.chase}
                onChange={(e) => setRow(i, { chase: e.target.value })}
                className={`${INPUT} min-w-56 flex-1`}
              >
                <option value="">— choose chase fund —</option>
                {chaseOpts.map((c) => (
                  <option key={c.code} value={c.code}>
                    {fmtFund(c, true)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={100}
                value={r.hasSlice ? r.chaseW : 100}
                disabled={!r.chase}
                onChange={(e) => setRow(i, { chaseW: Number(e.target.value) })}
                className={`${INPUT} w-20 text-right`}
              />
              <span className="text-xs text-gray-400">%</span>
            </div>
            {r.hasSlice ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <select
                  value={r.slice}
                  onChange={(e) => setRow(i, { slice: e.target.value })}
                  className={`${INPUT} min-w-56 flex-1`}
                >
                  <option value="">— stabilising slice fund —</option>
                  {sliceOpts.map((s) => (
                    <option key={s.code} value={s.code}>
                      {fmtFund(s, false)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={100 - r.chaseW >= 0 ? 100 - r.chaseW : 0}
                  disabled
                  className={`${INPUT} w-20 bg-gray-50 text-right`}
                />
                <span className="text-xs text-gray-400">% (auto)</span>
              </div>
            ) : null}
            <div className="mt-1.5 flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={r.hasSlice}
                  onChange={(e) => setRow(i, { hasSlice: e.target.checked, sliceW: 30 })}
                />
                add stabilising slice leg
              </label>
              {!r.hasSlice && r.chase ? (
                <span className="text-[11px] text-gray-400">100% in the chase fund</span>
              ) : null}
            </div>
          </div>
        );
      })}

      {(() => {
        if (!menu || rows.slice(0, freq).length === 0) return null;
        let num = 0, den = 0;
        for (const r of rows.slice(0, freq)) {
          const c = menu.chase.find((x) => x.code === r.chase);
          if (c && c.promised_pct != null) { num += (r.hasSlice ? r.chaseW : 100) * c.promised_pct; den += (r.hasSlice ? r.chaseW : 100); }
        }
        if (!den) return null;
        return (
          <p className="text-xs text-gray-600">
            Portfolio promised dividend ≈ <span className="font-semibold text-green-700">{(num / den).toFixed(1)}%</span> weighted across the chase legs
          </p>
        );
      })()}
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !menu || !allOk} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save chase plan'}
        </button>
        <span className="text-[11px] text-gray-400">
          one fund per record-day bucket per set · same fund cannot repeat across sets · funds without record dates stay selectable (note shown)
        </span>
      </div>
    </div>
  );
}
