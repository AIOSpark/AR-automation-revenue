"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, UserCheck, ArrowRight, CheckCircle2, Sliders, Lock, Zap } from "lucide-react";

interface LandingAutonomyProps {
  onOpenWaitlist: () => void;
}

const POLICIES = [
  {
    id: "low-value",
    title: "Low-value reminder",
    badge: "Autonomous",
    badgeColor: "emerald",
    condition: "Invoice > 15 days overdue AND Customer risk < Medium AND Amount < ₹5,00,000",
    action: "AI automatically drafts and dispatches payment nudge to AP primary contact.",
    guardrail: "Max 2 autonomous nudges. Escalates to human if customer disputes or remains silent > 7 days.",
    steps: [
      { name: "Condition detected", status: "complete" },
      { name: "Policy validated", status: "complete" },
      { name: "Autonomous dispatch", status: "complete" },
      { name: "Ledger status synced", status: "complete" },
    ],
  },
  {
    id: "high-value",
    title: "High-value escalation",
    badge: "Human-in-the-loop",
    badgeColor: "amber",
    condition: "Invoice > 30 days overdue OR Amount > ₹10,00,000",
    action: "AI drafts executive escalation letter and attaches reconciliation ledger; pauses for controller sign-off.",
    guardrail: "Human approval required before dispatch. Audit log recorded with timestamps.",
    steps: [
      { name: "High value flagged", status: "complete" },
      { name: "Policy gate verified", status: "complete" },
      { name: "Awaiting CFO approval", status: "active" },
      { name: "Dispatch queue held", status: "pending" },
    ],
  },
  {
    id: "dispute",
    title: "Dispute resolution",
    badge: "Policy-gated",
    badgeColor: "red",
    condition: "Root cause = PO mismatch OR Tax code variance OR Missing GRN",
    action: "AI compiles supporting delivery notes, recalculates tax delta, and prepares corrected invoice packet.",
    guardrail: "Commercial credit notes require dual finance controller approval before ERP write-back.",
    steps: [
      { name: "Variance diagnosed", status: "complete" },
      { name: "Correction packet ready", status: "complete" },
      { name: "Dual-signoff approval", status: "active" },
      { name: "ERP credit note write-back", status: "pending" },
    ],
  },
];

