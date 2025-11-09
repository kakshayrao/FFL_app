import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getSupabase } from "@/lib/supabase";
// No hashing - passwords are stored in plaintext per user's request

const authOptions = {
  session: {
    strategy: "jwt" as const,
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
        const username = (credentials?.username || "").trim();
        const password = String(credentials?.password || "");
        if (!username || !password) return null;
        const { data: acct } = await getSupabase()
          .from("accounts")
          .select("id, first_name, username, password, role, age")
          .eq("username", username)
          .maybeSingle();
        if (acct && String((acct as any).password) === password) {
          return { id: acct.id, name: acct.first_name, role: acct.role, age: (acct as any)?.age ?? null } as any;
        }
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }: { token: any; user?: any }) {
      if (user) {
        (token as any).id = (user as any).id;
        (token as any).name = (user as any).name;
        (token as any).role = (user as any).role;
        (token as any).age = (user as any).age ?? null;
      }
      return token;
    },
    async session({ session, token }: { session: any; token: any }) {
      (session as any).user = {
        id: String((token as any)?.id || ""),
        name: String((token as any)?.name ?? ""),
        role: (token as any)?.role ?? "player",
        age: (token as any)?.age ?? null,
      };
      return session;
    },
  },
} as const;

const handler = NextAuth(authOptions as any);
export { handler as GET, handler as POST };


