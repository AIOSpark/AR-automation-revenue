'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import { StructurallyEnforcedEvidenceDisplay } from '@/components/StructurallyEnforcedEvidenceDisplay';
import {
  Search,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Building2,
  RefreshCw,
  XCircle,
  AlertOctagon,
} from 'lucide-react';
import { AIAnalysis } from '@/lib/intelligence/ai-analysis-contract';
import { IntelligencePanel } from '@/components/system/IntelligencePanel';
import { SectionHeader } from '@/components/system/SectionHeader';
import { StatusIndicator } from '@/components/system/StatusIndicator';

export default function AIInvestigationPage() {
  const [investigationType, setInvestigationType] = useState<'invoice' | 'customer' | 'exception' | 'receivable'>('invoice');
  const [targetId, setTargetId] = useState<string>('inv_1001');
  const [role, setRole] = useState<string | undefined>(undefined);
  const [isInvestigating, setIsInvestigating] = useState<boolean>(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [staleWarning, setStaleWarning] = useState<boolean>(false);
  const [checkedTimestamp, setCheckedTimestamp] = useState<string | undefined>(undefined);

  // Resolution verification state
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationResult, setVerificationResult] = useState<{
    status: 'resolved' | 'still_blocked' | 'unable_to_verify';
    message: string;
    cashUnblockedFormatted?: string;
  } | null>(null);

  // Investigation history log
  const [history, setHistory] = useState<
    Array<{
      timestamp: string;
      role: string;
      type: string;
      targetId: string;
      conclusion: string;
      confidence: number;
    }>
  >([]);

  const runInvestigation = async (idToUse?: string, typeToUse?: string) => {
    const activeId = idToUse || targetId;
    const activeType = typeToUse || investigationType;
    if (!activeId) return;

    setIsInvestigating(true);
    setError(undefined);
    setAnalysis(null);
    setVerificationResult(null);
    setStaleWarning(false);

    try {
      const payload: any = {
        investigationType: activeType,
        role,
      };

      if (activeType === 'invoice' || activeType === 'receivable') {
        payload.invoiceId = activeId;
      } else if (activeType === 'customer') {
        payload.customerId = activeId;
      } else if (activeType === 'exception') {
        payload.exceptionId = activeId;
      }

      const res = await fetch('/api/agents/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`Investigation endpoint error: HTTP ${res.status}`);
      const json = await res.json();

      if (json.data) {
        setAnalysis(json.data);
        const nowStr = new Date().toLocaleTimeString();
        setCheckedTimestamp(nowStr);

        setHistory((prev) => [
          {
            timestamp: nowStr,
            role: role || '',
            type: activeType,
            targetId: activeId,
            conclusion: json.data.conclusion,
            confidence: json.data.confidence,
          },
          ...prev,
        ]);
      } else {
        throw new Error(json.error || 'AI Investigation failed to produce valid findings');
      }
    } catch (err: any) {
      setError(err.message || 'Investigation Service temporarily unavailable');
    } finally {
      setIsInvestigating(false);
    }
  };

  useEffect(() => {
    // Resolve the authenticated user's actual organization role.
    // Do not let the client choose or modify its authoritative role.
    const fetchRole = async () => {
      try {
        const membersRes = await fetch('/api/tenant/members');
        if (membersRes.ok) {
          const mData = await membersRes.json();
          setRole(mData.currentRole ?? null);
        }
      } catch (err) {
        console.error('Failed to fetch user role:', err);
      }
    };
    fetchRole();
    runInvestigation();
  }, []);

  const handleVerifyResolution = async () => {
    if (!analysis) return;
    setIsVerifying(true);
    setVerificationResult(null);

    try {
      const res = await fetch('/api/agents/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: targetId,
          investigationType: 'invoice',
        }),
      });

      if (!res.ok) throw new Error(`Verification failed: HTTP ${res.status}`);
      const json = await res.json();
      const resultData = json.data || {};
      const isResolved = resultData.category === 'NORMAL_CYCLE' && resultData.confidence > 0.9;
      setVerificationResult({
        status: isResolved ? 'resolved' : 'still_blocked',
        message: isResolved
          ? 'Evidence confirms discrepancy resolved against verified ledger data.'
          : 'Discrepancy remains active in ledger records. Further action required.',
        cashUnblockedFormatted: resultData.evidence?.[0]?.value
          ? `₹${Number(String(resultData.evidence[0].value).replace(/[^0-9]/g, '')) / 100}.00`
          : undefined,
      });
    } catch (err: any) {
      setVerificationResult({
        status: 'still_blocked',
        message: err.message || 'Verification service unavailable.',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="investigations-page space-y-8 max-w-7xl mx-auto font-sans pb-16">
        {/* EXECUTIVE HEADER */}
        <div className="investigations-header flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#09090b] border border-[#27272a] p-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-[10px] font-mono text-neutral-400">
              <span className="text-[#FF2D2D] font-bold">INTELLIGENCE</span>
              <span>/</span>
              <span className="text-white">AIOSPARK INVESTIGATION</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white uppercase">
              AIOSPARK INVESTIGATION WORKSPACE
            </h1>
            <p className="text-xs text-neutral-400 font-sans">
              Analyst-grade root cause analysis, evidence traceability, and verification report.
            </p>
          </div>

          <div className="flex items-center space-x-3 font-mono text-xs">
            <span className="text-neutral-400">ROLE:</span>
            <span className="text-zinc-100 font-bold">{role}</span>
          </div>
        </div>

        {/* INVESTIGATION LAUNCHER PANEL */}
        <div className="investigations-launcher bg-[#09090b] border border-[#27272a] p-5 space-y-4">
          <SectionHeader title="INVESTIGATION TARGET" signal />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
            <div>
              <label className="text-[10px] text-neutral-400 uppercase block mb-1">Investigation Scope</label>
              <select
                value={investigationType}
                onChange={(e) => {
                  const newType = e.target.value as any;
                  setInvestigationType(newType);
                  if (newType === 'invoice' || newType === 'receivable') setTargetId('');
                  if (newType === 'customer') setTargetId('');
                  if (newType === 'exception') setTargetId('');
                }}
                className="w-full bg-[#121215] border border-[#27272a] px-3 py-2 text-white font-mono focus:outline-none"
              >
                <option value="invoice">Invoice Investigation ("Why is invoice unpaid?")</option>
                <option value="customer">Customer 360 Investigation ("Why paying late?")</option>
                <option value="exception">Exception Investigation ("What caused blocker?")</option>
                <option value="receivable">Receivable Risk Investigation ("Why overdue?")</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-neutral-400 uppercase block mb-1">Target Entity Identifier</label>
              <input
                type="text"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                placeholder="e.g. inv_12345"
                className="w-full bg-[#121215] border border-[#27272a] px-3 py-2 text-white font-mono focus:outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => runInvestigation()}
                disabled={isInvestigating}
                className="w-full py-2 bg-[#FF2D2D] hover:bg-[#e02424] disabled:opacity-50 text-white font-mono font-bold text-xs transition cursor-pointer flex items-center justify-center space-x-2"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isInvestigating ? 'ANALYZING O2C CONTEXT...' : 'RUN AIOSPARK INVESTIGATION'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* LOADING STATE */}
        {isInvestigating && (
          <div className="investigations-loading bg-[#09090b] border border-[#FF2D2D]/60 p-6 space-y-3 font-mono text-xs">
            <div className="flex items-center space-x-3 text-white font-bold">
              <RefreshCw className="w-4 h-4 text-[#FF2D2D] animate-spin" />
              <span>ANALYZING O2C CONTEXT & EVIDENCE...</span>
            </div>
            <div className="text-[#FF2D2D] text-[11px] space-y-0.5">
              <p>● Finding relationships...</p>
              <p>● Checking evidence & ledger balances...</p>
              <p>● Preparing recommendation...</p>
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {error && (
          <div className="bg-red-950/40 border border-red-800 p-4 flex items-center justify-between text-xs text-red-300 font-mono">
            <div className="flex items-center space-x-2">
              <XCircle className="w-4 h-4 text-[#FF2D2D]" />
              <span>Unable to load cash intelligence: {error}</span>
            </div>
            <button
              onClick={() => runInvestigation()}
              className="px-3 py-1 bg-red-900 text-white font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* STRUCTURED INTELLIGENCE REPORT */}
        {analysis && !isInvestigating && (
          <div className="space-y-6">
            <IntelligencePanel
              title="AIOSPARK INVESTIGATION REPORT"
              whatChanged={`Primary finding: ${analysis.conclusion}`}
              whyItMatters={`Discrepancy category: ${analysis.category}. Requires finance action.`}
              evidence={analysis.evidence?.map((e) => `${e.label}: ${e.value}${e.comparisonValue ? ` (vs ${e.comparisonLabel}: ${e.comparisonValue})` : ''}`) || []}
              recommendedAction={`Resolve ${analysis.category.replace(/_/g, ' ')} with buyer finance team`}
              confidence={analysis.confidence}
              actionUrl="/exceptions"
            />

            {/* Structurally Enforced Evidence Display Component */}
            <div className="investigations-evidence bg-[#09090b] border border-[#27272a] p-5 space-y-4">
              <SectionHeader title="SUPPORTING EVIDENCE & DRILL-DOWN" signal />
              <StructurallyEnforcedEvidenceDisplay analysis={analysis} />

              <div className="flex flex-wrap items-center gap-3 pt-2 font-mono text-xs">
                <Link
                  href={`/invoices/${targetId}`}
                  className="px-3 py-1.5 bg-[#121215] hover:bg-neutral-800 border border-[#27272a] text-white flex items-center space-x-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-neutral-400" />
                  <span>SOURCE INVOICE</span>
                  <ExternalLink className="w-3 h-3 text-neutral-500" />
                </Link>

                <Link
                  href={`/customers/${targetId}`}
                  className="px-3 py-1.5 bg-[#121215] hover:bg-neutral-800 border border-[#27272a] text-white flex items-center space-x-1.5"
                >
                  <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                  <span>CUSTOMER 360</span>
                  <ExternalLink className="w-3 h-3 text-neutral-500" />
                </Link>

                <Link
                  href="/exceptions"
                  className="px-3 py-1.5 bg-[#121215] hover:bg-neutral-800 border border-[#27272a] text-white flex items-center space-x-1.5"
                >
                  <AlertOctagon className="w-3.5 h-3.5 text-neutral-400" />
                  <span>EXCEPTION WORKSPACE</span>
                  <ExternalLink className="w-3 h-3 text-neutral-500" />
                </Link>
              </div>
            </div>

            {/* RESOLUTION VERIFICATION PANEL */}
            <div className="investigations-resolution bg-[#09090b] border border-[#27272a] p-5 space-y-4 font-mono text-xs">
              <SectionHeader title="RESOLUTION VERIFICATION LOOP" signal />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleVerifyResolution}
                  disabled={isVerifying}
                  className="px-4 py-2 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-bold transition cursor-pointer flex items-center space-x-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{isVerifying ? 'VERIFYING RESOLUTION...' : 'VERIFY RESOLUTION'}</span>
                </button>
              </div>

              {verificationResult && (
                <div
                  className={`p-4 border ${
                    verificationResult.status === 'resolved'
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                      : 'bg-amber-950/40 border-amber-800 text-amber-300'
                  }`}
                >
                  <div className="font-bold uppercase tracking-wider">
                    {verificationResult.status === 'resolved' ? 'RESOLUTION VERIFIED & CASH UNBLOCKED' : 'STILL BLOCKED'}
                  </div>
                  <p className="mt-1 text-neutral-200 font-sans">{verificationResult.message}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MainNavShell>
  );
}
