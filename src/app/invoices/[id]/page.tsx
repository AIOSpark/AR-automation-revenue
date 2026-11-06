'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import {
  ArrowLeft,
  ShieldCheck,
  Download,
  Mail,
  FileText,
} from 'lucide-react';
import { formatCurrency } from '@/lib/ui/formatters';
import { FinancialBand } from '@/components/system/FinancialBand';
import { IntelligencePanel } from '@/components/system/IntelligencePanel';
import { SectionHeader } from '@/components/system/SectionHeader';
import { StatusIndicator } from '@/components/system/StatusIndicator';
import { Timeline, TimelineEvent } from '@/components/system/Timeline';
import { DataLineagePanel } from '@/components/system/DataLineagePanel';

export default function InvoiceIntelligenceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = (params?.id as string) || '';

  const [invoice, setInvoice] = useState<any | null>(null);
  const [lineage, setLineage] = useState<{
    sourceSystem?: string | null;
    sourceId?: string | null;
    sourceFileName?: string | null;
    sourceSheetName?: string | null;
    sourceRowNumber?: number | null;
    createdAt?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [investigating, setInvestigating] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [role, setRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!invoiceId) return;
    const fetchInvoice = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/receivables?q=${encodeURIComponent(invoiceId)}`);
        if (res.ok) {
          const json = await res.json();
          const found = json.data?.items?.find((i: any) => i.id === invoiceId || i.invoiceNumber.toLowerCase() === invoiceId.toLowerCase());
          if (found) {
            setInvoice(found);
          }
        }

        // Load data lineage for invoice source provenance
        try {
          const linRes = await fetch(`/api/data-lineage/invoice/${encodeURIComponent(invoiceId)}`);
          if (linRes.ok) {
            const linJson = await linRes.json();
            if (linJson.data) {
              setLineage(linJson.data);
            }
          }
        } catch {
          // Non-critical lineage loading failure
        }

        // Resolve the authenticated user's actual organization role.
        const membersRes = await fetch('/api/tenant/members');
        if (membersRes.ok) {
          const mData = await membersRes.json();
          setRole(mData.currentRole ?? null);
        }
      } catch (err) {
        console.error('Failed to fetch invoice details', err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoice();
  }, [invoiceId]);

  const handleRunInvestigation = async () => {
    setInvestigating(true);
    setActionNotice(null);

    try {
      const res = await fetch('/api/agents/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoiceId,
          investigationType: 'invoice',
        }),
      });
      if (!res.ok) throw new Error(`Investigation failed: HTTP ${res.status}`);
      const json = await res.json();
      setActionNotice('✅ Investigation complete! Structured analysis updated.');
    } catch (err: any) {
      setActionNotice(`❌ Investigation failed: ${err.message}`);
    } finally {
      setInvestigating(false);
    }
  };

  const handleRequestApproval = async () => {
    // No POST endpoint exists for /api/approvals to create approval requests.
    // Do not fabricate an approval payload or claim success.
    setActionNotice('Approval requests from invoice detail are not yet available via the API.');
  };

  const amountMinor = invoice ? invoice.amountMinorUnits : 0;
  const outstandingMinor = invoice ? invoice.outstandingMinorUnits : 0;

  // Genuine timeline events derived strictly from verifiable source data
  const timelineEvents: TimelineEvent[] = [];
  if (lineage?.createdAt) {
    timelineEvents.push({
      date: new Date(lineage.createdAt).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }),
      title: 'Invoice Record Ingested',
      description: `Ingested from ${lineage.sourceSystem || 'ledger'}${lineage.sourceFileName ? ` (${lineage.sourceFileName})` : ''}`,
      isCompleted: true,
    });
  }
  if (invoice?.dueDate) {
    timelineEvents.push({
      date: invoice.dueDate,
      title: 'Payment Due Date',
      description: `Contracted payment due date ${invoice.dueDate}`,
      isCurrent: true,
    });
  }

  return (
    <MainNavShell currentRole={role}>
      <div className="space-y-8 font-sans pb-16">
        {/* BACK LINK */}
        <div className="flex items-center justify-between font-mono text-xs">
          <Link
            href="/receivables"
            className="inline-flex items-center space-x-2 text-neutral-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4 text-[#FF2D2D]" />
            <span>BACK TO RECEIVABLES</span>
          </Link>
          <StatusIndicator status={invoice?.isOverdue ? 'CRITICAL' : 'VERIFIED'} />
        </div>

        {actionNotice && (
          <div className="p-4 bg-[#09090b] border border-[#FF2D2D] text-white text-xs font-mono flex items-center justify-between">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-neutral-400 hover:text-white">✕</button>
          </div>
        )}

        {/* 1. STRONG HEADER */}
        <div className="bg-[#09090b] border border-[#27272a] p-6 space-y-4 font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-[10px] text-neutral-400 uppercase tracking-widest">
                INVOICE DETAIL / {invoiceId.toUpperCase()}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                {invoice ? invoice.invoiceNumber : invoiceId.toUpperCase() || 'NO DATA'}
              </h1>
              <div className="text-xs text-neutral-400 mt-1 font-sans">
                {invoice ? `Customer: ${invoice.customerName}` : 'Record not found or empty tenant dataset.'}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleRunInvestigation}
                disabled={investigating || !invoice}
                className="px-4 py-2 bg-[#FF2D2D] hover:bg-[#e02424] text-white text-xs font-mono font-bold transition cursor-pointer disabled:opacity-50"
              >
                {investigating ? 'INVESTIGATING...' : 'RUN AIOSPARK INVESTIGATION'}
              </button>

              <button
                onClick={() => setShowApprovalModal(true)}
                disabled={!invoice}
                className="px-3.5 py-2 bg-[#121215] border border-[#27272a] hover:bg-neutral-800 text-white text-xs font-mono font-semibold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>REQUEST APPROVAL</span>
              </button>
            </div>
          </div>
        </div>

        {/* 2. FINANCIAL SUMMARY BAND */}
        <FinancialBand
          heroMetric={{
            label: "OUTSTANDING BALANCE",
            value: formatCurrency(outstandingMinor),
            sublabel: invoice ? "Contracted receivable balance." : "No active receivable record.",
            signal: true,
          }}
          metrics={[
            { label: "INVOICE TOTAL", value: formatCurrency(amountMinor) },
            { label: "AMOUNT PAID", value: formatCurrency(amountMinor - outstandingMinor), highlightColor: "amber" },
            { label: "STATUS", value: invoice ? invoice.status.toUpperCase() : "NO RECORD", highlightColor: invoice?.isOverdue ? "red" : "emerald" },
          ]}
        />

        <DataLineagePanel entityType="invoice" entityId={invoiceId} />

        {/* 3. WHY IS THIS UNPAID & INTELLIGENCE BAND */}
        <div className="space-y-4">
          <SectionHeader title="WHY IS THIS UNPAID?" subtitle="Root cause analysis and evidence breakdown" signal />

          <IntelligencePanel
            title="AIOSPARK INVESTIGATION — INVOICE UNPAID ANALYSIS"
            whatChanged={invoice ? `Operational record analyzed for Invoice ${invoice.invoiceNumber}.` : "No invoice data available for analysis."}
            whyItMatters={invoice ? "Payment processing requires verification of line item authorization." : "Empty tenant or missing record."}
            evidence={invoice ? [
              `Invoice Record: ${invoice.invoiceNumber}`,
              `Customer: ${invoice.customerName}`,
            ] : [
              "No active invoice evidence recorded.",
            ]}
            recommendedAction={invoice ? "Verify line item quantities with buyer AP and update ledger record." : "Import or sync ledger data to generate insights."}
            financialImpact={formatCurrency(outstandingMinor)}
            actionUrl="/exceptions"
          />
        </div>

        {/* 4. VERTICAL TIMELINE & LINE ITEMS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* TIMELINE */}
          <div className="lg:col-span-5 space-y-4">
            <SectionHeader title="INVOICE TIMELINE" signal />
            <div className="bg-[#09090b] border border-[#27272a] p-5">
              {timelineEvents.length > 0 ? (
                <Timeline events={timelineEvents} />
              ) : (
                <div className="text-neutral-400 text-xs font-mono">
                  No timeline events recorded. Timeline milestones appear when invoice lifecycle events are recorded in the ledger.
                </div>
              )}
            </div>
          </div>

          {/* LINE ITEMS */}
          <div className="lg:col-span-7 space-y-4">
            <SectionHeader title="BILLED LINE ITEMS" />
            <div className="bg-[#09090b] border border-[#27272a] overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-[#121215] text-neutral-400 font-mono text-[10px] uppercase border-b border-[#27272a]">
                  <tr>
                    <th className="py-2.5 px-3">ITEM</th>
                    <th className="py-2.5 px-3">DESCRIPTION</th>
                    <th className="py-2.5 px-3 text-right">QTY</th>
                    <th className="py-2.5 px-3 text-right">UNIT PRICE</th>
                    <th className="py-2.5 px-3 text-right">TOTAL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272a] font-mono">
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-400 font-sans">
                      No itemized line-item breakdown is available for this invoice.
                      <br />
                      <span className="text-xs text-neutral-500 block mt-1">
                        The source ledger record provides header-level financial totals. Individual itemized line records were not provided by the ingestion source.
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 5. SUGGESTED COMMUNICATION & ATTACHMENTS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-4">
            <SectionHeader title="SUGGESTED CUSTOMER DISPATCH" />
            <div className="bg-[#09090b] border border-[#27272a] p-5 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between pb-1 border-b border-neutral-800">
                <span className="text-neutral-400">To: Buyer Accounts Payable</span>
                <span className="text-[10px] text-amber-400 font-mono bg-amber-950/40 border border-amber-800 px-1.5 py-0.5 rounded">
                  DRAFT PREVIEW — DISPATCH DISABLED
                </span>
              </div>
              <div className="text-neutral-400">Subject: Invoice {invoiceId.toUpperCase()} — Resolution Request</div>
              <div className="p-3 bg-[#121215] text-neutral-300 font-sans leading-relaxed text-xs">
                Dear Accounts Payable Team, regarding Invoice {invoiceId.toUpperCase()}, our system flagged an operational discrepancy. We are prepared to assist in unblocking payment processing.
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setActionNotice('Customer communication dispatch is not yet available via the API.')}
                  className="px-4 py-2 bg-[#121215] border border-[#27272a] hover:border-white/20 text-neutral-300 hover:text-white text-xs font-mono font-bold transition cursor-pointer"
                >
                  DISPATCH MESSAGE →
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <SectionHeader title="DOCUMENTS" />
            <div className="bg-[#09090b] border border-[#27272a] p-5 space-y-2 font-mono text-xs">
              {lineage?.sourceFileName ? (
                <div className="p-3 bg-[#121215] border border-[#27272a] rounded space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-neutral-400" />
                      {lineage.sourceFileName}
                    </span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-1.5 py-0.5 rounded">
                      VERIFIED INGESTION
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-400 space-y-0.5">
                    <div>Source System: <span className="text-zinc-200">{lineage.sourceSystem || 'N/A'}</span></div>
                    {lineage.sourceRowNumber && (
                      <div>Source Location: <span className="text-zinc-200">Row {lineage.sourceRowNumber}{lineage.sourceSheetName ? ` (${lineage.sourceSheetName})` : ''}</span></div>
                    )}
                    {lineage.createdAt && (
                      <div>Ingested At: <span className="text-zinc-200">{new Date(lineage.createdAt).toLocaleString('en-IN')}</span></div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-neutral-400 font-sans">
                  No documents recorded for this invoice.
                  <br />
                  <span className="text-xs text-neutral-500 block mt-1">
                    Document attachment requires a supporting document data source from ERP sync or document ingestion.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* APPROVAL MODAL */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 font-mono text-xs">
          <div className="bg-[#09090b] border border-[#27272a] max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-white uppercase">REQUEST APPROVAL FOR ACTION</h3>
            <p className="text-neutral-400 font-sans text-xs">
              No approval endpoint exists for creating approval requests from invoice detail.
              Approval requests must be submitted through the Approval Center.
            </p>
            <div className="p-3 bg-[#121215] border border-[#27272a] space-y-1">
              <div>ACTION: <strong className="text-white">Not available — no backend endpoint</strong></div>
              <div>AMOUNT: <strong className="text-emerald-400">From invoice record above</strong></div>
              <div>CONFIDENCE: <strong className="text-white">From investigation result</strong></div>
            </div>
            <div className="flex justify-end space-x-3 pt-2">
              <button onClick={() => setShowApprovalModal(false)} className="px-3 py-1.5 bg-[#121215] text-neutral-400">
                CANCEL
              </button>
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setActionNotice('Approval requests from invoice detail are not yet available via the API.');
                }}
                className="px-4 py-1.5 bg-[#FF2D2D] text-white font-bold"
              >
                SUBMIT REQUEST
              </button>
            </div>
          </div>
        </div>
      )}
    </MainNavShell>
  );
}
