import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getSupabase } from "@/lib/supabase";
// No hashing - passwords stored in plaintext per user's request

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      role: "player" | "leader" | "governor";
      age?: number | null;
    };
  }
}

const authConfig = {
  session: {
    strategy: "jwt" as const,
    // Keep users signed in unless they sign out (long-lived cookie)
    maxAge: 365 * 24 * 60 * 60, // 365 days
    updateAge: 24 * 60 * 60, // refresh cookie age every 24h on activity
  },
  jwt: {
    maxAge: 365 * 24 * 60 * 60, // align JWT age with session
  },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = (credentials?.username || "").trim().toLowerCase();
        const password = credentials?.password || "";
        if (!username || !password) return null;
        const { data: acct } = await getSupabase()
          .from("accounts")
          .select("id, first_name, username, password, role, age")
          .eq("username", username)
          .maybeSingle();
        if (acct && String((acct as any).password) === password) {
          return {
            id: acct.id,
            name: acct.first_name,
            role: acct.role as "player" | "leader" | "governor",
            age: (acct as any)?.age ?? null,
          } as { id: string; name: string; role: "player" | "leader" | "governor"; age?: number | null };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: any; user?: any }) {
      if (user) {
        token.id = (user as unknown as { id: string }).id;
        token.name = user.name;
        token.role = (user as unknown as { role: "player" | "leader" | "governor" }).role;
        token.age = (user as any)?.age ?? null;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      session.user = {
        id: String(token.id || ""),
        name: String(token.name || ""),
        role: (token as { role?: "player" | "leader" | "governor" }).role || "player",
        age: (token as any)?.age ?? null,
      };
      return session;
    },
  },
};

const { auth, signIn, signOut } = NextAuth(authConfig);

export { auth, signIn, signOut };

// Export options for getServerSession consumers (API routes, etc.)
export const authOptions = authConfig as any;


