import { v2 as cloudinary } from "cloudinary";
import { prisma } from "@/lib/db/prisma";

cloudinary.config({
  cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface UploadResult {
  url: string;
  publicId: string;
  size: number;
  type: string;
}

/**
 * Upload medical document to Cloudinary
 * Expiry enforcement is handled in the application DB (see saveDocumentReference)
 */
export async function uploadMedicalDocument(
  file: Buffer,
  fileName: string,
  fileType: "report" | "prescription" | "scan" | "other"
): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: "auto",
        public_id: `medical/${Date.now()}-${fileName}`,
        folder: "emergency-aid/documents",
        // Tag for batch deletion
        tags: ["medical-document", "auto-expire"],
        // Metadata for tracking
        context: {
          filetype: fileType,
          uploadTime: new Date().toISOString(),
        },
      },
      (error: any, result: any) => {
        if (error) {
          reject(error);
        } else if (result) {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            size: result.bytes,
            type: fileType,
          });
        }
      }
    );

    uploadStream.end(file);
  });
}

/**
 * Save document reference in MongoDB with TTL
 */
export async function saveDocumentReference(
  _patientId: string,
  emergencyId: string,
  uploadResult: UploadResult
) {
  try {
    // 1 hour expiry
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    const doc = await prisma.medicalDocument.create({
      data: {
        emergencyId,
        url: uploadResult.url,
        type: uploadResult.type,
        cloudinaryId: uploadResult.publicId,
        expiresAt,
      },
      select: { id: true, expiresAt: true },
    });

    return {
      documentId: doc.id,
      expiresAt,
      expiresIn: "60 minutes",
    };
  } catch (error) {
    console.error("Save document reference error:", error);
    throw error;
  }
}

/**
 * Delete document from Cloudinary when TTL expires
 */
export async function deleteExpiredDocument(cloudinaryId: string) {
  try {
    const result = await cloudinary.uploader.destroy(cloudinaryId, {
      resource_type: "auto",
    });

    return result.result === "ok";
  } catch (error) {
    console.error("Delete document error:", error);
    return false;
  }
}

/**
 * Get all documents for a patient emergency
 */
export async function getEmergencyDocuments(emergencyId: string) {
  try {
    return await prisma.medicalDocument.findMany({
      where: { emergencyId, expiresAt: { gt: new Date() } },
      select: { id: true, url: true, type: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    console.error("Get documents error:", error);
    return [];
  }
}

/**
 * Cleanup job to delete expired documents from Cloudinary
 * Run this as a cron job every minute
 */
export async function cleanupExpiredDocuments() {
  try {
    const now = new Date();

    const expired = await prisma.medicalDocument.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true, cloudinaryId: true },
      take: 200,
    });

    for (const doc of expired) {
      await deleteExpiredDocument(doc.cloudinaryId);
      await prisma.medicalDocument.delete({ where: { id: doc.id } }).catch(() => null);
    }

    console.log("✅ Cleanup completed");
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

/**
 * Get document download URL (secure, time-limited)
 */
export function getSecureDocumentUrl(publicId: string, expiryMinutes: number = 5): string {
  const timestamp = Math.floor(Date.now() / 1000) + expiryMinutes * 60;

  // Signature generation (used for secure uploads)
  // const signature = cloudinary.utils.compute_hex_hash({...});

  return cloudinary.url(publicId, {
    secure: true,
    timestamp,
    sign_url: true,
    // Add download header
    flags: "attachment",
  });
}

export function getSignedDocumentUrl(params: {
  publicId: string;
  resourceType?: "raw" | "image" | "auto";
  deliveryType?: "upload" | "authenticated" | "private";
  format?: string;
  expiryMinutes?: number;
}) {
  const timestamp =
    Math.floor(Date.now() / 1000) + (params.expiryMinutes ?? 5) * 60;

  return cloudinary.url(params.publicId, {
    secure: true,
    timestamp,
    sign_url: true,
    resource_type: params.resourceType ?? "raw",
    type: params.deliveryType ?? "upload",
    format: params.format,
  });
}

/**
 * Generate QR code for document sharing
 */
export async function generateDocumentQR(documentUrl: string) {
  try {
    // Use Cloudinary's QR code generation
    const qrUrl = cloudinary.url("fetch:qr/url:" + btoa(documentUrl), {
      width: 300,
      height: 300,
    });

    return qrUrl;
  } catch (error) {
    console.error("Generate QR error:", error);
    return null;
  }
}
