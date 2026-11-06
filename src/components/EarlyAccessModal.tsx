"use client";

import { useState } from "react";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

interface EarlyAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function EarlyAccessModal({ isOpen, onClose }: EarlyAccessModalProps) {
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    company: "",
    role: "CFO / Finance Lead",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    trackAnalyticsEvent("early_access_form_submit", formData);

    try {
      const response = await fetch("/api/leads/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to submit your application.");
      setSubmitted(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Unable to submit your application.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setFormData({ name: "", email: "", company: "", role: "CFO / Finance Lead" });
    onClose();
  };

  return (
    <div
      className="landing-access-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-md animate-in fade-in duration-200"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="landing-access-modal relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="early-access-title"
        aria-describedby="early-access-description"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close early access form"
          className="absolute top-4 right-4 min-h-10 min-w-10 rounded-xl text-neutral-400 hover:text-white hover:bg-white/[0.06] text-base font-medium transition-colors"
          data-analytics-event="modal_close"
        >
          ✕
        </button>

        {!submitted ? (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="p-1.5 rounded-lg bg-[#FF2D2D]/10 text-[#FF2D2D] border border-[#FF2D2D]/20">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[#FF2D2D]">
                Early Access Program
              </span>
            </div>
            <h3 id="early-access-title" className="text-2xl font-bold text-white mb-2">
              Find out what's blocking your cash.
            </h3>
            <p id="early-access-description" className="text-xs text-neutral-400 mb-6 leading-relaxed">
              Join our limited design partner program for AIOSpark O2C Intelligence.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Full Name <span className="text-[#FF2D2D]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikram Sharma"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Work Email <span className="text-[#FF2D2D]">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="vikram@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Company Name <span className="text-[#FF2D2D]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Apex Enterprise Solutions"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Role in Finance Team
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer"
                >
                  <option value="CFO / Finance Lead">CFO / Finance Lead</option>
                  <option value="Finance Controller">Finance Controller</option>
                  <option value="AR Manager">AR Manager / Collections Lead</option>
                  <option value="Founder / CEO">Founder / CEO</option>
                  <option value="Finance Executive">Finance Executive</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={loading}
                data-analytics-event="submit_early_access_form"
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-[#FF2D2D]/20 active:scale-95"
              >
                {loading ? (
                  <span>Submitting...</span>
                ) : (
                  <>
                    <span>Apply for Early Access</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
            </form>
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#FF2D2D]/10 text-[#FF2D2D] border border-[#FF2D2D]/20 mb-4">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 id="early-access-title" className="text-xl font-bold text-white mb-2">Application Received</h4>
            <p id="early-access-description" className="text-xs text-neutral-300 mb-6 leading-relaxed">
              Thank you, {formData.name}. We'll reach out to <span className="text-white font-semibold">{formData.email}</span> to set up your design partner early access workspace.
            </p>
            <button
              onClick={handleReset}
              className="px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
