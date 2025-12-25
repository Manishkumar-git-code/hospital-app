import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from '@/lib/db/prisma';
import { getRequestUser } from '@/lib/auth/requestUser';
import { uploadMedicalDocument, saveDocumentReference } from '@/lib/services/cloudinary';
import { createDocumentToken } from '@/lib/auth/documentToken';

export const runtime = 'nodejs';

function sanitizeFileName(name: string) {
  const trimmed = name.trim().slice(0, 60) || 'document';
  return trimmed.replace(/[^a-zA-Z0-9-_\.]/g, '_');
}

function wrapText(text: string, maxLen: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxLen) {
      if (line) lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function POST(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);
    if (!requestUser || requestUser.role !== 'patient') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const emergencyId = typeof body?.emergencyId === 'string' ? body.emergencyId : '';
    const text = typeof body?.text === 'string' ? body.text : '';
    const title = typeof body?.title === 'string' ? body.title : 'Symptoms Report';

    if (!emergencyId) {
      return NextResponse.json({ error: 'Emergency ID is required' }, { status: 400 });
    }

    const cleanedText = text.trim();
    if (!cleanedText) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const emergency = await prisma.emergency.findUnique({
      where: { id: emergencyId },
      select: { id: true, patientId: true },
    });

    if (!emergency) {
      return NextResponse.json({ error: 'Emergency not found' }, { status: 404 });
    }

    if (emergency.patientId !== requestUser.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 48;
    let y = page.getHeight() - margin;

    page.drawText(title, {
      x: margin,
      y,
      font: fontBold,
      size: 18,
      color: rgb(0.1, 0.2, 0.35),
    });

    y -= 26;
    page.drawText(`Generated: ${new Date().toLocaleString()}`, {
      x: margin,
      y,
      font,
      size: 10,
      color: rgb(0.35, 0.35, 0.35),
    });

    y -= 24;

    const lines = wrapText(cleanedText, 95);
    for (const line of lines) {
      if (y < margin + 20) break;
      page.drawText(line, {
        x: margin,
        y,
        font,
        size: 12,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 16;
    }

    const pdfBytes = await pdfDoc.save();

    const fileName = sanitizeFileName(`${title}-${emergencyId}.pdf`);

    const uploadResult = await uploadMedicalDocument(Buffer.from(pdfBytes), fileName, 'report');
    const docRef = await saveDocumentReference(requestUser.id, emergencyId, uploadResult);

    return NextResponse.json(
      {
        success: true,
        document: {
          id: docRef.documentId,
          type: uploadResult.type,
          size: uploadResult.size,
          expiresAt: docRef.expiresAt,
          viewUrl: `/api/documents/view?token=${encodeURIComponent(
            createDocumentToken({
              documentId: docRef.documentId,
              userId: requestUser.id,
              role: requestUser.role,
              ttlSeconds: 300,
            })
          )}`,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Generate PDF error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate PDF',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
