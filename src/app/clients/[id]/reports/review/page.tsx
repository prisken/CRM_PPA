import QuarterlyReviewReport from '@/components/reports/QuarterlyReviewReport';

export const dynamic = 'force-dynamic';

export default async function ReviewReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const lang = sp.lang === 'zh' || sp.lang === 'both' ? sp.lang : 'en';
  return <QuarterlyReviewReport clientId={id} lang={lang} />;
}