export function LandingAutonomy({ onOpenWaitlist }: LandingAutonomyProps) {
  const [activePolicyIdx, setActivePolicyIdx] = useState(1);
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
  const activePolicy = POLICIES[activePolicyIdx];

  const badgeClass = (color: string) => {
    if (color === "emerald") return "bg-emerald-500/10 text-emerald-400 border-emerald-500/25";
    if (color === "amber") return "bg-amber-500/10 text-amber-400 border-amber-500/25";
    return "bg-[#FF2D2D]/10 text-[#FF2D2D] border-[#FF2D2D]/25";
  };

  return (
    <section
      id="autonomy"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      <div
        aria-hidden="true"
        className="absolute top-[10%] right-[-6%] w-[500px] h-[500px] rounded-full pointer-events-none"
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
              id="au-eyebrow"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider ${
                isRev("au-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D] animate-pulse" />
              <span>CONTROLLED AUTONOMY</span>
            </div>

            <h2
              data-reveal
              id="au-headline"
              className={`pt-1 font-bold text-white tracking-[-0.04em] ${
                isRev("au-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ fontSize: "clamp(2rem, 3.4vw, 3rem)", lineHeight: "1.15" }}
            >
              Your finance team sets<br />
              <span className="text-[#FF2D2D]">the rules.</span> AIOSpark executes.
            </h2>

            <p
              data-reveal
              id="au-subtext"
              className={`text-neutral-300 text-base lg:text-[17px] leading-relaxed max-w-lg ${
                isRev("au-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              Autonomy without guardrails is a liability. AIOSpark executes recovery actions strictly within the approval policies you define — humans remain fully in control of high-value communications and ledger modifications.
            </p>

            <div
              data-reveal
              id="au-callout"
              className={`p-5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2 ${
                isRev("au-callout") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
              }`}
            >
              <div className="flex items-center gap-2.5 text-white font-semibold text-[14px]">
                <ShieldCheck className="w-4 h-4 text-[#FF2D2D]" />
                <span>Zero unsolicited actions</span>
              </div>
              <p className="text-[13px] text-neutral-400 leading-relaxed">
                Set approval floors per legal entity, invoice tier, and customer tier. Every action is signed with cryptographic audit lineage.
              </p>
            </div>
          </div>

          {/* RIGHT: 60% TABBED POLICY WORKBENCH (HARD-CAPPED ~560PX) */}
          <div className="lg:col-span-7 w-full">
            <div
              data-reveal
              id="au-panel"
              className={`rounded-2xl bg-[#090A0D] border border-white/[0.10] p-6 sm:p-7 shadow-2xl max-h-[560px] flex flex-col justify-between ${
                isRev("au-panel") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
              }`}
            >
              {/* Top: Policy Tabs */}
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-5">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-neutral-400" />
                    <span className="text-[13px] font-mono font-bold text-white uppercase tracking-wider">
                      Policy Rule Configuration
                    </span>
                  </div>
                  <span className="text-[12px] font-mono text-neutral-400">3 Active Rules</span>
                </div>

                {/* Tabs */}
                <div className="grid grid-cols-3 gap-2 p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mb-5">
                  {POLICIES.map((p, i) => {
                    const active = i === activePolicyIdx;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setActivePolicyIdx(i)}
                        className={`min-h-[44px] px-3 py-2 rounded-lg text-[13px] font-medium transition-all text-center cursor-pointer ${
                          active
                            ? "bg-white/[0.10] text-white shadow-sm font-semibold"
                            : "text-neutral-400 hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        {p.title}
                      </button>
                    );
                  })}
                </div>

                {/* Active Rule Details */}
                <div className="space-y-4">
                  {/* Badge + Header */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white tracking-tight">
                      {activePolicy.title}
                    </h3>
                    <span className={`px-2.5 py-1 rounded-full text-[12px] font-mono font-bold border ${badgeClass(activePolicy.badgeColor)}`}>
                      {activePolicy.badge}
                    </span>
                  </div>

                  {/* When Condition */}
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-[12px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                      TRIGGER CONDITION (WHEN)
                    </span>
                    <div className="text-[13px] font-mono text-neutral-200">
                      {activePolicy.condition}
                    </div>
                  </div>

                  {/* Then Action */}
                  <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-[12px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                      DISPATCH POLICY (THEN)
                    </span>
                    <div className="text-[13px] font-semibold text-white leading-relaxed">
                      {activePolicy.action}
                    </div>
                    <div className="text-[12px] text-neutral-400 mt-2 flex items-center gap-1.5 border-t border-white/[0.05] pt-2">
                      <Lock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span>{activePolicy.guardrail}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Execution Path (Bottom connected stepper) */}
              <div className="pt-4 border-t border-white/[0.08] mt-4">
                <span className="text-[12px] font-mono text-neutral-400 uppercase tracking-wider block mb-3">
                  Live Execution Trace
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {activePolicy.steps.map((st, i) => {
                    const isDone = st.status === "complete";
                    const isActive = st.status === "active";
                    return (
                      <div
                        key={st.name}
                        className={`p-2.5 rounded-lg border text-left ${
                          isDone
                            ? "bg-emerald-500/[0.05] border-emerald-500/20"
                            : isActive
                            ? "bg-[#FF2D2D]/[0.08] border-[#FF2D2D]/35"
                            : "bg-white/[0.02] border-white/[0.05]"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isDone
                                ? "bg-emerald-400"
                                : isActive
                                ? "bg-[#FF2D2D] animate-pulse"
                                : "bg-neutral-600"
                            }`}
                          />
                          <span
                            className={`text-[12px] font-mono font-bold uppercase ${
                              isDone
                                ? "text-emerald-400"
                                : isActive
                                ? "text-[#FF2D2D]"
                                : "text-neutral-500"
                            }`}
                          >
                            Step 0{i + 1}
                          </span>
                        </div>
                        <div
                          className={`text-[12px] font-medium leading-snug line-clamp-1 ${
                            isActive ? "text-white font-semibold" : "text-neutral-300"
                          }`}
                        >
                          {st.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}