"use client";

import React, { useEffect, useState } from "react";
import { Database, CheckCircle2 } from "lucide-react";

interface LandingIntegrationsProps {
  onOpenWaitlist: () => void;
}

const CONNECTORS = [
  { name: "Tally", type: "Available now", category: "Accounting" },
  { name: "Zoho Books", type: "Available now", category: "Accounting" },
  { name: "SAP", type: "Available now", category: "ERP" },
  { name: "ERPNext", type: "Available now", category: "ERP" },
  { name: "Oracle", type: "On roadmap", category: "ERP" },
  { name: "Microsoft Dynamics", type: "On roadmap", category: "ERP" },
  { name: "QuickBooks", type: "Available now", category: "Accounting" },
];

export function LandingIntegrations({ onOpenWaitlist }: LandingIntegrationsProps) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setRevealed((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -15% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const isRev = (id: string) => revealed.has(id);

  return (
    <section
      id="integrations"
      className="relative text-white border-t border-white/[0.06] overflow-visible"
      style={{ background: "#050505" }}
    >
      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-10 gap-y-14 items-start">
          {/* LEFT: HEADLINE */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            <div
              data-reveal
              id="int-eyebrow"
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#D7192D]/10 border border-[#D7192D]/25 text-[10px] font-mono text-[#D7192D] uppercase tracking-wider ${isRev("int-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 transition-all duration-700 ai-delay-1"}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D7192D] animate-pulse" />
              <span>FINANCIAL INFRASTRUCTURE</span>
            </div>

            <h2
              data-reveal
              id="int-headline"
              className={`text-5xl sm:text-6xl lg:text-[60px] xl:text-[68px] font-bold text-white tracking-[-0.04em] leading-[1.1] ${isRev("int-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6 transition-all duration-700 ai-delay-2"}`}
            >
              Works with the systems<br />
              <span className="text-[#D7192D]">your finance team already uses.</span>
            </h2>

            <p
              data-reveal
              id="int-subtext"
              className={`mt-5 text-neutral-400 text-lg xl:text-xl leading-relaxed max-w-[520px] font-normal ${isRev("int-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 transition-all duration-700 ai-delay-3"}`}
            >
              AIOSpark works on top of your existing financial infrastructure — read your invoices, POs, and payments, then write reconciled recoveries back to your ledger. No rip-and-replace required.
            </p>
          </div>

          {/* RIGHT: CONNECTOR GRID */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div
              data-reveal
              id="int-grid"
              className={`grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-4 ${isRev("int-grid") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 transition-all duration-700 ai-delay-2"}`}
            >
              {CONNECTORS.map((c, i) => {
                const available = c.type === "Available now";
                return (
                  <div
                    key={c.name}
                    className={`p-6 rounded-xl border transition-all ${available ? "bg-white/[0.03] border-white/[0.08]" : "bg-white/[0.01] border-white/[0.05]"} hover:border-[#D7192D]/40 group`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-semibold text-white">{c.name}</span>
                      <span
                        className={`text-[9px] font-mono font-bold px-2.5 py-0.5 rounded ${available ? "bg-emerald-900/20 text-emerald-400 border-emerald-800/40" : "bg-amber-900/20 text-amber-400 border-amber-800/40"}`}
                      >
                        {c.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500">
                      <Database className="w-3 h-3" /> {c.category}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              data-reveal
              id="int-note"
              className={`mt-8 rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 ${isRev("int-note") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 transition-all duration-700 ai-delay-3"}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-[#D7192D] flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="text-xs text-neutral-400 leading-relaxed">
                  Connector availability varies by ERP and edition. We confirm the right connector path with your team during onboarding.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}