import { NextRequest, NextResponse } from "next/server";
import { analyzeSymptomsWithAI } from "@/lib/services/gemini";
import {
  calculateDistance,
  calculateETA,
  findNearestAmbulances,
  findNearestHospitals,
} from "@/lib/services/maps";
import { prisma } from "@/lib/db/prisma";
import { getRequestUser } from "@/lib/auth/requestUser";

export async function POST(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);
    if (!requestUser || requestUser.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request body
    const { location, symptoms } = await request.json();

    if (
      !location ||
      location.lat == null ||
      location.lng == null ||
      !Number.isFinite(Number(location.lat)) ||
      !Number.isFinite(Number(location.lng))
    ) {
      return NextResponse.json(
        { error: "Invalid location data" },
        { status: 400 }
      );
    }

    const created = await prisma.emergency.create({
      data: {
        patientId: requestUser.id,
        status: "pending",
        patientLat: Number(location.lat),
        patientLng: Number(location.lng),
        address: location.address || "Location not available",
        symptoms: symptoms || null,
        triggeredAt: new Date(),
      },
      select: {
        id: true,
        patientLat: true,
        patientLng: true,
      },
    });

    // Step 1: Analyze symptoms with Gemini AI
    let severityScore = 50; // Default
    let aiAssessment = "Symptoms received, awaiting analysis";

    try {
      const aiResult = await analyzeSymptomsWithAI(symptoms);
      if (aiResult) {
        severityScore = aiResult.severityScore;
        aiAssessment = aiResult.assessment;
      }
    } catch (aiError) {
      console.error("AI analysis failed:", aiError);
      // Continue with default values
    }

    // Step 2: Find nearest hospitals
    const hospitals = await findNearestHospitals(
      location.lat,
      location.lng,
      5 // Find 5 nearest hospitals
    );

    if (hospitals.length === 0) {
      const fallbackHospital = await prisma.user.findFirst({
        where: {
          role: "hospital",
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          licenseNumber: true,
          address: true,
          locationLat: true,
          locationLng: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (!fallbackHospital) {
        return NextResponse.json(
          { error: "No hospitals available" },
          { status: 503 }
        );
      }

      await prisma.emergency.update({
        where: { id: created.id },
        data: {
          assignedHospitalId: fallbackHospital.id,
          severityScore,
          aiAssessment,
        },
      });

      return NextResponse.json(
        {
          sosId: created.id,
          ambulanceDispatched: false,
          message:
            "Hospitals are missing location coordinates, so the emergency was assigned without distance ranking. Please ensure hospitals set their locationLat/locationLng.",
          hospitalAssigned: fallbackHospital.name,
          hospitalLicenseNumber: fallbackHospital.licenseNumber || null,
          hospital: {
            id: fallbackHospital.id,
            name: fallbackHospital.name,
            licenseNumber: fallbackHospital.licenseNumber || null,
            address: fallbackHospital.address || null,
            location:
              fallbackHospital.locationLat != null && fallbackHospital.locationLng != null
                ? { lat: fallbackHospital.locationLat, lng: fallbackHospital.locationLng }
                : null,
          },
          eta: null,
        },
        { status: 202 }
      );
    }

    // Auto-assign to nearest hospital
    const assignedHospital = hospitals[0];

    const assignedHospitalLicense = assignedHospital.licenseNumber || null;

    if (!assignedHospitalLicense) {
      await prisma.emergency.update({
        where: { id: created.id },
        data: {
          assignedHospitalId: assignedHospital.id,
          severityScore,
          aiAssessment,
        },
      });

      return NextResponse.json(
        {
          sosId: created.id,
          ambulanceDispatched: false,
          message: "Nearest hospital has no license on file, so no ambulance can be assigned automatically.",
          hospitalAssigned: assignedHospital.name,
          hospitalLicenseNumber: null,
          hospital: {
            id: assignedHospital.id,
            name: assignedHospital.name,
            licenseNumber: null,
            address: assignedHospital.address || null,
            location: assignedHospital.location || null,
          },
          eta: null,
        },
        { status: 202 }
      );
    }

    // Step 3: Find nearest available ambulances
    const ambulances = await findNearestAmbulances(
      location.lat,
      location.lng,
      3 // Find 3 nearest ambulances
      ,
      assignedHospitalLicense
    );

    if (ambulances.length === 0) {
      await prisma.emergency.update({
        where: { id: created.id },
        data: {
          assignedHospitalId: assignedHospital.id,
          severityScore,
          aiAssessment,
        },
      });
      return NextResponse.json(
        {
          sosId: created.id,
          ambulanceDispatched: false,
          message: assignedHospitalLicense
            ? "No matching ambulances available for this hospital license. Emergency dispatched manually."
            : "Nearest hospital has no license on file, so no ambulance can be assigned automatically.",
          hospitalAssigned: assignedHospital.name,
          hospitalLicenseNumber: assignedHospitalLicense,
          hospital: {
            id: assignedHospital.id,
            name: assignedHospital.name,
            licenseNumber: assignedHospitalLicense,
            address: assignedHospital.address || null,
            location: assignedHospital.location || null,
          },
          eta: null,
        },
        { status: 202 } // Accepted but pending
      );
    }

    // Auto-assign to nearest ambulance
    const assignedAmbulance = ambulances[0];

    const driverLat = assignedAmbulance?.currentLocation?.lat;
    const driverLng = assignedAmbulance?.currentLocation?.lng;

    const canComputeEta = typeof driverLat === "number" && typeof driverLng === "number";
    const distanceKm = canComputeEta
      ? calculateDistance(driverLat, driverLng, location.lat, location.lng)
      : null;
    const etaMinutes = canComputeEta && distanceKm != null ? calculateETA(distanceKm) : null;

    await prisma.emergency.update({
      where: { id: created.id },
      data: {
        assignedHospitalId: assignedHospital.id,
        assignedDriverId: assignedAmbulance.id,
        severityScore,
        aiAssessment,
        etaMinutes: etaMinutes ?? undefined,
        distanceKm: distanceKm ?? undefined,
        status: "assigned",
      },
    });

    console.log(
      "SOS assigned",
      JSON.stringify({
        sosId: created.id,
        assignedHospitalId: assignedHospital.id,
        assignedDriverId: assignedAmbulance.id,
      })
    );

    // Notify hospital and ambulance via WebSocket (implement based on your setup)
    // await notifyHospital(assignedHospital._id, emergency);
    // await notifyAmbulance(assignedAmbulance._id, emergency);

    return NextResponse.json(
      {
        sosId: created.id,
        ambulanceDispatched: true,
        eta: etaMinutes,
        distanceKm,
        hospitalAssigned: assignedHospital.name,
        hospitalLicenseNumber: assignedHospitalLicense,
        hospitalLocation: assignedHospital.location,
        hospital: {
          id: assignedHospital.id,
          name: assignedHospital.name,
          licenseNumber: assignedHospitalLicense,
          address: assignedHospital.address || null,
          location: assignedHospital.location || null,
        },
        driverId: assignedAmbulance.id,
        driverEmail: assignedAmbulance.user.email,
        driverName: assignedAmbulance.user.name,
        severityScore,
        priority: "medium",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("SOS trigger error:", error);
    return NextResponse.json(
      { error: "Failed to trigger SOS" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);
    if (!requestUser || requestUser.role !== "patient") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const emergencyId = body?.emergencyId as string | undefined;
    const location = body?.location as { lat?: number; lng?: number; address?: string } | undefined;

    if (!emergencyId) {
      return NextResponse.json({ error: "Emergency ID is required" }, { status: 400 });
    }

    if (
      !location ||
      location.lat == null ||
      location.lng == null ||
      !Number.isFinite(Number(location.lat)) ||
      !Number.isFinite(Number(location.lng))
    ) {
      return NextResponse.json({ error: "Invalid location data" }, { status: 400 });
    }

    const emergency = await prisma.emergency.findFirst({
      where: {
        id: emergencyId,
        patientId: requestUser.id,
      },
      select: { id: true, status: true },
    });

    if (!emergency) {
      return NextResponse.json({ error: "Emergency not found" }, { status: 404 });
    }

    const updated = await prisma.emergency.update({
      where: { id: emergencyId },
      data: {
        patientLat: Number(location.lat),
        patientLng: Number(location.lng),
        address: location.address != null ? String(location.address) : undefined,
      },
      select: { id: true, status: true, patientLat: true, patientLng: true },
    });

    if (updated.status === "completed") {
      return NextResponse.json({ success: true, status: "completed" }, { status: 200 });
    }

    return NextResponse.json(
      {
        success: true,
        emergency: {
          id: updated.id,
          status: updated.status,
          patientLat: updated.patientLat,
          patientLng: updated.patientLng,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("SOS location update error:", error);
    return NextResponse.json(
      { error: "Failed to update patient location" },
      { status: 500 }
    );
  }
}
