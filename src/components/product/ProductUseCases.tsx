"use client";

import React, { useState } from "react";
import { BarChart3, Check, TrendingUp, ArrowRight } from "lucide-react";
import { SparkIcon } from "../landing/LandingLogos";

interface ProductUseCasesProps {
  onOpenWaitlist: () => void;
}

export function ProductUseCases({ onOpenWaitlist }: ProductUseCasesProps) {
  const [activeTab, setActiveTab] = useState("Sales Teams");

  const useCaseData: Record<
    string,
    {
      title: string;
      desc: string;
      checklist: string[];
      company: string;
      dealValue: string;
      intent: string;
      badgeTitle: string;
      badgeSub: string;
    }
  > = {
    "Sales Teams": {
      title: "Close more deals, faster.",
      desc: "Identify high-intent leads, get AI-drafted replies, and keep your pipeline moving without spending hours in your inbox.",
      checklist: [
        "Detect high-value leads",
        "Draft personalized replies",
        "Track conversations",
        "Improve response rates",
      ],
      company: "Acme Corp",
      dealValue: "$50K - $100K",
      intent: "Partnership",
      badgeTitle: "High intent lead",
      badgeSub: "Partnership opportunity",
    },
    Partnerships: {
      title: "Scale co-selling & integrations.",
      desc: "Prioritize strategic partner outreach, sync context with your team, and accelerate mutual collaboration without dropping threads.",
      checklist: [
        "Highlight strategic partner intros",
        "Auto-generate integration briefs",
        "Manage joint pipeline reviews",
        "Track multi-stakeholder updates",
      ],
      company: "Nexus Cloud",
      dealValue: "$120K ARR",
      intent: "Ecosystem Integration",
      badgeTitle: "Strategic partner",
      badgeSub: "Joint GTM inquiry",
    },
    Founders: {
      title: "Never drop an important thread.",
      desc: "Stay on top of investor updates, key customer inquiries, and critical hires without letting your inbox run your calendar.",
      checklist: [
        "Surface high-priority client emails",
        "Executive-style reply drafting",
        "Fast-track investor communications",
        "Zero unread inbox clutter",
      ],
      company: "Venture Partners",
      dealValue: "$2.5M Seed",
      intent: "Term Sheet Inquiry",
      badgeTitle: "Priority investor",
      badgeSub: "Follow-up required",
    },
    "Customer Success": {
      title: "Boost customer retention & NPS.",
      desc: "Catch renewal risks and expansion questions early. Provide rapid, accurate responses with full account history context.",
      checklist: [
        "Detect churn warning signals",
        "Instant answers to technical queries",
        "Automated renewal scheduling",
        "Contextual expansion suggestions",
      ],
      company: "Global Enterprise",
      dealValue: "$80K Renewal",
      intent: "Contract Expansion",
      badgeTitle: "Expansion lead",
      badgeSub: "50-seat add-on",
    },
  };

  const current = useCaseData[activeTab] || useCaseData["Sales Teams"];

  return (
    <section id="use-cases" className="py-20 md:py-28 bg-[#FFFFFF] text-neutral-900 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header Row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div>
            <div className="text-xs font-bold tracking-wider text-[#EF4444] uppercase mb-2">
              USE CASES
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-neutral-900 tracking-tight leading-tight">
              Built for business teams <br />
              that rely on email.
            </h2>
          </div>

          <p className="text-neutral-600 text-sm sm:text-base max-w-md leading-relaxed">
            Whether you&apos;re in sales, partnerships, or customer success, AIOSpark helps you respond faster and never miss an opportunity.
          </p>
        </div>

        {/* Tab Pills */}
        <div className="flex flex-wrap items-center gap-2.5 mb-10">
          {["Sales Teams", "Partnerships", "Founders", "Customer Success"].map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  isActive
                    ? "bg-[#07080B] text-white shadow-md"
                    : "bg-neutral-100 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200"
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Interactive Card Layout */}
        <div className="rounded-3xl border border-neutral-200/90 bg-gradient-to-br from-white via-white to-red-50/30 p-8 sm:p-12 shadow-[0_15px_40px_-15px_rgba(0,0,0,0.06)] relative overflow-hidden">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            
            {/* Left Column: Copy & Checklist */}
            <div className="lg:col-span-6 space-y-6">
              <div className="w-12 h-12 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-[#EF4444]">
                <BarChart3 className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-3">
                  {current.title}
                </h3>
                <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
                  {current.desc}
                </p>
              </div>

              {/* Checklist */}
              <div className="space-y-3 pt-2">
                {current.checklist.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#EF4444] text-white flex items-center justify-center shrink-0 shadow-sm">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span className="text-sm sm:text-base font-medium text-neutral-800">
                      {item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: 3D Opportunity Card & Floating Badge */}
            <div className="lg:col-span-6 relative flex items-center justify-center">
              
              {/* Main Opportunity Card */}
              <div className="w-full max-w-md bg-white rounded-2xl border border-neutral-200 p-6 sm:p-7 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.12)] space-y-5 relative">
                
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-900">Opportunity Detected</span>
                    <SparkIcon className="w-4 h-4 text-[#EF4444]" />
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-50 text-[#EF4444] border border-red-200 font-semibold">
                    New Lead
                  </span>
                </div>

                <p className="text-xs text-neutral-500">
                  This email looks like a potential deal.
                </p>

                {/* Structured Key Values */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-neutral-50">
                    <span className="text-neutral-400">Company</span>
                    <span className="font-bold text-neutral-900">{current.company}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-neutral-50">
                    <span className="text-neutral-400">Deal Value</span>
                    <span className="font-bold font-mono text-emerald-600">{current.dealValue}</span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-neutral-400">Intent</span>
                    <span className="font-semibold text-neutral-800">{current.intent}</span>
                  </div>
                </div>

                {/* Red CTA Button */}
                <button
                  onClick={onOpenWaitlist}
                  className="w-full py-3 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-red-500/20 transition-all cursor-pointer active:scale-95"
                >
                  <span>View Opportunity</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Overlapping Floating Badge */}
              <div
                onClick={onOpenWaitlist}
                className="absolute -bottom-5 -right-2 sm:-bottom-4 sm:right-2 bg-white rounded-xl border border-neutral-200/90 px-3.5 py-2.5 shadow-xl flex items-center gap-3 cursor-pointer hover:scale-105 transition-transform"
              >
                <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center text-[#EF4444] shrink-0">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-neutral-900">{current.badgeTitle}</div>
                  <div className="text-[10px] text-neutral-500">{current.badgeSub}</div>
                </div>
              </div>

            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
