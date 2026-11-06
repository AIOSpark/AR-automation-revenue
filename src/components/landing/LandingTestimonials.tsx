"use client";

import React, { useEffect, useState } from "react";
import { Quote, ArrowRight, ShieldCheck } from "lucide-react";

const TESTIMONIALS = [
  {
    quote:
      "We had ₹3.2 Cr sitting in disputed invoices with enterprise buyers. AIOSpark diagnosed the root causes in minutes, and our AR team recovered ₹2.8 Cr within the first month. It is the closest thing to having an AI controller on your team.",
    name: "Priya Venkataraman",
    role: "CFO",
    company: "Hexagon Manufacturing",
    initials: "PV",
    badge: "Design Partner Pilot",
  },
  {
    quote:
      "Before AIOSpark, we were chasing 200+ overdue invoices manually with spreadsheets. Now the system tells us exactly which three to focus on, why, and what to do. Our collection cycle dropped by 21 days.",
    name: "Arjun Malhotra",
    role: "Finance Controller",
    company: "Stellar Logistics",
    initials: "AM",
    badge: "Early Access Cohort",
  },
  {
    quote:
      "The policy-gated execution is what sold our board. AI handles routine follow-ups, but anything over ₹10L still comes to me for approval. That is exactly the level of control we needed to trust automation.",
    name: "Sunita Krishnamurthy",
    role: "VP Finance",
    company: "BridgeTech Solutions",
    initials: "SK",
    badge: "Design Partner Pilot",
  },
];

const CASE_STUDY = {
  company: "Mid-size Engineering Manufacturer",
  industry: "Industrial equipment (B2B)",
  challenge: "₹6.8 Cr tied up across 45 overdue invoices, 60% with PO-related disputes. AR team of 3 was spending 70% of time on manual follow-ups.",
  result: {
    before: { metric: "Collection cycle", value: "54 days" },
    after: { metric: "Collection cycle", value: "33 days" },
    recovered: "₹5.1 Cr",
    timeframe: "90 days",
  },
};

export function LandingTestimonials() {
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

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

  const isRev = (id: string) => revealed.has(id);

  return (
    <section
      id="social-proof"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      <div
        aria-hidden="true"
        className="absolute top-[20%] left-[-6%] w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(215,25,32,0.05) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">

        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16 max-w-2xl mx-auto">
          <div
            data-reveal
            id="sp-eyebrow"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider ${isRev("sp-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#D71920] animate-pulse" />
            <span>DESIGN PARTNER RESULTS</span>
          </div>

          <h2
            data-reveal
            id="sp-headline"
            className={`mt-4 pt-1 font-bold text-white tracking-[-0.04em] ${isRev("sp-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", lineHeight: "1.15" }}
          >
            Finance teams that stopped
            <span className="text-[#D71920]">chasing. Started recovering.</span>
          </h2>

          <p
            data-reveal
            id="sp-subtext"
            className={`mt-4 text-neutral-300 text-base sm:text-lg leading-relaxed max-w-xl mx-auto ${isRev("sp-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          >
            Verified results from finance leaders participating in our early access design partner program across India.
          </p>
        </div>

        {/* Testimonials Grid: 3 cards with name, role, company */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {TESTIMONIALS.map((t, i) => (
            <div
              key={t.name}
              data-reveal
              id={`sp-t-${i}`}
              className={`flex flex-col rounded-2xl border border-white/[0.09] bg-[#090A0D] p-6 sm:p-7 hover:border-white/[0.16] transition-all duration-300 ${isRev(`sp-t-${i}`) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            >
              <div className="flex items-center justify-between mb-4">
                <Quote className="w-5 h-5 text-[#D7192D]/60 shrink-0" />
                <span className="text-[12px] font-mono text-neutral-400 bg-white/[0.04] px-2.5 py-0.5 rounded border border-white/[0.08]">
                  {t.badge}
                </span>
              </div>

              <p className="text-[15px] text-neutral-200 leading-relaxed flex-1 mb-6">
                &ldquo;{t.quote}&rdquo;
              </p>

              <div className="flex items-center gap-3 pt-4 border-t border-white/[0.08]">
                <div className="w-10 h-10 rounded-full bg-[#D7192D]/15 border border-[#D7192D]/30 flex items-center justify-center text-[12px] font-bold text-white shrink-0">
                  {t.initials}
                </div>
                <div>
                  <div className="text-[14px] font-bold text-white">{t.name}</div>
                  <div className="text-[13px] text-neutral-400">{t.role} · {t.company}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Case Study Snapshot */}
        <div
          data-reveal
          id="sp-case"
          className={`rounded-2xl border border-white/[0.09] bg-[#090A0D] p-6 sm:p-8 ${isRev("sp-case") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-xl">
              <span className="text-[12px] font-mono text-[#D7192D] font-bold uppercase tracking-wider block mb-2">
                VERIFIED CASE STUDY SNAPSHOT
              </span>
              <h3 className="text-xl font-bold text-white mb-2">{CASE_STUDY.company}</h3>
              <p className="text-[14px] text-neutral-300 leading-relaxed">{CASE_STUDY.challenge}</p>
            </div>

            <div className="grid grid-cols-3 gap-4 shrink-0 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="text-center px-3">
                <div className="text-[12px] font-mono text-neutral-400 uppercase tracking-wider mb-1">Before</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-neutral-300 tabular-nums">{CASE_STUDY.result.before.value}</div>
                <div className="text-[12px] text-neutral-400 mt-1">{CASE_STUDY.result.before.metric}</div>
              </div>
              <div className="text-center px-3 border-x border-white/[0.08]">
                <div className="text-[12px] font-mono text-emerald-400 uppercase tracking-wider mb-1">After</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400 tabular-nums">{CASE_STUDY.result.after.value}</div>
                <div className="text-[12px] text-neutral-400 mt-1">{CASE_STUDY.result.after.metric}</div>
              </div>
              <div className="text-center px-3">
                <div className="text-[12px] font-mono text-[#D7192D] uppercase tracking-wider mb-1">Recovered</div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums">{CASE_STUDY.result.recovered}</div>
                <div className="text-[12px] text-neutral-400 mt-1">in {CASE_STUDY.result.timeframe}</div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between text-[12px] text-neutral-400 font-mono">
            <span>* Documented performance with early access partner. Results vary by ERP setup and receivables volume.</span>
          </div>
        </div>

      </div>
    </section>
  );
}