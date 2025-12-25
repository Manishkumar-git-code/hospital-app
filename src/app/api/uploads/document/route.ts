import { NextRequest, NextResponse } from "next/server";
import {
  uploadMedicalDocument,
  saveDocumentReference,
} from "@/lib/services/cloudinary";
import { prisma } from "@/lib/db/prisma";
import { getRequestUser } from "@/lib/auth/requestUser";
import { createDocumentToken } from "@/lib/auth/documentToken";

/**
 * POST /api/uploads/document
 * Upload medical document for an emergency
 * 
 * Request:
 * - Form: file (PDF/Image), emergencyId, docType (report|prescription|scan|other)
 * 
 * Response:
 * - 201: { url, documentId, expiresAt }
 * - 400: Validation error
 * - 401: Unauthorized
 * - 404: Emergency not found
 */
export async function POST(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);

    if (!requestUser || requestUser.role !== "patient") {
      return NextResponse.json(
        { error: "Unauthorized: Only patients can upload documents" },
        { status: 401 }
      );
    }

    // 2. Parse form data
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const emergencyId = formData.get("emergencyId") as string;
    const docType = (formData.get("docType") as string) || "other";

    // 3. Validate inputs
    if (!file) {
      return NextResponse.json(
        { error: "File is required" },
        { status: 400 }
      );
    }

    if (!emergencyId) {
      return NextResponse.json(
        { error: "Emergency ID is required" },
        { status: 400 }
      );
    }

    // Validate file type (PDF or images only)
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        {
          error: "Invalid file type. Only PDF and images (JPEG, PNG, WebP) are allowed",
        },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size must be less than 5MB" },
        { status: 400 }
      );
    }

    // 4. Verify emergency exists and belongs to patient
    const emergency = await prisma.emergency.findUnique({
      where: { id: emergencyId },
      select: { id: true, patientId: true },
    });

    if (!emergency) {
      return NextResponse.json(
        { error: "Emergency not found" },
        { status: 404 }
      );
    }

    if (emergency.patientId !== requestUser.id) {
      return NextResponse.json(
        { error: "Unauthorized: Cannot upload to this emergency" },
        { status: 403 }
      );
    }

    // 5. Upload to Cloudinary
    const buffer = await file.arrayBuffer();
    const uploadResult = await uploadMedicalDocument(
      Buffer.from(buffer),
      file.name,
      docType as "report" | "prescription" | "scan" | "other"
    );

    // 6. Save reference in MongoDB
    const docRef = await saveDocumentReference(requestUser.id, emergencyId, uploadResult);

    // 7. Return response
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
          message: "Document expires in 60 minutes",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Document upload error:", error);
    return NextResponse.json(
      {
        error: "Failed to upload document",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/uploads/document?emergencyId=:emergencyId
 * Get all documents for an emergency
 */
export async function GET(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);

    if (!requestUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const emergencyId = request.nextUrl.searchParams.get("emergencyId");

    if (!emergencyId) {
      return NextResponse.json(
        { error: "Emergency ID is required" },
        { status: 400 }
      );
    }

    const emergency = await prisma.emergency.findUnique({
      where: { id: emergencyId },
      select: { id: true, patientId: true, assignedHospitalId: true, assignedDriverId: true },
    });

    if (!emergency) {
      return NextResponse.json(
        { error: "Emergency not found" },
        { status: 404 }
      );
    }

    // Check access: patient can view their own, hospital/driver can view assigned
    const hasAccess =
      emergency.patientId === requestUser.id ||
      (requestUser.role === "hospital" && emergency.assignedHospitalId === requestUser.id) ||
      (requestUser.role === "driver" && emergency.assignedDriverId === requestUser.id);

    if (!hasAccess) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const docs = await prisma.medicalDocument.findMany({
      where: { emergencyId, expiresAt: { gt: new Date() } },
      select: { id: true, type: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    const documents = docs.map((d: { id: string; type: string; expiresAt: Date; createdAt: Date }) => ({
      id: d.id,
      type: d.type,
      expiresAt: d.expiresAt,
      createdAt: d.createdAt,
      viewUrl: `/api/documents/view?token=${encodeURIComponent(
        createDocumentToken({
          documentId: d.id,
          userId: requestUser.id,
          role: requestUser.role,
          ttlSeconds: 300,
        })
      )}`,
    }));

    return NextResponse.json({
      success: true,
      documents,
      count: documents.length,
    });
  } catch (error) {
    console.error("Get documents error:", error);
    return NextResponse.json(
      { error: "Failed to fetch documents" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/uploads/document?documentId=:documentId&emergencyId=:emergencyId
 * Delete a document (before expiry)
 */
export async function DELETE(request: NextRequest) {
  try {
    const requestUser = getRequestUser(request.headers);

    if (!requestUser) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const documentId = request.nextUrl.searchParams.get("documentId");
    const emergencyId = request.nextUrl.searchParams.get("emergencyId");

    if (!documentId || !emergencyId) {
      return NextResponse.json(
        { error: "Document ID and Emergency ID are required" },
        { status: 400 }
      );
    }

    const emergency = await prisma.emergency.findUnique({
      where: { id: emergencyId },
      select: { id: true, patientId: true },
    });

    if (!emergency) {
      return NextResponse.json(
        { error: "Emergency not found" },
        { status: 404 }
      );
    }

    // Verify ownership
    if (emergency.patientId !== requestUser.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const document = await prisma.medicalDocument.findUnique({
      where: { id: documentId },
      select: { id: true, cloudinaryId: true, emergencyId: true },
    });

    if (!document || document.emergencyId !== emergencyId) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 }
      );
    }

    // Delete from Cloudinary
    await import("@/lib/services/cloudinary").then((m) => m.deleteExpiredDocument(document.cloudinaryId));
    await prisma.medicalDocument.delete({ where: { id: documentId } });

    return NextResponse.json({
      success: true,
      message: "Document deleted successfully",
    });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    );
  }
}
