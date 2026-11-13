"use client";

import { useReveal } from "./useReveal";
import { ShieldCheck, Clock, Bot } from "lucide-react";

const AUDIT_LOG = [
  { time: "10:42 AM", actor: "AIOSpark Agent", action: "Proposed reminder for Acme Precision (₹12.8L)", status: "pending", statusLabel: "Awaiting approval" },
  { time: "10:35 AM", actor: "R. Mehta (Controller)", action: "Approved escalation to Nova Industries", status: "done", statusLabel: "Approved" },
  { time: "10:31 AM", actor: "AIOSpark Agent", action: "Detected PO mismatch on invoice INV-4491", status: "done", statusLabel: "Resolved" },
  { time: "09:58 AM", actor: "AIOSpark Agent", action: "Sent payment reminder to Summit Textiles", status: "done", statusLabel: "Executed" },
];

export function LandingAutonomy() {
  useReveal();

  return (
    <section id="autonomy" className="aios-section">
      <div className="aios-container">
        <div className="max-w-2xl mx-auto text-center mb-16" data-aios-reveal id="autonomy-copy">
          <h2 className="mb-6 tracking-tight">AI proposes. Your team approves.</h2>
          <p className="aios-body mx-auto">
            Every recovery action is governed by your policy rules. Nothing is
            dispatched without the right sign-off, and every decision is logged
            for audit.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:gap-8 items-start" data-aios-reveal id="autonomy-grid">
          {/* Policy rules card */}
          <div className="aios-card p-6 sm:p-8 rounded-lg flex flex-col gap-5" data-aios-reveal id="policy-card">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-md bg-[#FF2D2D]/10 flex items-center justify-center border border-[#FF2D2D]/25">
                <span className="text-[#FF2D2D]">&#9993;</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Policy rules you control</h3>
                <p className="text-sm text-[#A1A1AA] leading-relaxed">
                  Set thresholds and approvers once. AI works within them.
                </p>
              </div>
            </div>

            <div className="p-6 rounded-md bg-white/[0.02] border border-white/[0.05]">
              <div className="flex items-start gap-3 mb-5">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#FF2D2D]/20 flex items-center justify-center text-[#FF2D2D] text-[11px] font-bold border border-[#FF2D2D]/30">
                  1
                </span>
                <p className="text-neutral-200 leading-relaxed flex-1">
                  Invoices above <span className="text-white font-semibold">₹50,000</span> require controller approval
                  before any reminder or escalation is sent.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#FF2D2D]/20 flex items-center justify-center text-[#FF2D2D] text-[11px] font-bold border border-[#FF2D2D]/30">
                  2
                </span>
                <p className="text-neutral-200 leading-relaxed flex-1">
                  Disputes above <span className="text-white font-semibold">₹5 Cr</span> route to the CFO for sign-off.
                </p>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2 text-[13px] text-[#71717A] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Policy engine active &middot; Rules editable in dashboard
            </div>
          </div>

          {/* Audit log card */}
          <div className="aios-card p-6 sm:p-8 rounded-lg flex flex-col gap-4" data-aios-reveal id="audit-log">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white mb-1">Audit log</h3>
                <p className="text-sm text-[#A1A1AA]">
                  Every action, decision and approval is recorded
                </p>
              </div>
              <span className="aios-chip aios-chip--green">Fully auditable</span>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[340px] pr-2 space-y-4">
              {AUDIT_LOG.map((entry, i) => {
                const isDone = entry.status === "done";
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="flex items-center gap-2">
                      {isDone ? (
                        <div className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
                      ) : (
                        <div className="w-2 h-2 rounded-full border-2 border-[#FF2D2D] shrink-0" />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px] font-mono font-bold text-[#71717A] tabular-nums">
                          {entry.time}
                        </span>
                        <span className="text-[13px] font-medium text-[#A1A1AA]">{entry.actor}</span>
                        <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${isDone ? "bg-[#10B981]/10 text-[#10B981] border border-[#10B981]/20" : "bg-[#FF2D2D]/10 text-[#FF2D2D] border border-[#FF2D2D]/20"}`}>
                          {entry.statusLabel}
                        </span>
                      </div>
                      <p className="text-sm text-[#A1A1AA] leading-relaxed mt-0.5">{entry.action}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="mt-16 border-t border-white/[0.06] pt-12" data-aios-reveal id="autonomy-strip">
          <div className="max-w-xl mx-auto text-center grid grid-cols-1 sm:grid-cols-3 gap-8 items-center">
            <div>
              <ShieldCheck className="w-6 h-6 text-[#10B981] mx-auto mb-3" />
              <p className="text-[14px] text-[#A1A1AA] font-medium leading-snug">SOC 2 aligned controls</p>
            </div>
            <div>
              <Clock className="w-6 h-6 text-[#71717A] mx-auto mb-3" />
              <p className="text-[14px] text-[#A1A1AA] font-medium leading-snug">Full retention history</p>
            </div>
            <div>
              <Bot className="w-6 h-6 text-[#FF2D2D] mx-auto mb-3" />
              <p className="text-[14px] text-[#A1A1AA] font-medium leading-snug">AI never acts alone</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}