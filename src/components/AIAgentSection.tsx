"use client";

import { Eye, Brain, ScanSearch, Search, CheckSquare, Zap, ShieldCheck } from "lucide-react";

export function AIAgentSection() {
  const loopSteps = [
    { title: "Observe", desc: "Ingests ERP ledgers, email streams & buyer portals continuously", icon: Eye },
    { title: "Understand", desc: "Maps PO terms, line item pricing, GRN receipts & credit terms", icon: Brain },
    { title: "Detect", desc: "Flags payment bottlenecks, hold signals & dispute indicators", icon: ScanSearch },
    { title: "Investigate", desc: "Cross-checks evidence across ERPs, POs & buyer portals", icon: Search },
    { title: "Decide", desc: "Formulates optimal resolution pathway & action draft", icon: CheckSquare },
    { title: "Execute", desc: "Dispatches approved communication or portal adjustment", icon: Zap },
    { title: "Verify", desc: "Confirms payment clearance & updates general ledger", icon: ShieldCheck },
  ];

  return (
    <section className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            AIOSpark doesn't just analyze. <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              It resolves blockers autonomously with human oversight.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            A 7-stage intelligent resolution loop engineered for financial controllers who demand speed without policy risk.
          </p>
        </div>

        {/* 7-Step Loop Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
          {loopSteps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div
                key={idx}
                className="p-4 rounded-xl workstation-card border border-white/[0.08] hover:border-[#FF3B30]/50 transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="w-7 h-7 rounded-lg bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30 text-xs font-bold font-mono flex items-center justify-center">
                      0{idx + 1}
                    </span>
                    <Icon className="w-4 h-4 text-neutral-400 group-hover:text-[#FF3B30] transition-colors" />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1.5">{step.title}</h3>
                  <p className="text-[11px] text-neutral-400 leading-relaxed font-sans font-normal">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Human Control Callout Banner */}
        <div className="mt-8 p-4 sm:p-5 rounded-2xl bg-[#12141A] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3B30] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF3B30]"></span>
            </span>
            <p className="text-xs sm:text-sm text-neutral-300">
              <span className="font-bold text-white">Policy-Gated Automation:</span> Every action can require explicit human manager approval depending on your enterprise governance rules.
            </p>
          </div>
          <span className="text-xs font-mono text-[#FF3B30] font-bold shrink-0 bg-[#FF3B30]/10 px-3 py-1 rounded border border-[#FF3B30]/20">
            Human-in-the-Loop Safeguard
          </span>
        </div>
      </div>
    </section>
  );
}
