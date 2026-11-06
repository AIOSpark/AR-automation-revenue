"use client";

import { FileSearch, AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

interface InvoiceIntelligenceDemoProps {
  onOpenWaitlist: () => void;
}

export function InvoiceIntelligenceDemo({ onOpenWaitlist }: InvoiceIntelligenceDemoProps) {
  return (
    <section className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            Drill down into any blocked invoice <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              with audit-grade causal transparency.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            Automatically extracts evidence across ERPs, buyer POs, and email threads to explain why payment is delayed.
          </p>
        </div>

        {/* Interactive Invoice Modal Simulation */}
        <div className="max-w-4xl mx-auto workstation-card border border-white/[0.1] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Top Invoice Metadata Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#FF3B30]/10 border border-[#FF3B30]/30 flex items-center justify-center text-[#FF3B30]">
                <FileSearch className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-white font-mono">INV-1021</h3>
                  <span className="px-2.5 py-0.5 rounded bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/30 font-bold text-xs font-mono">
                    Payment Blocked
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Buyer Account: <span className="text-white font-medium">Apex Tech Logistics Pvt Ltd</span> • Overdue: 24 Days
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right font-mono">
              <span className="text-xs text-neutral-400 block font-mono">Billed Amount</span>
              <span className="text-2xl font-bold text-white font-mono-num">₹18,00,000</span>
            </div>
          </div>

          {/* AIOSpark Analysis Box */}
          <div className="mt-6 p-5 rounded-2xl bg-[#0A0B0E] border border-white/[0.08]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#FF3B30]" />
                <span className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                  AIOSpark Automated Diagnosis
                </span>
              </div>
              <div className="flex items-center gap-1 text-xs text-emerald-400 font-mono font-bold bg-emerald-500/10 px-2.5 py-1 rounded border border-emerald-500/20">
                Confidence: 99.4%
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-5">
              <div className="p-4 rounded-xl bg-[#12141A] border border-white/[0.06]">
                <span className="text-xs text-neutral-400 block font-medium">Detected Blocker Type</span>
                <span className="text-base font-bold text-[#FF3B30] mt-1 block">PO Line Qty Discrepancy</span>
              </div>

              <div className="p-4 rounded-xl bg-[#12141A] border border-white/[0.06]">
                <span className="text-xs text-neutral-400 block font-medium">PO vs Billed Check</span>
                <span className="text-sm font-mono-num font-bold text-white mt-1 block">
                  PO Qty: <span className="text-amber-400">950</span> | Billed Qty: <span className="text-rose-400">1,000</span>
                </span>
              </div>

              <div className="p-4 rounded-xl bg-[#12141A] border border-white/[0.06]">
                <span className="text-xs text-neutral-400 block font-medium">AP Portal Gate Status</span>
                <span className="text-sm font-bold text-neutral-200 mt-1 block">
                  Stalled at AP Intake Rules
                </span>
              </div>
            </div>

            {/* Recommended Action Card */}
            <div className="p-4 rounded-xl bg-[#181B23] border border-white/[0.08] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#FF3B30] shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 block font-bold">
                    Recommended Policy Action
                  </span>
                  <p className="text-sm font-medium text-white mt-0.5">
                    "Issue 50-unit credit note adjustment to match buyer PO #8821 and resubmit."
                  </p>
                </div>
              </div>

              <Link
                href="/investigations"
                className="btn-editorial-primary px-5 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 shrink-0"
              >
                <span>Launch Full Audit</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
