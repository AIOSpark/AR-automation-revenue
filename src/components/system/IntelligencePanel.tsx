import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

interface IntelligencePanelProps {
  title?: string;
  whatChanged?: string;
  whyItMatters?: string;
  evidence?: string | string[];
  recommendedAction?: string;
  actionUrl?: string;
  confidence?: string | number;
  financialImpact?: string;
  className?: string;
}

export function IntelligencePanel({
  title = 'AIOSpark Intelligence • Cash Synthesis Engine',
  whatChanged,
  whyItMatters,
  evidence,
  recommendedAction,
  actionUrl,
  confidence,
  financialImpact,
  className = '',
}: IntelligencePanelProps) {
  return (
    <div className={`workstation-card rounded-xl p-6 space-y-5 border border-white/[0.08] ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.08] pb-3.5">
        <div className="flex items-center space-x-2.5">
          <span className="w-2 h-2 rounded-full bg-[#FF3B30]" />
          <h2 className="text-sm sm:text-base font-semibold tracking-tight text-white font-sans flex items-center gap-2">
            <span>{title}</span>
            <Sparkles className="w-3.5 h-3.5 text-[#FF3B30]" />
          </h2>
        </div>
        {confidence && (
          <div className="flex items-center gap-1.5 self-start sm:self-auto px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[11px] font-sans text-neutral-300">
            <span className="text-neutral-400">Confidence:</span>
            <span className="font-mono-num tabular-nums font-bold text-white">
              {typeof confidence === 'number' ? `${Math.round(confidence * 100)}%` : confidence}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-sans">
        {whatChanged && (
          <div className="p-4 bg-[#181B23]/60 border border-white/[0.08] rounded-xl space-y-1.5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-[#FF3B30] block font-sans">
                Trigger & Shift
              </span>
              <p className="text-neutral-200 text-xs leading-relaxed mt-1 font-sans">{whatChanged}</p>
            </div>
            <span className="text-[11px] text-neutral-400 font-serif-editorial italic pt-2">
              Automated ledger detection
            </span>
          </div>
        )}

        {whyItMatters && (
          <div className="p-4 bg-[#181B23]/60 border border-white/[0.08] rounded-xl space-y-1.5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-400 block font-sans">
                Financial Exposure
              </span>
              <p className="text-neutral-200 text-xs leading-relaxed mt-1 font-sans">{whyItMatters}</p>
            </div>
            {financialImpact && (
              <span className="text-xs font-mono-num tabular-nums text-amber-300 font-semibold pt-2">
                At stake: {financialImpact}
              </span>
            )}
          </div>
        )}

        {evidence && (
          <div className="p-4 bg-[#181B23]/60 border border-white/[0.08] rounded-xl space-y-1.5">
            <span className="text-xs font-semibold text-neutral-300 block font-sans">
              Verified Evidence
            </span>
            {Array.isArray(evidence) ? (
              <ul className="space-y-1.5 text-neutral-300 text-xs mt-1">
                {evidence.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-[#FF3B30] font-bold mt-0.5">•</span>
                    <span className="leading-snug">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-neutral-200 text-xs leading-relaxed mt-1">{evidence}</p>
            )}
          </div>
        )}

        {recommendedAction && (
          <div className="p-4 bg-[#181B23]/60 border border-white/[0.08] rounded-xl space-y-1.5 flex flex-col justify-between">
            <div>
              <span className="text-xs font-semibold text-emerald-400 block font-sans">
                Recommended Action
              </span>
              <p className="text-white font-medium text-xs leading-relaxed mt-1">{recommendedAction}</p>
            </div>

            {actionUrl && (
              <Link
                href={actionUrl}
                className="mt-3 py-2 px-3 bg-[#12141A] hover:bg-[#FF3B30] border border-white/[0.12] hover:border-[#FF3B30] text-[#FF3B30] hover:text-white rounded-lg inline-flex items-center justify-between text-xs font-semibold transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B30]"
              >
                <span>Execute Action</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
