'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type PulseData = {
  generatedAt: string;
  client: { name: string; company: string | null; contact: string | null; status: string };
  policies: Array<{ name: string; type: string; value: number | null; since: string }>;
  upcoming: Array<{ label: string; when: string }>;
  open_tasks: Array<{ title: string; due: string | null }>;
  last_interaction: { date: string; content: string } | null;
  next_action: string | null;
  next_follow_up: string | null;
};

type PulseReportProps = {
  clientId: string;
  lang: 'en' | 'zh' | 'both';
};

const fmtMoney = (v: number | null) =>
  v == null ? '—' : '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

export default function MonthlyPulseReport({ clientId, lang }: PulseReportProps) {
  const router = useRouter();
  const [data, setData] = useState<PulseData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authenticatedFetch(`/api/clients/${clientId}/reports/pulse`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('Could not load report data'); });
    return () => { cancelled = true; };
  }, [clientId]);

  // snapshot-on-generate: record what was shown
  useEffect(() => {
    if (data && !recorded) {
      setRecorded(true);
      authenticatedFetch(`/api/clients/${clientId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'PULSE', lang, snapshot: data }),
      }).catch(() => {});
    }
  }, [data, recorded, clientId, lang]);

  if (error) {
    return <div className="p-10 text-center text-sm text-red-600">{error}</div>;
  }
  if (!data) {
    return <div className="p-10 text-center text-sm text-gray-400">Preparing report…</div>;
  }

  const month = new Date().toLocaleDateString(lang === 'en' ? 'en' : 'zh-HK', {
    year: 'numeric', month: 'long',
  });
  const T = {
    en: {
      title: 'Monthly Pulse',
      subtitle: `Your protection update — ${month}`,
      hello: (n: string) => `Hi ${n.split(' ')[0]},`,
      lead: 'Here is a quick look at what is in place and what is coming up.',
      covered: 'What you have in place',
      none: 'No completed policies on record yet.',
      upcomingTitle: 'Coming up',
      noneUpcoming: 'Nothing scheduled right now.',
      tasksTitle: 'On our to-do list',
      tasksNote: (d: PulseData) => (d.next_action ? `Next step: ${d.next_action}` : ''),
      closed: (l: string) => `Next touchpoint: ${l}`,
      thanks: 'As always, I am a message away if anything changes or you have questions.',
      footer: 'Illustrative summary only — refer to your policy documents for full terms.',
    },
    zh: {
      title: '每月脈搏報告',
      subtitle: `${month} 保障概覽`,
      hello: (n: string) => `${n.split(' ')[0]} 你好，`,
      lead: '這份報告讓您快速了解目前的保障及未來安排。',
      covered: '現有保障',
      none: '暫未有已完成的保單記錄。',
      upcomingTitle: '即將發生',
      noneUpcoming: '目前沒有已安排事項。',
      tasksTitle: '跟進事項',
      tasksNote: (d: PulseData) => (d.next_action ? `下一步：${d.next_action}` : ''),
      closed: (l: string) => `下次跟進：${l}`,
      thanks: '如有任何轉變或疑問，歡迎隨時聯絡我。',
      footer: '僅供參考 — 詳細條款請參閱保單文件。',
    },
  };

  const showEn = lang !== 'zh';
  const showZh = lang !== 'en';
  const line = (en: string, zh: string) => (showZh && !showEn ? zh : showEn && !showZh ? en : `${en} / ${zh}`);
  const pick = lang === 'zh' ? T.zh : T.en;

  return (
    <div className="min-h-screen bg-gray-200 p-4 sm:p-8">
      <div className="mx-auto mb-4 flex max-w-3xl items-center justify-between">
        <button
          onClick={() => router.back()}
          className="rounded-lg border border-gray-400 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100"
        >
          ← Back
        </button>
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 active:bg-blue-800"
        >
          {line('Download PDF', '下載 PDF')}
        </button>
      </div>

      <div className="report-sheet mx-auto max-w-3xl bg-white p-10 shadow-lg print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-gray-900 pb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{pick.title}</h1>
            <p className="text-sm text-gray-500">{pick.subtitle}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">{data.client.name}</p>
            {data.client.company && <p className="text-sm text-gray-500">{data.client.company}</p>}
          </div>
        </div>

        {/* Opening */}
        <p className="mt-5 text-sm text-gray-700">{pick.hello(data.client.name)}</p>
        <p className="mt-1 text-sm text-gray-700">{pick.lead}</p>

        {/* What's in place */}
        <h2 className="mt-7 text-base font-bold text-gray-900">{pick.covered}</h2>
        {data.policies.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{pick.none}</p>
        ) : (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-left text-gray-500">
                <th className="pb-2 font-medium">{line('Policy', '保單')}</th>
                <th className="pb-2 font-medium">{line('Category', '類別')}</th>
                <th className="pb-2 text-right font-medium">{line('Value', '金額')}</th>
                <th className="pb-2 text-right font-medium">{line('Since', '生效')}</th>
              </tr>
            </thead>
            <tbody>
              {data.policies.map((p) => (
                <tr key={p.name} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-900">{p.name}</td>
                  <td className="py-2 text-gray-600">{p.type}</td>
                  <td className="py-2 text-right text-gray-900">{fmtMoney(p.value)}</td>
                  <td className="py-2 text-right text-gray-500">{p.since}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Coming up */}
        <h2 className="mt-7 text-base font-bold text-gray-900">{pick.upcomingTitle}</h2>
        {data.upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{pick.noneUpcoming}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {data.upcoming.map((u) => (
              <li key={u.label} className="flex justify-between text-sm">
                <span className="text-gray-800">{u.label}</span>
                <span className="text-gray-500">{fmtDate(u.when)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Next step */}
        <div className="mt-7 rounded-lg bg-gray-50 p-4">
          <p className="text-sm text-gray-700">
            {data.next_action ? pick.tasksNote(data) : pick.closed(data.next_follow_up ? fmtDate(data.next_follow_up) : '—')}
          </p>
        </div>

        {/* Closing */}
        <p className="mt-7 text-sm text-gray-700">{pick.thanks}</p>

        <div className="mt-8 border-t border-gray-200 pt-4 text-[11px] text-gray-400">
          {pick.footer}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          .report-sheet, .report-sheet * { visibility: visible; }
          .report-sheet { position: absolute; left: 0; top: 0; width: 100%; margin: 0; box-shadow: none; }
        }
      `}</style>
    </div>
  );
}
