"use client";

import React, { useEffect, useState, useRef } from "react";
import { TrendingUp, Wallet, ShieldCheck, ArrowRight, Database, CheckCircle2, RefreshCw } from "lucide-react";

interface LandingProofProps {
  onOpenWaitlist?: () => void;
}

const METRICS = [
  {
    label: "Receivables monitored",
    value: "₹48 Cr+",
    numericTarget: 48,
    prefix: "₹",
    suffix: " Cr+",
    note: "Design partner data",
  },
  {
    label: "Identified recoverable cash",
    value: "₹8.4 Cr",
    numericTarget: 8.4,
    prefix: "₹",
    suffix: " Cr",
    note: "High confidence recovery",
  },
  {
    label: "Avg. collection cycle cut",
    value: "18.4 days",
    numericTarget: 18.4,
    prefix: "",
    suffix: " days",
    note: "From due date to confirmation",
  },
  {
    label: "Diagnosis accuracy",
    value: "99.2%",
    numericTarget: 99.2,
    prefix: "",
    suffix: "%",
    note: "Verified by controllers",
  },
];

const CONNECTORS = [
  { name: "Tally Prime / ERP 9", type: "Available now", category: "Accounting" },
  { name: "Zoho Books", type: "Available now", category: "Accounting" },
  { name: "SAP S/4HANA", type: "Available now", category: "ERP" },
  { name: "ERPNext", type: "Available now", category: "ERP" },
  { name: "Intuit QuickBooks", type: "Available now", category: "Accounting" },
  { name: "Oracle NetSuite", type: "Roadmap (Q1)", category: "ERP" },
];

function useCountUp(target: number, duration = 1400, shouldStart = false) {
  const [count, setCount] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!shouldStart) return;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(eased * target);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, shouldStart]);

  return count;
}

function AnimatedMetric({
  metric,
  shouldStart,
}: {
  metric: (typeof METRICS)[0];
  shouldStart: boolean;
}) {
  const count = useCountUp(metric.numericTarget, 1600, shouldStart);
  const formatted =
    metric.numericTarget % 1 !== 0 ? count.toFixed(1) : Math.floor(count).toString();

  return (
    <span className="tabular-nums">
      {metric.prefix}
      {formatted}
      {metric.suffix}
    </span>
  );
}

