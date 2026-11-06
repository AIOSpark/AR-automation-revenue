"use client";

import { ArrowDown, AlertCircle, CheckCircle2, ShieldCheck, Zap } from "lucide-react";

export function DifferentiationSection() {
  const traditionalSteps = [
    { title: "Invoice Overdue Signal", desc: "Day 30 notification arrives in inbox" },
    { title: "Generic Template Reminder #1", desc: "Automated dunning email sent to accounts payable" },
    { title: "Silent Waiting Period", desc: "Buyer ignores email; no internal investigation done" },
    { title: "Generic Template Reminder #2", desc: "Escalated wording; root cause still unknown" },
    { title: "Manual Phone Call", desc: "AR rep discovers PO line mismatch 45 days late" },
    { title: "Manual Re-billing Loop", desc: "Re-submitting invoice restarts buyer's 30-day clock" },
  ];

  const aioSparkSteps = [
    { title: "Ledger Delay Detected", desc: "Automated real-time trigger from ERP stream" },
    { title: "PO & Portal Discrepancy Scanned", desc: "AI isolates 50-unit pricing mismatch instantly" },
    { title: "Evidence Cross-Referenced", desc: "Matches signed GRN & buyer portal log automatically" },
    { title: "Root Cause Pinpointed", desc: "Diagnoses PO line item discrepancy with 99.4% confidence" },
    { title: "Action Plan Generated", desc: "Formulates corrected PO line item adjustment" },
    { title: "Human Approval Executed", desc: "AR Controller approves resolution with one click" },
    { title: "Cash Reconciled & Cleared", desc: "Payment processed & settled to bank ledger" },
  ];

  return (
    <section className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            Don't just chase overdue invoices. <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              Resolve the exact blocker stopping payment.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            Traditional dunning software sends repetitive reminder emails. AIOSpark diagnoses the operational root cause and resolves it end-to-end.
          </p>
        </div>

        {/* Comparison Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Left: Traditional Process */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#12141A] border border-white/[0.08] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.08]">
                <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-neutral-500" />
                  Traditional Dunning Loops
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/[0.04] text-neutral-400 text-xs font-mono border border-white/[0.06]">
                  Reactive Email Chasing
                </span>
              </div>

              <div className="space-y-3">
                {traditionalSteps.map((step, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="w-full p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] text-neutral-400 text-xs font-mono flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-neutral-500 font-bold">0{idx + 1}</span>
                        <div>
                          <span className="font-semibold text-neutral-300 block">{step.title}</span>
                          <span className="text-[10px] text-neutral-500 font-sans">{step.desc}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-red-400/70 font-mono">Loop #{idx + 1}</span>
                    </div>
                    {idx < traditionalSteps.length - 1 && (
                      <ArrowDown className="w-3.5 h-3.5 text-neutral-600 my-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.06] text-center">
              <p className="text-xs text-neutral-400 font-mono">
                Outcome: 45+ Days DSO • High Customer Friction • Manual Labor
              </p>
            </div>
          </div>

          {/* Right: AIOSpark Workflow */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#181B23] border border-[#FF3B30]/40 shadow-xl shadow-[#FF3B30]/10 relative flex flex-col justify-between overflow-hidden">
            {/* Top Warm Glow Accent */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF3B30]/10 blur-3xl pointer-events-none" />

            <div>
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/[0.08] relative z-10">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-[#FF3B30]" />
                  <span className="text-xs font-mono uppercase tracking-wider text-white font-bold">
                    AIOSpark Root-Cause Workflow
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#FF3B30]/20 text-[#FF3B30] text-xs font-mono font-bold border border-[#FF3B30]/30 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-[#FF3B30]" />
                  Autonomous & Guided
                </span>
              </div>

              <div className="space-y-3 relative z-10">
                {aioSparkSteps.map((step, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="w-full p-3.5 rounded-xl bg-[#0A0B0E]/90 border border-white/[0.1] text-white text-xs font-mono flex items-center justify-between group hover:border-[#FF3B30] transition-colors">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-[#FF3B30] shrink-0" />
                        <div>
                          <span className="font-bold text-white block">{step.title}</span>
                          <span className="text-[10px] text-neutral-400 font-sans">{step.desc}</span>
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/[0.06] text-neutral-300 font-semibold border border-white/[0.08]">
                        Step {idx + 1}
                      </span>
                    </div>
                    {idx < aioSparkSteps.length - 1 && (
                      <ArrowDown className="w-3.5 h-3.5 text-[#FF3B30] my-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-white/[0.08] text-center relative z-10">
              <p className="text-xs font-mono text-[#FF3B30] font-semibold">
                Outcome: DSO Reduced by 18.4 Days • Audit-Grade Proof • 100% Controlled
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
