/**
 * Test Google Maps API connection
 * Run: npx ts-node scripts/test-maps.ts
 */
export async function testGoogleMapsAPI() {
  try {
    if (!process.env.GOOGLE_MAPS_API_KEY) {
      throw new Error("GOOGLE_MAPS_API_KEY not set in environment");
    }

    console.log("🔄 Testing Google Maps API...");

    // Test 1: Geocoding API
    const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    geocodeUrl.searchParams.append("address", "New York Hospital, New York, USA");
    geocodeUrl.searchParams.append("key", process.env.GOOGLE_MAPS_API_KEY);

    const geocodeResponse = await fetch(geocodeUrl.toString());
    const geocodeData = (await geocodeResponse.json()) as any;

    if (geocodeData.status !== "OK") {
      throw new Error(`Geocoding failed: ${geocodeData.error_message}`);
    }

    console.log("✅ Geocoding API Working");

    // Test 2: Distance Matrix API
    const origin = `${geocodeData.results[0].geometry.location.lat},${geocodeData.results[0].geometry.location.lng}`;
    const destination = "40.7489,-73.9680"; // Empire State Building

    const distanceUrl = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    distanceUrl.searchParams.append("origins", origin);
    distanceUrl.searchParams.append("destinations", destination);
    distanceUrl.searchParams.append("key", process.env.GOOGLE_MAPS_API_KEY);

    const distanceResponse = await fetch(distanceUrl.toString());
    const distanceData = (await distanceResponse.json()) as any;

    if (distanceData.status !== "OK") {
      throw new Error(`Distance Matrix failed: ${distanceData.error_message}`);
    }

    console.log("✅ Distance Matrix API Working");
    console.log(
      `   Distance: ${distanceData.rows[0].elements[0].distance.text}`
    );
    console.log(`   Duration: ${distanceData.rows[0].elements[0].duration.text}`);

    return {
      success: true,
      service: "Google Maps API",
      status: "Connected",
      apisEnabled: ["Geocoding", "Distance Matrix"],
    };
  } catch (error) {
    console.error("❌ Google Maps API Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

if (require.main === module) {
  testGoogleMapsAPI().then(console.log).catch(console.error);
}
