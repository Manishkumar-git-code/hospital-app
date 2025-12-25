// Simplified auth configuration for development
import type { NextAuthOptions } from "next-auth";

export const authOptions = {
  providers: [],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      const u = user as any;
      if (u) {
        (token as any).id = u.id;
        (token as any).role = u.role;
        (token as any).email = u.email;
        (token as any).phone = u.phone;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as any;
      if (session.user) {
        const su = session.user as any;
        su.id = t.id;
        su.role = t.role;
        su.email = t.email;
        su.phone = t.phone;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt" as const,
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: process.env.NEXTAUTH_SECRET || "development-secret",
} satisfies NextAuthOptions;