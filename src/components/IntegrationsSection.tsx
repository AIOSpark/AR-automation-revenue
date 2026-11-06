"use client";

import { CheckCircle2, Clock } from "lucide-react";

export function IntegrationsSection() {
  const availableIntegrations = [
    { name: "Tally ERP / Prime", desc: "Direct ledger voucher sync & GST tax breakdown" },
    { name: "Zoho Books", desc: "Real-time API invoice & credit note synchronization" },
    { name: "Spreadsheet Ledger Uploads", desc: "Instant CSV/XLSX ingestion with automatic column mapping" },
  ];

  const comingSoonIntegrations = [
    { name: "SAP S/4HANA", desc: "Enterprise general ledger & PO matching connector" },
    { name: "Oracle NetSuite", desc: "Cloud financial management & AP portal bridge" },
    { name: "Microsoft Dynamics 365", desc: "Finance & operations automated data stream" },
  ];

  return (
    <section className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            Connects with your accounting stack <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              in minutes without custom engineering.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            Plug into your existing ERP and spreadsheets — live telemetry ingestion with zero IT friction.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Available Column */}
          <div className="p-6 sm:p-8 rounded-2xl workstation-card border border-white/[0.08]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#FF3B30]" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  Available Now
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded bg-[#FF3B30]/15 text-[#FF3B30] border border-[#FF3B30]/30 text-xs font-bold font-mono">
                Live Ingestion
              </span>
            </div>

            <div className="space-y-4">
              {availableIntegrations.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-[#0A0B0E] border border-white/[0.06] flex items-center justify-between hover:border-[#FF3B30]/40 transition-all"
                >
                  <div>
                    <h4 className="text-sm font-bold text-white">{item.name}</h4>
                    <p className="text-xs text-neutral-400 mt-0.5 font-normal">{item.desc}</p>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded bg-white/[0.06] text-neutral-300 font-mono font-semibold border border-white/[0.08]">
                    Active
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Coming Soon Column */}
          <div className="p-6 sm:p-8 rounded-2xl bg-[#12141A] border border-white/[0.06]">
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-6">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-neutral-400" />
                <h3 className="text-sm font-bold text-neutral-300 uppercase tracking-wider font-mono">
                  Coming Soon
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded bg-white/[0.04] text-neutral-400 border border-white/[0.08] text-xs font-semibold font-mono">
                Roadmap
              </span>
            </div>

            <div className="space-y-4">
              {comingSoonIntegrations.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-xl bg-[#0A0B0E]/60 border border-white/[0.04] flex items-center justify-between opacity-80"
                >
                  <div>
                    <h4 className="text-sm font-bold text-neutral-300">{item.name}</h4>
                    <p className="text-xs text-neutral-400 mt-0.5 font-normal">{item.desc}</p>
                  </div>
                  <span className="text-[10px] px-2.5 py-1 rounded bg-white/[0.03] text-neutral-400 font-mono border border-white/[0.06]">
                    In Development
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
