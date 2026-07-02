import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';
import { timeRouteHandler } from '@/lib/performance';

export const dynamic = 'force-dynamic';

function formatTag(tag: {
  id: string;
  name: string;
  color: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: tag.id,
    name: tag.name,
    color: tag.color,
    createdAt: tag.createdAt.toISOString(),
    updatedAt: tag.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const tags = await timeRouteHandler(
    'GET /api/admin/tags',
    async () => {
      const rows = await prisma.tag.findMany({
        orderBy: { name: 'asc' },
      });

      return rows.map(formatTag);
    },
    (result) => ({ tagCount: result.length })
  );

  return NextResponse.json(tags);
}

export async function POST(request: Request) {
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const body = await request.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const color =
    typeof body.color === 'string' && body.color.trim() ? body.color.trim() : null;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const existing = await prisma.tag.findUnique({
    where: { name },
  });

  if (existing) {
    return NextResponse.json(formatTag(existing));
  }

  const tag = await prisma.tag.create({
    data: {
      name,
      color,
    },
  });

  return NextResponse.json(formatTag(tag), { status: 201 });
}
