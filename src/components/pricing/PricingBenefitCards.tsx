"use client";

import React from "react";
import { Zap, CreditCard, Users, ShieldCheck } from "lucide-react";

export function PricingBenefitCards() {
  const benefits = [
    {
      icon: Zap,
      title: "Real-Time ERP Ingestion",
      subtitle: "Bi-directional ledger sync with Tally, Zoho, and standard bank statement feeds.",
    },
    {
      icon: CreditCard,
      title: "Causal Root-Cause Telemetry",
      subtitle: "Automatic graph tracing isolating missing PO lines, tax mismatches, and GRN delays.",
    },
    {
      icon: Users,
      title: "Human Approval Floor",
      subtitle: "Zero unreviewed outbound communications above custom dispute tolerance thresholds.",
    },
    {
      icon: ShieldCheck,
      title: "Audit-Grade Governance",
      subtitle: "Immutable event logs, multi-tenant row-level security, and SOC2 compliant telemetry.",
    },
  ];

  return (
    <section className="py-12 md:py-16 bg-[#FAFAF9] text-neutral-900 border-b border-neutral-200/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {benefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-neutral-200/90 p-6 shadow-sm hover:border-[#EF4444]/40 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-[#EF4444] mb-4">
                  <Icon className="w-5 h-5 stroke-[2]" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-neutral-900 mb-1.5 tracking-tight">
                    {b.title}
                  </h4>
                  <p className="text-xs text-neutral-600 leading-relaxed">
                    {b.subtitle}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
