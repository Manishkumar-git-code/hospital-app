import bcryptjs from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { OAuth2Client } from 'google-auth-library';
import { prisma } from '@/lib/db/prisma';
import { buildSessionCookieOptions, createSessionToken, getSessionCookieName } from '@/lib/auth/session';

export const runtime = 'nodejs';

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function GET(request: NextRequest) {
  try {
    const clientId = getEnv('GOOGLE_CLIENT_ID');
    const clientSecret = getEnv('GOOGLE_CLIENT_SECRET');
    const redirectUri = getEnv('GOOGLE_REDIRECT_URI');

    const code = request.nextUrl.searchParams.get('code');
    const state = request.nextUrl.searchParams.get('state');

    const stateCookie = request.cookies.get('google_oauth_state')?.value;
    const verifier = request.cookies.get('google_pkce_verifier')?.value;

    if (!code || !state || !stateCookie || !verifier) {
      return NextResponse.json({ error: 'Missing OAuth parameters' }, { status: 400 });
    }

    if (state !== stateCookie) {
      return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 401 });
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });

    const tokenJson = await tokenRes.json().catch(() => null);
    if (!tokenRes.ok) {
      return NextResponse.json(
        { error: 'Google token exchange failed', details: tokenJson },
        { status: 502 }
      );
    }

    const idToken = tokenJson?.id_token;
    if (!idToken) {
      return NextResponse.json({ error: 'Missing id_token from Google' }, { status: 502 });
    }

    // Verify ID token server-side
    const oauthClient = new OAuth2Client(clientId);
    const ticket = await oauthClient.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    const googleId = payload?.sub;
    const email = payload?.email;
    const name = payload?.name || payload?.given_name || 'Patient';
    const emailVerified = payload?.email_verified;

    if (!googleId || !email) {
      return NextResponse.json({ error: 'Invalid Google token payload' }, { status: 400 });
    }

    if (!emailVerified) {
      return NextResponse.json({ error: 'Google email is not verified' }, { status: 401 });
    }

    // Upsert patient user by email/googleId
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail && existingByEmail.role !== 'patient') {
      return NextResponse.json(
        { error: 'This email is already registered for a non-patient role' },
        { status: 409 }
      );
    }

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        googleId,
        name: typeof name === 'string' ? name : undefined,
      },
      create: {
        email,
        googleId,
        role: 'patient',
        name: typeof name === 'string' ? name : 'Patient',
        phone: '',
        passwordHash: await bcryptjs.hash(`${googleId}:${Date.now()}:${Math.random()}`, 10),
        allergies: [],
        isActive: true,
      },
      select: { id: true, email: true, role: true, name: true },
    });

    const sessionToken = await createSessionToken(
      {
        user: {
          id: user.id,
          role: 'patient',
          email: user.email,
          name: user.name,
        },
      },
      30 * 24 * 60 * 60
    );

    const res = NextResponse.redirect(new URL('/patient', request.url), { status: 302 });
    res.cookies.set(getSessionCookieName(), sessionToken, buildSessionCookieOptions(30 * 24 * 60 * 60));

    // Clear OAuth temp cookies
    res.cookies.set('google_oauth_state', '', { ...buildSessionCookieOptions(0), maxAge: 0 });
    res.cookies.set('google_pkce_verifier', '', { ...buildSessionCookieOptions(0), maxAge: 0 });

    return res;
  } catch (e) {
    return NextResponse.json(
      { error: 'Google callback failed', details: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
