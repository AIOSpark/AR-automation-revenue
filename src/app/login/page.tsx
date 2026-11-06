"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, ArrowRight, AlertTriangle, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requiresEmailVerification) {
          router.push(`/verify-email?email=${encodeURIComponent(email)}`);
          return;
        }
        throw new Error(data.error || "Invalid credentials");
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message || "An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col justify-between p-4 sm:p-8 font-sans">
      {/* Top Header Logo */}
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="AIOSpark Logo"
            className="h-9 w-auto bg-white rounded-lg p-1 shadow-sm object-contain"
          />
        </Link>
        <span className="text-xs font-mono text-neutral-400">
          Don't have an account?{" "}
          <Link href="/signup" className="text-[#FF2D2D] hover:underline font-bold">
            Sign up →
          </Link>
        </span>
      </div>

      {/* Login Container */}
      <div className="max-w-md mx-auto w-full my-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-[#FF2D2D]" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#FF2D2D] font-bold">
            Enterprise Login
          </span>
        </div>

        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
          Welcome back
        </h1>
        <p className="text-sm text-neutral-400 mb-8 leading-relaxed">
          Log in to your AIOSpark O2C Intelligence workspace.
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-[#FF2D2D]/50 text-red-200 text-xs flex items-center gap-2 font-mono">
            <AlertTriangle className="w-4 h-4 text-[#FF2D2D] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
              Work Email Address
            </label>
            <input
              type="email"
              required
              placeholder="sarah@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-neutral-300">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs font-mono text-[#FF2D2D] hover:underline">
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3.5 rounded-xl font-semibold text-base text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-[#FF2D2D]/25 flex items-center justify-center gap-2 active:scale-95"
          >
            {loading ? (
              <span>Authenticating...</span>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* SSO / OAuth Config Expansion Options */}
        <div className="mt-8 pt-6 border-t border-neutral-800 text-center">
          <span className="text-xs text-neutral-500 font-mono block mb-4">
            Single Sign-On (SSO) & Enterprise Identity
          </span>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => alert("Google OAuth requires setting FEATURE_ENABLE_GOOGLE_AUTH=true in config")}
              className="py-2.5 px-3 rounded-xl bg-[#050505] border border-neutral-800 hover:border-neutral-700 text-neutral-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Google SSO</span>
            </button>

            <button
              type="button"
              onClick={() => alert("Microsoft SAML/OIDC SSO requires setting FEATURE_ENABLE_SAML_SSO=true in config")}
              className="py-2.5 px-3 rounded-xl bg-[#050505] border border-neutral-800 hover:border-neutral-700 text-neutral-300 text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>Microsoft / SAML</span>
            </button>
          </div>
        </div>
      </div>

      <div className="text-center py-4 text-xs text-neutral-500 font-mono">
        Managed Auth Provider: Supabase Auth • Secure Cookie Sessions
      </div>
    </div>
  );
}
