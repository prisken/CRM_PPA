import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';

export const dynamic = 'force-dynamic';

/**
 * POST /api/clients/[id]/reports — record a generated report (snapshot-on-send).
 * Body: { kind: 'PULSE' | 'REVIEW', lang: 'en'|'zh'|'both', snapshot: {...} }
 * The snapshot preserves exactly what was shown at generation time.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return auth.error;
  const { canReadClientCore } = await import('@/lib/authHelpers');
  const allowed = await canReadClientCore(auth.user.id, auth.user.role, id);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { kind?: string; lang?: string; snapshot?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const kind = body.kind === 'REVIEW' ? 'REVIEW' : 'PULSE';
  const lang = body.lang === 'zh' || body.lang === 'both' ? body.lang : 'en';

  const report = await prisma.clientReport.create({
    data: {
      clientId: id,
      kind,
      lang,
      status: 'DRAFT',
      snapshot: body.snapshot ?? {},
    },
    select: { id: true, kind: true, lang: true, status: true, createdAt: true },
  });

  return NextResponse.json({ report });
}

/** GET — list a client's generated reports. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return auth.error;
  const { canReadClientCore } = await import('@/lib/authHelpers');
  const allowed = await canReadClientCore(auth.user.id, auth.user.role, id);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const reports = await prisma.clientReport.findMany({
    where: { clientId: id },
    orderBy: { createdAt: 'desc' as const },
    select: { id: true, kind: true, lang: true, status: true, createdAt: true, sentAt: true },
  });
  return NextResponse.json({ reports });
}
