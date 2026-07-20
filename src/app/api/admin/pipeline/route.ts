import { NextResponse } from 'next/server';
import { fetchAdminPipelineClients } from '@/lib/adminPipeline';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const payload = await timeRouteHandler(
    'GET /api/admin/pipeline',
    async () => {
      const clients = await fetchAdminPipelineClients();
      return { clients };
    },
    {
      payloadCategory: 'admin-pipeline',
      getMeta: (result) => ({
        clientCount: result.clients.length,
      }),
    }
  );

  return NextResponse.json(payload);
}
