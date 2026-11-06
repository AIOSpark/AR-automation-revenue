"use client";

import React from "react";
import { Mail, Clock, AlertTriangle, FileSpreadsheet, CheckCircle2 } from "lucide-react";

export function LandingProblem() {
  return (
    <section id="problem" className="py-20 md:py-28 bg-[#07080B] text-white border-t border-white/[0.06] relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* LEFT: COPY & 3 CLEAN PROBLEM CARDS */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[11px] font-mono font-bold text-[#EF4444] uppercase tracking-wider">
              <span>THE OPERATIONAL BOTTLENECK</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-bold text-white tracking-tight leading-[1.15]">
              Buyers delay payments. <br />
              <span className="font-serif-editorial font-normal text-neutral-300">
                You lose working capital and hours.
              </span>
            </h2>

            <p className="text-neutral-300 text-base sm:text-lg leading-relaxed max-w-xl font-normal">
              Manual email chasing, misplaced invoices, and unflagged PO discrepancies make it impossible to forecast cash accurately.
            </p>

            {/* 3 PROBLEM CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 max-w-2xl">
              <div className="landing-feature-card bg-[#12141A] rounded-xl border border-white/[0.08] p-4 flex flex-col justify-between h-32">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[#EF4444]">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-white">Follow-up fatigue</div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">Repetitive dunning emails</div>
                </div>
              </div>

              <div className="landing-feature-card bg-[#12141A] rounded-xl border border-white/[0.08] p-4 flex flex-col justify-between h-32">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-white">Zero root-cause visibility</div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">PO & tax mismatch blindness</div>
                </div>
              </div>

              <div className="landing-feature-card bg-[#12141A] rounded-xl border border-white/[0.08] p-4 flex flex-col justify-between h-32">
                <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-[#EF4444]">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-white">Delayed buyer disputes</div>
                  <div className="text-[11px] text-neutral-400 mt-0.5">Entire invoice held for 1 line</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: CLEAN EXCEPTION DIAGNOSIS WORKSTATION CARD */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-[#0E1017] border border-white/10 p-6 shadow-2xl space-y-4">
              
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                <div className="space-y-0.5">
                  <div className="text-xs font-mono text-neutral-400">Invoice #1042 • Acme Corp</div>
                  <div className="text-lg font-bold font-mono text-white">₹1,20,000</div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-red-500/15 text-[#EF4444] border border-red-500/30 text-xs font-semibold">
                  14 Days Overdue
                </span>
              </div>

              {/* Diagnosis Details */}
              <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Root Cause Detected: PO Line 4 Tax Code Mismatch</span>
                </div>
                <p className="text-xs text-neutral-300 leading-relaxed">
                  Buyer accounts payable rejected invoice due to GST rate discrepancy on line item 4. AIOSpark auto-reconciled with original buyer PO.
                </p>
              </div>

              {/* AI Auto-Fix Proof */}
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="text-xs text-emerald-300 truncate">
                    Tax code aligned • Revised invoice prepared
                  </div>
                </div>
                <span className="text-[11px] font-mono text-emerald-400 font-semibold shrink-0">
                  Ready to Send
                </span>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
