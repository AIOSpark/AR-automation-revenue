"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useReveal } from "./useReveal";

const STEPS = [
  {
    id: "import",
    title: "Import",
    description: "Connect your invoices and receivables data from Tally, Zoho Books, SAP, Oracle, or QuickBooks in minutes.",
    visual: "ERP connectors sync receivables automatically",
  },
  {
    id: "analyze",
    title: "Analyze",
    description: "AI reviews outstanding balances, payment history, and buyer behavior to surface what actually matters.",
    visual: "Payment behavior analyzed per customer",
  },
  {
    id: "identify",
    title: "Identify",
    description: "Root-cause detection pinpoints exactly why each payment is blocked — PO mismatch, rejection, or approval delay.",
    visual: "Root cause identified per blocked invoice",
  },
  {
    id: "act",
    title: "Act",
    description: "The platform recommends the next-best collection action and coordinates reminders and escalations within your policy limits.",
    visual: "Recommended actions ready for review",
  },
  {
    id: "recover",
    title: "Recover",
    description: "Track collection progress in real time, match payments to invoices, and log every decision in the audit trail.",
    visual: "Cash reconciled and logged",
  },
];

const NODE_COLORS = ["#FF2D2D", "#C42B2D", "#7C3AED", "#0EA5E9", "#10B981"];

export function LandingStepper() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useReveal();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = (index: number) => {
    setActiveIndex(index);
    resetTimer();
  };

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (paused) return;
    timerRef.current = setTimeout(() => {
      setActiveIndex((i) => (i + 1) % STEPS.length);
    }, 5000);
  };

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeIndex, paused]);

  const step = STEPS[activeIndex];

  return (
    <section id="how-it-works" className="aios-section border-y border-white/[0.06]">
      <div className="aios-container">
        <div className="max-w-2xl mx-auto text-center mb-12" data-aios-reveal id="stepper-copy">
          <h2 className="mb-5 tracking-tight">Five steps, one closed loop</h2>
          <p className="aios-body mx-auto">
            From stuck invoice to recovered cash, every step is visible,
            controllable, and auditable.
          </p>
        </div>

        {/* Stepper: horizontal on desktop, vertical on mobile */}
        <div className="relative mx-auto mb-14" style={{ maxWidth: 800 }} data-aios-reveal id="stepper-bar">
          {/* Horizontal progress line (desktop) */}
          <svg
            className="hidden lg:block w-full h-[1px]"
            width={800}
            height={1}
            viewBox="0 0 800 1"
            preserveAspectRatio="none"
          >
            {STEPS.map((_, i) => {
              const x = (i / (STEPS.length - 1)) * 800;
              const isDone = i < activeIndex;
              const nextX = i === STEPS.length - 1 ? x : ((i + 1) / (STEPS.length - 1)) * 800;
              return (
                <line
                  key={i}
                  x1={x}
                  y1="0.5"
                  x2={nextX}
                  y2="0.5"
                  stroke={isDone ? "#10B981" : "rgba(255,255,255,0.06)"}
                  strokeWidth="1"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          <div className="flex flex-col lg:flex-row items-start justify-between gap-6 mt-10 lg:mt-12">
            {STEPS.map((s, i) => {
              const isActive = i === activeIndex;
              const isDone = i < activeIndex;
              const color = NODE_COLORS[i % NODE_COLORS.length];
              return (
                <div
                  key={s.id}
                  className="flex flex-col items-center gap-2.5 w-full lg:w-auto"
                  data-aios-reveal
                  id={`step-${s.id}`}
                >
                  <button
                    onClick={() => goTo(i)}
                    aria-pressed={isActive}
                    aria-label={`Step ${i + 1}: ${s.title}`}
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all ring-2 ring-transparent focus-visible:ring-[#FF2D2D] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050505]"
                    style={{
                      background: isActive
                        ? color
                        : isDone
                        ? "rgba(16, 185, 129, 0.10)"
                        : "rgba(255, 255, 255, 0.04)",
                      border: isActive
                        ? `1px solid ${color}`
                        : isDone
                        ? "1px solid rgba(16, 185, 129, 0.25)"
                        : "1px solid rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    <span className={`
                      text-[13px] font-bold ${isActive ? "text-white" : isDone ? "text-[#10B981]" : "text-[#71717A]"}
                    `}>
                      {i + 1}
                    </span>
                  </button>
                  <span className={`text-[13px] font-medium leading-tight text-center ${isActive ? "text-white" : "text-[#71717A]"} transition-colors`}>
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active step panel */}
        <div className="aios-card-lg flex flex-col lg:flex-row gap-10 items-start lg:items-center" data-aios-reveal id="stepper-panel">
          <div className="flex-shrink-0 lg:w-[30%]">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0 mb-5 bg-white/[0.03] border border-white/[0.05]">
              <span className={`text-[18px]`} style={{ color: NODE_COLORS[activeIndex % NODE_COLORS.length] }}>
                {step.title.charAt(0)}
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2 leading-tight">
              {step.title}
            </h3>
            <p className="text-[14px] text-[#A1A1AA] leading-relaxed">
              {step.visual}
            </p>
          </div>
          <div className="flex-1">
            <p className="text-[15px] text-[#A1A1AA] leading-relaxed">
              {step.description}
            </p>
          </div>
        </div>

        <div
          className="mt-8 flex items-center justify-between w-full cursor-pointer select-none"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter") goTo((activeIndex + 1) % STEPS.length);
          }}
        >
          <span className="text-[12px] text-[#71717A] font-medium">
            Auto-advancing every 5s &middot; Hover to pause
          </span>
        </div>
      </div>
    </section>
  );
}
