"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Calendar, ShieldCheck } from "lucide-react";

interface LandingFinalCTAProps {
  onOpenWaitlist: () => void;
}

export function LandingFinalCTA({ onOpenWaitlist }: LandingFinalCTAProps) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setRevealed((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isRev = (id: string) => revealed.has(id);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 600));
    setSubmitted(true);
    setSubmitting(false);
  };

  return (
    <section
      id="cta"
      className="relative text-white overflow-hidden border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      {/* Background ambient glows */}
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-[20%] left-[-8%] w-[500px] h-[500px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,45,45,0.08) 0%, transparent 70%)",
            filter: "blur(90px)",
          }}
        />
        <div
          className="absolute bottom-[20%] right-[-8%] w-[450px] h-[450px] rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(255,45,45,0.06) 0%, transparent 70%)",
            filter: "blur(90px)",
          }}
        />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
        <div
          data-reveal
          id="cta-card"
          className={`relative rounded-[2rem] px-8 py-14 sm:px-16 sm:py-16 md:px-20 md:py-18 border border-white/[0.12] bg-[#090A0E] shadow-2xl text-center ${isRev("cta-card") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"}`}
        >
          {/* Soft inner glow */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-[2rem] pointer-events-none"
            style={{
              background: "radial-gradient(ellipse at 50% 0%, rgba(255,45,45,0.12) 0%, transparent 65%)",
            }}
          />

          <div className="relative z-10 max-w-2xl mx-auto">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D71920] animate-pulse" />
              <span>EARLY ACCESS APPLICATION</span>
            </div>

            {/* Headline - line-height 1.15, padding-top, no clipping */}
            <h2
              className="pt-1 font-bold text-white tracking-[-0.04em] mb-4"
              style={{ fontSize: "clamp(2.25rem, 4.2vw, 3.5rem)", lineHeight: "1.15" }}
            >
              Turn trapped receivables<br />
              <span className="text-[#D71920]">into working capital.</span>
            </h2>

            {/* Subtext: 16px min */}
            <p className="text-neutral-300 text-base sm:text-lg leading-relaxed mb-9 max-w-xl mx-auto">
              AIOSpark uncovers the root cause, selects the highest-value action, and accelerates collections — with your finance team always in control.
            </p>

            {/* INLINE EMAIL FIELD + GET EARLY ACCESS BUTTON */}
            {!submitted ? (
              <form
                onSubmit={handleEmailSubmit}
                className="flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto mb-8"
              >
                <label htmlFor="cta-email" className="sr-only">
                  Work email address
                </label>
                <input
                  id="cta-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="min-h-[48px] flex-1 w-full sm:w-auto px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.15] text-white placeholder-neutral-400 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-[#D71920]/60 focus:border-[#D7192D] transition-all"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[48px] w-full sm:w-auto shrink-0 px-8 py-3 rounded-xl bg-[#D7192D] hover:bg-[#E51C1C] text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-red-500/30 transition-all cursor-pointer active:scale-95 disabled:opacity-60"
                >
                  <span>{submitting ? "Reserving..." : "Get early access"}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-center gap-3 mb-8 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 max-w-md mx-auto">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Check className="w-4 h-4" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white">Application Received</div>
                  <div className="text-[13px] text-neutral-300">Our partnership team will reach out within 24 hours.</div>
                </div>
              </div>
            )}

            {/* Secondary Option: Book Demo */}
            <div className="flex items-center justify-center gap-4">
              <Link
                href="/dashboard"
                className="min-h-[44px] px-6 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-neutral-200 hover:text-white font-medium text-sm transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Calendar className="w-4 h-4 text-neutral-400" />
                <span>Explore Interactive Demo</span>
              </Link>
            </div>

            {/* Trust Badges */}
            <div className="mt-10 pt-8 border-t border-white/[0.08] flex items-center justify-center gap-6 flex-wrap text-[13px] text-neutral-400">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Policy-gated by design
              </span>
              <span className="hidden sm:inline text-neutral-600">•</span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> No credit card required
              </span>
              <span className="hidden sm:inline text-neutral-600">•</span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> Data stays in India
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}