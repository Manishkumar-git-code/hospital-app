import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getRequestUser } from "@/lib/auth/requestUser";
import {
  calculateDistance,
  calculateETA,
} from "@/lib/services/maps";

type CacheEntry = {
  createdAt: number;
  expiresAt: number;
  payload: any;
};

const globalForCache = global as unknown as { __driverAssignmentCache?: Map<string, CacheEntry> };
const driverAssignmentCache = globalForCache.__driverAssignmentCache ?? new Map<string, CacheEntry>();
globalForCache.__driverAssignmentCache = driverAssignmentCache;

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/driver/assignment
 * Get current emergency assignment for a driver
 * 
 * Response:
 * - 200: { assignment: { id, patientInfo, location, symptoms, vitals, eta } }
 * - 204: No active assignment
 * - 401: Unauthorized
 */
export async function GET(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);
    if (!requestUser || requestUser.role !== "driver") {
      return NextResponse.json(
        { error: "Unauthorized: Only drivers can access this endpoint" },
        { status: 401 }
      );
    }

    const cacheKey = `driver_assignment:${requestUser.id}`;
    const cached = driverAssignmentCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const res = NextResponse.json(cached.payload);
      res.headers.set("Cache-Control", "no-store");
      return res;
    }

    const driver = await prisma.user.findUnique({
      where: { id: requestUser.id },
      select: { id: true, licenseNumber: true },
    });

    const driverLicense = driver?.licenseNumber || null;

    if (!driverLicense) {
      return new NextResponse(null, { status: 204 });
    }

    const emergency = await prisma.emergency.findFirst({
      where: {
        assignedDriverId: requestUser.id,
        status: { in: ["assigned", "en_route"] },
        assignedHospital: { is: { licenseNumber: driverLicense } },
      },
      include: {
        patient: { select: { id: true, name: true, phone: true, email: true, bloodType: true, allergies: true } },
        assignedHospital: { select: { id: true, name: true, licenseNumber: true, address: true, locationLat: true, locationLng: true } },
        documents: { where: { expiresAt: { gt: new Date() } }, select: { id: true, type: true, url: true } },
      },
      orderBy: { triggeredAt: "desc" },
    });

    if (!emergency) {
      return new NextResponse(null, { status: 204 });
    }

    const assignment = {
      id: emergency.id,
      status: emergency.status,
      patient: {
        id: emergency.patient.id,
        name: emergency.patient.name,
        phone: emergency.patient.phone,
        email: emergency.patient.email,
        bloodType: emergency.patient.bloodType,
        allergies: emergency.patient.allergies,
      },
      location: {
        address: emergency.address,
        coordinates: { lat: emergency.patientLat, lng: emergency.patientLng },
      },
      hospital: emergency.assignedHospital
        ? {
            id: emergency.assignedHospital.id,
            name: emergency.assignedHospital.name,
            licenseNumber: emergency.assignedHospital.licenseNumber,
            address: emergency.assignedHospital.address,
            location: {
              lat: emergency.assignedHospital.locationLat,
              lng: emergency.assignedHospital.locationLng,
            },
          }
        : null,
      emergency: {
        symptoms: emergency.symptoms,
        severity: { score: emergency.severityScore, priority: "medium" },
        vitals: null,
        assessment: emergency.aiAssessment,
      },
      eta: emergency.etaMinutes,
      distance: emergency.distanceKm,
      documents: emergency.documents,
      triggeredAt: emergency.triggeredAt,
    };

    const payload = {
      success: true,
      assignment,
    };

    driverAssignmentCache.set(cacheKey, {
      createdAt: Date.now(),
      expiresAt: Date.now() + 2000,
      payload,
    });

    const res = NextResponse.json(payload);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error) {
    try {
      const requestUser = getRequestUser(request.headers);
      if (requestUser && requestUser.role === 'driver') {
        const cacheKey = `driver_assignment:${requestUser.id}`;
        const cached = driverAssignmentCache.get(cacheKey);
        if (cached && Date.now() - cached.createdAt < 30000) {
          const res = NextResponse.json({ ...cached.payload, stale: true });
          res.headers.set("Cache-Control", "no-store");
          return res;
        }
      }
    } catch {
      // ignore
    }
    console.error("Get assignment error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch assignment",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/driver/location
 * Update driver's current location (triggers ETA recalculation)
 * 
 * Request:
 * - { emergencyId, latitude, longitude }
 * 
 * Response:
 * - 200: { eta, distance, nearingHospital }
 */
export async function POST(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);
    if (!requestUser || requestUser.role !== "driver") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { emergencyId, latitude, longitude } = body;

    if (!emergencyId || latitude === undefined || longitude === undefined) {
      return NextResponse.json(
        { error: "Emergency ID and coordinates are required" },
        { status: 400 }
      );
    }

    // Validate coordinates
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: "Invalid coordinates" },
        { status: 400 }
      );
    }

    const emergency = await prisma.emergency.findFirst({
      where: {
        id: emergencyId,
        assignedDriverId: requestUser.id,
      },
      select: {
        id: true,
        patientLat: true,
        patientLng: true,
        address: true,
        driverLat: true,
        driverLng: true,
        driverLastLocationUpdate: true,
        status: true,
      },
    });

    if (!emergency) {
      return NextResponse.json(
        { error: "Emergency not found or not assigned to you" },
        { status: 404 }
      );
    }

    // 2. Calculate new distance and ETA
    const patientLat = emergency.patientLat;
    const patientLng = emergency.patientLng;

    const distance = calculateDistance(latitude, longitude, patientLat, patientLng);
    const eta = calculateETA(distance);

    // 3. Check if ambulance is nearing patient (within 1km)
    const nearingPatient = distance < 1;

    const nextStatus = nearingPatient ? "arrived" : "en_route";
    const lastAt = emergency.driverLastLocationUpdate ? emergency.driverLastLocationUpdate.getTime() : 0;
    const tooSoon = lastAt && Date.now() - lastAt < 4000;
    const prevLat = typeof emergency.driverLat === 'number' ? emergency.driverLat : null;
    const prevLng = typeof emergency.driverLng === 'number' ? emergency.driverLng : null;
    const movedKm =
      prevLat != null && prevLng != null
        ? calculateDistance(latitude, longitude, prevLat, prevLng)
        : 999;
    const movedLittle = movedKm < 0.02;
    const statusSame = (emergency.status || null) === nextStatus;

    if (tooSoon && movedLittle && statusSame) {
      return NextResponse.json({
        success: true,
        tracking: {
          distance,
          eta,
          nearingPatient,
          patientAddress: emergency.address,
        },
      });
    }

    await prisma.emergency.update({
      where: { id: emergencyId },
      data: {
        driverLat: latitude,
        driverLng: longitude,
        driverLastLocationUpdate: new Date(),
        distanceKm: distance,
        etaMinutes: eta,
        status: nextStatus,
      },
    });

    // 5. Prepare response
    const response = {
      success: true,
      tracking: {
        distance,
        eta,
        nearingPatient,
        patientAddress: emergency.address,
      },
      notification: nearingPatient
        ? "You have arrived at the patient location"
        : null,
    };

    // TODO: Emit real-time update via WebSocket
    console.log(`Driver ${requestUser.id} updated location: ${distance}km away`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("Update location error:", error);
    return NextResponse.json(
      { error: "Failed to update location" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/driver/location
 * Update ambulance status during emergency
 */
export async function PATCH(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);
    if (!requestUser || requestUser.role !== "driver") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { emergencyId, status, action } = body;

    if (!emergencyId) {
      return NextResponse.json(
        { error: "Emergency ID is required" },
        { status: 400 }
      );
    }

    const emergency = await prisma.emergency.findFirst({
      where: {
        id: emergencyId,
        assignedDriverId: requestUser.id,
      },
      select: { id: true },
    });

    if (!emergency) {
      return NextResponse.json(
        { error: "Emergency not found" },
        { status: 404 }
      );
    }

    // Handle different actions
    let updateData: any = {};

    if (action === "patient_loaded") {
      updateData.status = "en_route";
    } else if (action === "arrived_hospital") {
      updateData.status = "arrived";
      updateData.arrivedAt = new Date();
    } else if (action === "handover_complete") {
      updateData.status = "completed";
      updateData.completedAt = new Date();
    } else if (status) {
      updateData.status = status;
    }

    const updated = await prisma.emergency.update({
      where: { id: emergencyId },
      data: updateData,
      select: { id: true, status: true },
    });

    return NextResponse.json({
      success: true,
      emergency: {
        id: updated.id,
        status: updated.status,
        action,
        timestamp: new Date(),
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
