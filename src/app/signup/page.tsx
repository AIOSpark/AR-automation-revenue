"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AUTH_CONFIG, validateWorkEmail } from "@/lib/auth/config";
import { ShieldCheck, ArrowRight, AlertTriangle, CheckCircle2, Lock } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();

  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    company_name: "",
    company_size: AUTH_CONFIG.companySizes[0],
    industry: AUTH_CONFIG.industries[0],
    phone: "",
    role_title: "",
  });

  const [freeEmailWarning, setFreeEmailWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData({ ...formData, email: val });
    
    if (val.includes("@")) {
      const check = validateWorkEmail(val);
      setFreeEmailWarning(check.isFreeEmail);
    } else {
      setFreeEmailWarning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailCheck = validateWorkEmail(formData.email);
    if (!emailCheck.isValid) {
      setError(emailCheck.error || "Invalid email address");
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Signup failed");
      }

      if (data.requiresEmailVerification) {
        router.push(`/verify-email?email=${encodeURIComponent(formData.email)}`);
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err?.message || "An unexpected error occurred");
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
          Already have an account?{" "}
          <Link href="/login" className="text-[#FF2D2D] hover:underline font-bold">
            Log in →
          </Link>
        </span>
      </div>

      {/* Main Form Container */}
      <div className="max-w-2xl mx-auto w-full my-8 bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-[#FF2D2D]" />
          <span className="text-xs font-mono uppercase tracking-widest text-[#FF2D2D] font-bold">
            Create Enterprise Account
          </span>
        </div>

        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
          Start Resolving Receivables Blockers
        </h1>
        <p className="text-sm text-neutral-400 mb-8 leading-relaxed">
          Set up your team's Order-to-Cash intelligence workspace today.
        </p>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/50 border border-[#FF2D2D]/50 text-red-200 text-xs flex items-center gap-2 font-mono">
            <AlertTriangle className="w-4 h-4 text-[#FF2D2D] shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section 1: User Information */}
          <div>
            <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400 pb-2 border-b border-neutral-800 mb-4 font-bold">
              1. User Credentials
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  First Name <span className="text-[#FF2D2D]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Sarah"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Last Name <span className="text-[#FF2D2D]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Jenkins"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Work Email <span className="text-[#FF2D2D]">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="sarah@company.com"
                value={formData.email}
                onChange={handleEmailChange}
                className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
              />
              {freeEmailWarning && (
                <div className="mt-2 text-[11px] text-amber-400 flex items-center gap-1.5 font-mono">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Notice: Using a personal email domain. Work emails are recommended for team workspace mapping.</span>
                </div>
              )}
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                Password <span className="text-[#FF2D2D]">*</span>
              </label>
              <input
                type="password"
                required
                placeholder="Minimum 8 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
              />
            </div>
          </div>

          {/* Section 2: Organization Profile */}
          <div>
            <h2 className="text-xs font-mono uppercase tracking-wider text-neutral-400 pb-2 border-b border-neutral-800 mb-4 font-bold">
              2. Organization Details
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Company Name <span className="text-[#FF2D2D]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Apex Enterprise Solutions Pvt Ltd"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Company Size <span className="text-[#FF2D2D]">*</span>
                  </label>
                  <select
                    value={formData.company_size}
                    onChange={(e) => setFormData({ ...formData, company_size: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer"
                  >
                    {AUTH_CONFIG.companySizes.map((sz) => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Industry <span className="text-[#FF2D2D]">*</span>
                  </label>
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer"
                  >
                    {AUTH_CONFIG.industries.map((ind) => (
                      <option key={ind} value={ind}>{ind}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Phone Number <span className="text-neutral-500">(Optional)</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98765 43210"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Role / Title <span className="text-neutral-500">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="VP of Finance / Controller"
                    value={formData.role_title}
                    onChange={(e) => setFormData({ ...formData, role_title: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-800">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-base text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-[#FF2D2D]/25 flex items-center justify-center gap-2 active:scale-95"
            >
              {loading ? (
                <span>Creating Managed Account...</span>
              ) : (
                <>
                  <span>Create Account & Verify Email</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <p className="mt-4 text-center text-xs text-neutral-500">
              By creating an account, mandatory provider email verification will be dispatched.
            </p>
          </div>
        </form>
      </div>

      <div className="text-center py-4 text-xs text-neutral-500 font-mono">
        Managed Auth Provider: Supabase Auth • End-to-end Encrypted
      </div>
    </div>
  );
}
