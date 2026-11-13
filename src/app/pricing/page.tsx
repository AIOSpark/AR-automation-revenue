"use client";

import { useState } from "react";
import { LandingNavbar } from "@/components/landing/LandingNavbar";
import { PricingHero } from "@/components/pricing/PricingHero";
import { PricingBenefitCards } from "@/components/pricing/PricingBenefitCards";
import { PricingPlans } from "@/components/pricing/PricingPlans";
import { PricingComparisonTable } from "@/components/pricing/PricingComparisonTable";
import { PricingFAQ } from "@/components/pricing/PricingFAQ";
import { PricingCTA } from "@/components/pricing/PricingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { EarlyAccessModal } from "@/components/EarlyAccessModal";

export default function PricingPage() {
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#07080B] text-neutral-900 font-sans selection:bg-[#EF4444]/30 selection:text-white antialiased">
      {/* Header Navigation */}
      <LandingNavbar />

      <main>
        {/* 1. Hero Section (Simple pricing for growing teams.) */}
        <PricingHero />

        {/* 2. Trust & Core Benefit Cards (All core features, Flexible plans, Built for teams, Secure) */}
        <PricingBenefitCards />

        {/* 3. Pricing Plans with Monthly/Yearly toggle (Free $0, Pro $29 [Most popular], Business $79) */}
        <PricingPlans onOpenWaitlist={() => setIsWaitlistOpen(true)} />

        {/* 4. Compare Plans Feature Matrix */}
        <PricingComparisonTable />

        {/* 5. Common Questions FAQ Accordion */}
        <PricingFAQ />

        {/* 6. CTA Banner (Turn your inbox into a revenue engine.) */}
        <PricingCTA onOpenWaitlist={() => setIsWaitlistOpen(true)} />
      </main>

      {/* Footer */}
      <LandingFooter />

      {/* Early Access / Trial Modal */}
      <EarlyAccessModal
        isOpen={isWaitlistOpen}
        onClose={() => setIsWaitlistOpen(false)}
      />
    </div>
  );
}
