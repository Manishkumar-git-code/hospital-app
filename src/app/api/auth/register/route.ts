import { NextResponse } from 'next/server';
import bcryptjs from 'bcryptjs';
import { prisma } from '@/lib/db/prisma';

// Define types for the request body
interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: 'patient' | 'hospital' | 'driver';
  // Location
  address?: string;
  locationLat?: number;
  locationLng?: number;
  // Patient specific
  bloodType?: string;
  allergies?: string;
  medicalHistory?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  // Hospital specific
  licenseNumber?: string;
  department?: string;
  // Driver specific
  vehicleDetails?: string;
  vehiclePlate?: string;
  vehicleCapacity?: number;
}

function toOptionalInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.trunc(n);
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const data: RegisterRequest = await request.json();
    const { email, password, role, ...rest } = data;

    if (!email || !password || !role || !data.name || !data.phone) {
      return NextResponse.json(
        { message: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json(
        { message: 'User already exists with this email' },
        { status: 400 }
      );
    }

    const passwordHash = await bcryptjs.hash(password, 10);

    const allergies = rest.allergies
      ? rest.allergies
          .split(',')
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    const locationLat = (rest as any).locationLat;
    const locationLng = (rest as any).locationLng;
    const address = (rest as any).address;
    const vehicleCapacity = (rest as any).vehicleCapacity;

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        name: data.name,
        phone: data.phone,
        isActive: true,
        address: typeof address === 'string' && address.trim() ? address.trim() : null,
        locationLat: typeof locationLat === 'number' && Number.isFinite(locationLat) ? locationLat : null,
        locationLng: typeof locationLng === 'number' && Number.isFinite(locationLng) ? locationLng : null,
        bloodType: role === 'patient' ? rest.bloodType || null : null,
        allergies: role === 'patient' ? allergies : [],
        medicalHistory: role === 'patient' ? rest.medicalHistory || null : null,
        emergencyContactName: role === 'patient' ? rest.emergencyContactName || null : null,
        emergencyContactPhone: role === 'patient' ? rest.emergencyContactPhone || null : null,
        emergencyContactRelation: role === 'patient' ? rest.emergencyContactRelation || null : null,
        licenseNumber: role === 'hospital' || role === 'driver' ? rest.licenseNumber || null : null,
        department: role === 'hospital' ? rest.department || null : null,
        vehicleType: role === 'driver' ? rest.vehicleDetails || null : null,
        vehiclePlate: role === 'driver' ? rest.vehiclePlate || null : null,
        vehicleCapacity: role === 'driver' ? toOptionalInt(vehicleCapacity) : null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });
    
    return NextResponse.json(
      { message: 'User registered successfully', user },
      { status: 201 }
    );
    
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { message: 'Error registering user', error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}