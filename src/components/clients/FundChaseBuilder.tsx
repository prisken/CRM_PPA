'use client';

/**
 * Plan B staged flow (v3):
 *  count -> Generate -> dividend funds (record-dated, promoted first) +
 *  stabilisers (reusable on EVERY tab) -> tabs each to 100% ->
 *  reveal: Total dividends (ADDED across tabs) + capital change + risk.
 */

import { useMemo, useState } from 'react';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type MenuFund = {
  code: string; name?: string | null; promised_pct?: number | null;
  bucket?: string | null; note?: string | null; yield?: number | null;
  ret_1m_pct?: number | null; ret_3m_pct?: number | null;
  expected_1y?: number | null; max_dd_pct?: number | null; score?: number | null;
};
type TabState = { members: Array<{ code: string; role: 'dividend' | 'stabiliser'; weight: number }> };
const fmtP = (x: number | null | undefined, sign = true) =>
  x == null ? '—' : `${sign && x > 0 ? '+' : ''}${x.toFixed(1)}%`;

export default function FundChaseBuilder({ clientId, onSaved }: { clientId: string; onSaved: () => void }) {
  const [stage, setStage] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [freq, setFreq] = useState(3);
  const [menu, setMenu] = useState<{ chase: MenuFund[]; slice_pool: MenuFund[] }>({ chase: [], slice_pool: [] });
  const [activeTab, setActiveTab] = useState(1);
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const generate = async () => {
    setStage('loading');
    setErr(null);
    try {
      const res = await authenticatedFetch(`/api/clients/${clientId}/fund-profiles/menu`);
      if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.error || `HTTP ${res.status}`); }
      const d = await res.json();
      setMenu({ chase: d.chase || [], slice_pool: d.slice_pool || [] });
      setTabs(Array.from({ length: freq }, () => ({ members: [] })));
      setActiveTab(1);
      setStage('ready');
    } catch (e) { setErr(`could not generate funds: ${e instanceof Error ? e.message : e}`); setStage('idle'); }
  };
  const backToCount = () => { setStage('idle'); setTabs([]); setErr(null); };

  const meta = useMemo(() => {
    const m = new Map<string, MenuFund>();
    for (const c of menu.chase) m.set(c.code, c);
    for (const s of menu.slice_pool) m.set(s.code, s);
    return m;
  }, [menu]);

  const dividendUsed = useMemo(() => {
    const u = new Set<string>();
    for (const t of tabs) for (const mem of t.members) if (mem.role === 'dividend') u.add(mem.code);
    return u;
  }, [tabs]);

  const addToTab = (code: string, weight: number, tabIdx: number, role: 'dividend' | 'stabiliser') => {
    const bucket = meta.get(code)?.bucket ?? null;
    const target = tabs[tabIdx] || { members: [] };
    const targetBucket = target.members.find((m) => m.role === 'dividend') ? meta.get(target.members.find((m) => m.role === 'dividend')!.code)?.bucket ?? null : null;
    if (role === 'dividend' && dividendUsed.has(code)) { setErr(`${code} is already used in another tab.`); return; }
    if (role === 'dividend' && targetBucket && bucket && bucket !== targetBucket) {
      setErr(`Tab ${tabIdx + 1} already targets the "${targetBucket}" record bucket — use a ${targetBucket}-bucket fund or another tab.`);
      return;
    }
    setErr(null);
    setTabs((prev) => prev.map((t, i) => (i === tabIdx ? { ...t, members: [...t.members.filter((m) => m.code !== code), { code, role, weight }] } : t)));
  };
  const setWeight = (ti: number, code: string, w: number) =>
    setTabs((prev) => prev.map((t, i) => (i === ti ? { ...t, members: t.members.map((m) => (m.code === code ? { ...m, weight: w } : m)) } : t)));
  const remove = (ti: number, code: string) =>
    setTabs((prev) => prev.map((t, i) => (i === ti ? { ...t, members: t.members.filter((m) => m.code !== code) } : t)));

  const sums = tabs.map((t) => t.members.reduce((a, m) => a + (Number.isFinite(m.weight) ? m.weight : 0), 0));
  const allAt100 = sums.every((s) => Math.abs(s - 100) < 0.6) && tabs.every((t) => t.members.length > 0);

  // ---- results ----
  const res = (() => {
    if (!allAt100) return null;
    let divN = 0; // dividends ADD: Σ(w/100 × promised)
    let cap1 = 0, cap3 = 0, capY = 0, ddN = 0, ddD = 0, anyCap = false, anyDD = false;
    for (const t of tabs) {
      for (const m of t.members) {
        const f = meta.get(m.code);
        if (!f) continue;
        const w = m.weight / 100;
        if (m.role === 'dividend' && f.promised_pct != null) divN += w * f.promised_pct;
        // capital: rotation factor 1/freq for <=3m windows (each tab ~1/N of month), full year = full exposure
        const rot = 1 / freq;
        if (f.ret_1m_pct != null) { cap1 += w * f.ret_1m_pct * rot; anyCap = true; }
        if (f.ret_3m_pct != null) { cap3 += w * f.ret_3m_pct * rot; anyCap = true; }
        if (f.expected_1y != null) { capY += w * f.expected_1y; anyCap = true; }
        if (f.max_dd_pct != null) { ddN += w * f.max_dd_pct; ddD += w; anyDD = true; }
      }
    }
    return { dividends: divN, cap1, cap3, capY, anyCap, dd: anyDD && ddD ? ddN / ddD : null };
  })();

  const save = async () => {
    if (!allAt100) return;
    setSaving(true); setErr(null);
    try {
      const sets = tabs.map((t) => ({
        bucket: (() => { const d = t.members.find((m) => m.role === 'dividend'); return (d && meta.get(d.code)?.bucket) || 'flex'; })(),
        members: t.members.map((m) => ({ code: m.code, weight_pct: m.weight })),
      }));
      const r = await authenticatedFetch(`/api/clients/${clientId}/fund-profiles/sets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy: 'b', risk_max_dd_pct: -20, expected_1y_pct: 5, min_yield_pct: 4, sets }),
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || `HTTP ${r.status}`); }
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'save failed'); } finally { setSaving(false); }
  };

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

  const bucketed = menu.chase.filter((c) => c.bucket);
  const unbucketed = menu.chase.filter((c) => !c.bucket);

  const assignmentsOf = (code: string) => {
    const out: Array<{ tab: number; weight: number; role: 'dividend' | 'stabiliser' }> = [];
    tabs.forEach((t, i) => {
      const m = t.members.find((x) => x.code === code);
      if (m) out.push({ tab: i + 1, weight: m.weight, role: m.role });
    });
    return out;
  };

  const fundMeta = (code: string) => meta.get(code);

  const rowMetaLine = (c: MenuFund) => (
    <span className="text-xs text-gray-500">
      {c.promised_pct != null ? ` · promised ${c.promised_pct.toFixed(1)}%` : ''}
      {c.bucket ? ` · [${c.bucket}]` : ''}
      {c.ret_1m_pct != null ? ` · 1M ${fmtP(c.ret_1m_pct)}` : ''}
      {c.ret_3m_pct != null ? ` · 3M ${fmtP(c.ret_3m_pct)}` : ''}
      {c.expected_1y != null ? ` · 1Y ${fmtP(c.expected_1y)}` : ''}
      {c.note ? ` · ${c.note}` : ''}
    </span>
  );

  const assignmentChips = (code: string, role: 'dividend' | 'stabiliser') => {
    const as = assignmentsOf(code);
    return as.length ? (
      <span className="flex flex-wrap items-center gap-1.5">
        {as.map((a) => (
          <span key={`${code}-${a.tab}`} className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs text-blue-800">
            Tab {a.tab}
            <input type="number" min={0.5} max={100} value={a.weight || ''}
              onChange={(e) => setWeight(a.tab - 1, code, Number(e.target.value))}
              className="w-14 rounded border border-blue-200 bg-white px-1 py-0.5 text-right text-xs outline-none focus:border-blue-500" />
            %
            <button type="button" onClick={() => remove(a.tab - 1, code)} className="text-blue-500 hover:text-red-600" aria-label={`remove ${code} from tab ${a.tab}`}>×</button>
          </span>
        ))}
      </span>
    ) : null;
  };

  const showAdd = (c: MenuFund, role: 'dividend' | 'stabiliser') => {
    const as = assignmentsOf(c.code);
    if (role === 'dividend') return as.length === 0;
    return as.length < freq; // stabilisers may repeat on every tab
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={backToCount} className="text-xs font-medium text-gray-500 hover:text-gray-800">← change chase count ({freq}×/mo)</button>
        <button type="button" onClick={generate} className="text-xs font-medium text-blue-600 hover:underline">Regenerate</button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map((t, i) => {
          const ok = Math.abs(sums[i] - 100) < 0.6;
          const d = t.members.find((m) => m.role === 'dividend');
          const bucket = d ? meta.get(d.code)?.bucket ?? '' : '';
          return (
            <button key={i} type="button"
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${ok ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              Tab {i + 1}{bucket ? ` [${bucket}]` : ''} · {t.members.length ? `${sums[i].toFixed(0)}%` : 'empty'}{t.members.length && ok ? ' ✓' : ''}
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-gray-700">Dividend funds <span className="font-normal text-gray-400">— add to one tab, edit or remove anytime</span></p>
        <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {bucketed.map((c) => (
            <li key={c.code} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 ${assignmentsOf(c.code).length ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}>
              <span className="min-w-0 flex-1 text-sm text-gray-800">
                <span className="font-medium">{c.code}</span>{rowMetaLine(c)}
              </span>
              {assignmentChips(c.code, 'dividend')}
              {showAdd(c, 'dividend') ? <RowAdd freq={freq} defTab={activeTab} onAdd={(t, w) => addToTab(c.code, w, t - 1, 'dividend')} /> : null}
            </li>
          ))}
        </ul>
        {unbucketed.length ? (
          <details className="mt-1.5">
            <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600">
              {unbucketed.length} more dividend funds — record dates not available (recommendable with note)
            </summary>
            <ul className="mt-1 max-h-40 space-y-1.5 overflow-y-auto pr-1">
              {unbucketed.map((c) => (
                <li key={c.code} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 ${assignmentsOf(c.code).length ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}>
                  <span className="min-w-0 flex-1 text-sm text-gray-800">
                    <span className="font-medium">{c.code}</span>{rowMetaLine(c)}
                  </span>
                  {assignmentChips(c.code, 'dividend')}
                  {showAdd(c, 'dividend') ? <RowAdd freq={freq} defTab={activeTab} onAdd={(t, w) => addToTab(c.code, w, t - 1, 'dividend')} /> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <div>
        <p className="mb-1 text-xs font-semibold text-gray-700">Capital-stabilising funds <span className="font-normal text-gray-400">— the same fund can sit on every tab (each tab holds it ~1/{freq} of the month)</span></p>
        <ul className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
          {menu.slice_pool.map((c) => (
            <li key={c.code} className={`flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-2 ${assignmentsOf(c.code).length ? 'border-green-200 bg-green-50/50' : 'border-gray-200'}`}>
              <span className="min-w-0 flex-1 text-sm text-gray-800">
                <span className="font-medium">{c.code}</span>
                <span className="text-xs text-gray-500"> · stabilising</span>{rowMetaLine(c)}
              </span>
              {assignmentChips(c.code, 'stabiliser')}
              {showAdd(c, 'stabiliser') ? <RowAdd freq={freq} defTab={activeTab} onAdd={(t, w) => addToTab(c.code, w, t - 1, 'stabiliser')} /> : null}
            </li>
          ))}
        </ul>
      </div>

      {tabs.some((t) => t.members.length) ? (
        <div className="rounded-lg border px-3 py-2 text-sm text-gray-700">
          {tabs.map((t, i) => {
            const s = sums[i];
            const ok = Math.abs(s - 100) < 0.6;
            const txt = t.members.length === 0 ? `Tab ${i + 1}: empty` : ok ? `Tab ${i + 1}: ${s.toFixed(1)}% ✓` : s < 100 ? `Tab ${i + 1}: ${s.toFixed(1)}% — add ${(100 - s).toFixed(1)}% more` : `Tab ${i + 1}: ${s.toFixed(1)}% — over by ${(s - 100).toFixed(1)}%`;
            return <div key={i} className={ok ? 'text-green-700' : 'text-amber-700'}>{txt}</div>;
          })}
        </div>
      ) : null}

      {err ? <p className="text-xs text-red-600">{err}</p> : null}

      {res ? (
        <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your chase plan ({freq} tab{freq > 1 ? 's' : ''})</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            Total dividends you&apos;ll get ≈ <span className="text-green-700">{res.dividends.toFixed(1)}%</span>
          </p>
          {res.anyCap ? (
            <p className="mt-1 text-sm text-gray-800">
              Capital change ≈{' '}
              1M <Colored x={res.cap1} />
              {' · '}3M <Colored x={res.cap3} />
              {' · '}1Y <Colored x={res.capY} />
              {res.capY < 0 ? <span className="text-xs text-gray-500"> — dividends likely outweigh the capital drift, but the capital side can drop</span> : null}
            </p>
          ) : null}
          {res.dd != null ? (
            <p className="mt-0.5 text-sm text-gray-700">
              Average risk (weighted max drawdown): <b className="text-gray-900">{fmtP(res.dd, false)}</b>{' '}
              <span className="text-xs text-gray-500">— {Math.abs(res.dd) <= 12 ? 'low' : Math.abs(res.dd) <= 20 ? 'medium' : 'high'} risk</span>
            </p>
          ) : null}
          <p className="mt-1 text-[10px] text-gray-400">Dividends add across tabs (e.g. 3 × 100% at 10% = 30%). Capital 1M/3M weighted with a ~1/{freq}-month rotation factor; 1Y assumes full-year holding. From funds-site NAV + forecast data.</p>
          <button type="button" onClick={save} disabled={saving}
            className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save chase plan'}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Colored({ x }: { x: number | null }) {
  const cls = x == null ? 'text-gray-400' : x < 0 ? 'text-red-600' : x > 0 ? 'text-green-700' : 'text-gray-900';
  return <b className={cls}>{fmtP(x)}</b>;
}

function RowAdd({ freq, defTab, onAdd }: { freq: number; defTab: number; onAdd: (tab: number, w: number) => void }) {
  const [tab, setTab] = useState(defTab);
  const [w, setW] = useState('');
  return (
    <span className="flex items-center gap-1.5">
      <select value={tab} onChange={(e) => setTab(Number(e.target.value))} className="rounded-lg border border-gray-300 px-1.5 py-1.5 text-xs text-gray-700 outline-none">
        {Array.from({ length: freq }).map((_, i) => <option key={i} value={i + 1}>Tab {i + 1}</option>)}
      </select>
      <input type="number" min={0.5} max={100} value={w} placeholder="%" onChange={(e) => setW(e.target.value)}
        className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-right text-sm outline-none focus:border-blue-500" />
      <button type="button" disabled={!w || Number(w) <= 0} onClick={() => onAdd(tab, Number(w))}
        className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40">Add</button>
    </span>
  );
}
