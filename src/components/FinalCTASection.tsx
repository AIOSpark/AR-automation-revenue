"use client";

import { handleCTAClick } from "@/lib/analytics";
import { ArrowRight, Activity } from "lucide-react";
import Link from "next/link";

interface FinalCTASectionProps {
  onOpenWaitlist: () => void;
}

export function FinalCTASection({ onOpenWaitlist }: FinalCTASectionProps) {
  const handlePrimaryClick = () => {
    handleCTAClick("final_cta_primary_click");
    onOpenWaitlist();
  };

  return (
    <section className="py-24 bg-[#0A0B0E] relative overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center relative z-10">
        <h2 className="text-4xl sm:text-6xl font-bold text-white tracking-tight mb-6 leading-tight">
          Find out what is blocking your cash. <br />
          <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
            Transform your receivables pipeline today.
          </span>
        </h2>

        <p className="text-base sm:text-lg text-neutral-400 max-w-2xl mx-auto mb-10 leading-relaxed font-normal">
          AIOSpark empowers modern finance teams to pinpoint payment friction, clear exceptions, and automate order-to-cash with total audit governance.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto">
          <button
            onClick={handlePrimaryClick}
            data-analytics-event="final_cta_button"
            className="btn-editorial-primary w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base text-white flex items-center justify-center gap-2 cursor-pointer shadow-xl"
          >
            <span>Get Early Access</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-base text-neutral-200 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.1] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <Activity className="w-4 h-4 text-[#FF3B30]" />
            <span>Launch Workstation</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
