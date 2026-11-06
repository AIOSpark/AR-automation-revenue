"use client";

import React from "react";
import { Mail, Sparkles, UserCheck, CheckCircle2, ArrowRight } from "lucide-react";

interface LandingAutomationProps {
  onOpenWaitlist: () => void;
}

export function LandingAutomation({ onOpenWaitlist }: LandingAutomationProps) {
  const steps = [
    {
      num: "01",
      icon: Mail,
      title: "Invoice becomes overdue",
      desc: "Automatically identified 24 hours post credit terms.",
      badge: "Step 01",
    },
    {
      num: "02",
      icon: Sparkles,
      title: "AI isolates root cause",
      desc: "Cross-references purchase order, tax rates, and delivery proof.",
      badge: "Diagnosis",
    },
    {
      num: "03",
      icon: UserCheck,
      title: "Human review & approval",
      desc: "Controller reviews recommended dunning message or revised invoice.",
      badge: "Guardrail",
    },
    {
      num: "04",
      icon: CheckCircle2,
      title: "Payment cleared & synced",
      desc: "Settled funds post directly to Tally, Zoho Books, or SAP.",
      badge: "Reconciliation",
    },
  ];

  return (
    <section id="automation" className="py-20 md:py-28 bg-[#07080B] text-white border-t border-white/[0.06] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="max-w-3xl mb-14 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[11px] font-mono font-bold text-[#EF4444] uppercase tracking-wider">
            <span>CONTROLLED AUTOMATION</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-bold text-white tracking-tight leading-[1.15]">
            Autonomous execution, <br />
            <span className="font-serif-editorial font-normal text-neutral-300">
              with human-in-the-loop control.
            </span>
          </h2>

          <p className="text-neutral-300 text-base sm:text-lg leading-relaxed font-normal">
            AIOSpark removes manual follow-up friction while enforcing your corporate finance approval policies.
          </p>
        </div>

        {/* 4 Clean Steps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {steps.map((st, idx) => {
            const Icon = st.icon;
            return (
              <div
                key={idx}
                className="landing-feature-card p-6 rounded-2xl bg-[#12141A] border border-white/[0.08] flex flex-col justify-between h-56"
              >
                <div className="flex items-center justify-between">
                  <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#EF4444]">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-mono text-neutral-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
                    {st.badge}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    {st.title}
                  </h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    {st.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA bar */}
        <div className="landing-automation-cta mt-10 p-6 rounded-2xl bg-[#12141A] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-sm font-semibold text-white">Experience autonomous AR in action</div>
            <div className="text-xs text-neutral-400 mt-0.5">Start with a 14-day zero-risk trial connected to your ledger.</div>
          </div>
          <button
            onClick={onOpenWaitlist}
            className="px-5 py-2.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold text-xs flex items-center gap-2 transition-all cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <span>Get early access</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </section>
  );
}
