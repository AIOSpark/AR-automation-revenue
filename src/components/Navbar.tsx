"use client";

import { useState } from "react";
import { handleCTAClick } from "@/lib/analytics";
import { Menu, X, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

interface NavbarProps {
  onOpenWaitlist: () => void;
}

export function Navbar({ onOpenWaitlist }: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavCTAClick = () => {
    handleCTAClick("navbar_cta_click");
    onOpenWaitlist();
    setMobileMenuOpen(false);
  };

  const navItems = [
    { label: "Product", href: "#product" },
    { label: "How It Works", href: "#how-it-works" },
    { label: "Solutions", href: "#solutions" },
    { label: "Security", href: "#security" },
    { label: "FAQ", href: "#faq" },
  ];

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const targetId = href.replace("#", "");
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0B0E]/90 backdrop-blur-md border-b border-white/[0.08] transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* LEFT: Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-7 w-7 rounded-md bg-[#FF3B30] flex items-center justify-center font-bold text-white text-xs tracking-wider shadow-sm">
            AS
          </div>
          <span className="text-base font-semibold tracking-tight text-white group-hover:text-[#FF3B30] transition-colors duration-150">
            AIOSpark
          </span>
        </Link>

        {/* CENTER: Primary Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              onClick={(e) => handleScroll(e, item.href)}
              className="text-xs font-medium text-neutral-300 hover:text-white transition-colors duration-150 py-1"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* RIGHT: Theme Toggle & Actions */}
        <div className="hidden md:flex items-center gap-4">
          <ThemeToggle />

          <Link
            href="/dashboard"
            className="text-xs font-medium text-neutral-300 hover:text-white transition-colors duration-150 px-3 py-1.5 rounded-md hover:bg-white/[0.04]"
          >
            Launch Workstation
          </Link>

          <button
            onClick={handleNavCTAClick}
            data-analytics-event="navbar_early_access"
            className="text-xs font-semibold text-white bg-[#FF3B30] hover:bg-[#E53026] px-4 py-2 rounded-md transition-all duration-150 shadow-sm flex items-center gap-1.5 cursor-pointer active:scale-[0.98]"
          >
            <span>Get Early Access</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* MOBILE: Toggle & Menu Button */}
        <div className="md:hidden flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-neutral-400 hover:text-white p-2 rounded-md transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* MOBILE MENU DRAWER */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0A0B0E] border-b border-white/[0.08] px-4 pt-3 pb-6 space-y-3 animate-in slide-in-from-top-2 duration-150">
          <div className="space-y-1">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={(e) => handleScroll(e, item.href)}
                className="block text-sm font-medium text-neutral-300 hover:text-white py-2 px-2 rounded-md hover:bg-white/[0.04] transition-colors"
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="pt-3 border-t border-white/[0.06] flex flex-col gap-2.5">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-md text-xs font-medium text-neutral-200 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
            >
              Launch Workstation
            </Link>

            <button
              onClick={handleNavCTAClick}
              data-analytics-event="navbar_early_access"
              className="w-full py-2.5 rounded-md font-semibold text-xs text-white bg-[#FF3B30] hover:bg-[#E53026] flex items-center justify-center gap-1.5 shadow-sm transition-all"
            >
              <span>Get Early Access</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
