"use client";

import {
  AlertCircle,
  Banknote,
  Clock,
  GitMerge,
  UserX,
} from "lucide-react";
import { useReveal } from "./useReveal";

const BLOCKERS = [
  {
    icon: AlertCircle,
    title: "Invoice rejected",
    body: "Buyer disputes a line item or tax code, so the invoice sits unpaid until it is corrected and reissued.",
    color: "red",
  },
  {
    icon: GitMerge,
    title: "PO mismatch",
    body: "Purchase order, goods receipt and invoice don't align, blocking the payment run in the buyer's AP system.",
    color: "amber",
  },
  {
    icon: UserX,
    title: "AP rejection",
    body: "Accounts payable rejects the invoice for missing approvals or documentation, returning it to the sender.",
    color: "red",
  },
  {
    icon: Clock,
    title: "Approval delay",
    body: "Invoices wait days for controller sign-off because no one knows which ones are overdue or at risk.",
    color: "amber",
  },
  {
    icon: Banknote,
    title: "Payment delay",
    body: "Even approved invoices sit in the payment queue, stretching the collection cycle and trapping working capital.",
    color: "neutral",
  },
];

const CHIP_COLORS = {
  red: { bg: "bg-[#FF2D2D]/10", border: "border-[#FF2D2D]/25", icon: "text-[#FF2D2D]" },
  amber: { bg: "bg-[#F59E0B]/10", border: "border-[#F59E0B]/25", icon: "text-[#F59E0B]" },
  neutral: { bg: "bg-white/[0.04]", border: "border-white/[0.06]", icon: "text-[#71717A]" },
} as const;

type ChipColor = keyof typeof CHIP_COLORS;

export function LandingProblem() {
  useReveal();

  return (
    <section id="problem" className="aios-section">
      <div className="aios-container">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-start" data-aios-reveal id="problem-section">
          {/* Left: headline + paragraph */}
          <div className="lg:col-span-4 lg:pr-6" data-aios-reveal id="problem-copy">
            <h2 className="mb-6 tracking-tight">Revenue isn&rsquo;t the problem. Cash is.</h2>
            <p className="aios-body leading-relaxed">
              Sales are booked, but the cash never lands. Overdue invoices pile
              up across ERPs, each stuck for a different reason your team has to
              chase manually.
            </p>
          </div>

          {/* Right: cards grid */}
          <div className="lg:col-span-8" data-aios-reveal id="problem-grid">
            <h3 className="sr-only">Why cash gets stuck</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {BLOCKERS.map((b, i) => {
                const Icon = b.icon;
                const c = CHIP_COLORS[b.color as ChipColor];
                return (
                  <div
                    key={b.title}
                    className="aios-card p-6 flex flex-col gap-3 hover:border-white/[0.12] transition-colors"
                    data-aios-reveal
                    id={`blocker-${i}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <span className={`w-10 h-10 rounded-md flex items-center justify-center shrink-0 ${c.bg} ${c.border}`}>
                          <Icon className="w-5 h-5 ${c.icon}" />
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-semibold text-white leading-snug block">
                          {b.title}
                        </span>
                        <p className="text-[15px] text-[#A1A1AA] leading-relaxed mt-1.5">
                          {b.body}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
