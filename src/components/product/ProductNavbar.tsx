"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { SparkIcon } from "../landing/LandingLogos";

interface ProductNavbarProps {
  onOpenWaitlist: () => void;
  activeRoute?: "product" | "solutions" | "integrations" | "pricing" | "resources";
}

export function ProductNavbar({ onOpenWaitlist, activeRoute = "product" }: ProductNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: "Product", href: "/product", id: "product" },
    { label: "Solutions", href: "#use-cases", id: "solutions" },
    { label: "Integrations", href: "#integrations", id: "integrations" },
    { label: "Pricing", href: "/pricing", id: "pricing" },
    { label: "Resources", href: "#resources", id: "resources" },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#07080B]/90 backdrop-blur-md border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <SparkIcon className="w-5 h-5 text-[#EF4444] transition-transform duration-200 group-hover:scale-110" />
          <span className="text-lg font-bold tracking-tight text-white">AIOSpark</span>
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((item) => {
            const isActive = activeRoute === item.id;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`text-xs sm:text-sm font-medium transition-colors py-1 relative ${
                  isActive ? "text-white font-semibold" : "text-neutral-400 hover:text-white"
                }`}
              >
                <span>{item.label}</span>
                {isActive && (
                  <span className="absolute bottom-[-16px] left-0 right-0 h-[2px] bg-white rounded-full" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Right Actions */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-xs sm:text-sm font-medium text-neutral-300 hover:text-white transition-colors px-3 py-1.5"
          >
            Sign in
          </Link>
          <button
            onClick={onOpenWaitlist}
            className="text-xs sm:text-sm font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] px-4 py-2 rounded-lg transition-all shadow-md shadow-red-500/20 flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <span>Get started</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile menu button */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-neutral-400 hover:text-white rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#0A0C12] border-b border-white/[0.08] px-4 py-4 space-y-3">
          {navLinks.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMobileMenuOpen(false)}
              className="block text-sm font-medium text-neutral-300 hover:text-white py-2 px-2 rounded-md hover:bg-white/[0.04]"
            >
              {item.label}
            </Link>
          ))}
          <div className="pt-3 border-t border-white/[0.08] flex flex-col gap-2.5">
            <Link
              href="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="text-center text-sm font-medium text-neutral-300 py-2 hover:bg-white/[0.04] rounded-md"
            >
              Sign in
            </Link>
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenWaitlist();
              }}
              className="w-full py-2.5 text-center text-sm font-semibold text-white bg-[#EF4444] hover:bg-[#DC2626] rounded-lg flex items-center justify-center gap-1.5"
            >
              <span>Get started</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
