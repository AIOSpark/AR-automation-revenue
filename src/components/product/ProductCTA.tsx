"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

interface ProductCTAProps {
  onOpenWaitlist: () => void;
}

export function ProductCTA({ onOpenWaitlist }: ProductCTAProps) {
  return (
    <section className="py-12 md:py-20 bg-[#FFFFFF] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Dark Curved Container Card with Red Cosmic Wave Ribbons */}
        <div className="relative rounded-3xl bg-[#07080B] border border-white/10 overflow-hidden px-6 py-16 sm:px-12 sm:py-20 text-center shadow-2xl">
          
          {/* Crimson Ambient Glows */}
          <div className="absolute top-1/2 left-0 -translate-y-1/2 w-80 h-80 bg-[#EF4444]/15 blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute top-1/2 right-0 -translate-y-1/2 w-80 h-80 bg-[#EF4444]/15 blur-[100px] rounded-full pointer-events-none" />

          {/* Left Cosmic Wave SVG Ribbon */}
          <svg
            className="absolute left-0 top-0 bottom-0 h-full w-48 sm:w-80 pointer-events-none opacity-40"
            viewBox="0 0 300 400"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M-50 400 C 50 300, 150 250, 80 150 C 20 70, 180 50, 120 -50"
              stroke="#EF4444"
              strokeWidth="2.5"
              strokeOpacity="0.6"
            />
            <path
              d="M-80 400 C 20 320, 110 220, 50 120 C 0 40, 150 20, 90 -50"
              stroke="#EF4444"
              strokeWidth="1.5"
              strokeOpacity="0.3"
            />
          </svg>

          {/* Right Cosmic Wave SVG Ribbon */}
          <svg
            className="absolute right-0 top-0 bottom-0 h-full w-48 sm:w-80 pointer-events-none opacity-40"
            viewBox="0 0 300 400"
            fill="none"
            preserveAspectRatio="none"
          >
            <path
              d="M350 400 C 250 300, 150 250, 220 150 C 280 70, 120 50, 180 -50"
              stroke="#EF4444"
              strokeWidth="2.5"
              strokeOpacity="0.6"
            />
            <path
              d="M380 400 C 280 320, 190 220, 250 120 C 300 40, 150 20, 210 -50"
              stroke="#EF4444"
              strokeWidth="1.5"
              strokeOpacity="0.3"
            />
          </svg>

          {/* Content */}
          <div className="relative z-10 max-w-2xl mx-auto space-y-4">
            <div className="text-xs font-bold tracking-wider text-[#EF4444] uppercase">
              READY TO GET STARTED?
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-white tracking-tight leading-tight">
              Turn your inbox into a revenue engine.
            </h2>

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
              <button
                onClick={onOpenWaitlist}
                className="px-6 py-3.5 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white font-semibold text-sm sm:text-base flex items-center gap-2 shadow-lg shadow-red-500/30 transition-all cursor-pointer active:scale-95"
              >
                <span>Try AIOSpark free</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={onOpenWaitlist}
                className="px-6 py-3.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/15 text-white font-medium text-sm sm:text-base transition-all cursor-pointer active:scale-95"
              >
                <span>Book a demo</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
