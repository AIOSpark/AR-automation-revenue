'use client';

import React, { useState } from 'react';
import type {
  NextBestActionRecommendation, 
  ActionCandidate 
} from '@/lib/intelligence/next-best-action-engine';
import { SignalRail } from '@/components/system/SignalLine';

interface NextBestActionCardProps {
  recommendation: NextBestActionRecommendation;
  onExecute?: (recommendation: NextBestActionRecommendation) => void;
  onRefresh?: () => void;
  onViewCausalPath?: (invoiceId: string) => void;
  onSimulateImpact?: (invoiceId: string) => void;
  compact?: boolean;
  className?: string;
}

export function NextBestActionCard({
  recommendation,
  onExecute,
  onRefresh,
  onViewCausalPath,
  onSimulateImpact,
  compact = false,
  className = '',
}: NextBestActionCardProps) {
  const [showDrawer, setShowDrawer] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  const formattedCash = `₹${(recommendation.cashAffectedMinorUnits / 100).toLocaleString('en-IN')}`;

  const stateBadgeMap: Record<string, { label: string; bg: string; text: string }> = {
    ACTIONABLE: { label: 'ACTIONABLE NOW', bg: 'bg-emerald-500/10', text: 'text-emerald-400 border-emerald-500/30' },
    WAITING_ON_CUSTOMER: { label: 'WAITING ON CUSTOMER', bg: 'bg-blue-500/10', text: 'text-blue-400 border-blue-500/30' },
    WAITING_ON_INTERNAL_TEAM: { label: 'WAITING ON INTERNAL TEAM', bg: 'bg-amber-500/10', text: 'text-amber-400 border-amber-500/30' },
    WAITING_ON_APPROVAL: { label: 'APPROVAL REQUIRED', bg: 'bg-purple-500/10', text: 'text-purple-400 border-purple-500/30' },
    BLOCKED_BY_DATA: { label: 'BLOCKED BY DATA', bg: 'bg-rose-500/10', text: 'text-rose-400 border-rose-500/30' },
    NO_CLEAR_ACTION: { label: 'NO ACTION REQUIRED', bg: 'bg-neutral-800', text: 'text-neutral-400 border-neutral-700' },
  };

  const currentBadge = stateBadgeMap[recommendation.actionabilityState] || stateBadgeMap.ACTIONABLE;

  const handleFeedback = async (type: 'ACCEPT' | 'REJECT', reason?: string) => {
    await fetch('/api/next-best-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'RECORD_FEEDBACK',
        recommendationId: recommendation.caseId,
        invoiceId: recommendation.invoiceId,
        feedbackType: type,
        reason,
      }),
    });
    setFeedbackGiven(type);
    setShowRejectInput(false);
  };

  const handleExecute = async () => {
    // 1. Re-verify freshness before execution
    const response = await fetch('/api/next-best-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'VERIFY_FRESHNESS',
        invoiceId: recommendation.invoiceId,
        expectedStateTimestamp: recommendation.dataFreshnessTimestamp,
      }),
    });
    const check = await response.json();
    if (!check.isValid) {
      setExecError(check.reason || 'Case state changed. Recommendation is stale.');
      return;
    }

    setExecuting(true);
    setExecError(null);
    setTimeout(() => {
      setExecuting(false);
      setShowPreviewModal(false);
      if (onExecute) {
        onExecute(recommendation);
      }
    }, 600);
  };

  if (compact) {
    return (
      <div className={`p-3 rounded bg-[#0A0D14] border border-[#1E2638] flex flex-col gap-2 ${className}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SignalRail status={recommendation.risk === 'HIGH' ? 'critical' : 'active'} thickness={3} className="h-4" />
            <span className="text-xs font-mono font-bold tracking-wider text-white uppercase">{recommendation.actionLabel}</span>
          </div>
          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${currentBadge.bg} ${currentBadge.text}`}>
            {currentBadge.label}
          </span>
        </div>
        <p className="text-xs text-neutral-400 line-clamp-1">{recommendation.rationale}</p>
        <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-[#182030]">
          <span>Cash Affected: <strong className="text-emerald-400 font-mono">{formattedCash}</strong></span>
          <button 
            onClick={() => setShowDrawer(true)}
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 underline"
          >
            [DECISION EXPLANATION]
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`p-4 rounded-lg bg-[#0D111C] border border-[#1E293B] shadow-xl flex flex-col gap-4 relative overflow-hidden ${className}`}>
        {/* Top Header Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
          <div className="flex items-center gap-3">
            <SignalRail status={recommendation.risk === 'HIGH' ? 'critical' : 'active'} thickness={4} className="h-6" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest font-semibold">NEXT-BEST-ACTION ENGINE</span>
                <span className="text-[10px] font-mono text-neutral-500">| CONFIDENCE: <strong className="text-white">{recommendation.confidence}</strong></span>
              </div>
              <h3 className="text-base font-bold text-white font-mono tracking-tight flex items-center gap-2">
                {recommendation.actionLabel}
                <span className="text-xs font-normal text-neutral-400">({recommendation.ownerTeam})</span>
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono font-semibold px-2.5 py-1 rounded border ${currentBadge.bg} ${currentBadge.text}`}>
              {currentBadge.label}
            </span>
            {onRefresh && (
              <button onClick={onRefresh} className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-neutral-800 transition" title="Refresh state">
                ↻
              </button>
            )}
          </div>
        </div>

        {/* Main Recommendation Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
          {/* Col 1: Why & Root Cause */}
          <div className="space-y-1.5 md:col-span-2">
            <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">WHY THIS RECOMMENDATION</span>
            <p className="text-neutral-200 leading-relaxed font-medium bg-[#080B11] p-2.5 rounded border border-[#161F30]">
              {recommendation.rationale}
            </p>
            <div className="flex items-center gap-2 text-[11px] text-neutral-400 pt-1">
              <span>Blocker: <strong className="text-amber-400 font-mono">{recommendation.blockerCategory}</strong></span>
              <span>•</span>
              <span>Dependency: <strong className="text-neutral-300 font-mono">{recommendation.dependency}</strong></span>
            </div>
          </div>

          {/* Col 2: Financial Impact & Expected Effect */}
          <div className="space-y-2 bg-[#080B11] p-3 rounded border border-[#161F30] flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">CASH AFFECTED</span>
              <span className="text-lg font-mono font-bold text-emerald-400">{formattedCash}</span>
            </div>

            <div>
              <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">EXPECTED EFFECT</span>
              <p className="text-neutral-300 text-[11px]">{recommendation.expectedEffect}</p>
            </div>
          </div>
        </div>

        {/* Evidence & Action Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1E293B] bg-[#0A0D15] -mx-4 -mb-4 p-3 rounded-b-lg">
          <div className="flex items-center gap-2 overflow-x-auto text-[11px]">
            <span className="font-mono text-neutral-500 font-semibold">EVIDENCE:</span>
            {recommendation.evidence.map((ev, idx) => (
              <span key={idx} className="font-mono text-neutral-300 bg-[#141C2E] px-2 py-0.5 rounded border border-[#223048]">
                {ev.label} <span className="text-neutral-500">({ev.source})</span>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onSimulateImpact && (
              <button
                onClick={() => onSimulateImpact(recommendation.invoiceId)}
                className="px-3 py-1.5 rounded text-xs font-mono font-bold bg-[#1B253B] text-amber-300 hover:bg-[#253352] border border-amber-500/40 transition shadow-sm flex items-center gap-1.5"
              >
                <span>⚡ [SIMULATE IMPACT]</span>
              </button>
            )}

            {onViewCausalPath && (
              <button
                onClick={() => onViewCausalPath(recommendation.invoiceId)}
                className="px-3 py-1.5 rounded text-xs font-mono font-semibold bg-[#141C2E] text-cyan-400 hover:bg-[#1E2B46] border border-cyan-500/30 transition"
              >
                [VIEW CAUSAL PATH]
              </button>
            )}

            <button
              onClick={() => setShowDrawer(true)}
              className="px-3 py-1.5 rounded text-xs font-mono font-semibold bg-[#141C2E] text-neutral-300 hover:text-white hover:bg-neutral-800 border border-neutral-700 transition"
            >
              [DECISION EXPLANATION]
            </button>

            {recommendation.isExecutable && (
              <button
                onClick={() => setShowPreviewModal(true)}
                className={`px-4 py-1.5 rounded text-xs font-mono font-bold transition shadow-md ${
                  recommendation.approvalRequired
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {recommendation.approvalRequired ? '[SUBMIT FOR APPROVAL]' : '[PREVIEW & EXECUTE]'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ACTION PREVIEW MODAL */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="workstation-dialog-panel bg-[#0D111C] border border-[#1E293B] rounded-xl max-w-lg w-full p-6 space-y-4 shadow-2xl text-xs font-sans">
            <div className="flex justify-between items-center border-b border-[#1E293B] pb-3">
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <SignalRail status="active" thickness={3} className="h-4" />
                ACTION PREVIEW — {recommendation.actionLabel}
              </h3>
              <button onClick={() => setShowPreviewModal(false)} className="text-neutral-400 hover:text-white text-base">✕</button>
            </div>

            {execError && (
              <div className="p-3 rounded bg-rose-500/10 border border-rose-500/40 text-rose-300 font-mono text-[11px]">
                ⚠️ {execError}
              </div>
            )}

            <div className="space-y-3 bg-[#080B11] p-3.5 rounded border border-[#161F30]">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div><span className="text-neutral-500">TARGET INVOICE:</span> <strong className="text-white font-mono block">{recommendation.invoiceNumber}</strong></div>
                <div><span className="text-neutral-500">CUSTOMER:</span> <strong className="text-white block">{recommendation.customerName}</strong></div>
                <div><span className="text-neutral-500">CASH AFFECTED:</span> <strong className="text-emerald-400 font-mono block">{formattedCash}</strong></div>
                <div><span className="text-neutral-500">RISK LEVEL:</span> <strong className="text-amber-400 font-mono block">{recommendation.risk}</strong></div>
              </div>

              <div className="pt-2 border-t border-[#182236]">
                <span className="text-neutral-500 block mb-1">RATIONALE:</span>
                <p className="text-neutral-200">{recommendation.rationale}</p>
              </div>

              <div className="pt-2 border-t border-[#182236]">
                <span className="text-neutral-500 block mb-1">EXPECTED EFFECT:</span>
                <p className="text-neutral-300">{recommendation.expectedEffect}</p>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-[10px] font-mono text-neutral-500">State re-checked & validated</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="px-3 py-1.5 rounded bg-neutral-800 text-neutral-300 hover:bg-neutral-700 font-mono text-xs"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs transition"
                >
                  {executing ? 'EXECUTING...' : '[CONFIRM & EXECUTE]'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DECISION EXPLANATION DRAWER */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-end">
          <div className="workstation-drawer-panel bg-[#0A0D14] border-l border-[#1E293B] max-w-2xl w-full h-full p-6 overflow-y-auto space-y-6 text-xs text-neutral-300 font-sans shadow-2xl">
            <div className="flex justify-between items-start border-b border-[#1E293B] pb-4">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest block">DECISION EXPLANATION</span>
                <h2 className="text-lg font-mono font-bold text-white">{recommendation.actionLabel}</h2>
                <span className="text-xs text-neutral-400">Case: {recommendation.invoiceNumber} • {recommendation.customerName}</span>
              </div>
              <button onClick={() => setShowDrawer(false)} className="text-neutral-400 hover:text-white text-lg">✕</button>
            </div>

            {/* Section 1: Situation */}
            <div className="space-y-2 bg-[#0E1320] p-4 rounded border border-[#1E283D]">
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <SignalRail status="active" thickness={3} className="h-3.5" />
                1. CURRENT SITUATION & DIAGNOSIS
              </h4>
              <p className="text-neutral-300">{recommendation.rootCause}</p>
              <div className="flex gap-4 pt-2 text-[11px]">
                <div><span className="text-neutral-500">Blocker:</span> <strong className="text-amber-400 font-mono">{recommendation.blockerCategory}</strong></div>
                <div><span className="text-neutral-500">Dependency:</span> <strong className="text-neutral-200 font-mono">{recommendation.dependency}</strong></div>
                <div><span className="text-neutral-500">State:</span> <strong className="text-cyan-400 font-mono">{recommendation.actionabilityState}</strong></div>
              </div>
            </div>

            {/* Section 2: Why Recommended */}
            <div className="space-y-2 bg-[#0E1320] p-4 rounded border border-[#1E283D]">
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">2. WHY RECOMMENDED</h4>
              <p className="text-neutral-200 leading-relaxed">{recommendation.rationale}</p>
              <div className="pt-2 text-[11px]">
                <span className="text-neutral-500 block">EXPECTED EFFECT:</span>
                <p className="text-emerald-400 font-mono">{recommendation.expectedEffect}</p>
              </div>
            </div>

            {/* Section 3: Why Alternatives Were Not Preferred */}
            {recommendation.alternatives.length > 0 && (
              <div className="space-y-3 bg-[#0E1320] p-4 rounded border border-[#1E283D]">
                <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">3. ALTERNATIVE ACTIONS EVALUATED</h4>
                <div className="space-y-2">
                  {recommendation.alternatives.map((alt) => (
                    <div key={alt.id} className="p-2.5 rounded bg-[#080B11] border border-[#182236] space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-bold text-neutral-300">{alt.actionLabel}</span>
                        <span className="text-[10px] font-mono text-neutral-500">SCORE: {alt.score}</span>
                      </div>
                      <p className="text-[11px] text-neutral-400">{alt.rationale}</p>
                      {alt.whyNotPreferredReason && (
                        <div className="text-[11px] text-amber-400/90 pt-1 font-mono">
                          ⚠️ Not Preferred: {alt.whyNotPreferredReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 4: Human Feedback */}
            <div className="space-y-3 bg-[#0E1320] p-4 rounded border border-[#1E283D]">
              <h4 className="text-xs font-mono font-bold text-white uppercase tracking-wider">4. FEEDBACK & GOVERNANCE</h4>
              {feedbackGiven ? (
                <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-xs">
                  ✓ Feedback recorded ({feedbackGiven}). Thank you for confirming intelligence accuracy.
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-[11px] text-neutral-400 block">Help refine recommendation logic:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFeedback('ACCEPT')}
                      className="px-3 py-1.5 rounded bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-700/50 font-mono text-xs"
                    >
                      👍 ACCEPT RECOMMENDATION
                    </button>
                    <button
                      onClick={() => setShowRejectInput(true)}
                      className="px-3 py-1.5 rounded bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-700/50 font-mono text-xs"
                    >
                      👎 REJECT / RECLASSIFY
                    </button>
                  </div>

                  {showRejectInput && (
                    <div className="pt-2 space-y-2">
                      <input
                        type="text"
                        placeholder="Reason for rejection (e.g. Wrong blocker, customer already paid)..."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        className="w-full bg-[#080B11] border border-[#223048] rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                      />
                      <button
                        onClick={() => handleFeedback('REJECT', rejectReason)}
                        className="px-3 py-1 rounded bg-rose-600 text-white font-mono text-xs"
                      >
                        SUBMIT FEEDBACK
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#1E293B] flex justify-between items-center text-[10px] font-mono text-neutral-500">
              <span>GENERATED: {new Date(recommendation.generatedAt).toLocaleTimeString()}</span>
              <button onClick={() => setShowDrawer(false)} className="underline text-neutral-400 hover:text-white">CLOSE EXPLANATION</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
