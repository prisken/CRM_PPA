'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type ReviewData = {
  generatedAt: string;
  client: { name: string; company: string | null; contact: string | null; status: string };
  plan: { title: string; goal: string | null; expected: string | null } | null;
  notes: string | null;
  policies: Array<{ name: string; type: string; value: number | null; since: string }>;
  in_discussion: Array<{ name: string; type: string; status: string }>;
  upcoming: Array<{ label: string; when: string }>;
  open_tasks: Array<{ title: string; due: string | null }>;
  recent_activity: Array<{ date: string; content: string }>;
  next_action: string | null;
  next_follow_up: string | null;
};

type ReviewProps = {
  clientId: string;
  lang: 'en' | 'zh' | 'both';
};

const fmtMoney = (v: number | null) =>
  v == null ? '—' : '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

export default function QuarterlyReviewReport({ clientId, lang }: ReviewProps) {
  const router = useRouter();
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recorded, setRecorded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    authenticatedFetch(`/api/clients/${clientId}/reports/review`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError('Could not load report data'); });
    return () => { cancelled = true; };
  }, [clientId]);

  useEffect(() => {
    if (data && !recorded) {
      setRecorded(true);
      authenticatedFetch(`/api/clients/${clientId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'REVIEW', lang, snapshot: data }),
      }).catch(() => {});
    }
  }, [data, recorded, clientId, lang]);

  if (error) return <div className="p-10 text-center text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-10 text-center text-sm text-gray-400">Preparing review pack…</div>;

  const quarter = new Date();
  const qNum = Math.floor(quarter.getMonth() / 3) + 1;
  const qLabel = lang === 'zh' ? `${quarter.getFullYear()}年 Q${qNum} 保單覆核` : `Q${qNum} ${quarter.getFullYear()} Policy Review`;
  const showEn = lang !== 'zh';
  const showZh = lang !== 'en';
  const line = (en: string, zh: string) =>
    showZh && !showEn ? zh : showEn && !showZh ? en : `${en} / ${zh}`;

  const H = (props: { children: React.ReactNode }) => (
    <h2 className="mt-8 border-b border-gray-300 pb-1 text-base font-bold text-gray-900">{props.children}</h2>
  );

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
            <h1 className="text-2xl font-bold text-gray-900">{line('Quarterly Policy Review', '季度保單覆核')}</h1>
            <p className="text-sm text-gray-500">{qLabel}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900">{data.client.name}</p>
            {data.client.company && <p className="text-sm text-gray-500">{data.client.company}</p>}
          </div>
        </div>

        {/* Purpose */}
        <div className="mt-6 rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
          {line(
            'This review keeps your protection aligned with your life. We look at what you have, what may have changed, and what to consider next.',
            '這次覆核讓您的保障與生活同步：檢視現有保障、生活轉變及下一步考慮。'
          )}
        </div>

        {/* Goals */}
        {data.plan?.goal || data.notes ? (
          <>
            <H>{line('Your goals', '您的目標')}</H>
            {data.plan?.goal && (
              <p className="mt-3 text-sm font-medium text-gray-900">{data.plan.goal}</p>
            )}
            {data.plan?.expected && (
              <p className="mt-1 text-sm text-gray-600">{data.plan.expected}</p>
            )}
            {data.notes && <p className="mt-2 text-sm text-gray-600">{data.notes}</p>}
          </>
        ) : null}

        {/* Coverage */}
        <H>{line('Current coverage', '現有保障')}</H>
        {data.policies.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{line('No completed policies on record.', '暫未有已完成保單記錄。')}</p>
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

        {/* In discussion */}
        {data.in_discussion.length > 0 && (
          <>
            <H>{line('In discussion', '商議中')}</H>
            <ul className="mt-2 space-y-1.5">
              {data.in_discussion.map((d) => (
                <li key={d.name} className="flex justify-between text-sm">
                  <span className="text-gray-800">{d.name}</span>
                  <span className="text-gray-500">{d.status}</span>
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Coming up */}
        <H>{line('Coming up', '即將發生')}</H>
        {data.upcoming.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">{line('Nothing scheduled.', '目前沒有已安排事項。')}</p>
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

        {/* Discussion items from notes/tasks */}
        {(data.open_tasks.length > 0 || data.next_action) && (
          <>
            <H>{line('To discuss', '討論事項')}</H>
            <ul className="mt-2 space-y-1.5 text-sm text-gray-700">
              {data.next_action && <li>• {data.next_action}</li>}
              {data.open_tasks.map((t) => (
                <li key={t.title}>• {t.title}{t.due ? ` (${fmtDate(t.due)})` : ''}</li>
              ))}
            </ul>
          </>
        )}

        {/* Agenda */}
        <H>{line('Meeting agenda', '會議議程')}</H>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          <li>{line('Review current coverage and any changes', '檢視現有保障及任何轉變')}</li>
          <li>{line('Life updates that may affect protection', '生活轉變對保障的影響')}</li>
          <li>{line('Confirm next steps and timing', '確認下一步及時間')}</li>
        </ol>

        {/* Closing */}
        <p className="mt-8 text-sm text-gray-700">
          {line(
            `I look forward to our review. ${data.next_follow_up ? `Suggested next date: ${fmtDate(data.next_follow_up)}.` : ''}`,
            `期待我們的覆核。${data.next_follow_up ? `建議下次日期：${fmtDate(data.next_follow_up)}。` : ''}`
          )}
        </p>
        <div className="mt-8 border-t border-gray-200 pt-4 text-[11px] text-gray-400">
          {line(
            'Illustrative summary only — refer to policy documents for full terms.',
            '僅供參考 — 詳細條款請參閱保單文件。'
          )}
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
