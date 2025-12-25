import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function base64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function sha256(input: string) {
  return crypto.createHash('sha256').update(input).digest();
}

function getEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

export async function GET(_request: NextRequest) {
  try {
    const clientId = getEnv('GOOGLE_CLIENT_ID');
    const redirectUri = getEnv('GOOGLE_REDIRECT_URI');

    const state = base64url(crypto.randomBytes(32));
    const codeVerifier = base64url(crypto.randomBytes(48));
    const codeChallenge = base64url(sha256(codeVerifier));

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');

    const res = NextResponse.redirect(url.toString(), { status: 302 });
    const isProd = process.env.NODE_ENV === 'production';

    res.cookies.set('google_oauth_state', state, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });

    res.cookies.set('google_pkce_verifier', codeVerifier, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });

    return res;
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to start Google OAuth', details: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
