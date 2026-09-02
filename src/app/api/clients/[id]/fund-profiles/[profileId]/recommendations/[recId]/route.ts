import { NextResponse } from 'next/server';
import {
  getClientOr404,
  requireSuperAdminOrClientAccess,
} from '@/lib/authHelpers';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** PATCH: accept/decline a recommendation (advisor curation). */
export async function PATCH(
  request: Request,
  {
    params,
  }: { params: Promise<{ id: string; profileId: string; recId: string }> }
) {
  const { id, profileId, recId } = await params;
  await getClientOr404(id);
  await requireSuperAdminOrClientAccess(id);

  const profile = await prisma.clientFundProfile.findFirst({
    where: { id: profileId, clientId: id },
  });
  if (!profile) {
    return NextResponse.json({ error: 'profile not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.accepted !== 'boolean') {
    return NextResponse.json(
      { error: 'body must include accepted: boolean' },
      { status: 400 }
    );
  }

  const updated = await prisma.fundRecommendation.update({
    where: { id: recId },
    data: {
      accepted: body.accepted,
      note: typeof body.note === 'string' ? body.note.slice(0, 2000) : undefined,
    },
  });
  return NextResponse.json({ ok: true, recommendation: updated });
}
