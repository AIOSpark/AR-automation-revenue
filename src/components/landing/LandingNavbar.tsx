"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";

interface LandingNavbarProps {
  onOpenWaitlist: () => void;
}

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#workflow" },
  { label: "Integrations", href: "#integrations" },
  { label: "Outcomes", href: "#proof" },
  { label: "Pricing", href: "#pricing" },
];

// Map section IDs → nav link hrefs
const SECTION_NAV_MAP: Record<string, string> = {
  product: "#product",
  problem: "#product",
  "ai-diagnosis": "#workflow",
  workflow: "#workflow",
  autonomy: "#workflow",
  "cash-queue": "#workflow",
  "causal-intelligence": "#workflow",
  integrations: "#integrations",
  proof: "#proof",
  pricing: "#pricing",
};

export function LandingNavbar({ onOpenWaitlist }: LandingNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState<string>("#product");

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 20);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Active section tracking
  useEffect(() => {
    const sectionIds = Object.keys(SECTION_NAV_MAP);
    const observers: IntersectionObserver[] = [];

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry that is most visible
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const id = visible[0].target.id;
          const href = SECTION_NAV_MAP[id];
          if (href) setActiveHref(href);
        }
      },
      { threshold: [0.2, 0.5], rootMargin: "-10% 0px -40% 0px" }
    );

    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleScrollTo = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const targetId = href.replace(/^[/#]+/, "");
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      e.preventDefault();
      setMobileMenuOpen(false);
      targetEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "h-14 bg-[#07080B]/85 backdrop-blur-[24px] border-b border-white/[0.08] shadow-lg shadow-black/20"
          : "h-16 bg-[#07080B]/60 backdrop-blur-[16px] border-b border-white/[0.05]"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0" aria-label="AIOSpark home">
          <img
            src="/logo-lockup.png"
            alt="AIOSpark"
            className="h-9 w-32 object-contain object-left transition-transform duration-300 group-hover:scale-105"
          />
        </Link>

        {/* Primary Navigation */}
        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.07] px-2 py-1.5 rounded-full backdrop-blur-md"
        >
          {NAV_LINKS.map((item) => {
            const isActive = activeHref === item.href;
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleScrollTo(e, item.href)}
                aria-current={isActive ? "page" : undefined}
                className={`relative text-xs font-medium px-3.5 py-1.5 rounded-full transition-all duration-200 ${
                  isActive
                    ? "text-white bg-white/[0.10]"
                    : "text-neutral-400 hover:text-white hover:bg-white/[0.06]"
                }`}
              >
                {isActive && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#FF2D2D]" />
                )}
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Link
            href="/login"
            className="text-xs font-medium text-neutral-300 hover:text-white transition-colors px-3 py-2"
          >
            Sign in
          </Link>
          <button
            onClick={onOpenWaitlist}
            className="text-xs font-semibold text-white bg-[#FF2D2D] hover:bg-[#DC2626] px-5 py-2.5 rounded-xl transition-all shadow-md shadow-red-500/25 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <span>Get early access</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="md:hidden flex items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-menu"
            className="min-h-11 min-w-11 p-2 text-neutral-400 hover:text-white rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D2D]"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div id="landing-mobile-menu" className="md:hidden bg-[#070809]/95 backdrop-blur-xl border-b border-white/[0.08] px-4 py-4 space-y-1">
          {NAV_LINKS.map((item) => {
            const isActive = activeHref === item.href;
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleScrollTo(e, item.href)}
                aria-current={isActive ? "page" : undefined}
                className={`block min-h-11 text-sm font-medium py-3 px-3 rounded-lg transition-colors ${
                  isActive
                    ? "text-white bg-white/[0.08]"
                    : "text-neutral-300 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
          <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2.5">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-11 text-center text-sm font-medium text-neutral-300 py-3 hover:bg-white/[0.04] rounded-md"
            >
              Sign in
            </Link>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenWaitlist();
              }}
              className="w-full py-3 text-center text-sm font-semibold text-white bg-[#FF2D2D] hover:bg-[#DC2626] rounded-xl flex items-center justify-center gap-1.5 transition-all"
            >
              <span>Get early access</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
