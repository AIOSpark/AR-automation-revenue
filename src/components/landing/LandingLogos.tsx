import React from "react";

export function SparkIcon({ className = "w-5 h-5 text-[#EF4444]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 2C12 7.523 7.523 12 2 12C7.523 12 12 16.477 12 22C12 16.477 16.477 12 22 12C16.477 12 12 7.523 12 2Z" />
    </svg>
  );
}

export function GmailLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label="Gmail">
      <path fill="#EA4335" d="M24 24L5 10.5V38a3 3 0 003 3h32a3 3 0 003-3V10.5L24 24z" />
      <path fill="#4285F4" d="M43 10.5V38a3 3 0 01-3 3h-5V20.5L43 10.5z" />
      <path fill="#34A853" d="M5 38V10.5l8 10V41H8a3 3 0 01-3-3z" />
      <path fill="#FBBC05" d="M40 7H8a3 3 0 00-3 3.5L24 24 43 10.5A3 3 0 0040 7z" />
      <path fill="#C5221F" d="M24 24L5 10.5l3.5-3.5L24 18l15.5-11 3.5 3.5L24 24z" />
    </svg>
  );
}

export function OutlookLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label="Microsoft Outlook">
      <path fill="#0078D4" d="M28 8h12a3 3 0 013 3v26a3 3 0 01-3 3H28V8z" />
      <path fill="#285994" d="M28 8v16l15 9V11a3 3 0 00-3-3H28z" opacity="0.3" />
      <path fill="#103F91" d="M28 24v16h12a3 3 0 003-3v-4L28 24z" opacity="0.4" />
      <path fill="#004E8C" d="M43 37a3 3 0 01-3 3H28V31l15 6z" opacity="0.2" />
      <rect x="5" y="12" width="23" height="24" rx="3" fill="#0078D4" />
      <path fill="#50E6FF" d="M5 15a3 3 0 013-3h17a3 3 0 013 3v2H5v-2z" opacity="0.6" />
      <circle cx="16.5" cy="24" r="6" fill="#FFFFFF" />
      <circle cx="16.5" cy="24" r="3.5" fill="#0078D4" />
    </svg>
  );
}

export function QuickBooksLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label="Intuit QuickBooks">
      <circle cx="24" cy="24" r="22" fill="#2CA01C" />
      <path
        fill="#FFFFFF"
        d="M21.5 13H16c-3.9 0-7 3.1-7 7s3.1 7 7 7h1.5v-3H16c-2.2 0-4-1.8-4-4s1.8-4 4-4h5.5v-3zm5 22H32c3.9 0 7-3.1 7-7s-3.1-7-7-7h-1.5v3H32c2.2 0 4 1.8 4 4s-1.8 4-4 4h-5.5v3z"
      />
      <path fill="#FFFFFF" d="M20 19h3v16h-3zm5-6h3v16h-3z" />
    </svg>
  );
}

export function XeroLogo({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label="Xero">
      <circle cx="24" cy="24" r="22" fill="#13B5EA" />
      <path
        fill="#FFFFFF"
        d="M13.5 17.5l5 6.5-5 6.5h3.5l3.2-4.4 3.2 4.4h3.5l-5-6.5 5-6.5h-3.5l-3.2 4.4-3.2-4.4h-3.5zm15 13c3.5 0 6.5-2.8 6.5-6.5s-3-6.5-6.5-6.5-6.5 2.8-6.5 6.5 3 6.5 6.5 6.5zm0-2.5c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z"
      />
    </svg>
  );
}

export function SapLogo({ className = "w-9 h-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 30" className={className} aria-label="SAP">
      <rect width="60" height="30" rx="3" fill="#007DB8" />
      <text
        x="30"
        y="21"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="800"
        fontSize="17"
        fill="#FFFFFF"
        letterSpacing="0.05em"
      >
        SAP
      </text>
    </svg>
  );
}

export function LinkedInLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="LinkedIn">
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.64 1.64 0 1 0 0-3.28 1.64 1.64 0 0 0 0 3.28m1.4 9.74v-8.37H5.06v8.37h2.8z" />
    </svg>
  );
}

export function XTwitterLogo({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="X">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function YouTubeLogo({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="YouTube">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
