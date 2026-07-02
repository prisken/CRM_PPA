import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

const MAX_CLIENT_IDS = 100;
const MAX_TAG_NAMES = 10;

function parseClientIds(value: unknown): string[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: 'clientIds must be a non-empty array' };
  }

  const clientIds = [
    ...new Set(
      value
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];

  if (clientIds.length === 0) {
    return { error: 'clientIds must be a non-empty array' };
  }

  if (clientIds.length > MAX_CLIENT_IDS) {
    return { error: `clientIds must contain at most ${MAX_CLIENT_IDS} items` };
  }

  return clientIds;
}

function parseTagNames(value: unknown): string[] | { error: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { error: 'tagNames must be a non-empty array' };
  }

  const tagNames = [
    ...new Set(
      value
        .filter((name): name is string => typeof name === 'string')
        .map((name) => name.trim())
        .filter(Boolean)
    ),
  ];

  if (tagNames.length === 0) {
    return { error: 'tagNames must be a non-empty array' };
  }

  if (tagNames.length > MAX_TAG_NAMES) {
    return { error: `tagNames must contain at most ${MAX_TAG_NAMES} items` };
  }

  return tagNames;
}

async function validateClientsExist(clientIds: string[]) {
  const existingClients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: { id: true },
  });

  return existingClients.length === clientIds.length;
}

async function upsertTagsByNames(tagNames: string[]) {
  const tags = [];

  for (const name of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    tags.push(tag);
  }

  return tags;
}

export async function POST(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const parsedClientIds = parseClientIds(body.clientIds);

  if ('error' in parsedClientIds) {
    return NextResponse.json({ error: parsedClientIds.error }, { status: 400 });
  }

  const parsedTagNames = parseTagNames(body.tagNames);
  if ('error' in parsedTagNames) {
    return NextResponse.json({ error: parsedTagNames.error }, { status: 400 });
  }

  const allClientsExist = await validateClientsExist(parsedClientIds);
  if (!allClientsExist) {
    return NextResponse.json(
      { error: 'One or more clients were not found' },
      { status: 400 }
    );
  }

  const payload = await timeRouteHandler(
    'POST /api/admin/leads/bulk-tags',
    async () => {
      const tags = await upsertTagsByNames(parsedTagNames);

      const result = await prisma.clientTag.createMany({
        data: parsedClientIds.flatMap((clientId) =>
          tags.map((tag) => ({
            clientId,
            tagId: tag.id,
          }))
        ),
        skipDuplicates: true,
      });

      return { ok: true as const, count: result.count };
    },
    (result) => ({
      count: result.count,
      clientCount: parsedClientIds.length,
      tagCount: parsedTagNames.length,
    })
  );

  return NextResponse.json(payload, { status: 201 });
}
