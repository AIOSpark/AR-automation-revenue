"use client";

import { useState } from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingTrappedCash } from "@/components/landing/LandingTrappedCash";
import { LandingAIDiagnosis } from "@/components/landing/LandingAIDiagnosis";
import { LandingWorkflow } from "@/components/landing/LandingWorkflow";
import { LandingAutonomy } from "@/components/landing/LandingAutonomy";
import { LandingCashQueue } from "@/components/landing/LandingCashQueue";
import { LandingCausal } from "@/components/landing/LandingCausal";
import { LandingProof } from "@/components/landing/LandingProof";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingFinalCTA } from "@/components/landing/LandingFinalCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { EarlyAccessModal } from "@/components/EarlyAccessModal";

export default function Home() {
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

  return (
    <div className="landing-shell min-h-screen text-white selection:bg-[#FF2D2D]/30 selection:text-white antialiased">
      <a href="#landing-content" className="landing-skip-link">
        Skip to content
      </a>

      {/* Sticky Navigation with Blur & Active-Section Indicator */}
      <LandingNavbar onOpenWaitlist={() => setIsWaitlistOpen(true)} />

      <main id="landing-content" tabIndex={-1}>
        {/* 1. Hero — Command Center with enlarged metrics & trust dividers */}
        <LandingHero onOpenWaitlist={() => setIsWaitlistOpen(true)} />

        {/* 2. Problem — Money is trapped */}
        <LandingTrappedCash />

        {/* 3. Decision Engine — AI that understands why cash is stuck */}
        <LandingAIDiagnosis />

        {/* 4. Signature Workflow — 5-step stepper with animated progress line + CTA */}
        <LandingWorkflow onOpenWaitlist={() => setIsWaitlistOpen(true)} />

        {/* 5. Controlled Autonomy — Policy engine & guardrails */}
        <LandingAutonomy onOpenWaitlist={() => setIsWaitlistOpen(true)} />

        {/* 6. Cash Unblock Queue — Prioritize recoverable rupees */}
        <LandingCashQueue />

        {/* 7. Causal Intelligence — Dependency graph analysis */}
        <LandingCausal />

        {/* 8. Business Outcomes & Accounting Stack Integrations (Merged & Streamlined) + CTA */}
        <LandingProof onOpenWaitlist={() => setIsWaitlistOpen(true)} />

        {/* 9. Social Proof — Testimonials & Case Study */}
        <LandingTestimonials />

        {/* 10. Pricing Plans — Highlighted Workstation Pro with "Most popular" badge */}
        <div id="pricing-section">
          <LandingPricing onOpenWaitlist={() => setIsWaitlistOpen(true)} />
        </div>

        {/* 11. FAQ Accordion — Security, Integrations, Onboarding, Privacy, Pricing */}
        <LandingFAQ />

        {/* 12. Final CTA — Inline email capture & Early Access */}
        <LandingFinalCTA onOpenWaitlist={() => setIsWaitlistOpen(true)} />
      </main>

      {/* Footer */}
      <LandingFooter />

      {/* Early Access Modal */}
      <EarlyAccessModal
        isOpen={isWaitlistOpen}
        onClose={() => setIsWaitlistOpen(false)}
      />
    </div>
  );
}