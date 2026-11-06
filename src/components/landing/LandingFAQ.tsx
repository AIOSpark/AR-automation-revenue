"use client";

import React, { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Is our financial data secure, and where is it stored?",
    a: "AIOSpark is built on SOC 2-compliant infrastructure hosted entirely in India (AWS Asia Pacific Mumbai / MeitY-empanelled data centers). Your invoice data, ERP exports, and customer records never leave Indian borders. All data is encrypted at rest using AES-256 and in transit via TLS 1.3. You retain complete data ownership and can request full cryptographic deletion at any time.",
  },
  {
    q: "Which ERPs and accounting tools do you integrate with?",
    a: "We provide native, bidirectional connectors for Tally Prime / ERP 9, Zoho Books, SAP S/4HANA, ERPNext, and Intuit QuickBooks. Oracle NetSuite and Microsoft Dynamics 365 connectors are currently in pilot (Q1). If your organization utilizes a proprietary ledger, our standard REST ingestion APIs can onboard your data within 5–10 business days.",
  },
  {
    q: "How long does onboarding take?",
    a: "Most finance teams are connected and working their first recovery queue within 5 to 7 business days. Onboarding includes read-only ERP connector configuration, historical baseline data validation, and one 45-minute workflow alignment session with your credit controller. We handle all technical setup — your team does not need to write code.",
  },
  {
    q: "How does AIOSpark protect data privacy under India's DPDP Act?",
    a: "AIOSpark is designed from the ground up for strict compliance with India's Digital Personal Data Protection (DPDP) Act 2023. We process only commercial B2B transactional records necessary to execute receivables recovery workflows. We never train public foundation models on your proprietary company ledger data, and execute formal Data Processing Agreements (DPA) with all partners.",
  },
  {
    q: "What does pricing look like after the pilot period?",
    a: "The Starter Pilot (₹0/month) allows your team to test root-cause detection on up to ₹25L in receivables risk-free. After the pilot, Workstation Pro is ₹14,999/month (or ₹11,999/month billed annually) and covers unlimited receivables with full autonomous execution and bidirectional ERP write-back. Multi-entity enterprise tiers are scoped to organizational scale.",
  },
  {
    q: "Will the AI dispatch emails or modify ledgers without my approval?",
    a: "Never without explicit policy authorization. You define precise approval thresholds by invoice amount, customer risk tier, and dispute type. Low-risk reminders can run autonomously, while any high-value escalation or credit note requires one-click controller sign-off. Every single action is auditable, reversible, and logged with timestamped signatures.",
  },
];

export function LandingFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
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

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <section
      id="faq"
      className="relative text-white border-t border-white/[0.08]"
      style={{ background: "#050505" }}
    >
      <div
        aria-hidden="true"
        className="absolute top-[15%] right-[-8%] w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(215,25,32,0.05) 0%, transparent 70%)",
          filter: "blur(90px)",
        }}
      />

      <div className="max-w-[960px] mx-auto px-6 sm:px-8 lg:px-12 relative z-10">

        {/* Section Header */}
        <div className="text-center mb-12 sm:mb-16">
          <div
            data-reveal
            id="faq-eyebrow"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.12] text-[12px] font-mono text-neutral-300 uppercase tracking-wider ${isRev("faq-eyebrow") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#D7192D] animate-pulse" />
            <span>FREQUENTLY ASKED QUESTIONS</span>
          </div>

          <h2
            data-reveal
            id="faq-headline"
            className={`mt-4 pt-1 font-bold text-white tracking-[-0.04em] ${isRev("faq-headline") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
            style={{ fontSize: "clamp(2rem, 3.5vw, 3rem)", lineHeight: "1.15" }}
          >
            Questions your CFO
            <span className="text-[#D7192D]">will ask.</span>
          </h2>

          <p
            data-reveal
            id="faq-subtext"
            className={`mt-4 text-neutral-300 text-base sm:text-lg leading-relaxed max-w-xl mx-auto ${isRev("faq-subtext") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}
          >
            Everything you need to know about security, ERP integrations, onboarding timelines, and data privacy.
          </p>
        </div>

        {/* Accordion List */}
        <div
          data-reveal
          id="faq-list"
          className={`space-y-3.5 ${isRev("faq-list") ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          {FAQS.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <div
                key={faq.q}
                className={`rounded-2xl border transition-all duration-300 overflow-hidden ${isOpen ? "border-[#D7192D]/40 bg-[#090A0E] shadow-lg shadow-black/40" : "border-white/[0.08] bg-[#090A0D] hover:border-white/[0.15]"}`}
              >
                <button
                  id={`faq-q-${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-a-${i}`}
                  onClick={() => toggle(i)}
                  className="w-full min-h-[56px] flex items-center justify-between gap-4 p-5 sm:p-6 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D7192D] rounded-2xl"
                >
                  <span className="text-[15px] sm:text-base font-semibold text-white leading-snug">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-neutral-400 shrink-0 transition-transform duration-300 ${isOpen ? "rotate-180 text-[#D7192D]" : ""}`}
                  />
                </button>

                <div
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
                >
                  <p className="px-5 pb-6 sm:px-6 sm:pb-6 text-[14px] sm:text-[15px] text-neutral-300 leading-relaxed border-t border-white/[0.05] pt-4">
                    {faq.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}