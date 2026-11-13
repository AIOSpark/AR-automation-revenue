"use client";

import React, { useEffect, useState, useRef } from "react";
import { Search, Microscope, Target, Play, CheckCircle2, ArrowRight } from "lucide-react";

interface LandingWorkflowProps {
  onOpenWaitlist?: () => void;
}

const WORKFLOW_STEPS = [
  {
    num: "01",
    title: "Detect",
    desc: "Find receivables at risk before cash is lost.",
    icon: Search,
    detail: "Continuously scans aging reports, invoices, payments, and ERP signals. Surfaces invoices most likely to cause shortfall — ranked by recovery potential, not age.",
  },
  {
    num: "02",
    title: "Diagnose",
    desc: "Know exactly why payment is delayed.",
    icon: Microscope,
    detail: "Cross-references PO lines, tax codes, delivery proof, and customer payment history to isolate the precise root cause — PO mismatch, missing document, or dispute.",
  },
  {
    num: "03",
    title: "Decide",
    desc: "Select the highest-value next action.",
    icon: Target,
    detail: "Ranks every opportunity by expected recovery value, AI confidence score, and customer behavioral signals. Outputs a prioritized action — not a passive list.",
  },
  {
    num: "04",
    title: "Act",
    desc: "Execute within your approval policies.",
    icon: Play,
    detail: "Dispatches reminders, requests corrected PO documents, or escalates to buyer AP contacts — strictly within the policy guardrails your finance team defines.",
  },
  {
    num: "05",
    title: "Verify",
    desc: "Confirm payment and close the loop.",
    icon: CheckCircle2,
    detail: "Matches incoming funds to the exact invoice, posts reconciliation back to your ledger (Tally, SAP, Zoho Books, ERPNext), and closes the case with zero manual matching.",
  },
];

