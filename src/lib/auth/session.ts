import { SignJWT, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';

export type AppSession = {
  user: {
    id: string;
    role: 'patient' | 'hospital' | 'driver';
    email: string;
    name: string;
  };
};

const COOKIE_NAME = 'app_session';

function getSessionSecret() {
  const secret = process.env.AUTH_JWT_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Missing AUTH_JWT_SECRET (or NEXTAUTH_SECRET)');
  return new TextEncoder().encode(secret);
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}

export async function createSessionToken(session: AppSession, ttlSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(session as any)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<AppSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ['HS256'],
    });
    const user = (payload as any)?.user;
    if (!user?.id || !user?.role || !user?.email || !user?.name) return null;
    return { user } as AppSession;
  } catch {
    return null;
  }
}

export async function getSessionFromRequest(request: NextRequest): Promise<AppSession | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function buildSessionCookieOptions(maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}
