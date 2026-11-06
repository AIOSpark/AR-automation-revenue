"use client";

import React, { useState } from "react";
import { Check, ArrowRight } from "lucide-react";

interface PricingPlansProps {
  onOpenWaitlist: () => void;
}

export function PricingPlans({ onOpenWaitlist }: PricingPlansProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");

  const proPrice = billingCycle === "monthly" ? "29" : "23";
  const bizPrice = billingCycle === "monthly" ? "79" : "63";

  return (
    <section className="landing-section landing-pricing py-16 md:py-24 bg-[#07080B] text-white border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center mb-10 md:mb-14">
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#EF4444] mb-3">Simple entry. Serious control.</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.035em] leading-tight">
            Start with visibility. <span className="font-serif-editorial font-normal text-neutral-300">Scale into autonomy.</span>
          </h2>
          <p className="text-sm sm:text-base text-neutral-400 leading-relaxed mt-4 max-w-2xl mx-auto">
            Choose the workspace that matches your operating rhythm. Every plan keeps finance teams in control of what gets dispatched.
          </p>
        </div>
        
        {/* Billing Cycle Toggle */}
        <div className="flex items-center justify-center mb-12 md:mb-14">
          <div className="inline-flex items-center p-1 rounded-full bg-white/[0.04] border border-white/10">
            <button
              onClick={() => setBillingCycle("monthly")}
              aria-pressed={billingCycle === "monthly"}
              className={`min-h-11 px-6 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                billingCycle === "monthly"
                  ? "bg-[#EF4444] text-white shadow-md"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Monthly
            </button>

            <button
              onClick={() => setBillingCycle("yearly")}
              aria-pressed={billingCycle === "yearly"}
              className={`min-h-11 px-6 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                billingCycle === "yearly"
                  ? "bg-[#EF4444] text-white shadow-md"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              <span>Yearly</span>
              <span className="text-[10px] font-bold text-[#EF4444] bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* 3 Pricing Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
          
          {/* PLAN 1: FREE / STARTER */}
          <div className="landing-pricing-card bg-[#12141A] rounded-3xl border border-white/[0.08] p-8 shadow-sm flex flex-col justify-between hover:border-white/20 transition-all hover:-translate-y-1 text-white">
            <div>
              <h3 className="text-2xl font-bold text-white">Starter Pilot</h3>
              <p className="text-xs text-neutral-400 mt-1 mb-6">
                For finance teams evaluating AR automation.
              </p>

              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-extrabold text-white tracking-tight font-mono">$0</span>
                <span className="text-sm font-medium text-neutral-400">/ month</span>
              </div>

              <button
                onClick={onOpenWaitlist}
                className="w-full py-3.5 px-4 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/[0.04] text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <span>Start 14-day pilot</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="mt-8 space-y-3.5 text-xs sm:text-sm text-neutral-300">
                {[
                  "Up to 250 invoices/month",
                  "Automated PO mismatch detection",
                  "CSV / Excel ledger ingestion",
                  "Human approval control queue",
                  "1 ERP integration connection",
                ].map((feat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PLAN 2: PRO (MOST POPULAR - HIGHLIGHTED) */}
          <div className="landing-pricing-card landing-pricing-card-featured relative rounded-3xl bg-[#0E1017] border border-red-500/40 p-8 shadow-[0_20px_50px_-10px_rgba(239,68,68,0.25)] flex flex-col justify-between text-white transform lg:-translate-y-2 hover:-translate-y-3 transition-transform">
            
            {/* Most popular badge */}
            <div className="absolute top-6 right-6">
              <span className="text-[11px] font-bold text-white bg-gradient-to-r from-[#EF4444] to-[#DC2626] px-3.5 py-1 rounded-full shadow-md shadow-red-500/30">
                Most popular
              </span>
            </div>

            <div>
              <h3 className="text-2xl font-bold text-white">Workstation Pro</h3>
              <p className="text-xs text-neutral-400 mt-1 mb-6">
                Full autonomous Order-to-Cash intelligence.
              </p>

              <div className="flex items-baseline gap-1 mb-8">
                <span className="text-5xl font-extrabold text-white tracking-tight font-mono">${proPrice}</span>
                <span className="text-sm font-medium text-neutral-400">/ month</span>
              </div>

              <button
                onClick={onOpenWaitlist}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-b from-[#EF4444] to-[#DC2626] hover:from-[#DC2626] hover:to-[#B91C1C] text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-500/30 active:scale-[0.98] group"
              >
                <span>Upgrade to Pro</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>

              <div className="mt-8 space-y-3.5 text-xs sm:text-sm text-neutral-300">
                {[
                  "Unlimited invoice streams",
                  "Real-time Tally & Zoho live sync",
                  "Autonomous Causal Graph investigation",
                  "Cash Unblock Simulator & forecasting",
                  "Multi-channel automated dunning",
                  "Priority finance team support",
                ].map((feat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-[#EF4444] text-white flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* PLAN 3: ENTERPRISE */}
          <div className="landing-pricing-card bg-[#12141A] rounded-3xl border border-white/[0.08] p-8 shadow-sm flex flex-col justify-between hover:border-white/20 transition-all hover:-translate-y-1 text-white">
            <div>
              <div className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider text-neutral-400 bg-white/[0.04] mb-3 border border-white/10">
                Multi-Entity / ERP
              </div>
              <h3 className="text-2xl font-bold text-white">Enterprise Workstation</h3>
              <p className="text-xs text-neutral-400 mt-1 mb-6">
                Custom risk models, ERP webhooks, & multi-entity treasury.
              </p>

              <div className="mb-8">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold text-white tracking-tight font-mono tabular-nums">
                    ${bizPrice}
                  </span>
                  <span className="text-sm font-medium text-neutral-400">/ workstation seat</span>
                </div>
                <div className="text-[11px] font-mono text-neutral-400 mt-1">billed annually or monthly</div>
              </div>

              <button
                onClick={onOpenWaitlist}
                className="w-full py-3.5 px-4 rounded-xl border border-white/10 hover:border-white/20 hover:bg-white/[0.04] text-white font-semibold text-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <span>Contact enterprise sales</span>
              </button>

              <div className="mt-8 space-y-3.5 text-xs sm:text-sm text-neutral-300">
                {[
                  "Everything in Workstation Pro",
                  "Dedicated SAP, Oracle & NetSuite connectors",
                  "Multi-entity consolidation & custom approval floors",
                  "Custom SLA & dedicated technical account lead",
                  "On-premise / private VPC deployment options",
                  "SOC2 Type II & custom compliance covenants",
                ].map((feat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full bg-white/10 text-white flex items-center justify-center shrink-0">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
