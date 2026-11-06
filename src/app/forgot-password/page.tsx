"use client";

import { useState } from "react";
import Link from "next/link";
import { KeyRound, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to process request");
      }

      setSubmitted(true);
      setMessage(data.message || "Reset link dispatched via Auth Provider");
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col justify-between p-4 sm:p-8 font-sans">
      <div className="max-w-7xl mx-auto w-full flex items-center justify-between py-4">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="AIOSpark Logo"
            className="h-9 w-auto bg-white rounded-lg p-1 shadow-sm object-contain"
          />
        </Link>
        <Link href="/login" className="text-xs font-mono text-[#FF2D2D] hover:underline font-bold">
          ← Back to Login
        </Link>
      </div>

      <div className="max-w-md mx-auto w-full my-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="w-12 h-12 rounded-2xl bg-[#FF2D2D]/10 text-[#FF2D2D] border border-[#FF2D2D]/20 flex items-center justify-center mb-4">
          <KeyRound className="w-6 h-6" />
        </div>

        <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
          Reset Password
        </h1>
        <p className="text-xs sm:text-sm text-neutral-400 mb-6 leading-relaxed">
          Enter your registered work email to receive password reset instructions managed securely by Supabase Auth.
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-[#FF2D2D]/50 text-red-200 text-xs flex items-center gap-2 font-mono">
            <AlertTriangle className="w-4 h-4 text-[#FF2D2D] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!submitted ? (
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

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-[#FF2D2D]/25 flex items-center justify-center gap-2 active:scale-95"
            >
              {loading ? (
                <span>Sending Reset Link...</span>
              ) : (
                <>
                  <span>Send Reset Link</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <p className="text-sm text-neutral-200 font-medium mb-4">{message}</p>
            <Link
              href="/login"
              className="inline-block px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition-colors"
            >
              Return to Login
            </Link>
          </div>
        )}
      </div>

      <div className="text-center py-4 text-xs text-neutral-500 font-mono">
        Delegated Entirely to Provider Managed Reset Flow
      </div>
    </div>
  );
}
