import crypto from 'crypto';

export type DocumentTokenPayload = {
  documentId: string;
  userId: string;
  role: 'patient' | 'hospital' | 'driver';
  exp: number;
};

function base64url(input: Buffer | string) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64urlToBuffer(input: string) {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return Buffer.from(b64 + pad, 'base64');
}

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.DOCUMENT_TOKEN_SECRET;
  if (!secret) throw new Error('Missing NEXTAUTH_SECRET');
  return secret;
}

export function createDocumentToken(params: {
  documentId: string;
  userId: string;
  role: 'patient' | 'hospital' | 'driver';
  ttlSeconds?: number;
}) {
  const ttlSeconds = params.ttlSeconds ?? 300;
  const payload: DocumentTokenPayload = {
    documentId: params.documentId,
    userId: params.userId,
    role: params.role,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = base64url(payloadStr);
  const sig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();
  const sigB64 = base64url(sig);
  return `${payloadB64}.${sigB64}`;
}

export function verifyDocumentToken(token: string): DocumentTokenPayload | null {
  try {
    const [payloadB64, sigB64] = token.split('.');
    if (!payloadB64 || !sigB64) return null;

    const expectedSig = crypto.createHmac('sha256', getSecret()).update(payloadB64).digest();

    const providedSig = base64urlToBuffer(sigB64);
    if (providedSig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(expectedSig, providedSig)) return null;

    const payload = JSON.parse(base64urlToBuffer(payloadB64).toString('utf8')) as DocumentTokenPayload;
    if (!payload?.documentId || !payload?.userId || !payload?.role || !payload?.exp) return null;

    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}
