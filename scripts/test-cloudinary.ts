import { v2 as cloudinary } from "cloudinary";

/**
 * Test Cloudinary API connection
 * Run: npx ts-node scripts/test-cloudinary.ts
 */
export async function testCloudinaryAPI() {
  try {
    if (!process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME) {
      throw new Error("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME not set");
    }
    if (!process.env.CLOUDINARY_API_KEY) {
      throw new Error("CLOUDINARY_API_KEY not set");
    }
    if (!process.env.CLOUDINARY_API_SECRET) {
      throw new Error("CLOUDINARY_API_SECRET not set");
    }

    console.log("🔄 Testing Cloudinary API...");

    cloudinary.config({
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    // Test: Fetch resource metadata
    const resources = await cloudinary.api.resources({ max_results: 1 });

    console.log("✅ Cloudinary Connected!");
    console.log(`   Cloud Name: ${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}`);
    console.log(`   Total Resources: ${resources.total_count}`);

    // Test: Create test upload signature
    const timestamp = Math.floor(Date.now() / 1000);
    cloudinary.utils.api_sign_request({
      timestamp,
      upload_preset: "medical_emergency",
    }, process.env.CLOUDINARY_API_SECRET);

    console.log("✅ Upload signature generation working");

    return {
      success: true,
      service: "Cloudinary",
      status: "Connected",
      cloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    };
  } catch (error) {
    console.error("❌ Cloudinary Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

if (require.main === module) {
  testCloudinaryAPI().then(console.log).catch(console.error);
}
