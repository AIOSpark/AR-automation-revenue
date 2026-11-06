"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function FAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const faqs = [
    {
      q: "What is AIOSpark and how does it differ from dunning software?",
      a: "AIOSpark is an Accounts Receivable Automation and Revenue Intelligence platform. Rather than repeating generic email reminders, AIOSpark analyzes why receivables are delayed — isolating root causes such as PO quantity discrepancies, missing tax documents, or approval deadlocks.",
    },
    {
      q: "Who is AIOSpark built for?",
      a: "AIOSpark is engineered for CFOs, Finance Directors, AR Controllers, and enterprise finance teams managing high volume or complex B2B trade receivables.",
    },
    {
      q: "Does AIOSpark replace our ERP system of record?",
      a: "No. AIOSpark operates alongside your existing ERPs and accounting tools (Tally, Zoho, SAP) as an intelligence layer. It reads ledgers and invoices without altering your core system of record.",
    },
    {
      q: "Which accounting systems are currently supported?",
      a: "AIOSpark currently provides direct ledger sync with Tally ERP / Prime, Zoho Books, and spreadsheet CSV/XLSX file uploads. Connectors for SAP S/4HANA, NetSuite, and Microsoft Dynamics 365 are on our active roadmap.",
    },
    {
      q: "How does AIOSpark enforce human policy control?",
      a: "Every automated resolution action formulated by AIOSpark can be policy-gated. AR controllers maintain 100% authority to review, edit, or sign off on any resolution before it is dispatched to external buyers.",
    },
    {
      q: "Is our financial data secure and compliant?",
      a: "Yes. Enterprise data security is foundational to our platform. We enforce end-to-end encryption in transit and at rest, role-based access control (RBAC), and immutable audit logs for all workspace actions.",
    },
  ];

  return (
    <section id="faq" className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            Everything you need to know <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              about AIOSpark architecture.
            </span>
          </h2>
          <p className="text-base sm:text-lg text-neutral-400">
            Answers to common questions regarding integration, governance, and receivables automation.
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl workstation-card border border-white/[0.08] overflow-hidden transition-all"
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-white/[0.03] transition-colors"
                >
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {faq.q}
                  </h3>
                  <ChevronDown
                    className={`w-5 h-5 text-[#FF3B30] shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-6 text-sm text-neutral-300 leading-relaxed border-t border-white/[0.06] pt-4 animate-in fade-in duration-150 font-normal">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
