"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

interface LandingNavbarProps {
  onOpenDemo?: () => void;
}

const NAV_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const SECTION_NAV_MAP: Record<string, string> = {
  product: "#product",
  "how-it-works": "#how-it-works",
  integrations: "#integrations",
  pricing: "#pricing",
  faq: "#faq",
};

export function LandingNavbar({ onOpenDemo }: LandingNavbarProps = {}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeHref, setActiveHref] = useState("#product");

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 10);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0 && visible[0].target.id) {
          const href = SECTION_NAV_MAP[visible[0].target.id];
          if (href) setActiveHref(href);
        }
      },
      { threshold: [0.25, 0.5], rootMargin: "-10% 0px -45% 0px" }
    );

    Object.keys(SECTION_NAV_MAP).forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollTo = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const id = href.replace(/^[/#]+/, "");
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      setMobileMenuOpen(false);
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const openDemo = () => {
    setMobileMenuOpen(false);
    const el = document.getElementById("book-demo");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (onOpenDemo) onOpenDemo();
  };

  return (
    <header
      aria-label="Primary navigation"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "h-14 bg-[#050505]/90 backdrop-blur-[24px] border-b border-white/[0.06] shadow-lg shadow-black/30"
          : "h-16 bg-[#050505]/70 backdrop-blur-[16px] border-b border-white/[0.05]"
      }`}
    >
      <div className="max-w-[1200px] mx-auto px-6 sm:px-8 lg:px-10 h-full flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0"
          aria-label="AIOSpark home"
        >
          <img
            src="/logo-lockup.png"
            alt="AIOSpark"
            className="h-8 w-auto object-contain shrink-0"
          />
        </Link>

        {/* Navigation */}
        <nav
          aria-label="Main navigation"
          className="hidden md:flex items-center gap-1"
        >
          {NAV_LINKS.map((item) => {
            const isActive = activeHref === item.href;
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => scrollTo(e, item.href)}
                aria-current={isActive ? "page" : undefined}
                className={`text-xs sm:text-sm font-medium transition-colors px-3 py-2 ${
                  isActive
                    ? "text-[#FF2D2D]"
                    : "text-[#A1A1AA] hover:text-[#FFFFFF]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </nav>

        {/* Right actions */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Link
            href="/login"
            className="text-xs sm:text-sm font-medium text-[#A1A1AA] hover:text-[#FFFFFF] transition-colors px-3 py-2"
          >
            Sign in
          </Link>
          <button
            onClick={openDemo}
            className="text-xs sm:text-sm font-semibold text-white bg-[#FF2D2D] hover:bg-[#E51C1C] px-5 py-2.5 rounded-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D2D] cursor-pointer active:scale-95"
          >
            Book a demo
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="md:hidden flex items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-menu"
            aria-label="Toggle menu"
            className="min-h-11 min-w-11 p-2 text-[#A1A1AA] hover:text-[#FFFFFF] rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF2D2D]"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div
          id="landing-mobile-menu"
          className="md:hidden bg-[#050505]/95 backdrop-blur-xl border-b border-white/[0.06] px-6 py-4 space-y-1"
        >
          {NAV_LINKS.map((item) => {
            const isActive = activeHref === item.href;
            return (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => scrollTo(e, item.href)}
                aria-current={isActive ? "page" : undefined}
                className={`block min-h-11 text-sm font-medium py-3 px-3 rounded-md transition-colors ${
                  isActive
                    ? "text-[#FF2D2D] bg-white/[0.03]"
                    : "text-[#A1A1AA] hover:text-[#FFFFFF] hover:bg-white/[0.03]"
                }`}
              >
                {item.label}
              </a>
            );
          })}
          <div className="pt-4 border-t border-white/[0.06] flex flex-col gap-2.5">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="min-h-11 text-center text-sm font-medium text-[#A1A1AA] py-3 hover:bg-white/[0.03] rounded-md"
            >
              Sign in
            </Link>
            <button
              onClick={openDemo}
              className="w-full py-3 text-center text-sm font-semibold text-white bg-[#FF2D2D] hover:bg-[#E51C1C] rounded-md flex items-center justify-center gap-1.5 transition-all"
            >
              Book a demo
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
