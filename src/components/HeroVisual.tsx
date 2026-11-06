"use client";

import { useState, useEffect } from "react";
import { FileText, Scan, FileSearch, CheckCircle2, DollarSign, AlertCircle, ArrowRight } from "lucide-react";

export function HeroVisual() {
  const [activeStep, setActiveStep] = useState<number>(2); // Start at Detect/Blocker

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev % 5) + 1);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  const steps = [
    { id: 1, label: "Invoice Ingestion", icon: FileText, sub: "INV-1021 (₹18,00,000)" },
    { id: 2, label: "Blocker Detection", icon: Scan, sub: "PO Line Mismatch", status: "blocked" },
    { id: 3, label: "Root Cause Audit", icon: FileSearch, sub: "Evidence Verification" },
    { id: 4, label: "Human Approval", icon: CheckCircle2, sub: "Workflow Dispatched" },
    { id: 5, label: "Cash Settlement", icon: DollarSign, sub: "Ledger Cleared", status: "success" },
  ];

  return (
    <div className="mt-14 max-w-5xl mx-auto px-4">
      <div className="workstation-card p-6 md:p-8 relative overflow-hidden group border border-white/[0.1] shadow-2xl">
        {/* Subtle Warm Crimson Accent Gradient */}
        <div className="absolute top-0 right-1/4 w-96 h-32 bg-[#FF3B30]/10 blur-3xl rounded-full pointer-events-none" />

        <div className="flex items-center justify-between pb-5 border-b border-white/[0.08] mb-8">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3B30] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#FF3B30]"></span>
            </span>
            <span className="text-xs font-mono text-neutral-300 uppercase tracking-wider font-semibold">
              Live Order-To-Cash Intelligence Pipeline
            </span>
          </div>
          <div className="text-xs font-mono text-neutral-400 hidden sm:block bg-white/[0.03] px-3 py-1 rounded border border-white/[0.06]">
            INV-1021 • Apex Tech Logistics
          </div>
        </div>

        {/* Step Flow Nodes */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 relative z-10">
          {steps.map((step) => {
            const Icon = step.icon;
            const isActive = activeStep === step.id;
            const isBlocked = step.id === 2;

            return (
              <div
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                className={`relative flex flex-col items-center text-center p-4 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? isBlocked && activeStep === 2
                      ? "bg-[#FF3B30]/10 border-[#FF3B30] shadow-lg shadow-[#FF3B30]/15 scale-[1.03]"
                      : "bg-white/[0.08] border-white/20 shadow-md"
                    : "bg-white/[0.02] border-white/[0.06] opacity-75 hover:opacity-100"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 transition-all ${
                    isBlocked && activeStep === 2
                      ? "bg-[#FF3B30] text-white shadow-md shadow-[#FF3B30]/30"
                      : isActive
                      ? "bg-white text-black"
                      : "bg-white/[0.06] text-neutral-400"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-white">{step.label}</span>
                  {isBlocked && (
                    <span className="inline-block w-2 h-2 rounded-full bg-[#FF3B30]" />
                  )}
                </div>

                <span
                  className={`text-[11px] mt-1 font-mono leading-tight ${
                    isBlocked && activeStep === 2
                      ? "text-[#FF3B30] font-medium"
                      : "text-neutral-400"
                  }`}
                >
                  {step.sub}
                </span>

                {/* Status Indicator Badge */}
                {isBlocked && activeStep === 2 && (
                  <span className="mt-2 text-[10px] px-2 py-0.5 rounded bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/30 font-semibold flex items-center gap-1 font-mono">
                    <AlertCircle className="w-3 h-3" /> Blocker Signals
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Live Simulation Telemetry Card */}
        <div className="mt-6 p-4 rounded-xl bg-[#181B23] border border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs shadow-inner">
          <div className="flex items-center gap-3 text-neutral-300">
            <span className="text-[#FF3B30] font-bold tracking-wider">STATE TELEMETRY:</span>
            {activeStep === 2 ? (
              <span className="text-[#FF3B30] flex items-center gap-1.5 font-medium">
                <AlertCircle className="w-4 h-4 text-[#FF3B30]" /> PO Quantity Discrepancy: 950 units ordered vs 1,000 units billed
              </span>
            ) : activeStep === 3 ? (
              <span className="text-amber-400 flex items-center gap-1.5">
                <FileSearch className="w-4 h-4 text-amber-400" /> Evidence Audit: Matched buyer portal record & delivery receipt #882
              </span>
            ) : activeStep === 4 ? (
              <span className="text-blue-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-blue-400" /> Approval Queue: Revised PO line item auto-formatted for AR controller
              </span>
            ) : activeStep === 5 ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" /> Payment Received: ₹18,00,000 matched & posted to ERP ledger
              </span>
            ) : (
              <span className="text-neutral-300">Invoice #1021 ingested from Tally ERP stream</span>
            )}
          </div>
          <div className="text-neutral-400 text-[11px] shrink-0 font-mono bg-white/[0.04] px-2.5 py-1 rounded border border-white/[0.06]">
            Phase {activeStep} of 5
          </div>
        </div>
      </div>
    </div>
  );
}
