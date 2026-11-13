"use client";

import { useState } from "react";
import { ArrowRight, Mail } from "lucide-react";
import { useReveal } from "./useReveal";

export function LandingFinalCTA() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  useReveal();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    await new Promise((res) => setTimeout(res, 900));
    setStatus("ok");
  };

  return (
    <section id="book-demo" className="aios-section pt-0 pb-0 relative overflow-hidden">
      <div className="aios-container relative z-10">
        <div
          className="aios-card rounded-lg p-6 sm:p-8 mx-auto max-w-[90%] text-center border-[#FF2D2D]/20 relative overflow-hidden"
          data-aios-reveal
          id="cta-card"
        >
          <div
            aria-hidden="true"
            className="absolute top-[-8%] right-[-8%] w-[160px] h-[160px] rounded-full pointer-events-none -z-10"
            style={{
              background: "radial-gradient(circle, rgba(255,45,45,0.04) 0%, transparent 50%)",
              filter: "blur(30px)",
            }}
          />
          <h2 className="mb-6 tracking-tight text-2xl sm:text-3xl lg:text-4xl font-bold">
            Recover your first ₹1 Cr in under 30 days
          </h2>
          <p className="aios-body mx-auto mb-8 leading-relaxed">
            Book a demo and we'll show you exactly how much working
            capital is trapped in your receivables &mdash; and how fast
            AIOSpark can release it.
          </p>

          <form
            onSubmit={handleSubmit}
            className="max-w-md mx-auto flex flex-col sm:flex-row gap-3"
            data-aios-reveal
            id="cta-form"
          >
            <div className="flex-1 min-w-0">
              <label htmlFor="cta-email" className="sr-only">
                Work email
              </label>
              <input
                id="cta-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === "submitting"}
                required
                aria-required="true"
                autoCapitalize="none"
                spellCheck={false}
                className="min-h-[52px] w-full px-4 py-2.5 rounded-md bg-white/[0.03] border border-white/[0.08] text-white placeholder-[#71717A] focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/60 focus:border-transparent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={status === "submitting"}
              className="aios-btn-primary"
            >
              {status === "submitting" ? "Sending..." : "Book a demo"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {status === "ok" && (
            <p className="mt-4 text-sm text-[#10B981] font-medium" role="status" aria-live="polite">
              Thanks &mdash; we'll be in touch shortly.
            </p>
          )}
          {status === "error" && (
            <p className="mt-4 text-sm text-[#FF2D2D] font-medium" role="alert" aria-live="polite">
              Something went wrong. Please try again.
            </p>
          )}

          <p className="mt-6 aios-micro-trust" data-aios-reveal id="cta-trust">
            <Mail className="w-3.5 h-3.5 text-[#71717A]" />
            No credit card &middot; Setup in under 7 days &middot; 14-day pilot
          </p>
        </div>
      </div>
    </section>
  );
}