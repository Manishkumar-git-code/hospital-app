import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getRequestUser } from '@/lib/auth/requestUser';

type CacheEntry = {
  expiresAt: number;
  createdAt: number;
  payload: any;
};

const globalForCache = global as unknown as { __trackingCache?: Map<string, CacheEntry> };
const trackingCache = globalForCache.__trackingCache ?? new Map<string, CacheEntry>();
globalForCache.__trackingCache = trackingCache;

export async function GET(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);
    if (!requestUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const emergencyId = request.nextUrl.searchParams.get('emergencyId');
    if (!emergencyId) {
      return NextResponse.json({ error: 'Emergency ID is required' }, { status: 400 });
    }

    const cacheKey = `${requestUser.role}:${requestUser.id}:emergency_tracking:${emergencyId}`;
    const cached = trackingCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    const emergency = await prisma.emergency.findUnique({
      where: { id: emergencyId },
      select: {
        id: true,
        status: true,
        patientId: true,
        patientLat: true,
        patientLng: true,
        address: true,
        assignedHospitalId: true,
        assignedDriverId: true,
        driverLat: true,
        driverLng: true,
        driverLastLocationUpdate: true,
        etaMinutes: true,
        distanceKm: true,
        assignedHospital: { select: { id: true, name: true, phone: true, licenseNumber: true, address: true, locationLat: true, locationLng: true } },
        assignedDriver: { select: { id: true, name: true, phone: true, vehiclePlate: true } },
      },
    });

    if (!emergency) {
      return NextResponse.json({ error: 'Emergency not found' }, { status: 404 });
    }

    const hasAccess =
      emergency.patientId === requestUser.id ||
      (requestUser.role === 'hospital' && emergency.assignedHospitalId === requestUser.id) ||
      (requestUser.role === 'driver' && emergency.assignedDriverId === requestUser.id);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const payload = {
      success: true,
      tracking: {
        emergencyId: emergency.id,
        status: emergency.status,
        patient: {
          lat: emergency.patientLat,
          lng: emergency.patientLng,
          address: emergency.address,
        },
        ambulance: emergency.driverLat != null && emergency.driverLng != null
          ? {
              lat: emergency.driverLat,
              lng: emergency.driverLng,
              lastUpdate: emergency.driverLastLocationUpdate,
            }
          : null,
        etaMinutes: emergency.etaMinutes,
        distanceKm: emergency.distanceKm,
        hospital: emergency.assignedHospital
          ? {
              id: emergency.assignedHospital.id,
              name: emergency.assignedHospital.name,
              licenseNumber: emergency.assignedHospital.licenseNumber,
              phone: emergency.assignedHospital.phone,
              address: emergency.assignedHospital.address,
              lat: emergency.assignedHospital.locationLat,
              lng: emergency.assignedHospital.locationLng,
            }
          : null,
        driver: emergency.assignedDriver
          ? {
              id: emergency.assignedDriver.id,
              name: emergency.assignedDriver.name,
              phone: emergency.assignedDriver.phone,
              vehiclePlate: emergency.assignedDriver.vehiclePlate,
            }
          : null,
      },
    };

    trackingCache.set(cacheKey, {
      createdAt: Date.now(),
      expiresAt: Date.now() + 2000,
      payload,
    });

    return NextResponse.json(payload);
  } catch (error) {
    try {
      const requestUser = getRequestUser(request.headers);
      const emergencyId = request.nextUrl.searchParams.get('emergencyId');
      if (requestUser && emergencyId) {
        const cacheKey = `${requestUser.role}:${requestUser.id}:emergency_tracking:${emergencyId}`;
        const cached = trackingCache.get(cacheKey);
        if (cached && Date.now() - cached.createdAt < 30000) {
          return NextResponse.json({ ...cached.payload, stale: true });
        }
      }
    } catch {
      // ignore
    }
    return NextResponse.json(
      {
        error: 'Failed to fetch tracking',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
