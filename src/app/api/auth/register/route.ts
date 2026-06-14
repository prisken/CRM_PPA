import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';
import { signAuthToken } from '@/lib/jwt';
import { prisma } from '@/lib/prisma';
import { createSupabaseAdminClient } from '@/lib/supabaseAdmin';

const MIN_PASSWORD_LENGTH = 8;
const BCRYPT_ROUNDS = 12;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = body.name?.trim();
    const email = body.email ? normalizeEmail(body.email) : '';
    const password = body.password ?? '';

    if (!name) {
      return NextResponse.json({ error: 'Full name is required' }, { status: 400 });
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 });
    }

    const supabase = createSupabaseAdminClient();
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (authError || !authData.user) {
      const message = authError?.message ?? 'Failed to create auth user';
      const status = message.toLowerCase().includes('already') ? 409 : 500;
      return NextResponse.json(
        { error: status === 409 ? 'Email already in use' : message },
        { status }
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          id: authData.user.id,
          name,
          email,
          passwordHash,
          role: UserRole.STANDARD_USER,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });
    } catch (dbError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw dbError;
    }

    const token = await signAuthToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    });

    return NextResponse.json(
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
