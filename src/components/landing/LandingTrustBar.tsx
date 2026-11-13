"use client";

import { useReveal } from "./useReveal";

const ERPS = ["Tally Prime", "Zoho Books", "SAP", "Oracle", "QuickBooks"];

const BADGES = [
  { label: "SOC 2 aligned" },
  { label: "DPDP-aligned" },
  { label: "AES-256 encrypted" },
];

export function LandingTrustBar() {
  useReveal();

  return (
    <section id="integrations" className="aios-section border-y border-white/[0.06]">
      <div className="aios-container">
        <div
          className="flex flex-col lg:flex-row items-center justify-between gap-6 mb-14"
          data-aios-reveal
          id="trust-copy"
        >
          <div className="flex items-center gap-3">
            <span className="aios-label">Works with</span>
            <span className="w-px h-5 bg-neutral-700" />
          </div>
          <div className="flex items-center gap-8 lg:gap-12 flex-wrap">
            {ERPS.map((erp) => (
              <span
                key={erp}
                className="text-[17px] text-neutral-400 font-medium leading-none"
                data-aios-reveal
                id={`erp-${erp.toLowerCase().replace(/\s+/, "")}`}
              >
                {erp}
              </span>
            ))}
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-4 lg:gap-6 justify-center"
          data-aios-reveal
          id="trust-badges"
        >
          {BADGES.map((b) => (
            <span
              key={b.label}
              className="aios-chip aios-chip--neutral"
              data-aios-reveal
              id={`badge-${b.label.toLowerCase().replace(/\s+/, "")}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
