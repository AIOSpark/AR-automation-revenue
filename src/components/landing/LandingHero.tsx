"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Calendar, ShieldCheck, Zap, Target } from "lucide-react";

interface LandingHeroProps {
  onOpenWaitlist: () => void;
}

const HERO_METRICS = [
  { label: "Receivables", value: "₹48.2 Cr", sub: "Total monitored" },
  { label: "At Risk", value: "₹14.2 Cr", sub: "Action required" },
  { label: "Recoverable", value: "₹8.4 Cr", sub: "Identified today" },
];

const RECOVERY_QUEUE = [
  {
    rank: "01",
    customer: "Acme Corp",
    amount: "₹12.8L",
    overdue: "19 days overdue",
    cause: "PO mismatch",
    recommendation: "Payment blocked by Line 4 tax code discrepancy in buyer AP.",
    action: "Request corrected PO",
  },
  {
    rank: "02",
    customer: "Nova Industries",
    amount: "₹8.4L",
    overdue: "31 days overdue",
    cause: "Approval pending",
    recommendation: "Reconciliation verified; awaiting AP controller sign-off.",
    action: "Escalate to AP head",
  },
];

const ACTIVITY_STREAM = [
  { label: "AI detected exception", status: "complete" },
  { label: "Diagnosed root cause", status: "complete" },
  { label: "Selected recovery action", status: "active" },
  { label: "Finance policy check", status: "pending" },
  { label: "Action executed", status: "pending" },
  { label: "Payment verified", status: "pending" },
];

const TRUST_METRICS = [
  { value: "₹48 Cr+", label: "Receivables monitored", icon: Target },
  { value: "18 days", label: "Faster cash recovery", icon: Zap },
  { value: "99.2%", label: "Workflow accuracy", icon: ShieldCheck },
];

