"use client";

import { useReveal } from "./useReveal";
import { TrendingUp, CheckCircle, CreditCard } from "lucide-react";

const METRICS = [
  {
    label: "Disputes resolved",
    value: "24.7%",
    icon: CheckCircle,
    note: "Auto-diagnosed root causes cut back-and-forth",
  },
  {
    label: "Recovered to date",
    value: "₹5.1 Cr",
    icon: CreditCard,
    note: "Overdue invoices turned into working capital",
  },
];

const TESTIMONIALS = [
  {
    initials: "LI",
    quote: "AIOSpark cut our collection cycle from 54 days to 33. The audit log means our controllers always know what the agent did and why.",
    name: "Lakshmi Iyer",
    role: "Finance Controller",
    company: "Meru Manufacturing",
    label: "Design partner",
    color: "#FF2D2D",
  },
  {
    initials: "RD",
    quote: "We recover overdue invoices without chasing buyers manually. The policy rules keep our approval process intact.",
    name: "Rahul Desai",
    role: "CFO",
    company: "Kiran Auto Components",
    label: "Design partner",
    color: "#FF2D2D",
  },
  {
    initials: "SR",
    quote: "The root-cause detection is precise. We know exactly why each invoice is stuck and which action will unblock it.",
    name: "Sneha Reddy",
    role: "Head of AR",
    company: "Vega Textiles",
    label: "Beta customer",
    color: "#10B981",
  },
];

export function LandingProof() {
  useReveal();

  return (
    <section id="proof" className="aios-section border-y border-white/[0.06]">
      <div className="aios-container">
        <div className="max-w-2xl mx-auto text-center mb-16" data-aios-reveal id="proof-copy">
          <h2 className="mb-6 tracking-tight">Trapped cash, released</h2>
          <p className="aios-body mx-auto">
            Results below are from early design partners and beta customers.
            Figures are as reported by those teams and may not reflect your
            results.
          </p>
        </div>

        {/* Before/after card */}
        <div
          className="aios-card-lg p-6 sm:p-8 mb-10 flex flex-col lg:flex-row gap-10 items-start lg:items-center"
          data-aios-reveal
          id="proof-beforeafter"
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[#10B981] shrink-0" />
              <span className="text-[11px] font-bold text-[#10B981] uppercase tracking-wider">Improved</span>
            </div>
            <h3 className="text-3xl sm:text-4xl font-bold text-white mb-4 leading-tight">
              Collection cycle: 54 days &rarr; 33 days
            </h3>
            <p className="text-[15px] text-[#A1A1AA] leading-relaxed">
              Finance teams using AIOSpark collect overdue invoices 21 days
              faster, freeing up working capital that was previously trapped.
            </p>
          </div>
          <div className="w-full lg:w-[42%] flex flex-col gap-4">
            {[
              { days: 54, label: "Before", color: "#FF2D2D", width: "58%" },
              { days: 33, label: "After", color: "#10B981", width: "38%" },
            ].map((d, i) => (
              <div key={d.label} className="flex items-center gap-3">
                <span className="w-[3px] flex-1 rounded-full bg-white/[0.06]" />
                <div className={`h-2.5 rounded-full flex-1 bg-white/[0.06]`}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: d.color,
                      width: d.width,
                      transition: "width 1000ms ease",
                    }}
                  />
                </div>
                <span className={`text-[14px] font-mono font-bold tabular-nums text-white min-w-[44px] text-right`}>
                  {d.days} days
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Two metric cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12" data-aios-reveal id="proof-metrics">
          {METRICS.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="aios-card p-6 sm:p-8 rounded-lg flex flex-col gap-3"
                data-aios-reveal
                id={`metric-${m.label}`}
              >
                <div className="w-10 h-10 rounded-md bg-white/[0.03] border border-white/[0.05] flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#10B981]" />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tabular-nums tracking-tight leading-none">
                    {m.value}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white">{m.label}</h4>
                <p className="text-[14px] text-[#A1A1AA] leading-relaxed">{m.note}</p>
              </div>
            );
          })}
        </div>

        {/* Testimonials: 3-column grid */}
        <div className="max-w-3xl mx-auto" data-aios-reveal id="proof-testimonials">
          <h3 className="sr-only">Customer testimonials</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="aios-card p-6 sm:p-8 rounded-lg flex flex-col gap-4"
                data-aios-reveal
                id={`testimonial-${t.name}`}
              >
                <div className="flex items-start gap-3 mb-1">
                  <div
                    className={`w-10 h-10 rounded-md flex-shrink-0 flex items-center justify-center text-[14px] font-bold ${t.color === "#FF2D2D" ? "text-[#FF2D2D] border-[#FF2D2D]/25 bg-[#FF2D2D]/10" : "text-[#10B981] border-[#10B981]/25 bg-[#10B981]/10"}`}
                    style={{ borderColor: t.color === "#FF2D2D" ? "rgba(255,45,45,0.25)" : "rgba(16,185,129,0.25)" }}
                  >
                    {t.initials}
                  </div>
                  <span className={`aios-chip aios-chip--neutral text-[11px] mt-0.5 ${t.color === "#FF2D2D" ? "aios-chip--red" : ""}`}>
                    {t.label}
                  </span>
                </div>
                <p className="text-[15px] text-[#A1A1AA] leading-relaxed italic flex-1">
                  {t.quote}
                </p>
                <div className="mt-auto pt-4 border-t border-white/[0.06]">
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-[13px] text-[#71717A]">{t.role}, {t.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
