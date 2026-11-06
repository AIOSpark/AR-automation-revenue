"use client";

import React from "react";
import Link from "next/link";
import { LinkedInLogo, XTwitterLogo, YouTubeLogo } from "./LandingLogos";
import { Mail } from "lucide-react";

const FOOTER_LINKS = [
  {
    group: "Product",
    items: [
      { label: "Overview", href: "#product" },
      { label: "How it works", href: "#workflow" },
      { label: "Integrations", href: "#integrations" },
      { label: "Outcomes", href: "#proof" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    group: "Platform",
    items: [
      { label: "Open workstation", href: "/dashboard" },
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/signup" },
      { label: "Early access", href: "#cta" },
      { label: "FAQ", href: "#faq" },
    ],
  },
  {
    group: "Company",
    items: [
      { label: "About", href: "#" },
      { label: "Blog", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Contact us", href: "mailto:hello@aiospark.com" },
    ],
  },
  {
    group: "Legal",
    items: [
      { label: "Privacy policy", href: "#" },
      { label: "Terms of service", href: "#" },
      { label: "Data processing", href: "#" },
      { label: "Cookie policy", href: "#" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer
      id="company"
      className="bg-[#040506] text-neutral-400 border-t border-white/[0.08]"
      style={{ paddingBlock: "3.5rem" }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 lg:gap-10 items-start">

          {/* Brand column */}
          <div className="col-span-2 md:col-span-3 space-y-4">
            <Link href="/" aria-label="AIOSpark home" className="flex items-center gap-2">
              <img
                src="/logo-lockup.png"
                alt="AIOSpark"
                className="h-9 w-32 object-contain object-left"
              />
            </Link>
            <p className="text-[14px] text-neutral-300 leading-relaxed max-w-xs">
              An autonomous AI execution layer for finance teams that isolates why cash is stuck and recovers working capital with full policy control.
            </p>
            <a
              href="mailto:hello@aiospark.com"
              className="inline-flex items-center gap-2 text-[13px] text-neutral-300 hover:text-white transition-colors"
            >
              <Mail className="w-4 h-4 text-[#FF2D2D]" />
              hello@aiospark.com
            </a>
          </div>

          {/* Nav columns */}
          {FOOTER_LINKS.map((group) => (
            <div key={group.group} className="col-span-1 md:col-span-2 space-y-3">
              <div className="text-[12px] font-mono font-bold uppercase tracking-wider text-neutral-200 mb-3">
                {group.group}
              </div>
              <ul className="space-y-2">
                {group.items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-[13px] text-neutral-400 hover:text-white transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Socials column */}
          <div className="col-span-2 md:col-span-1 flex flex-row md:flex-col md:items-end gap-4 md:gap-3">
            <a
              href="https://linkedin.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn"
              className="hover:text-white text-neutral-400 transition-colors p-1"
            >
              <LinkedInLogo className="w-4 h-4" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              className="hover:text-white text-neutral-400 transition-colors p-1"
            >
              <XTwitterLogo className="w-4 h-4" />
            </a>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
              className="hover:text-white text-neutral-400 transition-colors p-1"
            >
              <YouTubeLogo className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-6 border-t border-white/[0.08] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <span className="text-[12px] text-neutral-400">
            © 2026 AIOSpark Technologies Pvt. Ltd. All rights reserved.
          </span>
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            <span className="text-[12px] text-neutral-400 font-mono">
              Policy-gated by design · Data hosted in India
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}