"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, CheckCircle2, AlertTriangle, FileText, ChevronRight } from "lucide-react";

export function LandingAIDiagnosis() {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setRevealed((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isRev = (id: string) => revealed.has(id);

  return (
    <section
      id="ai-diagnosis"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      {/* Subtle ambient glow */}
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255,45,45,0.06) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          
          {/* LEFT: 40% STICKY COLUMN */}
          <div className="lg:col-span-5 lg:sticky lg:top-[120px] self-start space-y-6">
            <div
              data-reveal
              id="ad-eyebrow"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider ${
                isRev("ad-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D] animate-pulse" />
              <span>THE DECISION ENGINE</span>
            </div>

            <h2
              data-reveal
              id="ad-headline"
              className={`pt-1 font-bold text-white tracking-[-0.04em] ${
                isRev("ad-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ fontSize: "clamp(2rem, 3.4vw, 3rem)", lineHeight: "1.15" }}
            >
              AI that understands<br />
              <span className="text-[#FF2D2D]">why cash is stuck.</span>
            </h2>

            <p
              data-reveal
              id="ad-subtext"
              className={`text-neutral-300 text-base lg:text-[17px] leading-relaxed max-w-lg ${
                isRev("ad-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              AIOSpark does not simply list overdue invoices. It evaluates each receivable against purchase orders, tax lines, delivery proof, and customer payment history to isolate the root cause — then recommends the exact unblocking action.
            </p>

            <div
              data-reveal
              id="ad-feature-list"
              className={`pt-2 space-y-3 ${
                isRev("ad-feature-list") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              <div className="flex items-center gap-3 text-[14px] text-neutral-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Line-level purchase order &amp; GST tax validation</span>
              </div>
              <div className="flex items-center gap-3 text-[14px] text-neutral-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Customer behavioral baseline &amp; dispute probability</span>
              </div>
              <div className="flex items-center gap-3 text-[14px] text-neutral-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Deterministic next-best-action with policy safeguards</span>
              </div>
            </div>
          </div>

          {/* RIGHT: 60% CLEAN ANALYSIS CARD (HARD-CAPPED ~560PX) */}
          <div className="lg:col-span-7 w-full">
            <div
              data-reveal
              id="ad-card"
              className={`relative rounded-2xl bg-[#090A0D] border border-white/[0.10] p-6 sm:p-8 shadow-2xl max-h-[560px] flex flex-col justify-between ${
                isRev("ad-card") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
              }`}
            >
              {/* Header: Invoice ₹12,80,000 + Metadata */}
              <div>
                <div className="flex items-center justify-between pb-5 border-b border-white/[0.08]">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.10] flex items-center justify-center text-neutral-300">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono font-bold text-[#FF2D2D]">ILLUSTRATIVE EXAMPLE</span>
                                              <span className="text-[13px] font-mono font-bold text-white">INV-8712</span>
                        <span className="text-neutral-500">•</span>
                        <span className="text-[13px] text-neutral-300 font-medium">Acme Corp</span>
                      </div>
                      <div className="text-[12px] text-neutral-400 font-mono">GSTIN: 27AABCS1429B1Z8 • Net-30</div>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[12px] font-mono font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    Action Required
                  </span>
                </div>

                {/* Big figure display */}
                <div className="py-5 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-[13px] font-mono text-neutral-400 uppercase tracking-wider block">
                      Receivable Value At Risk
                    </span>
                    <div className="text-3xl sm:text-4xl font-extrabold text-white tabular-nums tracking-tight mt-1">
                      ₹12,80,000
                    </div>
                    <span className="text-[10px] text-neutral-400 font-mono mt-1">Illustrative example</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[13px] font-mono text-neutral-400 uppercase tracking-wider block">
                      Expected Recovery
                    </span>
                    <div className="text-xl sm:text-2xl font-bold text-emerald-400 tabular-nums mt-1">
                      ₹12,80,000 <span className="text-xs text-neutral-400 font-normal">(100%)</span>
                    </div>
                  </div>
                </div>

                {/* ROW OF 3 KEY SIGNALS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                  {/* Signal 1: Overdue Days */}
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium text-neutral-400">Overdue days</span>
                      <span className="w-2 h-2 rounded-full bg-amber-400" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-white tabular-nums">
                      19 days
                    </div>
                    <div className="text-[12px] text-neutral-400 mt-1">Net-30 terms breached</div>
                  </div>

                  {/* Signal 2: Dispute Reason */}
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium text-neutral-400">Dispute reason</span>
                      <span className="w-2 h-2 rounded-full bg-[#FF2D2D]" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-white tracking-tight">
                      PO mismatch
                    </div>
                    <div className="text-[12px] text-neutral-400 mt-1">Line 4 tax code rejected</div>
                  </div>

                  {/* Signal 3: Confidence */}
                  <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[13px] font-medium text-neutral-400">Confidence</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    </div>
                    <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                      94%
                    </div>
                    <div className="text-[12px] text-neutral-400 mt-1">Verified against buyer PO</div>
                  </div>
                </div>

                {/* Root Cause Diagnosis Context */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] mb-5">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="text-[13px] leading-relaxed text-neutral-300">
                      <strong className="text-white font-semibold">Diagnosis:</strong> Buyer AP automated filter held payment because line item 4 applied GST 18% instead of client exempt code. Acme Corp normally settles in 28 days with zero prior default.
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTION EXECUTION BAR WITH ONE RECOMMENDED-ACTION BUTTON */}
              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2 text-neutral-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Policy check passed · Controller sign-off enabled</span>
                  </div>
                  <span className="text-neutral-500 font-mono hidden sm:inline">Execution SLA: &lt; 2h</span>
                </div>

                <button
                  onClick={() => setApproved(!approved)}
                  className={`w-full min-h-[48px] px-6 py-3.5 rounded-xl font-semibold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all cursor-pointer ${
                    approved
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30"
                      : "bg-[#FF2D2D] hover:bg-[#E51C1C] text-white shadow-lg shadow-red-500/25 active:scale-[0.99]"
                  }`}
                >
                  {approved ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Approved: Corrected PO Dispatch Scheduled</span>
                    </>
                  ) : (
                    <>
                      <span>Approve recovery action: Request corrected PO</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}