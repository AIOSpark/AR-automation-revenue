"use client";

import { handleCTAClick } from "@/lib/analytics";
import { Sparkles, ArrowRight, CheckCircle2 } from "lucide-react";

interface EarlyAccessProgramSectionProps {
  onOpenWaitlist: () => void;
}

export function EarlyAccessProgramSection({ onOpenWaitlist }: EarlyAccessProgramSectionProps) {
  const handleClick = () => {
    handleCTAClick("early_access_program_cta_click");
    onOpenWaitlist();
  };

  const partnerBenefits = [
    "Priority feature requests & custom ERP workflow development",
    "Direct weekly access to the AIOSpark founding engineering team",
    "Locked-in design partner pricing upon public release",
  ];

  return (
    <section className="py-24 bg-[#050505] border-b border-neutral-800/80">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="p-8 sm:p-12 rounded-3xl bg-neutral-900 border-2 border-[#FF2D2D]/40 shadow-2xl relative overflow-hidden text-center">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-[#FF2D2D]/15 blur-3xl pointer-events-none rounded-full" />

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FF2D2D]/10 border border-[#FF2D2D]/30 text-xs font-bold uppercase tracking-wider text-[#FF2D2D] mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Limited early-access program</span>
          </div>

          <h3 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-6">
            Help us build the future of receivables operations.
          </h3>

          <p className="text-base sm:text-lg text-neutral-300 max-w-2xl mx-auto mb-10 leading-relaxed">
            We're inviting a limited number of B2B finance teams to become early design partners and help shape AIOSpark.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mb-10 text-left font-sans text-xs text-neutral-300">
            {partnerBenefits.map((benefit, idx) => (
              <div key={idx} className="p-4 rounded-xl bg-[#050505] border border-neutral-800 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#FF2D2D] shrink-0 mt-0.5" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>

          <button
            onClick={handleClick}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-base text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all cursor-pointer shadow-xl shadow-[#FF2D2D]/25 active:scale-95"
          >
            <span>Apply for Early Access</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </section>
  );
}
