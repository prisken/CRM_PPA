import { NextResponse } from 'next/server';
import { requireSuperAdminFromRequest } from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; tagId: string }> }
) {
  const { id: clientId, tagId } = await params;
  const auth = await requireSuperAdminFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const clientTag = await prisma.clientTag.findFirst({
    where: {
      clientId,
      tagId,
    },
  });

  if (!clientTag) {
    return NextResponse.json({ error: 'Tag not found on client' }, { status: 404 });
  }

  await prisma.clientTag.delete({
    where: { id: clientTag.id },
  });

  return NextResponse.json({ ok: true });
}