export function LandingWorkflow({ onOpenWaitlist }: LandingWorkflowProps) {
  const [activeStep, setActiveStep] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(20);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setRevealed((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Subtle animated line that fills as user scrolls through the section
  useEffect(() => {
    const handleScroll = () => {
      if (!sectionRef.current) return;
      const rect = sectionRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;

      // Calculate how far through the section the viewport has scrolled
      const totalDist = rect.height + windowHeight * 0.5;
      const currentDist = windowHeight - rect.top;
      const rawPct = Math.max(0, Math.min(1, currentDist / totalDist));
      const pct = Math.round(rawPct * 100);
      setScrollProgress(pct);

      // Auto update active step based on scroll progress
      const stepIdx = Math.min(4, Math.floor(rawPct * 5));
      setActiveStep(stepIdx);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isRev = (id: string) => revealed.has(id);
  const activeData = WORKFLOW_STEPS[activeStep];
  const ActiveIcon = activeData.icon;

  return (
    <section
      ref={sectionRef}
      id="workflow"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      <div
        aria-hidden="true"
        className="absolute top-[-8%] right-[-8%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(215,25,32,0.05) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">

        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16 max-w-2xl mx-auto">
          <div
            data-reveal
            id="wf-eyebrow"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider ${isRev("wf-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#D7192D] animate-pulse" />
            <span>SIGNATURE WORKFLOW</span>
          </div>

          <h2
            data-reveal
            id="wf-headline"
            className={`mt-4 pt-1 font-bold text-white tracking-[-0.04em] ${isRev("wf-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", lineHeight: "1.15" }}
          >
            From detection to
            <span className="text-[#D7192D]">recovered cash.</span>
          </h2>

          <p
            data-reveal
            id="wf-subtext"
            className={`mt-4 text-neutral-300 text-base sm:text-lg leading-relaxed max-w-xl mx-auto ${isRev("wf-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          >
            Five continuous steps that turn trapped receivables into working capital — with your finance team in control at every policy gate.
          </p>
        </div>

        {/* 5-STEP HORIZONTAL STEPPER (DESKTOP) */}
        <div
          data-reveal
          id="wf-stepper"
          className={`hidden lg:block relative ${isRev("wf-stepper") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
        >
          {/* Connecting Base Line */}
          <div className="absolute top-[26px] left-[8%] right-[8%] h-[2px] bg-white/[0.10] z-0" />

          {/* Animated Scroll Fill Line */}
          <div
            className="absolute top-[26px] left-[8%] h-[2px] bg-gradient-to-r from-[#D7192D] via-[#D7192D] to-red-400 z-0 transition-all duration-300"
            style={{ width: `${Math.min(80, Math.max(0, scrollProgress * 0.8))}%` }}
          />

          {/* Stepper items */}
          <div className="grid grid-cols-5 gap-4 relative z-10 mb-10">
            {WORKFLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === activeStep;
              const isPast = i < activeStep;

              return (
                <button
                  key={step.num}
                  onClick={() => setActiveStep(i)}
                  className="flex flex-col items-center text-center group cursor-pointer focus:outline-none"
                >
                  {/* Numbered circle */}
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center border-2 transition-all duration-300 mb-4 ${isActive ? "bg-[#D7192D] text-white border-[#D7192D] shadow-[0_0_24px_rgba(215,25,32,0.45)] scale-110" : isPast ? "bg-[#090A0D] text-emerald-400 border-emerald-500/50" : "bg-[#090A0D] text-neutral-400 border-white/[0.15] group-hover:border-white/30 group-hover:text-white"}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  {/* Title & Step Number */}
                  <div className="space-y-1 px-2">
                    <span className="text-[12px] font-mono text-neutral-400 font-bold block">
                      STEP {step.num}
                    </span>
                    <h3 className={`text-base font-bold transition-colors ${isActive ? "text-[#D7192D]" : "text-white"} group-hover:text-neutral-200`}>
                      {step.title}
                    </h3>
                    <p className="text-[13px] text-neutral-400 leading-snug">
                      {step.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Step Detailed Card */}
          <div className="rounded-2xl border border-white/[0.10] bg-[#090A0D] p-6 sm:p-7 shadow-xl max-w-4xl mx-auto">
            <div className="flex items-start gap-5">
              <div className="w-12 h-12 rounded-xl bg-[#D7192D]/15 border border-[#D7192D]/30 flex items-center justify-center text-[#D7192D] shrink-0">
                <ActiveIcon className="w-6 h-6" />
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-mono text-[#D7192D] font-bold uppercase tracking-wider">
                    Step {activeData.num} Deep Dive
                  </span>
                  <span className="text-neutral-500">•</span>
                  <h4 className="text-base font-bold text-white">{activeData.title}</h4>
                </div>
                <p className="text-[14px] text-neutral-300 leading-relaxed">
                  {activeData.detail}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* VERTICAL STEPPER (MOBILE / TABLET) */}
        <div className="lg:hidden space-y-4">
          <div className="relative pl-6">
            {/* Vertical connector line */}
            <div className="absolute left-[18px] top-4 bottom-4 w-[2px] bg-white/[0.10]" />
            <div
              className="absolute left-[18px] top-4 w-[2px] bg-[#D7192D] transition-all duration-300"
              style={{ height: `${Math.min(100, scrollProgress)}%` }}
            />

            <div className="space-y-4">
              {WORKFLOW_STEPS.map((step, i) => {
                const Icon = step.icon;
                const isActive = i === activeStep;
                const isPast = i < activeStep;

                return (
                  <div
                    key={step.num}
                    onClick={() => setActiveStep(i)}
                    className={`relative flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${isActive ? "bg-[#090A0D] border-[#D7192D]/40 shadow-lg" : "bg-white/[0.02] border-white/[0.08]"}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border shrink-0 -ml-8 mt-0.5 z-10 transition-all ${isActive ? "bg-[#D7192D] text-white border-[#D7192D]" : isPast ? "bg-[#090A0D] text-emerald-400 border-emerald-500/50" : "bg-[#090A0D] text-neutral-400 border-white/[0.15]"}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-mono text-neutral-400 font-bold">
                          {step.num}
                        </span>
                        <h3 className={`text-[15px] font-bold ${isActive ? "text-[#D7192D]" : "text-white"}`}>
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-[13px] text-neutral-300 leading-snug">
                        {step.desc}
                      </p>
                      {isActive && (
                        <p className="text-[12px] text-neutral-400 pt-1 leading-relaxed">
                          {step.detail}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CTA BUTTON AFTER STEPPER (Requirement 7) */}
        {onOpenWaitlist && (
          <div
            data-reveal
            id="wf-cta"
            className={`mt-12 flex flex-col sm:flex-row items-center justify-center gap-4 text-center ${isRev("wf-cta") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          >
            <button
              onClick={onOpenWaitlist}
              className="min-h-[48px] px-8 py-3.5 rounded-xl bg-[#D7192D] hover:bg-[#E51C1C] text-white font-semibold text-sm sm:text-base flex items-center gap-2 shadow-lg shadow-red-500/25 transition-all cursor-pointer active:scale-95"
            >
              <span>Get early access to the workflow</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <span className="text-[13px] text-neutral-400">
              No credit card required · Full policy control by design
            </span>
          </div>
        )}
      </div>
    </section>
  );
}