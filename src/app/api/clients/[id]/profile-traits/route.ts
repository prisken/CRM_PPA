import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { VOCABULARY } from '@/lib/recommendationEngine';

export const dynamic = 'force-dynamic';

/**
 * GET/PUT /api/clients/[id]/profile-traits
 * Reads/writes the rep-picked trait list for a client (drives recommendations).
 * Traits are validated against the vocabulary; unknown traits are rejected
 * individually (400 with the offending keys) so typos never silently store.
 */

async function canAccess(request: Request, clientId: string) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) return { error: auth.error };
  // reuse core-read gate — any user who can view the client 360 can set traits
  const { canReadClientCore } = await import('@/lib/authHelpers');
  const allowed = await canReadClientCore(auth.user.id, auth.user.role, clientId);
  if (!allowed) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { user: auth.user };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccess(request, id);
  if (access.error) return access.error;

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, profileTraits: true },
  });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const traits = Array.isArray(client.profileTraits)
    ? (client.profileTraits as string[])
    : [];
  return NextResponse.json({ traits });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await canAccess(request, id);
  if (access.error) return access.error;

  let body: { traits?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!Array.isArray(body.traits)) {
    return NextResponse.json({ error: 'traits must be an array' }, { status: 400 });
  }

  const traits = body.traits.map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  const unknown = traits.filter((t) => !VOCABULARY.has(t));
  if (unknown.length) {
    return NextResponse.json(
      { error: `Unknown traits: ${unknown.join(', ')}` },
      { status: 400 }
    );
  }

  const client = await prisma.client.update({
    where: { id },
    data: { profileTraits: traits },
    select: { id: true, profileTraits: true },
  });
  return NextResponse.json({ traits: client.profileTraits });
}
