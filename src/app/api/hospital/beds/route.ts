import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email');

    if (!email) {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        role: true,
        bedIcu: true,
        bedGeneral: true,
        bedEmergency: true,
      },
    });

    if (!user || user.role !== 'hospital') {
      return NextResponse.json({ message: 'Hospital not found' }, { status: 404 });
    }

    const bedCounts =
      typeof user.bedIcu === 'number' &&
      typeof user.bedGeneral === 'number' &&
      typeof user.bedEmergency === 'number'
        ? { icu: user.bedIcu, general: user.bedGeneral, emergency: user.bedEmergency }
        : null;

    return NextResponse.json({ bedCounts }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Failed to fetch bed counts',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body?.email;
    const bedCounts = body?.bedCounts;

    if (!email) {
      return NextResponse.json({ message: 'Email is required' }, { status: 400 });
    }

    const icu = Number(bedCounts?.icu);
    const general = Number(bedCounts?.general);
    const emergency = Number(bedCounts?.emergency);

    if (
      !Number.isFinite(icu) ||
      !Number.isFinite(general) ||
      !Number.isFinite(emergency) ||
      icu < 0 ||
      general < 0 ||
      emergency < 0
    ) {
      return NextResponse.json(
        { message: 'Invalid bedCounts. Provide non-negative numbers for icu, general, emergency.' },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { email },
      data: {
        bedIcu: icu,
        bedGeneral: general,
        bedEmergency: emergency,
      },
      select: { role: true, bedIcu: true, bedGeneral: true, bedEmergency: true },
    }).catch(() => null);

    if (!updated || updated.role !== 'hospital') {
      return NextResponse.json({ message: 'Hospital not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        bedCounts: {
          icu: updated.bedIcu,
          general: updated.bedGeneral,
          emergency: updated.bedEmergency,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Failed to update bed counts',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