export function LandingHero({ onOpenWaitlist }: LandingHeroProps) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const sectionRef = useRef<HTMLElement>(null);

  const observeReveals = useCallback(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setRevealed((prev) => new Set([...prev, entry.target.id]));
          }
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -5% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRevealed(new Set(["hero-eyebrow", "hero-headline", "hero-subtext", "hero-ctas", "hero-trust", "hero-flow"]));
    }, 40);
    const cleanup = observeReveals();
    return () => {
      clearTimeout(timer);
      cleanup();
    };
  }, [observeReveals]);

  const isRev = (id: string) => revealed.has(id);

  return (
    <section
      ref={sectionRef}
      id="product"
      className="relative flex items-center bg-transparent text-white overflow-visible"
      style={{ paddingTop: "5.5rem", paddingBottom: "4.5rem", minHeight: "calc(100vh - 60px)" }}
    >
      {/* Ambient soft glow */}
      <div
        aria-hidden="true"
        className="absolute top-[8%] right-[-4%] w-[650px] h-[650px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255,45,45,0.08) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[-6%] left-[-6%] w-[450px] h-[450px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255,45,45,0.05) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="max-w-[1440px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">

          {/* ===== LEFT: HERO COPY ===== */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            {/* Eyebrow */}
            <div
              data-reveal
              id="hero-eyebrow"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider w-fit ${
                isRev("hero-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D] animate-pulse" />
              <span>AI-POWERED RECEIVABLES EXECUTION</span>
            </div>

            {/* H1 Headline - No clipping */}
            <h1
              data-reveal
              id="hero-headline"
              className={`mt-4 pt-1 font-bold text-white tracking-[-0.04em] ${
                isRev("hero-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ fontSize: "clamp(2.5rem, 4.5vw, 4.25rem)", lineHeight: "1.12" }}
            >
              Turn overdue invoices<br />
              into working capital.<br />
              <span className="text-[#FF2D2D]">Automatically.</span>
            </h1>

            {/* Supporting copy: 16px minimum */}
            <p
              data-reveal
              id="hero-subtext"
              className={`mt-5 text-neutral-300 text-base sm:text-lg leading-relaxed font-normal max-w-[520px] ${
                isRev("hero-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              For <strong className="text-white font-semibold">CFOs, finance controllers, and AR teams</strong> — AIOSpark uncovers why each rupee is stuck, chooses the optimal recovery action, and executes it. Recover trapped cash{" "}
              <strong className="text-white font-semibold">18 days faster</strong>, with your finance team always in control.
            </p>

            {/* Primary CTAs */}
            <div
              data-reveal
              id="hero-ctas"
              className={`mt-7 flex flex-wrap items-center gap-4 ${
                isRev("hero-ctas") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              <button
                onClick={onOpenWaitlist}
                className="min-h-[48px] px-8 py-3.5 rounded-xl bg-[#FF2D2D] hover:bg-[#E51C1C] text-white font-semibold text-base flex items-center gap-2.5 shadow-xl shadow-red-500/25 transition-all cursor-pointer active:scale-95"
              >
                <span>Get early access</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <Link
                href="/dashboard"
                className="min-h-[48px] px-7 py-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-white font-medium text-base flex items-center gap-2 transition-all cursor-pointer active:scale-95"
              >
                <Calendar className="w-4 h-4 text-neutral-300" />
                <span>Book a demo</span>
              </Link>
            </div>

            {/* ENLARGED TRUST STRIP SEPARATED WITH DIVIDERS */}
            <div
              data-reveal
              id="hero-trust"
              className={`mt-8 ${isRev("hero-trust") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            >
              {/* 3 Metric columns separated with dividers */}
              <div className="grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-4 mb-4">
                {TRUST_METRICS.map((metric, idx) => (
                  <div key={metric.label} className={`flex flex-col ${idx === 0 ? "pr-3 sm:pr-4" : idx === 1 ? "px-3 sm:px-4" : "pl-3 sm:pl-4"}`}>
                    <div className="text-xl sm:text-2xl font-extrabold text-white tabular-nums tracking-tight">
                      {metric.value}
                    </div>
                    <div className="text-[13px] text-neutral-300 font-medium leading-snug mt-0.5">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Trust & compliance line */}
              <div className="flex items-center gap-4 flex-wrap text-[12px] text-neutral-400">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> SOC 2 Compliant
                </span>
                <span className="w-1 h-1 rounded-full bg-neutral-600" />
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Data stays in India
                </span>
                <span className="w-1 h-1 rounded-full bg-neutral-600" />
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> No credit card required
                </span>
              </div>
            </div>
          </div>

          {/* ===== RIGHT: IMPROVED HERO DASHBOARD MOCKUP ===== */}
          <div className="lg:col-span-7 flex flex-col min-w-0">
            <div className="relative w-full">
              {/* Soft red radial glow behind mockup */}
              <div
                aria-hidden="true"
                className="absolute -inset-4 rounded-[2rem] pointer-events-none"
                style={{
                  background: "radial-gradient(ellipse at 50% 35%, rgba(255,45,45,0.16) 0%, transparent 70%)",
                  filter: "blur(28px)",
                }}
              />

              {/* Mockup frame with subtle 1px border (white at 10% opacity) */}
              <div className="relative p-6 sm:p-7 rounded-[1.5rem] bg-[#090A0D]/90 border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
                {/* Dashboard Header */}
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-[#FF2D2D] animate-pulse" />
                    <span className="text-[13px] font-mono text-white font-bold uppercase tracking-wider">
                      AIOSpark Command Center
                    </span>
                  </div>
                  <span className="text-[12px] font-mono text-neutral-300 bg-white/[0.05] px-2.5 py-1 rounded border border-white/[0.10]">
                    Live Telemetry
                  </span>
                </div>

                {/* Metric Band: Readable at normal zoom (min 24px figures, 13px labels) */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  {HERO_METRICS.map((m) => (
                    <div
                      key={m.label}
                      className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15] transition-colors"
                    >
                      <span className="text-[13px] font-mono font-bold text-neutral-400 uppercase tracking-wider block mb-1.5">
                        {m.label}
                      </span>
                      <div className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums leading-none tracking-tight">
                        {m.value}
                      </div>
                      <span className="text-[13px] text-neutral-400 mt-1.5 block">{m.sub}</span>
                    </div>
                  ))}
                </div>

                {/* AI Recovery Priority Queue */}
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] font-mono font-bold text-neutral-300 uppercase tracking-wider">
                      AI RECOVERY QUEUE
                    </h3>
                    <span className="text-[12px] font-mono text-neutral-400">
                      Ranked by expected yield
                    </span>
                  </div>

                  <div className="space-y-3">
                    {RECOVERY_QUEUE.map((item) => {
                      const isActive = activeAction === item.rank;
                      return (
                        <div
                          key={item.rank}
                          className={`p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer ${
                            isActive
                              ? "border-[#FF2D2D]/60 bg-[#FF2D2D]/[0.08]"
                              : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.14]"
                          }`}
                          onMouseEnter={() => setActiveAction(item.rank)}
                          onMouseLeave={() => setActiveAction(null)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") setActiveAction(item.rank);
                          }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-6 h-6 rounded bg-white/[0.06] border border-white/[0.10] flex items-center justify-center text-[12px] font-bold text-neutral-300 shrink-0">
                                {item.rank}
                              </span>
                              <span className="text-[14px] font-bold text-white">{item.customer}</span>
                            </div>
                            <span className="text-[15px] font-bold font-mono tabular-nums text-white">
                              {item.amount}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[13px] mb-1.5">
                            <span className="text-neutral-400">{item.overdue}</span>
                            <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.10] text-neutral-300 font-mono text-[12px]">
                              {item.cause}
                            </span>
                          </div>

                          <div className="text-[13px] text-neutral-300 mb-2 leading-snug">
                            {item.recommendation}
                          </div>

                          <button
                            className="text-[#FF2D2D] text-[13px] font-semibold flex items-center gap-1.5 hover:underline underline-offset-4 cursor-pointer"
                            aria-label={item.action}
                          >
                            <span>{item.action}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* AI Activity Stream */}
                <div className="pt-4 border-t border-white/[0.08]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[13px] font-mono font-bold text-neutral-300 uppercase tracking-wider">
                      LIVE ACTIVITY STREAM
                    </h3>
                    <span className="text-[12px] font-mono text-[#FF2D2D] uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D] animate-pulse" />
                      Active
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {ACTIVITY_STREAM.slice(0, 3).map((step) => {
                      const isComplete = step.status === "complete";
                      const isActiveStep = step.status === "active";
                      return (
                        <div
                          key={step.label}
                          className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] flex items-center gap-2"
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full border-2 shrink-0 ${
                              isComplete
                                ? "bg-emerald-400 border-emerald-400"
                                : isActiveStep
                                ? "bg-[#FF2D2D] border-[#FF2D2D] shadow-[0_0_8px_rgba(255,45,45,0.7)] animate-pulse"
                                : "bg-transparent border-white/[0.2]"
                            }`}
                          />
                          <span className={`text-[12px] font-medium truncate ${
                            isActiveStep ? "text-[#FF2D2D] font-semibold" : "text-neutral-300"
                          }`}>
                            {step.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}