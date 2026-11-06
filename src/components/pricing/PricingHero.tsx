"use client";

import React from "react";
import { Calendar, CreditCard, ShieldCheck, TrendingUp, Sparkles, Clock, DollarSign, Target } from "lucide-react";
import { SparkIcon } from "../landing/LandingLogos";

export function PricingHero() {
  return (
    <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 bg-[#07080B] text-white overflow-hidden">
      {/* Background Cosmic Deep Orb & Arc Glow */}
      <div className="absolute top-1/4 right-0 w-[650px] h-[650px] bg-[#EF4444]/15 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute -top-20 -right-20 w-[720px] h-[720px] rounded-full border border-red-500/15 pointer-events-none shadow-[inset_0_0_80px_rgba(239,68,68,0.12)] [mask-image:radial-gradient(ellipse_70%_70%_at_65%_45%,#000_30%,transparent_75%)]" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* LEFT COLUMN: HERO COPY */}
          <div className="lg:col-span-6 space-y-6">
            {/* Tagline */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-[11px] font-mono font-bold text-[#EF4444] uppercase tracking-wider">
              <span>FINANCIAL WORKSTATION PRICING</span>
            </div>

            {/* Main Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-bold text-white tracking-tight leading-[1.1]">
              Predictable pricing <br />
              for <span className="font-serif-editorial font-normal text-neutral-200 underline decoration-[#EF4444]/40 underline-offset-8">growing finance teams.</span>
            </h1>

            {/* Subtext */}
            <p className="text-neutral-300 text-base sm:text-lg leading-relaxed max-w-lg font-normal">
              Scale autonomous AR workflows, invoice dispute resolution, and cash forecasting with zero per-seat friction. Start free, upgrade anytime.
            </p>

            {/* Benefit Pills */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-2 text-xs font-mono text-neutral-300">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#EF4444]" />
                <span>14-day free pilot</span>
              </div>

              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#EF4444]" />
                <span>No credit card required</span>
              </div>

              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#EF4444]" />
                <span>Cancel anytime</span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: 3D PERSPECTIVE TILTED GRAPHIC CARD */}
          <div className="lg:col-span-6 relative flex items-center justify-center">
            <div className="relative w-full max-w-lg [perspective:1200px]">
              
              {/* Main Growth Chart Card */}
              <div
                className="w-full rounded-2xl bg-[#0D0F17]/95 border border-white/10 shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95)] backdrop-blur-xl overflow-hidden p-5 sm:p-6 transition-transform duration-500 hover:[transform:none] relative"
                style={{
                  transform: "rotateY(-4deg) rotateX(3deg)",
                  transformStyle: "preserve-3d",
                }}
              >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <div className="flex items-center gap-2">
                    <SparkIcon className="w-4 h-4 text-[#EF4444]" />
                    <span className="text-xs font-bold text-white tracking-wide">Business Growth</span>
                  </div>
                  <span className="text-[10px] text-neutral-400 font-mono">Q3 Performance</span>
                </div>

                {/* Growth Chart Area with Bars & Line */}
                <div className="grid grid-cols-12 gap-4 mt-4 items-center">
                  
                  {/* Left Chart SVG (7 Cols) */}
                  <div className="col-span-7 space-y-2">
                    <div className="relative h-32 w-full">
                      {/* Vertical Bars */}
                      <div className="absolute inset-0 flex items-end justify-between px-2 gap-2 opacity-30">
                        <div className="w-full bg-white/10 rounded-t h-[30%]" />
                        <div className="w-full bg-white/10 rounded-t h-[45%]" />
                        <div className="w-full bg-white/10 rounded-t h-[40%]" />
                        <div className="w-full bg-white/10 rounded-t h-[65%]" />
                        <div className="w-full bg-white/10 rounded-t h-[85%]" />
                      </div>

                      {/* Glowing Upward Line Chart SVG */}
                      <svg className="w-full h-full overflow-visible relative z-10" viewBox="0 0 160 100" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#EF4444" stopOpacity="0.4" />
                            <stop offset="100%" stopColor="#EF4444" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Shaded Area */}
                        <path
                          d="M 10 80 Q 40 70 70 50 T 110 45 T 150 15 L 150 95 L 10 95 Z"
                          fill="url(#growthGrad)"
                        />

                        {/* Curved Line */}
                        <path
                          d="M 10 80 Q 40 70 70 50 T 110 45 T 150 15"
                          fill="none"
                          stroke="#EF4444"
                          strokeWidth="3"
                          strokeLinecap="round"
                        />

                        {/* Peak Dot */}
                        <circle cx="150" cy="15" r="4" fill="#EF4444" stroke="#FFFFFF" strokeWidth="2" />
                      </svg>
                    </div>

                    {/* Floating Pill Tag inside card */}
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-[11px] font-semibold text-white shadow-sm">
                      <TrendingUp className="w-3.5 h-3.5 text-[#EF4444]" />
                      <span>More opportunities</span>
                    </div>
                  </div>

                  {/* Right Metric Cards Stack (5 Cols) */}
                  <div className="col-span-5 space-y-2 font-mono">
                    {/* Metric 1 */}
                    <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-red-500/15 text-[#EF4444] border border-red-500/30 flex items-center justify-center shrink-0">
                        <Target className="w-3 h-3" />
                      </div>
                      <div>
                        <div className="text-[9px] text-neutral-400 font-sans">Leads detected</div>
                        <div className="text-xs font-bold text-white">120+</div>
                      </div>
                    </div>

                    {/* Metric 2 */}
                    <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-red-500/15 text-[#EF4444] border border-red-500/30 flex items-center justify-center shrink-0">
                        <Clock className="w-3 h-3" />
                      </div>
                      <div>
                        <div className="text-[9px] text-neutral-400 font-sans">Time saved</div>
                        <div className="text-xs font-bold text-white">20 hrs</div>
                      </div>
                    </div>

                    {/* Metric 3 */}
                    <div className="p-2 rounded-lg bg-white/[0.03] border border-white/[0.08] flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-red-500/15 text-[#EF4444] border border-red-500/30 flex items-center justify-center shrink-0">
                        <DollarSign className="w-3 h-3" />
                      </div>
                      <div>
                        <div className="text-[9px] text-neutral-400 font-sans">Revenue potential</div>
                        <div className="text-xs font-bold text-white">$50K+</div>
                      </div>
                    </div>
                  </div>

                </div>

              </div>

            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
