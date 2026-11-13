"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Filter, ShieldCheck, CheckCircle2 } from "lucide-react";

const QUEUE_ITEMS = [
  {
    id: "acme",
    priority: "HIGH",
    priorityColor: "red",
    customer: "Acme Corp",
    amount: "₹12,80,000",
    days: "19d overdue",
    cause: "PO mismatch (line 4)",
    action: "Request corrected PO",
    recovery: "₹12.8L",
    status: "Ready to dispatch",
    illustrative: true,
  },
  {
    id: "nova",
    priority: "HIGH",
    priorityColor: "red",
    customer: "Nova Industries",
    amount: "₹8,40,000",
    days: "31d overdue",
    cause: "AP sign-off pending",
    action: "Escalate to AP head",
    recovery: "₹8.4L",
    status: "Awaiting approval",
    illustrative: true,
  },
  {
    id: "buildpro",
    priority: "MEDIUM",
    priorityColor: "amber",
    customer: "BuildPro Infrastructure",
    amount: "₹4,20,000",
    days: "12d overdue",
    cause: "Missing delivery GRN",
    action: "Attach digital proof",
    recovery: "₹4.2L",
    status: "Queued",
    illustrative: true,
  },
  {
    id: "vertex",
    priority: "MEDIUM",
    priorityColor: "amber",
    customer: "Vertex Logistics",
    amount: "₹3,10,000",
    days: "22d overdue",
    cause: "Tax line item variance",
    action: "Reissue credit adjustment",
    recovery: "₹3.1L",
    status: "Ready to dispatch",
    illustrative: true,
  },
];

export function LandingCashQueue() {
  const [filter, setFilter] = useState<"ALL" | "HIGH">("ALL");
  const [totalAtRisk, setTotalAtRisk] = useState(0);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setRevealed((p) => new Set([...p, e.target.id]));
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let start = 0;
    const end = 28400000;
    const duration = 1200;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const value = Math.floor(start + (end - start) * progress);
      setTotalAtRisk(value);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  const isRev = (id: string) => revealed.has(id);

  const totalDisplay = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(totalAtRisk);

  const displayedItems = filter === "ALL" ? QUEUE_ITEMS : QUEUE_ITEMS.filter((i) => i.priority === "HIGH");

  return (
    <section
      id="cash-queue"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      <div
        aria-hidden="true"
        className="absolute top-[8%] right-[-6%] w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(215,25,32,0.05) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-start">

          {/* LEFT: 40% STICKY COLUMN */}
          <div className="lg:col-span-5 lg:sticky lg:top-[120px] self-start space-y-6">
            <div
              data-reveal
              id="cq-eyebrow"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D7192D] animate-pulse" />
              <span>CASH UNBLOCK QUEUE</span>
            </div>

            <h2
              data-reveal
              id="cq-headline"
              className="pt-1 font-bold text-white tracking-[-0.04em]"
              style={{ fontSize: "clamp(2rem, 3.4vw, 3rem)", lineHeight: "1.15" }}
            >
              Don't manage invoices.
              <span className="text-[#D7192D]">Manage unblockable cash.</span>
            </h2>

            <p
              data-reveal
              id="cq-subtext"
              className="text-neutral-300 text-base lg:text-[17px] leading-relaxed max-w-lg"
            >
              Most collections software ranks simply by days overdue or invoice number. AIOSpark ranks by recoverable money at risk and probability of recovery — focusing team effort where it delivers the highest return.
            </p>

            {/* Total Money At Risk Card */}
            <div
              data-reveal
              id="cq-total-card"
              className="p-6 rounded-2xl bg-white/[0.03] border border-white/[0.09] space-y-2"
            >
              <span className="text-[12px] font-mono text-neutral-400 uppercase tracking-wider block">
                Total Money At Risk In Queue
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">
                {totalDisplay}
              </div>
              <div className="text-[13px] text-neutral-400 pt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Live telemetry across connected ERP ledgers</span>
              </div>
            </div>
          </div>

          {/* RIGHT: QUEUE CARDS AREA */}
          <div className="lg:col-span-7 w-full">
            <div
              data-reveal
              id="cq-queue-panel"
              className="rounded-2xl bg-[#090A0D] border border-white/[0.10] p-6 sm:p-7 shadow-lg max-w-full flex flex-col justify-between"
            >
              <div>
                {/* Header & Filter */}
                <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
                  <div>
                    <span className="text-[13px] font-mono font-bold text-white uppercase tracking-wider block">
                      Prioritized Recovery Queue
                    </span>
                    <span className="text-[12px] text-neutral-400">
                      Showing top {displayedItems.length} unblock opportunities
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 p-1 rounded-lg bg-white/[0.04] border border-white/[0.08]">
                    <button
                      onClick={() => setFilter("ALL")}
                      className="min-h-[36px] px-3 py-1 rounded text-[12px] font-medium transition-all cursor-pointer"
                    >
                      All (4)
                    </button>
                    <button
                      onClick={() => setFilter("HIGH")}
                      className="min-h-[36px] px-3 py-1 rounded text-[12px] font-medium transition-all cursor-pointer"
                    >
                      High Risk (2)
                    </button>
                  </div>
                </div>

                {/* Queue Card Stack */}
                <div className="space-y-3">
                  {displayedItems.map((item) => {
                    const isHigh = item.priority === "HIGH";
                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.14] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={
                                isHigh
                                  ? "px-2 py-0.5 rounded text-[12px] font-mono font-bold uppercase bg-[#D7192D]/15 text-[#D7192D] border border-[#D7192D]/30"
                                  : "px-2 py-0.5 rounded text-[12px] font-mono font-bold uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30"
                              }
                            >
                              {item.priority}
                            </span>
                            {item.illustrative && (
                              <span className="text-[10px] font-mono font-bold text-[#D7192D] bg-[#D7192D]/10 px-2 py-0.5 rounded border border-[#D7192D]/30">
                                ILLUSTRATIVE
                              </span>
                            )}
                            <span className="text-[14px] font-bold text-white">{item.customer}</span>
                            <span className="text-neutral-500">•</span>
                            <span className="text-[12px] font-mono text-neutral-400">{item.days}</span>
                          </div>

                          <div className="text-[13px] text-neutral-300">
                            Root cause: <span className="text-neutral-200 font-medium">{item.cause}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                          <div className="text-left sm:text-right">
                            <div className="text-[15px] font-bold font-mono text-white tabular-nums">
                              {item.amount}
                            </div>
                            <div className="text-[12px] font-mono text-emerald-400">
                              Recovery: {item.recovery}
                            </div>
                          </div>

                          <button
                            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-white/[0.06] hover:bg-[#D7192D] text-white hover:text-white border border-white/[0.12] hover:border-[#D7192D] text-[12px] font-semibold transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <span>{item.action}</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Queue Summary Bar */}
                <div className="pt-4 border-t border-white/[0.08] mt-3 flex items-center justify-between text-[12px] text-neutral-400">
                  <span>Ranked by recoverable cash value</span>
                  <span className="text-emerald-400 font-mono font-medium">Auto-synced with ERP</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}