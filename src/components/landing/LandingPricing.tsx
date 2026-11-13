"use client";

import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useReveal } from "./useReveal";

const MONTHLY = {
  starter: "15,000",
  pro: "25,000",
  enterprise: null,
};
const YEARLY = {
  starter: "1,44,000",
  pro: "2,40,000",
  enterprise: null,
};

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    for: "Small finance teams starting to automate collections",
    isPopular: false,
    cta: "Start with Starter",
    micro: "No credit card &middot; Setup in under 7 days",
    features: [
      "Up to 500 invoices / month",
      "AI root-cause detection",
      "ERP sync (Tally / Zoho Books)",
      "Automated reminder workflows",
      "Standard policy templates",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    for: "Growing teams that want full autonomy with control",
    isPopular: true,
    cta: "Get Pro",
    micro: "No credit card &middot; Setup in under 7 days",
    features: [
      "Everything in Starter, plus:",
      "Unlimited invoices / month",
      "Autonomous dispatch with approval controls",
      "Custom policy rules",
      "SAP / Oracle / QuickBooks integrations",
      "Prioritized recovery queue",
      "Causal-graph analysis",
      "Dedicated onboarding",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    for: "Large organisations with complex ERP and compliance needs",
    isPopular: false,
    cta: "Talk to sales",
    micro: "Custom SLA &middot; Security review &middot; SSO & RBAC",
    features: [
      "Everything in Pro, plus:",
      "Custom integrations",
      "SSO and role-based access",
      "Private cloud or on-prem deployment",
      "Dedicated success manager",
      "SLA-backed support",
      "Security review",
    ],
  },
];

export function LandingPricing() {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  useReveal();
  const prices = cycle === "monthly" ? MONTHLY : YEARLY;
  const unit = cycle === "monthly" ? "/ month" : "/ year";

  return (
    <section id="pricing" className="aios-section">
      <div className="aios-container">
        <div className="mx-auto text-center mb-6" data-aios-reveal id="pricing-eyebrow">
          <div className="aios-label mb-5 inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D]" />
            Transparent pricing in INR
          </div>
        </div>

        <div className="mx-auto text-center mb-10 sm:mb-12" data-aios-reveal id="pricing-copy">
          <h2 className="mb-5 tracking-tight">Simple, predictable pricing</h2>
          <p className="aios-body mx-auto">
            All prices in INR, exclusive of GST. 14-day pilot available. Cancel
            anytime.
          </p>

          <div
            className="inline-flex items-center p-1.5 rounded-md bg-white/[0.03] border border-white/[0.06] mt-10"
            data-aios-reveal
            id="pricing-toggle"
          >
            <button
              onClick={() => setCycle("monthly")}
              aria-pressed={cycle === "monthly"}
              className={`min-h-[44px] px-6 py-2 rounded-md text-sm font-semibold transition-all cursor-pointer ${cycle === "monthly" ? "bg-[#FF2D2D] text-white shadow-md shadow-red-500/20" : "text-[#A1A1AA] hover:text-[#FFFFFF]"}`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("yearly")}
              aria-pressed={cycle === "yearly"}
              className={`min-h-[44px] px-6 py-2 rounded-md text-sm font-semibold transition-all cursor-pointer flex items-center gap-2 ${cycle === "yearly" ? "bg-[#FF2D2D] text-white shadow-md shadow-red-500/20" : "text-[#A1A1AA] hover:text-[#FFFFFF]"}`}
            >
              <span>Yearly</span>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border transition-all ${cycle === "yearly" ? "text-white bg-white/20 border-white/20" : "text-[#FF2D2D] bg-[#FF2D2D]/10 border-[#FF2D2D]/25"}`}>
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="mx-auto" data-aios-reveal id="pricing-cards">
          <div className="grid grid-cols-1 gap-4 md:gap-8 items-start">
            {PLANS.map((plan) => {
              const price = prices[plan.id as keyof typeof prices];
              const isPopular = plan.isPopular;
              const custom = price === null;
              return (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-lg border border-white/[0.06] bg-[#0A0A0A] transition-colors hover:border-white/[0.12] ${isPopular ? "lg:-mt-4 z-10 border-2 border-[#FF2D2D]/40 shadow-[0_0_50px_rgba(255,45,45,0.12)]" : "border border-white/[0.09]"}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 lg:block hidden">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-white uppercase tracking-wider px-3 py-1 rounded-md bg-[#FF2D2D] border border-[#FF2D2D]/50 shadow-lg shadow-red-500/30">
                        <Sparkles className="w-3 h-3" />
                        Most popular
                      </span>
                    </div>
                  )}

                  <div className="p-6 sm:p-8 flex-1 flex flex-col">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold tracking-tight text-white">
                        {plan.name}
                      </h3>
                      <p className="text-[13px] text-[#A1A1AA] mt-1.5 leading-snug">
                        {plan.for}
                      </p>
                    </div>

                    <div className="flex items-baseline gap-1 mb-7 border-b border-white/[0.06] pb-5">
                      <span className={`text-2xl sm:text-[36px] font-extrabold tabular-nums tracking-tight leading-none ${custom ? "text-[#71717A]" : "text-white"}`}>
                        {custom ? "Custom" : `₹${price}`}
                      </span>
                      {!custom && (
                        <span className={`text-[14px] text-[#71717A]`}>
                          {unit}
                        </span>
                      )}
                    </div>

                    <div className="space-y-3 mb-auto flex-1">
                      <span className="text-[11px] font-mono font-bold text-[#71717A] uppercase tracking-wider block mb-3">
                        Includes
                      </span>
                      {plan.features.map((feature, i) => (
                        <div key={i} className="flex items-start gap-2.5 min-h-[24px]">
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isPopular ? "bg-[#FF2D2D]/15 text-[#FF2D2D] border border-[#FF2D2D]/30" : "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/25"}`}>
                            <span className="text-[10px]">{isPopular ? "+" : "&#10003;"}</span>
                          </div>
                          <span className={`text-[14px] ${i === 0 && !isPopular ? "text-[#71717A]" : "text-[#A1A1AA]"} leading-snug`}>
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      className={`w-full min-h-[48px] py-3 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 mt-6 ${isPopular ? "bg-[#FF2D2D] text-white shadow-lg shadow-red-500/30 hover:bg-[#E51C1C]" : "bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.12] text-white"}`}
                    >
                      <span>{plan.cta}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>

                    <p className={`mt-5 aios-micro-trust ${plan.micro ? "" : "hidden"}`}>
                      {plan.micro}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-12 sm:mt-16 border-t border-white/[0.06] pt-10" data-aios-reveal id="pricing-footer">
          <div className="mx-auto text-center space-y-4 max-w-2xl">
            <p className="text-[13px] text-[#71717A] font-mono">
              All prices in INR, exclusive of GST. 14-day pilot available. Cancel anytime.
            </p>
            <p className="text-[14px] text-[#A1A1AA] font-medium leading-snug">
              Pro pays for itself if it recovers just one delayed ₹2 Cr invoice.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}