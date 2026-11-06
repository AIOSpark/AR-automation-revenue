"use client";

import { useState, useEffect } from "react";
import { handleCTAClick } from "@/lib/analytics";
import { ArrowRight, Activity, Sparkles } from "lucide-react";
import { HeroVisual } from "./HeroVisual";
import Link from "next/link";

interface HeroSectionProps {
  onOpenWaitlist: () => void;
}

const ROTATING_PHRASES = [
  "what blocks cash.",
  "PO line mismatches.",
  "missing proof of delivery.",
  "unresolved buyer disputes.",
  "approval bottlenecks.",
];

export function HeroSection({ onOpenWaitlist }: HeroSectionProps) {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setPhraseIdx((prev) => (prev + 1) % ROTATING_PHRASES.length);
        setFade(true);
      }, 250);
    }, 3500);
    return () => clearInterval(interval);
  }, []);

  const handlePrimaryClick = () => {
    handleCTAClick("hero_primary_cta_click");
    onOpenWaitlist();
  };

  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden workstation-shell border-b border-white/[0.08]">
      {/* Animated Ambient Glow Sphere */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-[#FF3B30]/10 blur-[140px] rounded-full pointer-events-none animate-float-glow" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 text-center">
        {/* Animated Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#181B23] border border-white/[0.12] text-xs font-mono text-neutral-300 mb-8 shadow-lg hover:border-[#FF3B30]/50 transition-colors">
          <Sparkles className="w-3.5 h-3.5 text-[#FF3B30] animate-pulse" />
          <span>AUTONOMOUS REVENUE INTELLIGENCE WORKSTATION</span>
        </div>

        {/* Main Headline with Animated Rotating Phrase */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight text-[#FFFFFF] max-w-4xl mx-auto leading-[1.08] mb-6">
          Stop chasing payments. <br />
          <span className="font-serif-editorial font-normal text-neutral-200 underline decoration-[#FF3B30]/40 underline-offset-8">
            Start resolving
          </span>{" "}
          <span
            className={`text-[#FF3B30] inline-block transition-all duration-300 ${
              fade ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
            }`}
          >
            {ROTATING_PHRASES[phraseIdx]}
          </span>
        </h1>

        {/* Supporting Narrative */}
        <p className="text-base sm:text-lg md:text-xl text-neutral-300 max-w-3xl mx-auto mb-10 font-normal leading-relaxed">
          AIOSpark isolates root causes behind stuck B2B receivables — PO mismatches, missing proof of delivery, and approval bottlenecks — providing autonomous resolution with human audit guardrails.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-lg mx-auto mb-14">
          <button
            onClick={handlePrimaryClick}
            data-analytics-event="hero_primary_cta"
            className="w-full sm:w-auto px-8 py-4 rounded-xl font-semibold text-sm text-white bg-gradient-to-b from-[#FF3B30] to-[#E53026] hover:from-[#E53026] hover:to-[#C62828] transition-all cursor-pointer shadow-lg shadow-[#FF3B30]/25 flex items-center justify-center gap-2 active:scale-[0.98] group"
          >
            <span>Get Early Access</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>

          <Link
            href="/dashboard"
            data-analytics-event="hero_secondary_cta"
            className="w-full sm:w-auto px-7 py-4 rounded-xl font-medium text-sm text-white bg-[#12141A] hover:bg-[#181B23] border border-white/[0.12] hover:border-[#FF3B30]/40 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-[0.98]"
          >
            <Activity className="w-4 h-4 text-[#FF3B30]" />
            <span>Explore Workstation Demo</span>
          </Link>
        </div>

        {/* Key Telemetry Highlights */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-14 text-left">
          {[
            { title: "Average DSO Reduction", val: "18.4 Days", tag: "↓ Faster", tagCol: "text-emerald-400" },
            { title: "Dispute Match Accuracy", val: "99.2%", tag: "Verified", tagCol: "text-neutral-400" },
            { title: "Working Capital Unblocked", val: "₹4.2 Cr", tag: "Average", tagCol: "text-emerald-400" },
            { title: "Human Control Standard", val: "100%", tag: "Policy-Gated", tagCol: "text-[#FF3B30]" },
          ].map((item, i) => (
            <div
              key={i}
              className="p-4 rounded-xl workstation-card-interactive border border-white/[0.08] hover:border-[#FF3B30]/40 transition-all"
            >
              <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider mb-1.5">
                {item.title}
              </div>
              <div className="text-2xl font-bold font-mono text-white flex items-baseline gap-1.5">
                {item.val} <span className={`text-xs font-sans font-normal ${item.tagCol}`}>{item.tag}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Hero Visual Component */}
        <HeroVisual />
      </div>
    </section>
  );
}
