"use client";

import Link from "next/link";

const FOOTER_LINKS = [
  { label: "Product", href: "#product" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

const COMPANY_LINKS = [
  { label: "About", href: "#" },
  { label: "Security", href: "#" },
  { label: "Privacy", href: "#" },
  { label: "Terms", href: "#" },
  { label: "Contact", href: "#" },
];

export function LandingFooter() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#050505]" data-aios-reveal id="footer">
      <div className="aios-container py-10 sm:py-14 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-10 mb-8 sm:mb-12">
          <div className="lg:col-span-1">
            <img
              src="/logo-lockup.png"
              alt="AIOSpark"
              className="h-8 w-auto mb-6 object-contain"
            />
            <p className="text-[14px] text-[#71717A] leading-relaxed max-w-xs">
              AIOSpark helps CFOs, finance controllers and AR teams recover
              overdue invoices and turn them into working capital &mdash;
              automatically.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight mb-6 uppercase tracking-wider">
              Product
            </h3>
            <ul className="space-y-3">
              {FOOTER_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-[15px] text-[#71717A] hover:text-[#FFFFFF] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF2D2D]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden lg:block">
            <h3 className="text-sm font-semibold text-white tracking-tight mb-6 uppercase tracking-wider">
              Company
            </h3>
            <ul className="space-y-3">
              {COMPANY_LINKS.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-[15px] text-[#71717A] hover:text-[#FFFFFF] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF2D2D]"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight mb-6 uppercase tracking-wider">
              Follow
            </h3>
            <div className="flex gap-4">
              {["LinkedIn", "Twitter", "YouTube"].map((platform) => (
                <a
                  key={platform}
                  href="#"
                  aria-label={platform}
                  className="w-9 h-9 rounded-md flex items-center justify-center bg-white/[0.03] border border-white/[0.06] text-[#71717A] hover:text-[#FFFFFF] hover:border-white/[0.12] transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF2D2D]"
                >
                  {platform.charAt(0)}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-white/[0.06] pt-8 sm:pt-10 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[13px] text-[#71717A]">
            &copy; {new Date().getFullYear()} AIOSpark Technologies Pvt. Ltd.
            All rights reserved.
          </p>
          <p className="text-[13px] text-[#71717A]">
            Prices in INR, exclusive of GST. 14-day pilot available.
          </p>
        </div>
      </div>
    </footer>
  );
}
