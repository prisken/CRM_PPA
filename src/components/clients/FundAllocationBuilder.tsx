'use client';

/**
 * FundAllocationBuilder — Plan A allocation. Pick growth candidates from the
 * engine's ranked menu and size each with a % weight; the allocation must sum
 * to 100% before saving (same rule as Plan B sets).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type Candidate = {
  code: string;
  name?: string | null;
  score?: number | null;
  expected_1y?: number | null;
  max_dd_pct?: number | null;
  verdict?: string | null;
};

const INPUT =
  'w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-blue-500';

export default function FundAllocationBuilder({
  clientId,
  onSaved,
}: {
  clientId: string;
  onSaved: () => void;
}) {
  const [menu, setMenu] = useState<Candidate[]>([]);
  const [rows, setRows] = useState<Array<{ code: string; weight: number }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authenticatedFetch(`/api/clients/${clientId}/fund-profiles/menu?kind=a`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setMenu(Array.isArray(d.candidates) ? d.candidates : []))
      .catch(() => setErr('could not load plan-A menu (funds engine unreachable?)'));
  }, [clientId]);

  const used = useMemo(() => new Set(rows.map((r) => r.code)), [rows]);
  const available = menu.filter((c) => !used.has(c.code));
  const sum = rows.reduce((a, r) => a + (Number.isFinite(r.weight) ? r.weight : 0), 0);
  const ok = Math.abs(sum - 100) < 0.6 && rows.length > 0 && rows.every((r) => r.code && r.weight > 0);

  const addFund = (code: string) => {
    if (!code) return;
    const rest = rows.length === 0 ? 100 : 0;
    setRows((prev) => [...prev, { code, weight: Math.max(0, Math.round((100 - sum) * 10) / 10 || rest) }]);
  };

  const setRow = (i: number, patch: Partial<{ code: string; weight: number }>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!ok) {
      setErr('allocation must sum to 100% with at least one fund');
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

  const meta = (code: string) => menu.find((c) => c.code === code);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value="" onChange={(e) => addFund(e.target.value)} className={`${INPUT} min-w-60 flex-1`}>
          <option value="">+ add a fund from the engine&apos;s growth list…</option>
          {available.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} · score {c.score?.toFixed(2)}
              {c.expected_1y != null ? ` · exp ${c.expected_1y > 0 ? '+' : ''}${c.expected_1y.toFixed(1)}%` : ''}
              {c.max_dd_pct != null ? ` · maxDD ${c.max_dd_pct.toFixed(0)}%` : ''}
            </option>
          ))}
        </select>
        <span className={`text-xs font-semibold ${ok ? 'text-green-600' : 'text-red-600'}`}>
          {rows.length ? `${sum.toFixed(1)}%` : '—'} / 100%
        </span>
      </div>

      {rows.length > 0 ? (
        <ul className="space-y-1.5">
          {rows.map((r, i) => {
            const m = meta(r.code);
            return (
              <li key={r.code} className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 text-sm text-gray-800">
                  {r.code}
                  {m?.expected_1y != null ? (
                    <span className="ml-1 text-xs text-gray-500">exp {m.expected_1y > 0 ? '+' : ''}{m.expected_1y.toFixed(1)}%</span>
                  ) : null}
                  {m?.max_dd_pct != null ? (
                    <span className="ml-1 text-xs text-gray-500">maxDD {m.max_dd_pct.toFixed(0)}%</span>
                  ) : null}
                </span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={r.weight}
                  onChange={(e) => setRow(i, { weight: Number(e.target.value) })}
                  className={`${INPUT} w-20 text-right`}
                />
                <span className="text-xs text-gray-400">%</span>
                <button type="button" onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50">
                  remove
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-gray-400">Add funds and size each one — total must reach 100%.</p>
      )}

      {(() => {
        if (!rows.length) return null;
        let eNum = 0, eDen = 0, dNum = 0, dDen = 0;
        for (const r of rows) {
          const m = meta(r.code);
          if (m?.expected_1y != null) { eNum += r.weight * m.expected_1y; eDen += r.weight; }
          if (m?.max_dd_pct != null) { dNum += r.weight * m.max_dd_pct; dDen += r.weight; }
        }
        return (
          <p className="text-xs text-gray-600">
            Portfolio expected 1Y ≈{' '}
            <span className="font-semibold text-gray-900">
              {eDen ? `${(eNum / eDen) > 0 ? '+' : ''}${(eNum / eDen).toFixed(1)}%` : 'n/a'}
            </span>
            {dDen ? (
              <>
                {' '}· weighted max DD ≈{' '}
                <span className="font-semibold text-gray-900">{(dNum / dDen).toFixed(0)}%</span>
              </>
            ) : null}
            {' '}<span className="text-[10px] text-gray-400">(funds without data excluded)</span>
          </p>
        );
      })()}
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      <button type="button" onClick={save} disabled={saving || !ok}
        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {saving ? 'Saving…' : 'Save allocation'}
      </button>
    </div>
  );
}
