"use client";

import React from "react";
import { Check } from "lucide-react";

export function PricingComparisonTable() {
  const comparisonRows = [
    { feature: "Monthly Invoice Processing Volume", free: "Up to 250", pro: "Unlimited", biz: "Enterprise Scale" },
    { feature: "ERP Sync (Tally, Zoho Books, Busy)", free: "1 Connector", pro: "Real-time Live Sync", biz: "Custom ERP & SAP" },
    { feature: "Discrepancy & PO Line Mismatch Engine", free: "Standard (Rule-based)", pro: "Autonomous ML", biz: "Custom Causal Models" },
    { feature: "Autonomous Causal Root-Cause Graph", free: false, pro: true, biz: true },
    { feature: "Cash Unblock Simulator & Forecasting", free: false, pro: true, biz: true },
    { feature: "Multi-Channel Dunning (Email, WhatsApp)", free: "Email only", pro: true, biz: true },
    { feature: "Human-in-the-Loop Approval Queue", free: true, pro: true, biz: true },
    { feature: "Multi-Tenant Row-Level Security (RLS)", free: true, pro: true, biz: true },
    { feature: "Audit-Grade Dispute Resolution Trail", free: "30-day retention", pro: "1-year retention", biz: "Unlimited / SOC2" },
    { feature: "Dedicated Treasury Solutions Architect", free: false, pro: false, biz: true },
  ];

  const renderCell = (val: string | boolean) => {
    if (typeof val === "boolean") {
      return val ? (
        <Check className="w-4 h-4 text-[#EF4444] mx-auto stroke-[2.5]" />
      ) : (
        <span className="text-neutral-300 font-mono text-xs">—</span>
      );
    }
    return <span className="text-neutral-800 font-medium text-xs sm:text-sm font-mono">{val}</span>;
  };

  return (
    <section className="py-16 md:py-24 bg-[#FFFFFF] text-neutral-900 border-t border-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Container Box */}
        <div className="rounded-3xl border border-neutral-200/90 bg-white p-6 sm:p-10 lg:p-12 shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            
            {/* Left Header Column */}
            <div className="lg:col-span-4 space-y-3">
              <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider text-[#EF4444] bg-red-50 border border-red-200">
                CAPABILITY MATRIX
              </div>
              <h3 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight font-serif-editorial">
                Workstation <span className="italic font-normal">capability matrix</span>
              </h3>
              <p className="text-neutral-500 text-xs sm:text-sm leading-relaxed max-w-sm">
                Every tier is architected with audit-level integrity, safe human approval floors, and high-frequency ledger synchronization.
              </p>
            </div>

            {/* Right Comparison Table */}
            <div className="lg:col-span-8 overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200/90 text-xs font-mono uppercase tracking-wider text-neutral-600">
                    <th className="py-3.5 pr-4 font-semibold">Specification</th>
                    <th className="py-3.5 px-4 text-center w-28">Starter</th>
                    <th className="py-3.5 px-4 text-center w-32 text-[#EF4444] bg-red-50/50 rounded-t-xl">Pro</th>
                    <th className="py-3.5 px-4 text-center w-32">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 text-xs sm:text-sm">
                  {comparisonRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="py-3.5 pr-4 text-neutral-700 font-medium">{row.feature}</td>
                      <td className="py-3.5 px-4 text-center">{renderCell(row.free)}</td>
                      <td className="py-3.5 px-4 text-center bg-red-50/30 font-semibold">{renderCell(row.pro)}</td>
                      <td className="py-3.5 px-4 text-center">{renderCell(row.biz)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </div>
        </div>

      </div>
    </section>
  );
}
