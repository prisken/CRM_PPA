import { NextResponse } from 'next/server';
import { getAuthenticatedUserFromRequest } from '@/lib/authHelpers';
import { signAuthToken } from '@/lib/jwt';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await getAuthenticatedUserFromRequest(request);
  if (auth.error) {
    return auth.error;
  }

  const token = await signAuthToken({
    id: auth.user.id,
    email: auth.user.email,
    role: auth.user.role,
    name: auth.user.name ?? null,
  });

  return NextResponse.json({ token });
}
