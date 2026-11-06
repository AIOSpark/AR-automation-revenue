"use client";

import { useState } from "react";
import { Building2, AlertTriangle, FileText, DollarSign, MessageSquare, History, ShieldAlert } from "lucide-react";

export function Customer360Section() {
  const [activeTab, setActiveTab] = useState<string>("Exceptions");

  const tabs = [
    { id: "Invoices", label: "Invoices (14)", icon: FileText },
    { id: "Payments", label: "Payments", icon: DollarSign },
    { id: "Disputes", label: "Disputes (1)", icon: AlertTriangle },
    { id: "Communication", label: "Communication", icon: MessageSquare },
    { id: "Promises", label: "Promises (2)", icon: History },
    { id: "Exceptions", label: "Exceptions (3)", icon: ShieldAlert },
  ];

  return (
    <section className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            Customer 360 Account Intelligence <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              Multi-dimensional ledger visibility before action.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            Gain complete audit visibility into every B2B buyer account before making collection or credit decisions.
          </p>
        </div>

        {/* Customer Profile Card */}
        <div className="workstation-card border border-white/[0.1] p-6 sm:p-8 shadow-2xl">
          {/* Header Profile Info */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-white/[0.08]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white font-bold text-xl font-mono">
                ABC
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-2xl font-bold text-white">ABC Industries Ltd</h3>
                  <span className="px-2.5 py-0.5 rounded bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/30 text-xs font-bold font-mono">
                    High Risk Account
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-mono">
                  Enterprise Account • GSTIN: 27AAACA00001Z5 • ERP ID: ACC-9921
                </p>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              <div className="p-3 rounded-xl bg-[#0A0B0E] border border-white/[0.08]">
                <span className="text-[10px] text-neutral-400 block font-sans">Outstanding</span>
                <span className="text-lg font-bold text-white font-mono-num">₹82 L</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0A0B0E] border border-white/[0.08]">
                <span className="text-[10px] text-neutral-400 block font-sans">Overdue</span>
                <span className="text-lg font-bold text-amber-400 font-mono-num">₹31 L</span>
              </div>
              <div className="p-3 rounded-xl bg-[#0A0B0E] border border-white/[0.08]">
                <span className="text-[10px] text-neutral-400 block font-sans">Avg Payment</span>
                <span className="text-lg font-bold text-neutral-200 font-mono-num">47 Days</span>
              </div>
              <div className="p-3 rounded-xl bg-[#181B23] border border-[#FF3B30]/40">
                <span className="text-[10px] text-[#FF3B30] block font-sans font-bold">Open Blockers</span>
                <span className="text-lg font-bold text-[#FF3B30] font-mono-num">3 Active</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pt-6 pb-4 border-b border-white/[0.08]">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                    isActive
                      ? "btn-editorial-primary text-white"
                      : "bg-[#0A0B0E] text-neutral-400 hover:text-white border border-white/[0.08]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Display */}
          <div className="mt-6 p-6 rounded-2xl bg-[#0A0B0E] border border-white/[0.08] font-mono text-xs">
            {activeTab === "Exceptions" && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-xl bg-[#12141A] border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3 font-sans">
                    <span className="w-2 h-2 rounded-full bg-[#FF3B30]" />
                    <span className="font-bold text-white font-mono-num">INV-8802 (₹14,50,000)</span>
                    <span className="text-neutral-400 text-xs">— Tax Deducted at Source (TDS) Certificate Missing</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-[#FF3B30]/20 text-[#FF3B30] font-bold text-[10px] border border-[#FF3B30]/30 font-mono">High Priority</span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#12141A] border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3 font-sans">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="font-bold text-white font-mono-num">INV-8791 (₹11,00,000)</span>
                    <span className="text-neutral-400 text-xs">— PO Line Item #3 Unit Rate Discrepancy</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] border border-amber-500/30 font-mono">Medium Priority</span>
                </div>

                <div className="p-3.5 rounded-xl bg-[#12141A] border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3 font-sans">
                    <span className="w-2 h-2 rounded-full bg-blue-400" />
                    <span className="font-bold text-white font-mono-num">INV-8650 (₹5,50,000)</span>
                    <span className="text-neutral-400 text-xs">— Vendor Portal Invoice Resubmission Pending</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold text-[10px] border border-blue-500/30 font-mono">Escalated</span>
                </div>
              </div>
            )}

            {activeTab !== "Exceptions" && (
              <div className="py-8 text-center text-neutral-400 font-sans">
                Showing synchronized ledger data for <span className="text-white font-bold">{activeTab}</span> (14 active records live from ERP).
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
