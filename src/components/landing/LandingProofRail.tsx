"use client";

import React from "react";
import { ArrowRight, CheckCircle2, Search, ShieldCheck } from "lucide-react";

export function LandingProofRail() {
  const steps = [
    { icon: Search, label: "Find the blocker", detail: "PO, tax, POD, or promise" },
    { icon: CheckCircle2, label: "Prepare the fix", detail: "Evidence attached" },
    { icon: ShieldCheck, label: "Approve with control", detail: "Every action auditable" },
  ];

  return (
    <section aria-label="AIOSpark workflow overview" className="landing-proof-rail relative border-y border-white/[0.08] bg-[#0B0D12]/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:items-center">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500 lg:max-w-[220px]">From stuck cash to controlled resolution</p>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 lg:gap-6 w-full min-w-0">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <React.Fragment key={step.label}>
                  <div className="flex items-center gap-3 min-w-0 sm:min-w-0 sm:flex-1">
                    <span className="w-8 h-8 shrink-0 rounded-lg bg-white/[0.04] border border-white/[0.1] flex items-center justify-center text-[#EF4444]">
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{step.label}</div>
                      <div className="text-[11px] text-neutral-500 truncate">{step.detail}</div>
                    </div>
                  </div>
                  {index < steps.length - 1 && <ArrowRight className="hidden lg:block w-4 h-4 shrink-0 text-neutral-700" aria-hidden="true" />}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
