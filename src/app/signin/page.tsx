"use client";

import { useEffect, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const router = useRouter();
  // If already logged in, redirect appropriately (handles prod where login page may persist)
  useEffect(() => {
    (async () => {
      const sess = await getSession();
      const role = (sess as any)?.user?.role as 'player' | 'leader' | 'governor' | undefined;
      if (role === 'governor') {
        window.location.replace('/governor');
      } else if (sess) {
        window.location.replace('/dashboard');
      }
    })();
  }, []);
  // Username/password only
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await signIn("credentials", {
      username: username.trim().toLowerCase(),
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });
    if (res?.error) {
      setError("Username or password is incorrect. Please try again");
      return;
    }
    if (res?.ok) {
      // In production, session cookie may require a full reload; redirect hard.
      // Dashboard will further redirect governors to /governor.
      window.location.replace('/dashboard');
      return;
    }
  };

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-rfl-navy mb-4">Log in</h1>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Username</label>
            <input value={username} onChange={e => setUsername(e.target.value)} className="w-full border rounded-md px-3 py-2" placeholder="Enter username" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border rounded-md px-3 py-2 pr-10"
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full bg-rfl-navy text-white rounded-md py-2">Continue</button>
        </form>
        {/* Sign up removed */}
      </div>
    </div>
  );
}


