'use client';

/**
 * FundChaseBuilder — Plan B staged flow (per directive):
 *  1) choose chase count (1-3) -> nothing else shown
 *  2) click "Generate funds" -> list appears: Dividend funds (promised %,
 *     record bucket, note) + Capital-stabilising funds
 *  3) tabs = chase count; add funds (with %) to the active tab
 *  4) every tab must reach 100% (guidance like Plan A)
 *  5) reveal: TOTAL dividends the user will get (weighted promised %)
 */

import { useEffect, useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type DivFund = {
  code: string; name?: string | null; promised_pct?: number | null;
  bucket?: string | null; note?: string | null; yield?: number | null;
};
type SliceFund = { code: string; name?: string | null };
type Menu = { chase: DivFund[]; slice_pool: SliceFund[] };
type TabState = { members: Array<{ code: string; role: 'dividend' | 'stabiliser'; weight: number; bucket?: string | null }> };

const fmtP = (x: number | null | undefined, sign = true) =>
  x == null ? '—' : `${sign && x > 0 ? '+' : ''}${x.toFixed(1)}%`;

export default function FundChaseBuilder({
  clientId,
  onSaved,
}: { clientId: string; onSaved: () => void }) {
  const [stage, setStage] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [freq, setFreq] = useState(3);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [activeTab, setActiveTab] = useState(1);
  const [tabs, setTabs] = useState<TabState[]>(() => Array.from({ length: 3 }, () => ({ members: [] })));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setStage('loading');
    setErr(null);
    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/fund-profiles/menu`);
      if (!res.ok) {
        const e = await res.json().catch(() => null);
        throw new Error(e?.error || `HTTP ${res.status}`);
      }
      setMenu(await res.json());
      setTabs(Array.from({ length: freq }, () => ({ members: [] })));
      setActiveTab(1);
      setStage('ready');
    } catch (e) {
      setErr(`could not generate funds: ${e instanceof Error ? e.message : e}`);
      setStage('idle');
    }
  };

  const divMeta = (code: string) => (menu?.chase || []).find((c) => c.code === code);
  const roleOf = (code: string): 'dividend' | 'stabiliser' =>
    (menu?.chase || []).some((c) => c.code === code) ? 'dividend' : 'stabiliser';

  const usedGlobal = useMemo(() => {
    const u = new Set<string>();
    for (const t of tabs) for (const m of t.members) u.add(m.code);
    return u;
  }, [tabs]);

  const curTab = tabs[activeTab - 1] || { members: [] };
  const curDividendBucket = curTab.members.find((m) => m.role === 'dividend')?.bucket ?? null;

  const addToTab = (code: string, weight: number, tabIdx: number) => {
    const role = roleOf(code);
    const bucket = role === 'dividend' ? divMeta(code)?.bucket ?? null : null;
    const target = tabs[tabIdx] || { members: [] };
    const targetDividendBucket = target.members.find((m) => m.role === 'dividend')?.bucket ?? null;
    if (role === 'dividend' && targetDividendBucket && bucket && bucket !== targetDividendBucket) {
      setErr(`Tab ${tabIdx + 1} already targets the "${targetDividendBucket}" record bucket — pick a ${targetDividendBucket}-bucket fund (or another tab).`);
      return;
    }
    setErr(null);
    setTabs((prev) =>
      prev.map((t, i) =>
        i === tabIdx
          ? {
              ...t,
              members: [...t.members.filter((m) => m.code !== code), { code, role, weight, bucket }],
            }
          : t
      )
    );
  };
  const setMemberWeight = (tabIdx: number, code: string, weight: number) =>
    setTabs((prev) =>
      prev.map((t, i) =>
        i === tabIdx
          ? { ...t, members: t.members.map((m) => (m.code === code ? { ...m, weight } : m)) }
          : t
      )
    );
  const removeMember = (tabIdx: number, code: string) =>
    setTabs((prev) => prev.map((t, i) => (i === tabIdx ? { ...t, members: t.members.filter((m) => m.code !== code) } : t)));

  const sums = tabs.slice(0, freq).map((t) => t.members.reduce((a, m) => a + (Number.isFinite(m.weight) ? m.weight : 0), 0));
  const allAt100 = sums.every((s) => Math.abs(s - 100) < 0.6) && tabs.slice(0, freq).every((t) => t.members.length > 0);

  // total dividend the user gets: Σ(weight × promised%) / Σ weight of dividend legs
  const totalDiv = (() => {
    let n = 0, d = 0;
    for (const t of tabs.slice(0, freq)) {
      for (const m of t.members) {
        if (m.role !== 'dividend') continue;
        const p = divMeta(m.code)?.promised_pct;
        if (p != null) { n += m.weight * p; d += m.weight; }
      }
    }
    return d ? n / d : null;
  })();

  const save = async () => {
    if (!allAt100) return;
    setSaving(true);
    setErr(null);
    try {
      const sets = tabs.slice(0, freq).map((t, i) => ({
        bucket: (t.members.find((m) => m.role === 'dividend')?.bucket as string) || 'flex',
        members: t.members.map((m) => ({ code: m.code, weight_pct: m.weight })),
      }));
      const res = await authenticatedFetch(`/api/clients/${clientId}/fund-profiles/sets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'b', risk_max_dd_pct: -20, expected_1y_pct: 5, min_yield_pct: 4, sets }),
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

  /* idle: count + generate */
  if (stage === 'idle') {
    return (
      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4 text-center">
        {err ? <p className="mb-2 text-xs text-red-600">{err}</p> : null}
        <p className="text-sm text-gray-600">How many times per month do you want to chase dividends?</p>
        <div className="mt-2 flex justify-center gap-2">
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" onClick={() => setFreq(n)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${freq === n ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
              {n}× / month
            </button>
          ))}
        </div>
        <button type="button" onClick={generate} className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          Generate funds
        </button>
      </div>
    );
  }
  if (stage === 'loading') return <div className="mt-3 h-24 animate-pulse rounded-lg bg-gray-100" />;

  /* ready */
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-700">
          Funds generated{' '}
          <span className="font-normal text-gray-400">— dividend payers (promised % · bucket) and capital-stabilising funds</span>
        </p>
        <button type="button" onClick={generate} className="text-xs font-medium text-blue-600 hover:underline">Regenerate</button>
      </div>

      {/* tabs */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: freq }).map((_, i) => {
          const s = sums[i];
          const ok = Math.abs(s - 100) < 0.6;
          return (
            <button key={i} type="button" onClick={() => setActiveTab(i + 1)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                activeTab === i + 1 ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              Tab {i + 1} · {tabs[i].members.length ? `${s.toFixed(0)}%` : 'empty'}
              {tabs[i].members.length ? (ok ? ' ✓' : '') : ''}
            </button>
          );
        })}
      </div>

      {/* generated list */}
      <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
        {[...(menu?.chase || [])].map((c) => {
          const inTab = usedGlobal.has(c.code);
          return (
            <li key={c.code} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${inTab ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}>
              <span className="min-w-0 flex-1 text-sm text-gray-800">
                <span className="font-medium">{c.code}</span>
                <span className="text-xs text-gray-500"> · dividend</span>
                <span className="text-xs text-gray-500">
                  {c.promised_pct != null ? ` · promised ${c.promised_pct.toFixed(1)}%` : ''}
                  {c.bucket ? ` · [${c.bucket}]` : ''}
                  {c.note ? ` · ${c.note}` : ''}
                </span>
                {inTab ? <span className="ml-1 text-[10px] font-semibold text-green-700">added</span> : null}
              </span>
              {!inTab ? (
                <TabAdder activeTab={activeTab} freq={freq} onAdd={(tab, w) => { setActiveTab(tab); addToTab(c.code, w, tab - 1); }} code={c.code} />
              ) : null}
            </li>
          );
        })}
        {(menu?.slice_pool || []).map((c) => {
          const inTab = usedGlobal.has(c.code);
          return (
            <li key={c.code} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${inTab ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}>
              <span className="min-w-0 flex-1 text-sm text-gray-800">
                <span className="font-medium">{c.code}</span>
                <span className="text-xs text-gray-500"> · stabilising (accumulation)</span>
                {inTab ? <span className="ml-1 text-[10px] font-semibold text-green-700">added</span> : null}
              </span>
              {!inTab ? (
                <TabAdder activeTab={activeTab} freq={freq} onAdd={(tab, w) => { setActiveTab(tab); addToTab(c.code, w, tab - 1); }} code={c.code} />
              ) : null}
            </li>
          );
        })}
      </ul>

      {/* active tab composition */}
      <div className="rounded-lg border border-gray-200 p-2.5">
        <p className="mb-1.5 text-xs font-bold text-gray-800">Tab {activeTab} {curDividendBucket ? `— record bucket [${curDividendBucket}]` : ''}</p>
        {curTab.members.length === 0 ? (
          <p className="text-xs text-gray-400">No funds in this tab yet. Add a dividend payer (and optionally a stabiliser) above.</p>
        ) : (
          <ul className="space-y-1">
            {curTab.members.map((m) => (
              <li key={m.code} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-gray-800">
                  {m.code} <span className="text-xs text-gray-400">{m.role === 'stabiliser' ? '· stabiliser' : ''}</span>
                </span>
                <input type="number" min={0.5} max={100} value={m.weight || ''}
                  onChange={(e) => setMemberWeight(activeTab - 1, m.code, Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm outline-none focus:border-blue-500" />
                <span className="text-xs text-gray-400">%</span>
                <button type="button" onClick={() => removeMember(activeTab - 1, m.code)} className="text-xs text-red-600 hover:underline">remove</button>
              </li>
            ))}
          </ul>
        )}
        <div className={`mt-1.5 text-xs font-semibold ${Math.abs(sums[activeTab - 1] - 100) < 0.6 ? 'text-green-600' : 'text-amber-600'}`}>
          {curTab.members.length ? `Tab total: ${sums[activeTab - 1].toFixed(1)}% / 100%` : ''}
        </div>
      </div>

      {err ? <p className="text-xs text-red-600">{err}</p> : null}

      {/* reveal: total dividends */}
      {allAt100 ? (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your chase plan</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            Total dividends you&apos;ll get ≈{' '}
            <span className="text-green-700">{totalDiv != null ? `${totalDiv.toFixed(1)}%` : 'n/a'}</span>
          </p>
          <p className="mt-0.5 text-[10px] text-gray-400">
            weighted promised dividend across the {freq} tab(s) · stabilisers add stability, not income
          </p>
          <button type="button" onClick={save} disabled={saving}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save chase plan'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TabAdder({
  activeTab, freq, code, onAdd,
}: { activeTab: number; freq: number; code: string; onAdd: (tab: number, weight: number) => void }) {
  const [w, setW] = useState('');
  const [tab, setTab] = useState(activeTab);
  return (
    <span className="flex items-center gap-1.5">
      <select value={tab} onChange={(e) => setTab(Number(e.target.value))} className="rounded-lg border border-gray-300 px-1.5 py-1.5 text-xs text-gray-700 outline-none">
        {Array.from({ length: freq }).map((_, i) => (
          <option key={i} value={i + 1}>Tab {i + 1}</option>
        ))}
      </select>
      <input type="number" min={0.5} max={100} value={w} placeholder="%" onChange={(e) => setW(e.target.value)}
        className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm outline-none focus:border-blue-500" />
      <button type="button" disabled={!w || Number(w) <= 0} onClick={() => onAdd(tab, Number(w))}
        className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">
        Add
      </button>
    </span>
  );
}
