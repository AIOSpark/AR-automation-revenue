"use client";

import {
  FileSpreadsheet,
  FileQuestion,
  FileX,
  AlertCircle,
  Hourglass,
  Handshake,
  ArrowUpRight,
} from "lucide-react";

export function ProblemSection() {
  const problems = [
    {
      title: "Purchase Order Mismatch",
      description: "Line item quantities, unit pricing, or tax calculations differing from the approved purchase order.",
      icon: FileSpreadsheet,
      impact: "High Latency • 12.4 Days Average Hold",
    },
    {
      title: "Missing Supporting Proofs",
      description: "Vendor portals or buyer ERP systems lacking tax clearance, GRN receipts, or signed proof of delivery.",
      icon: FileQuestion,
      impact: "Documentation Gap • 8.1 Days Hold",
    },
    {
      title: "Invoice Structure Errors",
      description: "Incorrect legal entity names, GSTIN formatting, or line-item tax breakdowns causing immediate automated rejections.",
      icon: FileX,
      impact: "Intake Rejection • 6.2 Days Hold",
    },
    {
      title: "Unresolved Buyer Disputes",
      description: "Short payments, quality hold-backs, or rate disagreements stalling the entire invoice ledger balance.",
      icon: AlertCircle,
      impact: "Commercially Blocked • 14.5 Days Hold",
    },
    {
      title: "Buyer Approval Bottlenecks",
      description: "Valid invoices buried inside multi-layer internal approval chains without automated escalation.",
      icon: Hourglass,
      impact: "Workflow Stalled • 9.8 Days Hold",
    },
    {
      title: "Untracked Payment Commitments",
      description: "Verbal or email promises to pay that lack automated tracking, ledger reconciliation, and timely follow-ups.",
      icon: Handshake,
      impact: "Commitment Risk • 11.0 Days Hold",
    },
  ];

  return (
    <section id="solutions" className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            Your cash isn't stuck because buyers refuse to pay. <br />
            <span className="font-serif-editorial text-neutral-300 font-normal">
              It is blocked by operational friction in the chain.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            68% of delayed B2B payments stem from administrative mismatches, missing proof, and approval deadlocks rather than customer insolvency.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {problems.map((problem, idx) => {
            const Icon = problem.icon;
            return (
              <div
                key={idx}
                className="p-6 workstation-card-interactive group relative flex flex-col justify-between"
              >
                <div>
                  <div className="w-11 h-11 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#FF3B30] mb-5 group-hover:scale-105 group-hover:bg-[#FF3B30]/10 transition-all">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2 flex items-center justify-between">
                    <span>{problem.title}</span>
                    <ArrowUpRight className="w-4 h-4 text-neutral-600 group-hover:text-[#FF3B30] transition-colors" />
                  </h3>
                  <p className="text-xs text-neutral-400 leading-relaxed mb-6 font-normal">
                    {problem.description}
                  </p>
                </div>
                
                <div className="pt-3 border-t border-white/[0.06] text-[11px] font-mono text-[#FF3B30] font-medium flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]" />
                  {problem.impact}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
