"use client";

import { useCallback, useState } from "react";
import { ChevronDown, Shield, Smartphone, Clock, Zap, Lock } from "lucide-react";
import { useReveal } from "./useReveal";

const FAQS = [
  {
    id: "faq-security",
    q: "How is our data secured?",
    a:
      "AIOSpark is SOC 2 aligned and encrypts data at rest and in transit (AES-256 / TLS 1.2+). Receivables data stays in India and is processed in isolated tenant environments. We never share your data with other customers or use it to train public models.",
    icon: Shield,
  },
  {
    id: "faq-erp",
    q: "Which ERPs does AIOSpark integrate with?",
    a:
      "Tally Prime, Zoho Books, SAP, Oracle and QuickBooks are supported out of the box via read connectors. Write-back is available on Pro and Enterprise plans. Custom integrations are available for Enterprise.",
    icon: Smartphone,
  },
  {
    id: "faq-onboarding",
    q: "How long does onboarding take?",
    a:
      "Most teams are set up in under 7 days. ERP connectors are configured in a day, and our team walks you through policy setup, user access and the first recovery queue during dedicated onboarding.",
    icon: Clock,
  },
  {
    id: "faq-dpdp",
    q: "Is AIOSpark DPDP compliant?",
    a:
      "Yes. AIOSpark is built to align with India&rsquo;s Digital Personal Data Protection Act. Personal data is processed only for the purpose of receivables recovery, with consent logs, data minimization and deletion on request.",
    icon: Lock,
  },
  {
    id: "faq-approval",
    q: "Does the AI act without our approval?",
    a:
      "No. AIOSpark recommends recovery actions, but nothing is dispatched outside the policy rules you set. Invoices above ₹50,000 require controller approval by default, and every action is recorded in the audit log.",
    icon: Zap,
  },
];

export function LandingFAQ() {
  const [open, setOpen] = useState<string | null>(null);
  useReveal();
  const toggle = useCallback((id: string) => {
    setOpen((prev) => (prev === id ? null : id));
  }, []);

  return (
    <section id="faq" className="aios-section border-y border-white/[0.06]">
      <div className="aios-container">
        <div className="max-w-[800px] mx-auto text-center mb-12" data-aios-reveal id="faq-copy">
          <div className="aios-label mb-6 inline-flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D2D]" />
            Frequently asked questions
          </div>
          <h2 className="mb-6 tracking-tight">Answers finance teams ask</h2>
          <p className="aios-body mx-auto">
            Everything you need to know before you book a demo.
          </p>
        </div>

        <div className="max-w-[800px] mx-auto space-y-2" data-aios-reveal id="faq-list">
          {FAQS.map((f) => {
            const isOpen = open === f.id;
            const Icon = f.icon;
            return (
              <div
                key={f.id}
                className="aios-card rounded-lg overflow-hidden border border-white/[0.06]"
                data-aios-reveal
                id={f.id}
              >
                <button
                  onClick={() => toggle(f.id)}
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${f.id}`}
                  id={`faq-btn-${f.id}`}
                  className="w-full flex items-center justify-between px-7 py-6 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D2D]/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-white/[0.03] border border-white/[0.06] flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-[#71717A]" />
                    </div>
                    <h3 className="text-[18px] font-semibold text-white leading-snug">
                      {f.q}
                    </h3>
                  </div>
                  <ChevronDown
                    className={`w-4 h-4 text-[#71717A] transition-transform duration-300 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div
                  id={`faq-panel-${f.id}`}
                  hidden={!isOpen}
                  className="border-t border-white/[0.06] px-7 pb-6 pt-1"
                >
                  <p className="text-[15px] text-[#A1A1AA] leading-relaxed">
                    {f.a}
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
