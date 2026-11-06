"use client";

import { useState } from "react";
import { Calculator, ArrowRight, Info, DollarSign } from "lucide-react";

interface CalculatorSectionProps {
  onOpenWaitlist: () => void;
}

export function CalculatorSection({ onOpenWaitlist }: CalculatorSectionProps) {
  const [annualRevenue, setAnnualRevenue] = useState<number>(50); // in Cr ₹
  const [outstandingAR, setOutstandingAR] = useState<number>(10); // in Cr ₹
  const [avgPaymentDays, setAvgPaymentDays] = useState<number>(65); // days
  const [overduePercent, setOverduePercent] = useState<number>(25); // %

  // Calculations
  const trappedCapital = ((outstandingAR * overduePercent) / 100).toFixed(2);
  const potentialDsoReduction = Math.round(avgPaymentDays * 0.28); // ~28% DSO improvement estimate
  const annualCarryingCostSaved = ((Number(trappedCapital) * 0.10) * 100).toFixed(1); // 10% cost of capital in Lakhs ₹

  return (
    <section className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            How much working capital is locked <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              in your receivables right now?
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            Adjust your enterprise parameters below to calculate trapped cash and potential DSO acceleration.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center workstation-card p-6 sm:p-10 border border-white/[0.1] shadow-2xl">
          {/* Inputs Column */}
          <div className="lg:col-span-7 space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <span className="text-xs font-mono uppercase tracking-wider text-neutral-300 font-bold flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[#FF3B30]" />
                Financial Parameters Input
              </span>
              <span className="text-[11px] font-mono text-neutral-400">Currency: INR (₹)</span>
            </div>

            {/* Input 1: Annual B2B Revenue */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="text-neutral-300 font-medium">Annual B2B Revenue</label>
                <span className="text-white font-mono-num font-bold text-sm bg-white/[0.05] px-2.5 py-0.5 rounded border border-white/[0.08]">₹{annualRevenue} Cr</span>
              </div>
              <input
                type="range"
                min="5"
                max="500"
                step="5"
                value={annualRevenue}
                onChange={(e) => setAnnualRevenue(Number(e.target.value))}
                className="w-full h-2 bg-[#181B23] rounded-lg appearance-none cursor-pointer accent-[#FF3B30]"
              />
            </div>

            {/* Input 2: Outstanding Receivables */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="text-neutral-300 font-medium">Outstanding Accounts Receivable</label>
                <span className="text-white font-mono-num font-bold text-sm bg-white/[0.05] px-2.5 py-0.5 rounded border border-white/[0.08]">₹{outstandingAR} Cr</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={outstandingAR}
                onChange={(e) => setOutstandingAR(Number(e.target.value))}
                className="w-full h-2 bg-[#181B23] rounded-lg appearance-none cursor-pointer accent-[#FF3B30]"
              />
            </div>

            {/* Input 3: Avg Payment Period */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="text-neutral-300 font-medium">Average Days Sales Outstanding (DSO)</label>
                <span className="text-white font-mono-num font-bold text-sm bg-white/[0.05] px-2.5 py-0.5 rounded border border-white/[0.08]">{avgPaymentDays} Days</span>
              </div>
              <input
                type="range"
                min="30"
                max="120"
                step="5"
                value={avgPaymentDays}
                onChange={(e) => setAvgPaymentDays(Number(e.target.value))}
                className="w-full h-2 bg-[#181B23] rounded-lg appearance-none cursor-pointer accent-[#FF3B30]"
              />
            </div>

            {/* Input 4: Overdue Percentage */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="text-neutral-300 font-medium">Percentage Overdue Past Payment Terms</label>
                <span className="text-[#FF3B30] font-mono-num font-bold text-sm bg-[#FF3B30]/10 px-2.5 py-0.5 rounded border border-[#FF3B30]/20">{overduePercent}%</span>
              </div>
              <input
                type="range"
                min="5"
                max="60"
                step="1"
                value={overduePercent}
                onChange={(e) => setOverduePercent(Number(e.target.value))}
                className="w-full h-2 bg-[#181B23] rounded-lg appearance-none cursor-pointer accent-[#FF3B30]"
              />
            </div>
          </div>

          {/* Results Column */}
          <div className="lg:col-span-5 bg-[#181B23] border border-white/[0.1] p-6 sm:p-8 rounded-2xl flex flex-col justify-between space-y-6 shadow-inner relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF3B30]/10 blur-2xl pointer-events-none" />

            <div>
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-5 pb-3 border-b border-white/[0.08]">
                <Info className="w-4 h-4 text-[#FF3B30]" />
                <span>Working Capital Diagnostic Output</span>
              </div>

              <div className="space-y-6">
                <div>
                  <span className="text-xs text-neutral-400 block font-medium">
                    Estimated Trapped Working Capital
                  </span>
                  <div className="text-3xl sm:text-5xl font-bold text-white mt-1 font-mono-num tracking-tight">
                    ₹{trappedCapital} Cr
                  </div>
                  <span className="text-[11px] text-neutral-400 mt-1 block">
                    Capital stalled behind PO mismatches & missing documentation
                  </span>
                </div>

                <div className="pt-4 border-t border-white/[0.08] grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-[11px] text-neutral-400 block font-mono">DSO ACCELERATION</span>
                    <span className="text-2xl font-bold text-[#FF3B30] font-mono-num">
                      ↓ {potentialDsoReduction} Days
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-neutral-400 block font-mono">CARRYING COST SAVING</span>
                    <span className="text-2xl font-bold text-emerald-400 font-mono-num">
                      ₹{annualCarryingCostSaved} L / yr
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/[0.08]">
              <button
                onClick={onOpenWaitlist}
                className="btn-editorial-primary w-full py-3.5 px-6 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg"
              >
                <span>Run Full Receivables Audit</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <span className="text-[10px] text-neutral-400 text-center block mt-3 font-mono">
                *Audit estimate based on Indian B2B trade benchmark metrics.
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
