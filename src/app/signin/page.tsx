"use client";

import { useEffect, useState } from "react";
import { signIn, getSession } from "next-auth/react";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  const [isLoading, setIsLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const res = await signIn("credentials", {
      username: username.trim().toLowerCase(),
      password,
      redirect: false,
      callbackUrl: "/dashboard",
    });
    if (res?.error) {
      setError("Username or password is incorrect. Please try again");
      setIsLoading(false);
      return;
    }
    if (res?.ok) {
      // In production, session cookie may require a full reload; redirect hard.
      // Dashboard will further redirect governors to /governor.
      window.location.replace('/dashboard');
      return;
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-start justify-center px-4 pt-30 pb-12 bg-gradient-to-br from-white via-rfl-peach/30 to-white">
      <div className="w-full max-w-md">
        {/* Sign In Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-rfl-navy mb-2">Welcome back</h2>
            <p className="text-sm text-gray-600">Sign in to continue your fitness journey</p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-rfl-navy focus:border-transparent transition-all bg-white text-gray-900 placeholder-gray-400"
                placeholder="Enter your username"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-12 focus:outline-none focus:ring-2 focus:ring-rfl-navy focus:border-transparent transition-all bg-white text-gray-900 placeholder-gray-400"
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors p-1"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-rfl-navy text-white rounded-lg py-3 font-semibold hover:bg-rfl-navy/90 focus:outline-none focus:ring-2 focus:ring-rfl-navy focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg"
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}


