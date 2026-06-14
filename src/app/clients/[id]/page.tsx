import Client360Page from '@/components/clients/Client360Page';

export const dynamic = 'force-dynamic';

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Client360Page clientId={id} />;
}