export function LandingProof({ onOpenWaitlist }: LandingProofProps) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [countersStarted, setCountersStarted] = useState(false);
  const metricsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setRevealed((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => revealObserver.observe(el));

    if (metricsRef.current) {
      const counterObserver = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setCountersStarted(true);
            counterObserver.disconnect();
          }
        },
        { threshold: 0.3 }
      );
      counterObserver.observe(metricsRef.current);
    }

    return () => revealObserver.disconnect();
  }, []);

  const isRev = (id: string) => revealed.has(id);

  return (
    <section
      id="proof"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      {/* Anchor for nav links pointing to integrations */}
      <span id="integrations" className="absolute -top-20" aria-hidden="true" />

      <div
        aria-hidden="true"
        className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255,45,45,0.05) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
        
        {/* SECTION HEADER */}
        <div className="text-center mb-12 sm:mb-16 max-w-2xl mx-auto">
          <div
            data-reveal
            id="pr-eyebrow"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider ${
              isRev("pr-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D] animate-pulse" />
            <span>BUSINESS OUTCOMES &amp; INFRASTRUCTURE</span>
          </div>

          <h2
            data-reveal
            id="pr-headline"
            className={`mt-4 pt-1 font-bold text-white tracking-[-0.04em] ${
              isRev("pr-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", lineHeight: "1.15" }}
          >
            Measurable results across{" "}
            <span className="text-[#FF2D2D]">your financial stack.</span>
          </h2>

          <p
            data-reveal
            id="pr-subtext"
            className={`mt-4 text-neutral-300 text-base sm:text-lg leading-relaxed max-w-xl mx-auto ${
              isRev("pr-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            AIOSpark integrates directly into your existing accounting infrastructure. No rip-and-replace: recovered funds update your ledgers automatically.
          </p>
        </div>

        {/* 4 CORE METRIC CARDS */}
        <div
          ref={metricsRef}
          data-reveal
          id="pr-metrics"
          className={`grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10 ${
            isRev("pr-metrics") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
          }`}
        >
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="p-5 sm:p-6 rounded-2xl border border-white/[0.08] bg-[#090A0D] hover:border-white/[0.15] transition-all"
            >
              <span className="text-[11px] font-mono font-bold text-[#FF2D2D] bg-[#FF2D2D]/10 px-2 py-0.5 rounded border border-[#FF2D2D]/30 mb-2 block">
                ILLUSTRATIVE EXAMPLE
              </span>
              <span className="text-[13px] font-mono font-bold text-neutral-400 uppercase tracking-wider block mb-2">
                {m.label}
              </span>
              <div className="text-3xl sm:text-4xl font-extrabold text-white leading-none mb-2 tabular-nums">
                <AnimatedMetric metric={m} shouldStart={countersStarted} />
              </div>
              <div className="text-[12px] text-neutral-400 font-mono">
                {m.note}
              </div>
            </div>
          ))}
        </div>

        {/* MERGED: FINANCIAL STACK INTEGRATIONS */}
        <div
          data-reveal
          id="pr-integrations"
          className={`rounded-2xl border border-white/[0.08] bg-[#090A0D] p-6 sm:p-8 mb-10 ${
            isRev("pr-integrations") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-white/[0.08] mb-6">
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Works with your existing accounting stack
              </h3>
              <p className="text-[14px] text-neutral-400 mt-0.5">
                Bidirectional synchronization: read invoices and POs, write reconciled recoveries straight to your ledger.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[12px] font-mono text-emerald-400 shrink-0">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" style={{ animationDuration: "8s" }} />
              <span>Zero manual spreadsheet matching</span>
            </div>
          </div>

          {/* Connectors grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {CONNECTORS.map((c) => {
              const isAvailable = c.type === "Available now";
              return (
                <div
                  key={c.name}
                  className="p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] flex flex-col justify-between hover:border-white/[0.12] transition-colors"
                >
                  <div className="text-[13px] font-bold text-white mb-2 leading-tight">
                    {c.name}
                  </div>
                  <div className="flex items-center justify-between text-[12px] font-mono pt-2 border-t border-white/[0.05]">
                    <span className="text-neutral-400">{c.category}</span>
                    <span className={isAvailable ? "text-emerald-400" : "text-amber-400"}>
                      {isAvailable ? "Live" : "Q1"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Ledger guarantee callout */}
          <div className="mt-6 pt-5 border-t border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[13px] text-neutral-300">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Full bidirectional audit trail for Tally, Zoho Books, SAP, and ERPNext</span>
            </div>
            <span className="text-neutral-400 font-mono text-[12px]">
              DPDP Act &amp; SOC 2 Compliant · Data stays in India
            </span>
          </div>
        </div>

        {/* CTA BUTTON AFTER OUTCOMES SECTION (Requirement 7) */}
        {onOpenWaitlist && (
          <div
            data-reveal
            id="pr-cta"
            className={`flex flex-col sm:flex-row items-center justify-center gap-4 text-center ${
              isRev("pr-cta") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
            }`}
          >
            <button
              onClick={onOpenWaitlist}
              className="min-h-[48px] px-8 py-3.5 rounded-xl bg-[#FF2D2D] hover:bg-[#E51C1C] text-white font-semibold text-sm sm:text-base flex items-center gap-2 shadow-lg shadow-red-500/25 transition-all cursor-pointer active:scale-95"
            >
              <span>Get early access for your team</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="text-[13px] text-neutral-400">
              Join our design partner program · Limited pilot cohorts
            </span>
          </div>
        )}

      </div>
    </section>
  );
}