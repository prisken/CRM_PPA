import MonthlyPulseReport from '@/components/reports/MonthlyPulseReport';

export const dynamic = 'force-dynamic';

export default async function PulseReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const lang = sp.lang === 'zh' || sp.lang === 'both' ? sp.lang : 'en';
  return <MonthlyPulseReport clientId={id} lang={lang} />;
}
