import { prisma } from "@/lib/db/prisma";

type HospitalCandidate = {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string | null;
  address: string | null;
  locationLat: number | null;
  locationLng: number | null;
};

type DriverCandidate = {
  id: string;
  email: string;
  name: string;
  phone: string;
  licenseNumber: string | null;
  vehicleType: string | null;
  vehiclePlate: string | null;
  vehicleCapacity: number | null;
  locationLat: number | null;
  locationLng: number | null;
};

/**
 * Find nearest hospitals using geospatial queries
 * Returns hospitals sorted by distance from patient location
 */
export async function findNearestHospitals(
  latitude: number,
  longitude: number,
  limit: number = 5
) {
  try {
    const candidates = (await prisma.user.findMany({
      where: {
        role: "hospital",
        isActive: true,
        locationLat: { not: null },
        locationLng: { not: null },
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
    })) as unknown as HospitalCandidate[];

    const ranked = candidates
      .map((h: HospitalCandidate) => {
        const d = calculateDistance(latitude, longitude, h.locationLat!, h.locationLng!);
        return {
          ...h,
          distance: d,
          location: { lat: h.locationLat, lng: h.locationLng },
        };
      })
      .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)
      .slice(0, limit);

    return ranked;
  } catch (error) {
    console.error("Find hospitals error:", error);
    return [];
  }
}

/**
 * Find nearest available ambulances (drivers)
 * Returns drivers who are currently available
 */
export async function findNearestAmbulances(
  latitude: number,
  longitude: number,
  limit: number = 3,
  licenseNumber?: string | null
) {
  try {
    const candidates = (await prisma.user.findMany({
      where: {
        role: "driver",
        isActive: true,
        ...(licenseNumber ? { licenseNumber } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        licenseNumber: true,
        vehicleType: true,
        vehiclePlate: true,
        vehicleCapacity: true,
        locationLat: true,
        locationLng: true,
      },
    })) as unknown as DriverCandidate[];

    const ranked = candidates
      .map((d: DriverCandidate) => {
        const hasLocation = d.locationLat != null && d.locationLng != null;
        const distance = hasLocation
          ? calculateDistance(latitude, longitude, d.locationLat as number, d.locationLng as number)
          : Number.POSITIVE_INFINITY;
        return {
          ...d,
          distance,
          currentLocation: hasLocation ? { lat: d.locationLat, lng: d.locationLng } : null,
          user: { name: d.name, email: d.email },
        };
      })
      .sort((a: { distance: number; id: string }, b: { distance: number; id: string }) => {
        const dd = a.distance - b.distance;
        if (dd !== 0) return dd;
        return a.id.localeCompare(b.id);
      })
      .slice(0, limit);

    return ranked;
  } catch (error) {
    console.error("Find ambulances error:", error);
    return [];
  }
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Calculate ETA based on distance and average speed
 * Returns estimated time in minutes
 */
export function calculateETA(
  distanceKm: number,
  averageSpeedKmh: number = 60
): number {
  const etaHours = distanceKm / averageSpeedKmh;
  const etaMinutes = Math.ceil(etaHours * 60);
  return etaMinutes;
}

/**
 * Get nearby hospitals within a radius
 */
export async function getHospitalsInRadius(
  latitude: number,
  longitude: number,
  radiusKm: number = 10
) {
  try {
    const candidates = (await prisma.user.findMany({
      where: {
        role: "hospital",
        isActive: true,
        locationLat: { not: null },
        locationLng: { not: null },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        address: true,
        locationLat: true,
        locationLng: true,
      },
      take: 200,
    })) as unknown as HospitalCandidate[];

    return candidates
      .map((h: HospitalCandidate) => ({
        ...h,
        distance: calculateDistance(latitude, longitude, h.locationLat!, h.locationLng!),
      }))
      .filter((h: { distance: number }) => h.distance <= radiusKm)
      .sort((a: { distance: number }, b: { distance: number }) => a.distance - b.distance)
      .slice(0, 10);
  } catch (error) {
    console.error("Get hospitals in radius error:", error);
    return [];
  }
}

/**
 * Check if coordinates are valid
 */
export function isValidCoordinate(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Format coordinates for display
 */
export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * Convert address to coordinates using mock data
 * In production, use Google Geocoding API
 */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  // Mock implementation
  // In production, call Google Geocoding API
  if (!address) return null;

  // This is a placeholder - implement with actual geocoding service
  return {
    lat: 40.7128,
    lng: -74.006,
  };
}

/**
 * Get route directions between two points
 * In production, use Google Directions API
 */
export async function getDirections(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
) {
  try {
    // In production, call Google Directions API
    // For now, return mock data
    const distance = calculateDistance(fromLat, fromLng, toLat, toLng);
    const eta = calculateETA(distance);

    return {
      distance,
      duration: eta,
      steps: [
        {
          instruction: "Head towards the destination",
          distance: distance,
        },
      ],
      polyline: [], // Google Maps polyline
    };
  } catch (error) {
    console.error("Get directions error:", error);
    return null;
  }
}
