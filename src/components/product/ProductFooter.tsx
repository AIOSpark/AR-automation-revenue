"use client";

import React from "react";
import Link from "next/link";
import { SparkIcon, LinkedInLogo, XTwitterLogo, YouTubeLogo } from "../landing/LandingLogos";

export function ProductFooter() {
  return (
    <footer className="bg-[#050608] text-neutral-400 border-t border-white/[0.08] py-14 text-xs sm:text-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Footer Main Row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 pb-10 border-b border-white/[0.06]">
          
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start gap-2">
            <Link href="/" className="flex items-center gap-2">
              <SparkIcon className="w-5 h-5 text-[#EF4444]" />
              <span className="text-lg font-bold text-white tracking-tight">AIOSpark</span>
            </Link>
            <p className="text-neutral-400 text-xs sm:text-sm">
              Smarter emails. Bigger opportunities.
            </p>
          </div>

          {/* Center Links */}
          <nav className="flex flex-wrap items-center justify-center gap-6 text-xs sm:text-sm font-medium">
            <Link href="/product" className="text-white hover:text-white transition-colors">
              Product
            </Link>
            <a href="#use-cases" className="hover:text-white transition-colors">
              Solutions
            </a>
            <a href="#integrations" className="hover:text-white transition-colors">
              Integrations
            </a>
            <Link href="/pricing" className="hover:text-white transition-colors">
              Pricing
            </Link>
            <a href="#resources" className="hover:text-white transition-colors">
              Resources
            </a>
          </nav>

          {/* Socials */}
          <div className="flex items-center gap-4 text-neutral-400">
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="hover:text-white transition-colors"
            >
              <LinkedInLogo className="w-4 h-4" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              className="hover:text-white transition-colors"
            >
              <XTwitterLogo className="w-4 h-4" />
            </a>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
              className="hover:text-white transition-colors"
            >
              <YouTubeLogo className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Bottom Copyright */}
        <div className="pt-6 text-center text-xs text-neutral-500">
          © 2025 AIOSpark. All rights reserved.
        </div>

      </div>
    </footer>
  );
}
