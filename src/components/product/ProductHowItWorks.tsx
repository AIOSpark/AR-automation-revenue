"use client";

import React from "react";
import { Mail, FileText, Users } from "lucide-react";
import { SparkIcon } from "../landing/LandingLogos";

export function ProductHowItWorks() {
  const steps = [
    {
      num: "01",
      icon: Mail,
      isSpark: false,
      title: "Sync Your Inbox",
      description: "Connect your business email in seconds.",
    },
    {
      num: "02",
      icon: null,
      isSpark: true,
      title: "AI Analyzes",
      description: "We sort, categorize and find high-value opportunities.",
    },
    {
      num: "03",
      icon: FileText,
      isSpark: false,
      title: "Review & Approve",
      description: "Get AI-drafted replies and make updates if needed.",
    },
    {
      num: "04",
      icon: Users,
      isSpark: false,
      title: "Build Relationships",
      description: "Send replies and turn conversations into revenue.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 md:py-28 bg-[#07080B] text-white relative overflow-hidden border-t border-white/[0.08]">
      {/* Subtle Crimson Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[#EF4444]/10 blur-[140px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header Row */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-16">
          <div>
            <div className="text-xs font-bold tracking-wider text-[#EF4444] uppercase mb-2">
              HOW IT WORKS
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-[42px] font-bold text-white tracking-tight leading-tight">
              From email to opportunity <br />
              in four simple steps.
            </h2>
          </div>

          <p className="text-neutral-400 text-sm sm:text-base max-w-md leading-relaxed">
            AIOSpark handles the busy work, so you can focus on what matters — growing your business.
          </p>
        </div>

        {/* 4 Steps Horizontal Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isLast = idx === steps.length - 1;

            return (
              <div key={idx} className="relative group">
                
                {/* Horizontal Connector Line for desktop */}
                {!isLast && (
                  <div className="hidden lg:block absolute top-4 left-[calc(100%-8px)] w-6 h-[1px] bg-neutral-700 z-0">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#EF4444]" />
                  </div>
                )}

                {/* Step Card Container */}
                <div className="rounded-2xl bg-[#0D1017] border border-white/10 p-6 sm:p-7 shadow-lg hover:border-red-500/40 transition-all flex flex-col justify-between h-56 relative z-10">
                  
                  {/* Top Step Number Badge & Icon */}
                  <div className="flex items-center justify-between">
                    <div className="w-7 h-7 rounded-full bg-[#EF4444] text-white flex items-center justify-center text-xs font-bold shadow-md shadow-red-500/30">
                      {step.num}
                    </div>

                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-[#EF4444]">
                      {step.isSpark ? (
                        <SparkIcon className="w-5 h-5 text-[#EF4444]" />
                      ) : (
                        Icon && <Icon className="w-5 h-5" />
                      )}
                    </div>
                  </div>

                  {/* Text Details */}
                  <div className="mt-6">
                    <h3 className="text-base font-bold text-white mb-2">
                      {step.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                </div>

              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
