import { NextResponse } from 'next/server';
import { resolveClient360Context } from '@/lib/client360RequestContext';
import { timeAsync, timeRouteHandler } from '@/lib/performance';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * Phase 2I.1 semantics via Phase 2J context:
 * 403-first access; SUPER_ADMIN clientLookup only when the list is empty.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: clientId } = await params;

  const resolved = await resolveClient360Context({
    clientId,
    request,
    capability: 'sourceRecords:view',
    perfPrefix: 'client360:sourceRecords',
  });
  if (!resolved.ok) {
    return resolved.error;
  }
  const { ctx } = resolved;

  const payload = await timeRouteHandler(
    `GET /api/clients/${clientId}/source-records`,
    async () => {
      return timeAsync(
        'client360:sourceRecords',
        async () => {
          const records = await timeAsync(
            'client360:sourceRecords:query',
            () =>
              prisma.clientSourceRecord.findMany({
                where: { clientId },
                select: {
                  id: true,
                  source: true,
                  externalId: true,
                  normalizedEmail: true,
                  normalizedPhone: true,
                  receivedAt: true,
                  createdAt: true,
                  payload: true,
                },
                orderBy: { receivedAt: 'desc' },
              })
          );

          if (records.length === 0) {
            const missing = await ctx.ensureClientExistsForPrivilegedMiss();
            if (missing) {
              return null;
            }
          }

          return timeAsync('client360:sourceRecords:map', async () => ({
            sourceRecords: records.map((record) => ({
              id: record.id,
              source: record.source,
              externalId: record.externalId,
              normalizedEmail: record.normalizedEmail,
              normalizedPhone: record.normalizedPhone,
              receivedAt: record.receivedAt.toISOString(),
              createdAt: record.createdAt.toISOString(),
              payload: record.payload,
            })),
          }));
        },
        (result) => ({
          found: result !== null,
          recordCount: result?.sourceRecords.length ?? 0,
        })
      );
    },
    {
      getMeta: (result) => ({
        found: result !== null,
        recordCount: result?.sourceRecords.length ?? 0,
      }),
    }
  );

  if (!payload) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json(payload);
}
