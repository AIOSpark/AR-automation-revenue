"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";

export function LandingSocialProof() {
  const testimonials = [
    {
      quote:
        "AIOSpark transformed our collections cadence. Identifying PO discrepancies automatically cut our overdue receivables by 42% in our very first billing cycle.",
      name: "Priya Sharma",
      role: "CFO, Tech Solutions Ltd",
      avatarText: "P",
    },
    {
      quote:
        "Automating invoice disputes and multi-channel reminders brought our DSO down by 16.5 days. Our finance analysts saved 20+ hours every week.",
      name: "Vikram Malhotra",
      role: "VP Finance, Apex Logistics",
      avatarText: "V",
    },
    {
      quote:
        "Our treasury finally has real-time visibility into every blocked rupee with zero manual spreadsheets. The audit trail is flawless.",
      name: "Ananya Roy",
      role: "Head of Operations, CloudWave",
      avatarText: "A",
    },
  ];

  const [currentIdx, setCurrentIdx] = useState(0);

  const prev = () => {
    setCurrentIdx((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
  };

  const next = () => {
    setCurrentIdx((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
  };

  const activeTestimonial = testimonials[currentIdx];

  return (
    <section className="landing-section landing-social-proof py-20 md:py-28 bg-[#07080B] text-white border-t border-white/[0.06] relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* LEFT: METRICS & HEADING */}
          <div className="lg:col-span-6 space-y-6">
            <div className="text-xs font-bold tracking-wider text-[#EF4444] uppercase">
              TRUSTED BY ENTERPRISE FINANCE TEAMS
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-bold text-white tracking-tight leading-[1.15]">
              Faster collections. <br />
              <span className="font-serif-editorial font-normal text-neutral-300">
                Predictable working capital.
              </span>
            </h2>

            {/* 3 Large Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 pt-4">
              <div className="landing-metric-card p-4 rounded-xl bg-[#12141A] border border-white/[0.08]">
                <div className="text-2xl sm:text-3xl font-bold font-mono text-white">₹48 Cr+</div>
                <div className="text-xs text-neutral-400 mt-1">Cash Unblocked</div>
              </div>

              <div className="landing-metric-card p-4 rounded-xl bg-[#12141A] border border-white/[0.08]">
                <div className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">-18.4d</div>
                <div className="text-xs text-neutral-400 mt-1">Average DSO Reduction</div>
              </div>

              <div className="landing-metric-card p-4 rounded-xl bg-[#12141A] border border-white/[0.08]">
                <div className="text-2xl sm:text-3xl font-bold font-mono text-white">99.2%</div>
                <div className="text-xs text-neutral-400 mt-1">Ledger Sync Accuracy</div>
              </div>
            </div>
          </div>

          {/* RIGHT: TESTIMONIAL CARD */}
          <div className="lg:col-span-6">
            <div className="landing-testimonial-card rounded-2xl bg-[#12141A] border border-white/[0.08] p-8 shadow-2xl relative space-y-6">
              
              {/* Star Rating */}
              <div className="flex items-center gap-1 text-amber-400">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                ))}
              </div>

              <blockquote aria-live="polite" className="text-base sm:text-lg text-neutral-200 leading-relaxed font-sans">
                &ldquo;{activeTestimonial.quote}&rdquo;
              </blockquote>

              <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#EF4444] to-[#B91C1C] flex items-center justify-center text-white font-bold text-sm shadow-md">
                    {activeTestimonial.avatarText}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{activeTestimonial.name}</div>
                    <div className="text-xs text-neutral-400">{activeTestimonial.role}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={prev}
                    aria-label="Previous testimonial"
                    className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={next}
                    aria-label="Next testimonial"
                    className="w-8 h-8 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
