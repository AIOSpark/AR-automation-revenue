"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { useReveal } from "./useReveal";

const HERO_STATS = [
  { value: "₹48 Cr", label: "Receivables analyzed" },
  { value: "18 days", label: "Faster collection" },
  { value: "99.2%", label: "Action accuracy" },
];

const KPI_TILES = [
  { label: "Receivables", value: "₹48.2 Cr", delta: "+12.4% vs last month" },
  { label: "At risk", value: "₹11.6 Cr", delta: "32 invoices need action", color: "red" },
  { label: "Recoverable", value: "₹6.8 Cr", delta: "Identified this week", color: "green" },
];

const ACTION_QUEUE = [
  {
    customer: "Acme Precision Pvt. Ltd.",
    amount: "₹12.8L",
    age: "22 days overdue",
    cause: "PO mismatch",
    recommendation: "Request corrected PO from buyer AP.",
    action: "Send PO query",
  },
  {
    customer: "Nova Industries Ltd.",
    amount: "₹8.4L",
    age: "31 days overdue",
    cause: "Approval pending",
    recommendation: "Reconciliation verified; awaiting AP controller sign-off.",
    action: "Escalate to AP head",
  },
  {
    customer: "Summit Textiles",
    amount: "₹4.2L",
    age: "14 days overdue",
    cause: "Invoice rejected",
    recommendation: "GST tax code mismatch on Line 3; reissue invoice.",
    action: "Reissue invoice",
  },
];

function DashboardPreview() {
  return (
    <div className="relative p-6 rounded-lg bg-[#0A0A0A]/80 border border-white/[0.04] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.5)] transform -rotate-1 hover:rotate-0 transition-transform">
      <div
        aria-hidden="true"
        className="absolute -inset-2 rounded-[2em] pointer-events-none -z-10"
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(255,45,45,0.10) 0%, transparent 60%)",
          filter: "blur(40px)",
        }}
      />
      <div className="relative flex items-center justify-between pb-6 border-b border-white/[0.04] mb-7">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#FF2D2D] animate-pulse" />
          <span className="text-[11px] font-mono font-bold text-white uppercase tracking-wider">
            AIOSpark Command Center
          </span>
        </div>
        <span className="text-[10px] font-mono text-[#71717A] bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
          Live telemetry
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 mb-6 md:grid-cols-3">
        {KPI_TILES.map((c) => {
          const isRed = c.color === "red";
          const isGreen = c.color === "green";
          return (
            <div
              key={c.label}
              className="p-4 rounded-md bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.10] transition-colors"
            >
              <span className="text-[11px] font-mono font-bold text-[#71717A] uppercase tracking-wider block mb-2">
                {c.label}
              </span>
              <div className={`text-xl font-extrabold text-white tabular-nums leading-none tracking-tight mb-1 ${isRed ? "text-[#FF2D2D]" : isGreen ? "text-[#10B981]" : ""}`}>
                {c.value}
              </div>
              <span className={`text-[13px] ${isRed ? "text-[#FF2D2D]" : isGreen ? "text-[#10B981]" : "text-[#71717A]"} font-medium block`}>
                {c.delta}
              </span>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        {ACTION_QUEUE.map((item, i) => (
          <div
            key={i}
            className="p-4 rounded-md border border-white/[0.05] bg-white/[0.02] hover:border-white/[0.10] transition-colors group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-white/[0.03] border border-white/[0.05] flex items-center justify-center text-[10px] font-bold text-[#71717A] shrink-0">
                  {String(i + 1)}
                </span>
                <span className="text-sm font-bold text-white leading-tight">
                  {item.customer}
                </span>
              </div>
              <span className="text-sm font-mono font-bold tabular-nums text-white">
                {item.amount}
              </span>
            </div>
            <div className="flex items-center justify-between text-[13px] mb-2">
              <span className="text-[#71717A]">{item.age}</span>
              <span className="px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.05] text-[11px] font-mono text-[#71717A]">
                {item.cause}
              </span>
            </div>
            <div className="text-sm text-[#A1A1AA] mb-2 leading-snug">
              {item.recommendation}
            </div>
            <button className="aios-btn-ghost text-xs">
              {item.action}
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LandingHero() {
  useReveal();

  return (
    <section
      id="product"
      className="aios-section relative pt-0 pb-0"
      data-aios-reveal
    >
      <div className="aios-container relative z-10">
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-12 lg:gap-16 items-start lg:items-center">
          {/* Copy column - full width on mobile, left column on desktop */}
          <div className="col-span-full lg:col-span-8 xl:col-span-7" data-aios-reveal id="hero-copy">
            <div className="aios-label mb-4 inline-flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D]" />
              AI-powered receivables execution
            </div>

            <h1 className="mb-5 tracking-tight text-3xl sm:text-4xl lg:text-5xl font-bold">
              Turn overdue invoices into working capital. Automatically.
            </h1>

            <p className="aios-body mb-8 leading-relaxed max-w-none text-lg">
              AIOSpark is an intelligent accounts receivable execution platform
              that identifies blocked cash, prioritizes collection actions, and
              helps finance teams recover revenue faster — while staying in
              full control of every decision.
            </p>

            <div className="flex flex-wrap items-center gap-4 mb-10">
              <Link
                href="#book-demo"
                className="aios-btn-primary"
                onClick={(e) => {
                  const el = document.getElementById("book-demo");
                  if (el) {
                    e.preventDefault();
                    el.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                Book a demo <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="#how-it-works"
                className="aios-btn-secondary"
                onClick={(e) => {
                  const el = document.getElementById("how-it-works");
                  if (el) {
                    e.preventDefault();
                    el.scrollIntoView({ behavior: "smooth" });
                  }
                }}
              >
                <Play className="w-4 h-4" /> See how it works
              </Link>
            </div>

            <p className="aios-micro-trust mb-12">
              No credit card &middot; Setup in under 7 days &middot; 14-day pilot
            </p>

            {/* 3-stat strip */}
            <div className="grid grid-cols-1 gap-3 py-3 md:grid-cols-3">
              {HERO_STATS.map((s) => (
                <div key={s.value} className="flex flex-col">
                  <span className="text-3xl font-extrabold text-white tabular-nums tracking-tight leading-none">
                    {s.value}
                  </span>
                  <span className="mt-1.5 text-[13px] text-[#71717A] font-medium leading-snug">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Desktop dashboard preview (right side) */}
          <div className="hidden lg:block lg:col-span-4 xl:col-span-5 relative" data-aios-reveal id="hero-mockup">
            <DashboardPreview />
          </div>

          {/* Mobile dashboard preview - full width below copy */}
          <div className="md:hidden mb-10" data-aios-reveal id="hero-mockup-mobile">
            <DashboardPreview />
          </div>
        </div>
      </div>
    </section>
  );
}