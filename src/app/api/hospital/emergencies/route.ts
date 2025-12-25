import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestUser } from "@/lib/auth/requestUser";

type CacheEntry = {
  createdAt: number;
  expiresAt: number;
  payload: any;
};

const globalForCache = global as unknown as { __hospitalEmergenciesCache?: Map<string, CacheEntry> };
const hospitalEmergenciesCache = globalForCache.__hospitalEmergenciesCache ?? new Map<string, CacheEntry>();
globalForCache.__hospitalEmergenciesCache = hospitalEmergenciesCache;

/**
 * GET /api/hospital/emergencies
 * List all emergencies assigned to or relevant for a hospital
 * 
 * Query params:
 * - status: pending|assigned|en_route|arrived|completed (optional)
 * - priority: critical|high|medium|low (optional)
 * - limit: number (default 20)
 * - offset: number (default 0)
 * 
 * Response:
 * - 200: { emergencies: [], total, page, pages }
 * - 401: Unauthorized
 */
export async function GET(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);

    if (!requestUser || requestUser.role !== "hospital") {
      return NextResponse.json(
        { error: "Unauthorized: Only hospitals can access this endpoint" },
        { status: 401 }
      );
    }

    // 2. Get query parameters
    const status = request.nextUrl.searchParams.get("status");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
    const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");

    const cacheKey = `${requestUser.id}:status=${status || ''}:limit=${limit}:offset=${offset}`;
    const cached = hospitalEmergenciesCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    const now = new Date();
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);

    const where: any = {
      assignedHospitalId: requestUser.id,
      status: status || { not: "completed" },
      OR: [
        // If any documents exist, keep case visible ONLY while at least one is still unexpired.
        { documents: { some: { expiresAt: { gt: now } } } },
        // If no documents exist, keep case visible for 1 hour after SOS.
        { AND: [{ documents: { none: {} } }, { triggeredAt: { gte: cutoff } }] },
      ],
    };

    const [emergencies, total] = await Promise.all([
      prisma.emergency.findMany({
        where,
        include: {
          patient: { select: { id: true, name: true, phone: true, email: true } },
          assignedDriver: { select: { id: true, vehiclePlate: true } },
          documents: {
            where: { expiresAt: { gt: now } },
            select: { id: true, type: true, url: true, expiresAt: true },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { triggeredAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.emergency.count({ where }),
    ]);

    // Keep only latest case per patient to avoid duplicates in the feed.
    const seenPatients = new Set<string>();
    const deduped = emergencies.filter((e: any) => {
      const pid = e?.patientId;
      if (!pid) return false;
      if (seenPatients.has(pid)) return false;
      seenPatients.add(pid);
      return true;
    });

    const transformedEmergencies = deduped.map((emergency: any) => ({
      id: emergency.id,
      patientId: emergency.patientId,
      patient: emergency.patient,
      status: emergency.status,
      priority: "medium",
      location: {
        address: emergency.address,
        coordinates: [emergency.patientLng, emergency.patientLat],
      },
      symptoms: emergency.symptoms,
      severity: {
        score: emergency.severityScore,
        description: getSeverityDescription(emergency.severityScore || 0),
      },
      assessment: emergency.aiAssessment,
      vitals: null,
      ambulance: emergency.assignedDriver
        ? {
            id: emergency.assignedDriver.id,
            plate: emergency.assignedDriver.vehiclePlate,
            status: emergency.status,
          }
        : null,
      eta: emergency.etaMinutes,
      distance: emergency.distanceKm,
      driverLocation: emergency.driverLat != null && emergency.driverLng != null ? { lat: emergency.driverLat, lng: emergency.driverLng } : null,
      documents: emergency.documents,
      createdAt: emergency.triggeredAt,
      acceptedAt: emergency.acceptedAt,
      arrivedAt: emergency.arrivedAt,
    }));

    const pages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    const payload = {
      success: true,
      emergencies: transformedEmergencies,
      pagination: {
        total,
        limit,
        offset,
        page: currentPage,
        pages,
      },

    };

    hospitalEmergenciesCache.set(cacheKey, {
      createdAt: Date.now(),
      expiresAt: Date.now() + 3000,
      payload,
    });

    return NextResponse.json(payload);
  } catch (error) {
    try {
      const requestUser = getRequestUser(request.headers);
      if (requestUser && requestUser.role === 'hospital') {
        const status = request.nextUrl.searchParams.get("status");
        const limit = parseInt(request.nextUrl.searchParams.get("limit") || "20");
        const offset = parseInt(request.nextUrl.searchParams.get("offset") || "0");
        const cacheKey = `${requestUser.id}:status=${status || ''}:limit=${limit}:offset=${offset}`;
        const cached = hospitalEmergenciesCache.get(cacheKey);
        if (cached && Date.now() - cached.createdAt < 30000) {
          return NextResponse.json({ ...cached.payload, stale: true });
        }
      }
    } catch {
      // ignore
    }
    console.error("Fetch emergencies error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch emergencies",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/hospital/emergencies/:id/accept
 * Hospital accepts an emergency case
 */
export async function POST(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);

    if (!requestUser || requestUser.role !== "hospital") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { emergencyId } = body;

    if (!emergencyId) {
      return NextResponse.json(
        { error: "Emergency ID is required" },
        { status: 400 }
      );
    }

    const emergency = await prisma.emergency.update({
      where: { id: emergencyId },
      data: {
        assignedHospitalId: requestUser.id,
        status: "assigned",
        acceptedAt: new Date(),
      },
      select: { id: true, status: true, acceptedAt: true },
    }).catch(() => null);

    if (!emergency) {
      return NextResponse.json(
        { error: "Emergency not found" },
        { status: 404 }
      );
    }

    // TODO: Send notification to patient and ambulance driver
    console.log(`Hospital ${requestUser.id} accepted emergency ${emergencyId}`);

    return NextResponse.json({
      success: true,
      emergency: {
        id: emergency.id,
        status: emergency.status,
        acceptedAt: emergency.acceptedAt,
      },
    });
  } catch (error) {
    console.error("Accept emergency error:", error);
    return NextResponse.json(
      { error: "Failed to accept emergency" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/hospital/emergencies/:id/update-status
 * Update emergency status during handling
 */
export async function PUT(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);

    if (!requestUser || requestUser.role !== "hospital") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { emergencyId, status, bedType, notes } = body;

    if (!emergencyId || !status) {
      return NextResponse.json(
        { error: "Emergency ID and status are required" },
        { status: 400 }
      );
    }

    const validStatuses = ["pending", "assigned", "en_route", "arrived", "completed"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Invalid status" },
        { status: 400 }
      );
    }

    const updateData: any = { status };

    // Track status updates with timestamps
    if (status === "arrived") {
      updateData.arrivedAt = new Date();
    } else if (status === "completed") {
      updateData.completedAt = new Date();
    }

    if (bedType) {
      updateData.assignedBedType = bedType;
    }

    if (notes) {
      updateData.hospitalNotes = notes;
    }

    const emergency = await prisma.emergency.update({
      where: { id: emergencyId },
      data: updateData,
      select: { id: true, status: true },
    }).catch(() => null);

    if (!emergency) {
      return NextResponse.json(
        { error: "Emergency not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      emergency: {
        id: emergency.id,
        status: emergency.status,
        updatedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Update status error:", error);
    return NextResponse.json(
      { error: "Failed to update status" },
      { status: 500 }
    );
  }
}

/**
 * Helper: Get human-readable severity description
 */
function getSeverityDescription(score: number): string {
  if (score >= 80) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}
