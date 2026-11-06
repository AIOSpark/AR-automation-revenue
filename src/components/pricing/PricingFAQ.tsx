"use client";

import React, { useState } from "react";
import { Plus, Minus, ArrowRight } from "lucide-react";

export function PricingFAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const faqs = [
    {
      q: "Can I change my plan later?",
      a: "Yes, you can upgrade, downgrade, or cancel your plan at any time from your account settings. Prorated adjustments are applied automatically.",
    },
    {
      q: "What happens if I exceed my limit?",
      a: "If you exceed your monthly invoice volume, you will receive an alert and the option to upgrade to Pro for higher limits. We never pause active collections workflows on critical invoices.",
    },
    {
      q: "Is there a free trial?",
      a: "Yes! All paid plans come with a 14-day free trial with no credit card required so you can experience autonomous AR dunning and root-cause resolution risk-free.",
    },
    {
      q: "Is my data secure?",
      a: "AIOSpark complies with SOC 2 standards and GDPR. We never use your confidential financial data to train public foundation models, and all communications are encrypted in transit and at rest.",
    },
    {
      q: "Do you offer annual discounts?",
      a: "Yes, choosing annual billing saves you 20% on Pro and Business plans compared to month-to-month subscriptions.",
    },
    {
      q: "Do you support teams?",
      a: "Absolutely. Our Business plan is designed for multi-user finance teams with collaborative AR workstation access, role-based controls, and seamless ERP/accounting integrations.",
    },
  ];

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-20 md:py-28 bg-[#FFFFFF] text-neutral-900 border-t border-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
          <div>
            <div className="text-xs font-bold tracking-wider text-[#EF4444] uppercase mb-2">
              FAQ
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-neutral-900 tracking-tight">
              Common questions.
            </h2>
          </div>

          <div>
            <a
              href="#faq"
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#EF4444] hover:text-[#DC2626] transition-colors group"
            >
              <span>View all FAQs</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </a>
          </div>
        </div>

        {/* 2-Column FAQ Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {faqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                onClick={() => toggle(idx)}
                className={`rounded-xl border transition-all cursor-pointer p-4 sm:p-5 ${
                  isOpen
                    ? "bg-neutral-50/70 border-neutral-300 shadow-sm"
                    : "bg-white border-neutral-200/90 hover:border-neutral-300"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-neutral-900">
                    {faq.q}
                  </span>
                  <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 shrink-0">
                    {isOpen ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  </div>
                </div>

                {isOpen && (
                  <p className="mt-3 text-xs sm:text-sm text-neutral-600 leading-relaxed border-t border-neutral-200/60 pt-3 animate-in fade-in duration-200">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
