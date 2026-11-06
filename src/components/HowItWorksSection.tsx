"use client";

import {
  Link2,
  Search,
  ScanSearch,
  FileText,
  CheckSquare,
  BadgeDollarSign,
} from "lucide-react";

export function HowItWorksSection() {
  const steps = [
    {
      title: "Connect Ledger",
      description: "Seamless API sync with Tally, Zoho ERP, SAP, or raw CSV exports — live in under 5 minutes.",
      icon: Link2,
    },
    {
      title: "Ingest Context",
      description: "Aggregates invoices, payment histories, email communications, and contract terms into one UDM stream.",
      icon: Search,
    },
    {
      title: "Detect Blockers",
      description: "Real-time AI scanners flag PO line discrepancies, missing GRNs, and dispute indicators instantly.",
      icon: ScanSearch,
    },
    {
      title: "Causal Audit",
      description: "Constructs causal graph root-cause trees pinpointing why cash is delayed for every line item.",
      icon: FileText,
    },
    {
      title: "Human Approval",
      description: "Generates policy-gated action plans for AR controllers with one-click resolution dispatch.",
      icon: CheckSquare,
    },
    {
      title: "Cash Settlement",
      description: "Reconciles cleared payments directly to ERP general ledger with automated audit trails.",
      icon: BadgeDollarSign,
    },
  ];

  return (
    <section id="how-it-works" className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            How AIOSpark systematically clears <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              your trapped receivables.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            A 6-stage telemetry pipeline built for financial controllers who demand absolute audit clarity.
          </p>
        </div>

        <div className="relative">
          {/* Connector Line for Desktop */}
          <div className="hidden lg:block absolute top-1/2 left-6 right-6 h-0.5 bg-white/[0.08] -translate-y-12 z-0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-5 relative z-10">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={idx}
                  className="flex flex-col workstation-card p-5 rounded-xl border border-white/[0.08] relative group hover:border-[#FF3B30]/50 transition-all justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="w-8 h-8 rounded-lg bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30 font-mono text-xs font-bold flex items-center justify-center">
                        0{idx + 1}
                      </span>
                      <Icon className="w-5 h-5 text-neutral-400 group-hover:text-[#FF3B30] transition-colors" />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-xs text-neutral-400 leading-relaxed font-normal">
                      {step.description}
                    </p>
                  </div>
                  
                  <div className="mt-4 pt-2 border-t border-white/[0.04] text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                    Phase 0{idx + 1}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
