import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestUser } from '@/lib/auth/requestUser';

export async function POST(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);
    if (!requestUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { lat, lng, address } = body as {
      lat?: number;
      lng?: number;
      address?: string;
    };

    if (lat == null || lng == null) {
      return NextResponse.json({ error: 'lat and lng are required' }, { status: 400 });
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: requestUser.id },
      data: {
        locationLat: lat,
        locationLng: lng,
        address: address || null,
      },
      select: { id: true, locationLat: true, locationLng: true, address: true },
    });

    return NextResponse.json({ success: true, location: updated }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to save location',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
