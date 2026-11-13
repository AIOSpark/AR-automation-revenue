"use client";

import {
  LandingNavbar,
  LandingHero,
  LandingProblem,
  LandingStepper,
  LandingAutonomy,
  LandingProof,
  LandingPricing,
  LandingFAQ,
  LandingFinalCTA,
  LandingFooter,
} from "@/components/landing/index";

export default function Home() {
  return (
    <div className="landing-shell aios-landing min-h-screen text-white selection:bg-[#FF2D2D]/30 selection:text-white antialiased">
      <a href="#landing-content" className="landing-skip-link">
        Skip to content
      </a>

      <LandingNavbar />

      <main id="landing-content" tabIndex={-1}>
        <LandingHero />
        <LandingProblem />
        <LandingStepper />
        <LandingAutonomy />
        <LandingProof />
        <LandingPricing />
        <LandingFAQ />
        <LandingFinalCTA />
      </main>

      <LandingFooter />
    </div>
  );
}
