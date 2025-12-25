import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyDocumentToken } from '@/lib/auth/documentToken';
import { deleteExpiredDocument, getSignedDocumentUrl } from '@/lib/services/cloudinary';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 });
    }

    const payload = verifyDocumentToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    const doc = await prisma.medicalDocument.findUnique({
      where: { id: payload.documentId },
      select: {
        id: true,
        url: true,
        cloudinaryId: true,
        expiresAt: true,
        emergencyId: true,
      },
    });

    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.expiresAt <= new Date()) {
      await deleteExpiredDocument(doc.cloudinaryId);
      await prisma.medicalDocument.delete({ where: { id: doc.id } }).catch(() => null);
      return NextResponse.json({ error: 'Document expired' }, { status: 410 });
    }

    const emergency = await prisma.emergency.findUnique({
      where: { id: doc.emergencyId },
      select: { patientId: true, assignedHospitalId: true, assignedDriverId: true },
    });

    if (!emergency) {
      return NextResponse.json({ error: 'Emergency not found' }, { status: 404 });
    }

    const allowed =
      emergency.patientId === payload.userId ||
      (payload.role === 'hospital' && emergency.assignedHospitalId === payload.userId) ||
      (payload.role === 'driver' && emergency.assignedDriverId === payload.userId);

    if (!allowed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const tryFetch = async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) return null;
        return res;
      } catch {
        return null;
      }
    };

    const mkSignedCandidates = () => {
      const candidates: { url: string; kind: string }[] = [];

      const push = (p: {
        resourceType: 'raw' | 'image';
        deliveryType: 'upload' | 'authenticated' | 'private';
        format?: string;
      }) => {
        candidates.push({
          kind: `${p.resourceType}/${p.deliveryType}${p.format ? `.${p.format}` : ''}`,
          url: getSignedDocumentUrl({
            publicId: doc.cloudinaryId,
            resourceType: p.resourceType,
            deliveryType: p.deliveryType,
            format: p.format,
            expiryMinutes: 5,
          }),
        });
      };

      const deliveryTypes: Array<'upload' | 'authenticated' | 'private'> = [
        'upload',
        'authenticated',
        'private',
      ];

      for (const deliveryType of deliveryTypes) {
        push({ resourceType: 'raw', deliveryType, format: 'pdf' });
        push({ resourceType: 'raw', deliveryType });
        push({ resourceType: 'image', deliveryType });
      }

      return candidates;
    };

    // 1) Try server-side proxy (works when Cloudinary asset is publicly retrievable)
    let upstream = await tryFetch(doc.url);
    if (upstream) {
      const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

      return new NextResponse(upstream.body as any, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          Pragma: 'no-cache',
          Expires: '0',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'inline',
          'Cross-Origin-Resource-Policy': 'same-origin',
        },
      });
    }

    // 2) Fallback: redirect to short-lived signed Cloudinary URL (browser fetches directly)
    const candidates = mkSignedCandidates();
    for (const cand of candidates) {
      // We don't pre-fetch here because your environment's server-side fetch is failing.
      // Redirect lets the browser retrieve the asset directly.
      if (cand.url && cand.url.startsWith('https://')) {
        return NextResponse.redirect(cand.url, { status: 302 });
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to fetch document',
        details: 'Upstream fetch failed and no signed URL candidates were generated',
      },
      { status: 502 }
    );

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to serve document', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
