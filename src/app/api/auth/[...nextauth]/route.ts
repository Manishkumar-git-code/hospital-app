// Temporary simple auth handler - replace with proper NextAuth setup later
import { authOptions } from "@/lib/auth";
import NextAuth from "next-auth";

export const handler = NextAuth(authOptions);

export async function GET() {
  return handler;
}

export async function POST() {
  return handler;
}
