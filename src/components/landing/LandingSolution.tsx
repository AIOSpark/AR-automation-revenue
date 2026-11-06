"use client";

import React from "react";
import { Mail, BarChart3, ShieldCheck, RefreshCw } from "lucide-react";

export function LandingSolution() {
  const capabilities = [
    {
      icon: Mail,
      title: "Smart Multi-Channel Dunning",
      desc: "Personalized, policy-gated follow-ups across email and WhatsApp based on debtor payment habits.",
    },
    {
      icon: RefreshCw,
      title: "Root-Cause Discrepancy Resolution",
      desc: "Instantly matches PO lines, tax rates, and delivery receipts (POD) to eliminate payment disputes.",
    },
    {
      icon: BarChart3,
      title: "Live Cash Flow Telemetry",
      desc: "Real-time DSO velocity tracking and aging bracket analytics with daily executive CFO briefings.",
    },
    {
      icon: ShieldCheck,
      title: "Direct General Ledger Sync",
      desc: "Cleared receipts post automatically back into Tally, Zoho Books, SAP, QuickBooks, and Xero.",
    },
  ];

  return (
    <section id="solution" className="py-20 md:py-28 bg-transparent text-white border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="max-w-3xl mb-14 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[11px] font-mono font-bold text-[#EF4444] uppercase tracking-wider">
            <span>AUTONOMOUS ENGINE</span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-bold text-white tracking-tight leading-[1.15]">
            Everything you need <br />
            <span className="font-serif-editorial font-normal text-neutral-300">
              to get paid, on autopilot.
            </span>
          </h2>

          <p className="text-neutral-300 text-base sm:text-lg leading-relaxed font-normal">
            AIOSpark eliminates manual receivables friction from invoice issuance to final reconciliation.
          </p>
        </div>

        {/* 4 Clean Capability Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {capabilities.map((cap, idx) => {
            const Icon = cap.icon;
            return (
              <div
                key={idx}
                className="landing-feature-card p-6 rounded-2xl bg-[#12141A] border border-white/[0.08] flex flex-col justify-between h-56"
              >
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[#EF4444]">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm sm:text-base font-bold text-white">
                    {cap.title}
                  </h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    {cap.desc}
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
