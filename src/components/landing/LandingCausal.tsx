"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Zap, ShieldCheck, CheckCircle2, GitCommit, AlertOctagon, HelpCircle } from "lucide-react";

const NODES = [
  {
    id: "invoice",
    title: "1. Invoice Raised",
    desc: "₹12.8L raised under standard Net-30 terms",
    status: "ok",
    impact: "Initial invoice generated without baseline validation errors.",
  },
  {
    id: "mismatch",
    title: "2. PO Mismatch (Line 4)",
    desc: "Buyer AP portal rejected tax code 18% vs SEZ exempt",
    status: "root-cause",
    impact: "Root bottleneck: Automated AP filter flagged ₹42k tax discrepancy and blocked invoice approval.",
  },
  {
    id: "approval",
    title: "3. AP Approval Blocked",
    desc: "Buyer system placed invoice into unassigned review queue",
    status: "blocked",
    impact: "Downstream delay: No AP clerk assigned to notify vendor or manually override.",
  },
  {
    id: "trapped",
    title: "4. ₹12.8L Trapped Cash",
    desc: "Payment halted 19 days past contractual due date",
    status: "trapped",
    impact: "Working capital locked until line 4 correction packet is delivered.",
  },
];

export function LandingCausal() {
  const [activeNodeIdx, setActiveNodeIdx] = useState(1); // default to root cause
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

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
  const activeNode = NODES[activeNodeIdx];

  return (
    <section
      id="causal-intelligence"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      <div
        aria-hidden="true"
        className="absolute top-[10%] left-[-6%] w-[500px] h-[500px] rounded-full pointer-events-none"
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
              id="cs-eyebrow"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider ${isRev("cs-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D71920] animate-pulse" />
              <span>CAUSAL INTELLIGENCE</span>
            </div>

            <h2
              data-reveal
              id="cs-headline"
              className={`pt-1 font-bold text-white tracking-[-0.04em] ${isRev("cs-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
              style={{ fontSize: "clamp(2rem, 3.4vw, 3rem)", lineHeight: "1.15" }}
            >
              See what is actually
              <span className="text-[#D71920]">blocking your cash.</span>
            </h2>

            <p
              data-reveal
              id="cs-subtext"
              className={`text-neutral-300 text-base lg:text-[17px] leading-relaxed max-w-lg ${isRev("cs-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            >
              Simple automation sends generic reminders. AIOSpark traces the causal dependency graph behind every trapped rupee — isolating whether the block is a PO mismatch, missing documentation, or approval deadlock.
            </p>

            <div
              data-reveal
              id="cs-highlight"
              className={`p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2 ${isRev("cs-highlight") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
            >
              <div className="flex items-center gap-2.5 text-white font-semibold text-[14px]">
                <Zap className="w-4 h-4 text-[#D71920]" />
                <span>Fix the true root cause, not the symptom</span>
              </div>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                Reminding a customer to pay an invoice that failed their internal AP validation does not work. Fixing the tax code unlocks payment within 48 hours.
              </p>
            </div>
          </div>

          {/* RIGHT: 60% CAUSAL CHAIN PANEL (HARD-CAPPED ~560PX) */}
          <div className="lg:col-span-7 w-full">
            <div
              data-reveal
              id="cs-panel"
              className={`rounded-2xl bg-[#090A0D] border border-white/[0.10] p-6 sm:p-7 shadow-2xl max-h-[560px] flex flex-col justify-between ${isRev("cs-panel") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
            >
              <div>
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
                  <div className="flex items-center gap-2">
                    <GitCommit className="w-4 h-4 text-[#D71920]" />
                    <span className="text-[13px] font-mono font-bold text-white uppercase tracking-wider">
                      Causal Graph Analysis
                    </span>
                  </div>
                  <span className="text-[12px] font-mono text-neutral-400 bg-white/[0.04] px-2.5 py-1 rounded border border-white/[0.08]">
                    INV-8712 • ₹12,80,000
                  </span>
                </div>

                {/* 4 Focused Nodes (Clickable) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                  {NODES.map((node, i) => {
                    const isSelected = i === activeNodeIdx;
                    const isRoot = node.status === "root-cause";
                    const isTrapped = node.status === "trapped";

                    return (
                      <button
                        key={node.id}
                        onClick={() => setActiveNodeIdx(i)}
                        className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${isSelected ? isRoot ? "border-[#D7192D] bg-[#D7192D]/[0.08] shadow-md shadow-red-500/10" : "border-white/30 bg-white/[0.06]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]"}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={`text-[13px] font-bold ${isRoot ? "text-[#D7192D]" : isTrapped ? "text-amber-400" : "text-white"}`}>
                            {node.title}
                          </span>
                          {isRoot && (
                            <span className="px-2 py-0.5 rounded text-[12px] font-mono font-bold bg-[#D7192D]/20 text-[#D7192D] border border-[#D7192D]/30">
                              Root Cause
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-neutral-400 leading-snug">
                          {node.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* Node Inspection & Evidence Box */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] mb-5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[12px] font-mono text-neutral-400 uppercase tracking-wider">
                      INSPECTION EVIDENCE
                    </span>
                    <span className="text-neutral-500">•</span>
                    <span className="text-[12px] font-semibold text-white">{activeNode.title}</span>
                  </div>
                  <p className="text-[13px] text-neutral-300 leading-relaxed">
                    {activeNode.impact}
                  </p>
                </div>
              </div>

              {/* AI Conclusion + Action Bar */}
              <div className="pt-4 border-t border-white/[0.08] space-y-3">
                <div className="flex items-center justify-between text-[12px]">
                  <div className="flex items-center gap-2 text-neutral-300 font-medium">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>Confidence: 94% · Impact: ₹12.8L unblocked</span>
                  </div>
                  <span className="text-neutral-400 font-mono hidden sm:inline">Turnaround: 1 business day</span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <div className="text-[13px] text-neutral-300 font-semibold flex-1 leading-snug">
                    Recommendation: Dispatch corrected PO Line 4 tax packet directly to AP manager.
                  </div>
                  <a
                    href="#pricing-section"
                    className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl bg-[#D7192D] hover:bg-[#E51C1C] text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 shrink-0 transition-all shadow-md shadow-red-500/20 active:scale-95"
                  >
                    <span>Execute unblock</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}