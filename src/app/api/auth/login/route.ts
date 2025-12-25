import { NextResponse } from 'next/server';
import bcryptjs from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';
import { buildSessionCookieOptions, createSessionToken, getSessionCookieName } from '@/lib/auth/session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, role } = body as {
      email?: string;
      password?: string;
      role?: 'patient' | 'hospital' | 'driver';
    };

    if (!email || !password || !role) {
      return NextResponse.json({ message: 'Missing credentials' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.role !== role) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const ok = await bcryptjs.compare(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ message: 'Invalid credentials' }, { status: 401 });
    }

    const userPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      phone: user.phone,
      licenseNumber: user.licenseNumber,
    };

    const sessionToken = await createSessionToken(
      {
        user: {
          id: user.id,
          role: user.role,
          email: user.email,
          name: user.name,
        },
      },
      30 * 24 * 60 * 60
    );

    const res = NextResponse.json({ user: userPayload }, { status: 200 });
    res.cookies.set(getSessionCookieName(), sessionToken, buildSessionCookieOptions(30 * 24 * 60 * 60));
    return res;
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Login failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
