import { NextResponse } from 'next/server';
import { buildSessionCookieOptions, getSessionCookieName } from '@/lib/auth/session';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ success: true }, { status: 200 });
  res.cookies.set(getSessionCookieName(), '', { ...buildSessionCookieOptions(0), maxAge: 0 });
  return res;
}
