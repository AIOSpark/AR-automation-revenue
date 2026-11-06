"use client";

import React, { useState } from "react";
import { ArrowRight, Check, Zap, Sparkles } from "lucide-react";

interface LandingPricingProps {
  onOpenWaitlist: () => void;
}

const MONTHLY_PRICES = {
  starter: "₹0",
  pro: "₹14,999",
  enterprise: "Custom",
};

const YEARLY_PRICES = {
  starter: "₹0",
  pro: "₹11,999",
  enterprise: "Custom",
};

const PLANS = [
  {
    id: "starter",
    name: "Starter Pilot",
    for: "Finance teams evaluating automated AR",
    period: "/ month to start",
    cta: "Apply for pilot access",
    isPopular: false,
    features: [
      "Up to ₹25L receivables monitored",
      "AI root-cause detection (read-only)",
      "Cash recovery priority queue",
      "Tally & Zoho Books read connectors",
      "Policy-guided email draft templates",
      "2 guided onboarding team sessions",
    ],
  },
  {
    id: "pro",
    name: "Workstation Pro",
    for: "Growing finance teams executing collections",
    period: "/ month",
    cta: "Get early access",
    isPopular: true,
    features: [
      "Unlimited receivables monitored",
      "Autonomous recovery queue + dispatch",
      "Configurable policy approval engine",
      "Bidirectional ERP write-back & sync",
      "Multi-entity & GST sub-accounts",
      "Dedicated finance AI customer engineer",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    for: "Multi-entity conglomerates & high-AUM treasury",
    period: "Custom billing",
    cta: "Contact enterprise team",
    isPopular: false,
    features: [
      "Custom causal risk & scoring models",
      "SAP, Oracle & Microsoft Dynamics",
      "REST Webhook & direct banking APIs",
      "Custom multi-tier approval workflows",
      "Dedicated VPC or on-prem deployment",
      "24/7 SLA support + DPDP compliance audit",
    ],
  },
];

export function LandingPricing({ onOpenWaitlist }: LandingPricingProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const prices = billingCycle === "monthly" ? MONTHLY_PRICES : YEARLY_PRICES;

  return (
    <section
      id="pricing"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">

        {/* Section Header */}
        <div className="max-w-2xl mx-auto text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D7192D] animate-pulse" />
            <span>TRANSPARENT PRICING</span>
          </div>

          <h2
            className="pt-1 font-bold text-white tracking-[-0.04em] mb-4"
            style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", lineHeight: "1.15" }}
          >
            Simple entry.
            <span className="text-neutral-400 font-normal">Scale into autonomy.</span>
          </h2>

          <p className="text-neutral-300 text-base sm:text-lg leading-relaxed mb-8 max-w-xl mx-auto">
            All plans include full policy controls and guided onboarding. All prices in INR — confirmed during team pilot validation.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center p-1.5 rounded-full bg-white/[0.04] border border-white/[0.10]">
            <button
              onClick={() => setBillingCycle("monthly")}
              aria-pressed={billingCycle === "monthly"}
              className={`min-h-[44px] px-6 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer ${billingCycle === "monthly" ? "bg-[#D7192D] text-white shadow-md shadow-red-500/20" : "text-neutral-400 hover:text-white"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              aria-pressed={billingCycle === "yearly"}
              className={`min-h-[44px] px-6 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${billingCycle === "yearly" ? "bg-[#D7192D] text-white shadow-md shadow-red-500/20" : "text-neutral-400 hover:text-white"}`}
            >
              <span>Yearly</span>
              <span
                className={`text-[12px] font-bold px-2 py-0.5 rounded-full border transition-all ${billingCycle === "yearly" ? "text-white bg-white/20 border-white/20" : "text-[#D7192D] bg-red-500/10 border-red-500/25"}`}
              >
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* Plan Cards Grid: Workstation Pro highlighted as Most Popular and slightly larger */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center max-w-6xl mx-auto">
          {PLANS.map((plan) => {
            const price = prices[plan.id as keyof typeof prices];
            const isPopular = plan.isPopular;

            return (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl p-7 sm:p-8 transition-all duration-300 ${isPopular ? "lg:-my-3 lg:py-10 border-2 border-[#D7192D]/70 bg-[#090A0E] shadow-[0_0_50px_rgba(215,25,32,0.16)] z-10" : "border border-white/[0.09] bg-[#090A0D] hover:border-white/[0.18]"}`}
              >
                {/* Most Popular Badge */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-mono font-bold text-white uppercase tracking-wider px-3.5 py-1 rounded-full bg-[#D7192D] border border-red-400 shadow-md shadow-red-500/30">
                      <Sparkles className="w-3.5 h-3.5" />
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan Header */}
                <div className="mb-4">
                  <h3 className={`text-2xl font-bold tracking-tight ${isPopular ? "text-white" : "text-white"}`}>
                    {plan.name}
                  </h3>
                  <p className="text-[13px] text-neutral-400 mt-1 min-h-[36px] leading-snug">
                    {plan.for}
                  </p>
                </div>

                {/* Price Display */}
                <div className="flex items-baseline gap-1.5 pb-6 mb-6 border-b border-white/[0.08]">
                  <span className="text-4xl sm:text-5xl font-extrabold text-white tabular-nums tracking-tight">
                    {price}
                  </span>
                  <span className="text-sm text-neutral-400">{plan.period}</span>
                </div>

                {/* 6 Features with Consistent Row Alignment */}
                <div className="space-y-3.5 mb-8 flex-1">
                  <span className="text-[12px] font-mono font-bold text-neutral-400 uppercase tracking-wider block mb-2">
                    Included capabilities:
                  </span>
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3 min-h-[28px]">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isPopular ? "bg-[#D7192D]/15 text-[#D7192D] border border-[#D7192D]/30" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"}`}
                      >
                        <Check className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-[13px] sm:text-[14px] text-neutral-200 leading-snug">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <button
                  onClick={onOpenWaitlist}
                  className={`w-full min-h-[48px] py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${isPopular ? "bg-[#D7192D] text-white shadow-lg shadow-red-500/30 hover:bg-[#E51C1C]" : "bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.12] text-white"}`}
                >
                  <span>{plan.cta}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>

        <p className="text-center text-[12px] text-neutral-400 mt-10 font-mono">
          All plans include full policy audit logs · DPDP Act compliant · 30-day notice to cancel
        </p>
      </div>
    </section>
  );
}