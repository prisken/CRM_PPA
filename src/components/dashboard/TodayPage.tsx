'use client';

import { useCallback, useEffect, useState } from 'react';
import AppLink from '@/components/ui/app-link';
import { pressableRow } from '@/components/ui/pressable';
import { ChevronRight } from 'lucide-react';
import WorkspaceShell from '@/components/layout/WorkspaceShell';
import {
  buildWorkspaceNavConfig,
} from '@/components/layout/workspaceNavConfig';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authenticatedFetch } from '@/lib/authenticatedFetch';

type TodayItem = {
  client_id: string;
  client_name: string;
  company: string | null;
  status: string;
  why: string;
  verb: string;
  due_label: string | null;
};

type TodayData = {
  needs_you: TodayItem[];
  my_day: Array<{ type: string; client_id: string; client_name: string; label: string; when: string }>;
  counts: { needs_you: number; unassigned: number; reviews_due: number };
};

const VERB_TONE: Record<string, string> = {
  'Complete task': 'bg-red-100 text-red-700',
  'Prepare': 'bg-blue-100 text-blue-700',
  'Assign': 'bg-amber-100 text-amber-800',
  'Reach out': 'bg-green-100 text-green-700',
  'Follow up': 'bg-purple-100 text-purple-700',
};

export default function TodayPage() {
  const { profile, loading: profileLoading } = useUserProfile();
  const [data, setData] = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch('/api/today');
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (profileLoading) {
    return <div className="flex min-h-dvh items-center justify-center bg-gray-100 text-sm text-gray-500">Loading…</div>;
  }

  const nav = buildWorkspaceNavConfig({
    shell: 'standard',
    role: profile?.role ?? 'STANDARD_USER',
  });

  return (
    <WorkspaceShell
      nav={nav}
      userRole={profile?.role ?? 'STANDARD_USER'}
      title="Today"
      subtitle={profile?.name ? `What needs you, ${profile.name.split(' ')[0]}` : undefined}
    >
      <div className="space-y-5">
        {loading || !data ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
            Building your queue…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
            {/* A. Needs you — 2/3 on desktop; queue stays first on phone. */}
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-900">
                  Needs you
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
                    {data.counts.needs_you}
                  </span>
                </h2>
                {data.counts.unassigned > 0 && (
                  <AppLink
                    href="/admin/leads"
                    className="rounded px-1 py-1 text-xs font-medium text-blue-600 hover:underline"
                  >
                    {data.counts.unassigned} unassigned →
                  </AppLink>
                )}
              </div>

              {data.needs_you.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-400">
                  Nothing is waiting. New leads and due reviews will show up here.
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {data.needs_you.map((item) => (
                    <li key={item.client_id}>
                      <AppLink
                        href={`/clients/${item.client_id}`}
                        className={`-mx-1 flex items-center gap-3 rounded-lg px-1 py-3 ${pressableRow}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold text-gray-900 sm:text-sm">
                              {item.client_name}
                            </span>
                            {item.due_label && (
                              <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">
                                {item.due_label}
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[13px] text-gray-500 sm:text-xs">{item.why}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            VERB_TONE[item.verb] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {item.verb}
                        </span>
                        <ChevronRight
                          className="h-4 w-4 shrink-0 text-gray-300 md:hidden"
                          aria-hidden="true"
                        />
                      </AppLink>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* B. My day — right rail on desktop. */}
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-2 text-base font-semibold text-gray-900">My day</h2>
              {data.my_day.length === 0 ? (
                <p className="text-sm text-gray-400">No tasks or dates due today.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.my_day.map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      <AppLink
                        href={`/clients/${item.client_id}`}
                        className="font-medium text-blue-700 hover:underline active:text-blue-800"
                      >
                        {item.client_name}
                      </AppLink>
                      <span className="text-gray-500">· {item.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            </div>
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
