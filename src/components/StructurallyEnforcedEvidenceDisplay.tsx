'use client';

import React from 'react';
import { AIAnalysis } from '@/lib/intelligence/ai-analysis-contract';
import { Sparkles, AlertTriangle, HelpCircle, CheckCircle2, FileQuestion } from 'lucide-react';
import { formatDate, formatPercent } from '@/lib/ui/formatters';

export interface EvidenceDisplayProps {
  analysis: AIAnalysis | null;
  hasDataQualityFlag?: boolean;
}

/**
 * Shared Evidence-Display Component (Layer 11, 12, 15, 18)
 * Standardized across Invoice Intelligence, Customer 360, Exceptions, and Approval Center.
 * Builds trust through visual consistency and side-by-side evidence matrix representation.
 */
export function StructurallyEnforcedEvidenceDisplay({
  analysis,
  hasDataQualityFlag = false,
}: EvidenceDisplayProps) {
  // FALLBACK 1: Calm "Not yet analyzed" state if analysis is null
  if (!analysis) {
    return (
      <div className="p-6 bg-neutral-900 border border-neutral-800 rounded-2xl text-center space-y-2">
        <FileQuestion className="w-8 h-8 text-neutral-500 mx-auto" />
        <h4 className="text-sm font-semibold text-white">Analysis Pending</h4>
        <p className="text-xs text-neutral-400 max-w-sm mx-auto">
          This invoice has not yet been processed by the O2C Reasoning Engine. Check back after the next scheduled sync.
        </p>
      </div>
    );
  }

  // DATA QUALITY REVISION: Apply warning and reduce confidence band if data quality issue exists
  let effectiveConfidence = analysis.confidence;
  if (hasDataQualityFlag) {
    effectiveConfidence = Math.max(0.1, effectiveConfidence - 0.25);
  }

  // STRUCTURAL RULE ENFORCEMENT: If evidence is missing or empty, NEVER render conclusion
  const hasValidEvidence = Array.isArray(analysis.evidence) && analysis.evidence.length > 0;
  if (!hasValidEvidence) {
    return (
      <div className="p-6 bg-neutral-950 border border-amber-900/40 rounded-2xl space-y-3">
        <div className="flex items-center space-x-2 text-amber-400">
          <HelpCircle className="w-5 h-5" />
          <h4 className="text-sm font-bold">Needs Investigation</h4>
        </div>
        <p className="text-xs text-neutral-400">
          Inconclusive signals detected. AI conclusion suppressed due to lack of verifiable side-by-side evidence.
        </p>
      </div>
    );
  }

  // CONFIDENCE BAND DETERMINATION:
  // > 0.9: Primary confident conclusion
  // 0.6 - 0.9: Conclusion with "Review recommended" badge
  // < 0.6: Render "Needs investigation" framing with inconclusive evidence
  const isHighConfidence = effectiveConfidence > 0.9;
  const isMediumConfidence = effectiveConfidence >= 0.6 && effectiveConfidence <= 0.9;
  const isLowConfidence = effectiveConfidence < 0.6;

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 shadow-md space-y-6">
      {/* Quality Warning Header if Layer 8 Data Quality Flag present */}
      {hasDataQualityFlag && (
        <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl flex items-center space-x-3 text-amber-300 text-xs font-mono">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>This invoice has a data quality issue — analysis confidence reduced (-25%).</span>
        </div>
      )}

      {/* Header & Confidence Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-800">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-[#FF2D2D]/10 border border-[#FF2D2D]/30 rounded-lg text-[#FF2D2D]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">AI Root Cause Intelligence</h3>
            <p className="text-[11px] text-neutral-400 font-mono">
              Source: {analysis.source} • {formatDate(analysis.generatedAt, 'long')}
            </p>
          </div>
        </div>

        {/* Confidence Band Badges */}
        <div>
          {isHighConfidence && (
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800 flex items-center space-x-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>High Confidence ({formatPercent(effectiveConfidence, 0)})</span>
            </span>
          )}

          {isMediumConfidence && (
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-amber-950/60 text-amber-400 border border-amber-800 flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Review Recommended ({formatPercent(effectiveConfidence, 0)})</span>
            </span>
          )}

          {isLowConfidence && (
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-neutral-900 text-neutral-400 border border-neutral-800 flex items-center space-x-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Low Confidence ({formatPercent(effectiveConfidence, 0)})</span>
            </span>
          )}
        </div>
      </div>

      {/* Prominent Conclusion (Suppressed to "Needs Investigation" if low confidence) */}
      <div className="space-y-1">
        {isLowConfidence ? (
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-bold block">
              Needs Investigation
            </span>
            <p className="text-sm text-neutral-300 italic mt-1">
              Analysis confidence is below threshold ({formatPercent(effectiveConfidence, 0)}). Partial evidence items below require manual finance review.
            </p>
          </div>
        ) : (
          <div>
            <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold block">
              AI Conclusion
            </span>
            <h4 className="text-lg font-bold text-white mt-1">{analysis.conclusion}</h4>
          </div>
        )}
      </div>

      {/* Side-by-Side Structured Evidence Matrix (Non-negotiable requirement) */}
      <div className="space-y-3">
        <span className="text-xs font-mono uppercase tracking-wider text-neutral-400 font-semibold block">
          Supporting Side-by-Side Evidence ({analysis.evidence.length})
        </span>

        <div className="grid gap-3">
          {analysis.evidence.map((item, idx) => (
            <div
              key={idx}
              className="p-4 bg-neutral-900 border border-neutral-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs font-sans"
            >
              <div className="grid grid-cols-2 gap-4 flex-1">
                <div>
                  <span className="text-[11px] text-neutral-400 font-mono block">{item.label}</span>
                  <span className="font-semibold text-white text-sm">{item.value}</span>
                </div>

                {item.comparisonLabel && (
                  <div>
                    <span className="text-[11px] text-neutral-400 font-mono block">{item.comparisonLabel}</span>
                    <span className="font-semibold text-white text-sm">{item.comparisonValue}</span>
                  </div>
                )}
              </div>

              {item.delta && (
                <div className="px-3 py-1.5 bg-[#050505] border border-neutral-800 rounded-lg text-right">
                  <span className="text-[10px] text-neutral-500 font-mono block">Variance Delta</span>
                  <span className="font-mono font-bold text-[#FF2D2D]">{item.delta}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
