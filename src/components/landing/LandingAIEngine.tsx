"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Zap, Brain, Target, ShieldCheck, TrendingUp } from "lucide-react";

const STEPS = [
  {
    label: "Invoice",
    value: "\u20B912,80,000",
    meta: "19 days overdue",
  },
  {
    label: "AI Diagnosis",
    value: "PO mismatch",
    meta: "Root cause",
  },
  {
    label: "Confidence",
    value: "94%",
    meta: "Model certainty",
  },
  {
    label: "Customer Signal",
    value: "Previously paid on time",
    meta: "Behavioral history",
  },
  {
    label: "Next Best Action",
    value: "Request corrected PO",
    meta: "Recommended workflow",
  },
  {
    label: "Expected Impact",
    value: "\u20B912,80,000",
    meta: "Recoverable amount",
  },
];

export function LandingAIEngine() {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setRevealed((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -15% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isRev = (id: string) => revealed.has(id);

  return (
    <section
      id="how-it-works"
      className="relative py-24 md:py-36 bg-[#07080B] text-white border-t border-white/[0.06] overflow-hidden"
    >
      <div className="absolute top-[10%] left-[-8%] w-[500px] h-[500px] bg-[#EF4444]/05 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-16 items-start">
          {/* LEFT: COPY */}
          <div className="lg:col-span-5 space-y-8">
            <div
              data-reveal
              id="ai-eyebrow"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EF4444]/08 border border-[#EF4444]/20 text-[10px] font-mono text-[#EF4444] uppercase tracking-wider ${
                isRev("ai-eyebrow")
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4 transition-all duration-700 ai-delay-1"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse" />
              <span>THE DECISION ENGINE</span>
            </div>

            <h2
              data-reveal
              id="ai-headline"
              className={`text-5xl sm:text-6xl lg:text-[60px] font-bold text-white tracking-[-0.04em] leading-[1.1] ${
                isRev("ai-headline")
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-6 transition-all duration-700 ai-delay-2"
              }`}
            >
              AI that understands<br />
              <span className="text-[#EF4444]">why cash is stuck.</span>
            </h2>

            <p
              data-reveal
              id="ai-subtext"
              className={`text-neutral-300 text-lg xl:text-xl leading-relaxed max-w-xl font-normal ${
                isRev("ai-subtext")
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4 transition-all duration-700 ai-delay-3"
              }`}
            >
              AIOSpark does not simply list overdue invoices. It evaluates each receivable against purchase orders, tax lines, delivery proof, and customer payment history to determine the root cause — then selects the next best action.
            </p>

            <div
              data-reveal
              id="ai-chip"
              className={`mt-6 flex items-start gap-3 ${
                isRev("ai-chip")
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-4 transition-all duration-700 ai-delay-4"
              }`}
            >
              <div className="w-9 h-9 rounded-xl bg-[#EF4444]/10 border border-[#EF4444]/20 flex items-center justify-center text-[#EF4444] flex-shrink-0">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Not a reminder tool. An execution layer.</div>
                <div className="text-xs text-neutral-400 mt-0.5">
                  Every recommendation carries a reason, a confidence score, and an expected recovery amount.
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: CENTRAL INVOICE OBJECT + DIAGNOSIS PANEL */}
          <div className="lg:col-span-7">
            <div className="relative p-9 md:p-12 rounded-[1.6rem] bg-[#0A0C12]/40 border border-white/[0.10] shadow-2xl">
              {/* Top badge */}
              <div className="flex items-center gap-3 mb-8">
                <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
                <span className="text-[11px] font-mono text-[#EF4444] uppercase tracking-wider">Live AI Diagnosis</span>
                <span className="text-[10px] font-mono text-neutral-500 bg-white/[0.03] px-2 py-0.5 rounded border border-white/[0.05] ml-auto">Confidence 94%</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* LEFT: INVOICE OBJECT */}
                <div className="space-y-6">
                  <div className="px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Invoice object</span>
                      <span className="text-[10px] font-mono font-bold text-[#FF2D2D]">ILLUSTRATIVE</span>
                                            <span className="text-[10px] font-mono text-[#EF4444] font-bold">INV-8712</span>
                    </div>
                    <div className="text-4xl font-extrabold text-white tabular-nums">\u20B912,80,000</div>
                                        <span className="text-[10px] text-neutral-400 font-mono mt-1">Illustrative example</span>
                    <div className="text-xs text-neutral-400 mt-1 flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-amber-500" />
                      <span>19 days overdue</span>
                    </div>
                  </div>

                  <div className="px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-2">Customer</div>
                    <div className="text-sm font-semibold text-white">Acme Corp</div>
                    <div className="text-xs text-neutral-400 mt-1">Net-30 terms • Last paid 42 days ago</div>
                  </div>

                  <div className="px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-2">Line items flagged</div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-xs text-neutral-300 bg-white/[0.03] px-2 py-1.5 rounded border border-white/[0.05]">PO Line 4 — Tax code</div>
                      <div className="text-xs text-neutral-300 bg-white/[0.03] px-2 py-1.5 rounded border border-white/[0.05]">GRN not received</div>
                    </div>
                  </div>
                </div>

                {/* RIGHT: AI DIAGNOSIS */}
                <div className="space-y-5">
                  {STEPS.map((step, i) => (
                    <div
                      key={step.label}
                      data-reveal
                      id={`ai-diag-${i}`}
                      className={`p-5 rounded-xl bg-white/[0.02] border border-white/[0.06] ${
                        isRev(`ai-diag-${i}`)
                          ? "opacity-100 translate-y-0"
                          : "opacity-0 translate-y-4 transition-all duration-700 ai-delay-2"
                      } group`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">
                          {step.label}
                        </span>
                        <div className="w-1 h-1 rounded-full bg-[#EF4444]/40" />
                      </div>
                      <div className="text-2xl font-bold font-mono tabular-nums text-white">
                        {step.value}
                      </div>
                      <span className="text-xs text-neutral-400">{step.meta}</span>
                    </div>
                  ))}

                  {/* Action execution bar */}
                  <div className="pt-4 border-t border-white/[0.08]">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-[#EF4444]/15 border border-[#EF4444]/30 flex items-center justify-center text-[#EF4444]">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <div className="text-xs font-semibold text-white">Policy gate check</div>
                        <div className="text-[10px] text-neutral-400">Human approval required before dispatch</div>
                      </div>
                    </div>
                    <button className="w-full py-3.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-500/25 active:scale-95">
                      Approve recovery action
                      <ArrowRight className="w-4 h-4" />
                    </button>
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
