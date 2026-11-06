"use client";

import React, { useEffect, useState } from "react";
import { FileText, AlertTriangle, XCircle, Clock, Ban, Lock } from "lucide-react";

const CHAIN_STEPS = [
  {
    label: "Invoice Raised",
    desc: "Generated & dispatched to buyer AP",
    status: "idle",
    icon: FileText,
  },
  {
    label: "PO Mismatch",
    desc: "Line-item tax code rejected by buyer filter",
    status: "idle",
    icon: AlertTriangle,
  },
  {
    label: "AP Rejection",
    desc: "Invoice paused pending vendor correction",
    status: "idle",
    icon: XCircle,
  },
  {
    label: "Approval Delay",
    desc: "No AP owner assigned to override hold",
    status: "idle",
    icon: Clock,
  },
  {
    label: "Payment Delay",
    desc: "31+ days overdue and counting",
    status: "idle",
    icon: Ban,
  },
  {
    label: "Cash Trapped",
    desc: "Working capital locked indefinitely",
    status: "trapped",
    icon: Lock,
  },
];

export function LandingTrappedCash() {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setRevealed((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isRev = (id: string) => revealed.has(id);

  return (
    <section
      id="problem"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      <div
        aria-hidden="true"
        className="absolute top-[10%] right-[-8%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(215,25,32,0.06) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">

          {/* LEFT: 40% STICKY COLUMN */}
          <div className="lg:col-span-5 lg:sticky lg:top-[120px] self-start space-y-6">
            <div
              data-reveal
              id="tc-eyebrow"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider ${isRev("tc-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D7192D] animate-pulse" />
              <span>THE WORKING CAPITAL PROBLEM</span>
            </div>

            <h2
              data-reveal
              id="tc-headline"
              className={`pt-1 font-bold text-white tracking-[-0.04em] ${isRev("tc-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ fontSize: "clamp(2rem, 3.4vw, 3rem)", lineHeight: "1.15" }}
            >
              Revenue isn&rsquo;t the problem.
              <span className="text-[#D7192D]">Cash is.</span>
            </h2>

            <p
              data-reveal
              id="tc-subtext"
              className={`text-neutral-300 text-base sm:text-lg leading-relaxed max-w-lg ${isRev("tc-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            >
              Indian enterprises can be profitable and still struggle with cash flow — because capital gets trapped between invoice generation, tax line verification, AP approval, and banking clearance. Every link is a potential bottleneck.
            </p>

            <div
              data-reveal
              id="tc-identify"
              className={`p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2 ${isRev("tc-identify") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            >
              <h3 className="text-[14px] font-bold text-white tracking-tight">
                AIOSpark identifies the root blockage — not just the overdue date.
              </h3>
              <p className="text-[13px] text-neutral-300 leading-relaxed">
                Most tools tell you that an invoice is late. AIOSpark surfaces exactly <em className="text-white font-semibold not-italic">why</em> it is late — and what unblocks it.
              </p>
            </div>
          </div>

          {/* RIGHT: 60% BLOCKAGE CHAIN GRID */}
          <div className="lg:col-span-7 w-full">
            <div
              data-reveal
              id="tc-flow"
              className={`relative ${isRev("tc-flow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                {CHAIN_STEPS.map((step, i) => {
                  const isTrapped = step.status === "trapped";
                  const isActive = activeIndex === i;
                  const isComplete = i < (activeIndex ?? 0);
                  const Icon = step.icon;

                  return (
                    <div
                      key={step.label}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseLeave={() => setActiveIndex(null)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") setActiveIndex(i);
                      }}
                      role="button"
                      tabIndex={0}
                      className={`relative flex flex-col items-start gap-3.5 rounded-2xl border p-5 text-left transition-all duration-300 cursor-pointer ${isTrapped ? "border-[#D7192D]/50 bg-[#D7192D]/10 shadow-[0_16px_30px_rgba(215,25,32,0.12)]" : isActive ? "border-white/30 bg-white/[0.06]" : "border-white/[0.08] bg-[#090A0D] hover:border-white/[0.15]"}`}
                    >
                      {/* Step number */}
                      <span className="absolute top-3.5 right-3.5 text-[12px] font-mono text-neutral-400">
                        {String(i + 1).padStart(2, "0")}
                      </span>

                      {/* Icon */}
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center border transition-all duration-300 ${isTrapped ? "bg-[#D7192D] text-white border-[#D7192D] shadow-[0_0_20px_rgba(215,25,32,0.4)]" : isActive ? "bg-white/[0.10] text-white border-white/20" : isComplete ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-white/[0.04] text-neutral-300 border-white/[0.10]"}`}
                      >
                        <Icon className="w-4.5 h-4.5" />
                      </div>

                      {/* Label + desc */}
                      <div>
                        <div
                          className={`text-[14px] font-bold mb-1 ${isTrapped ? "text-[#D7192D]" : "text-white"}`}>
                          {step.label}
                        </div>
                        <div className="text-[13px] text-neutral-300 leading-snug">
                          {step.desc}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom guidance */}
              <p className="mt-4 text-[12px] text-neutral-400 font-mono text-center">
                Hover any node to trace where receivables get blocked in the payment cycle ↑
              </p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}