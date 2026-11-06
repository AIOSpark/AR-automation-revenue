'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import type { PaymentsQueryResult, PaymentListItem } from '@/lib/payments/query-engine';
import {
  CreditCard,
  AlertTriangle,
  AlertCircle,
  Clock,
  Search,
  Download,
  Sparkles,
  Upload,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { parsePaymentCSV, PaymentCSVRowError } from '@/lib/payments/csv-parser';
import { StructurallyEnforcedEvidenceDisplay } from '@/components/StructurallyEnforcedEvidenceDisplay';
import { SectionHeader } from '@/components/system/SectionHeader';
import { FinancialMetric } from '@/components/system/FinancialMetric';
import { StatusIndicator } from '@/components/system/StatusIndicator';

export default function PaymentsReconciliationPage() {
  const [data, setData] = useState<PaymentsQueryResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<string | undefined>(undefined);

  // Filters & Controls
  const [search, setSearch] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'unallocated' | 'customer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);

  // Detail Modal state
  const [selectedItem, setSelectedItem] = useState<PaymentListItem | null>(null);

  // Bank Statement Upload Modal state
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadText, setUploadText] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadParseErrors, setUploadParseErrors] = useState<Array<{
    row: number;
    field: string;
    value: string;
    message: string;
  }>>([]);

  // AI Payment Investigation Modal state
  const [isInvestigating, setIsInvestigating] = useState<boolean>(false);
  const [aiAnalysis, setAiAnalysis] = useState<any | null>(null);

  const fetchPaymentsData = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);
      if (selectedSource !== 'all') params.set('source', selectedSource);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      params.set('page', page.toString());
      params.set('pageSize', '15');

      const res = await fetch(`/api/payments?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to load payments queue`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Failed to fetch payments workspace');

      setData(json.data);

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
      }
    } catch (err: any) {
      setError(err.message || 'Error connecting to Payments API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentsData();
  }, [search, selectedStatus, selectedSource, sortBy, sortOrder, page]);

  const handleUploadBankStatement = async () => {
    if (!uploadText.trim()) return;
    setIsUploading(true);
    setUploadParseErrors([]);

    try {
      const parseResult = parsePaymentCSV(uploadText);

      if (!parseResult.success) {
        setUploadParseErrors(parseResult.errors);
        setIsUploading(false);
        return;
      }

      if (parseResult.rows.length === 0) {
        throw new Error('No valid statement rows to upload.');
      }

      const rows = parseResult.rows.map((r) => ({
        reference: r.reference,
        raw_reference: r.reference,
        narration: r.narration,
        narration_text: r.narration,
        date: r.date,
        amount: r.amountMajorUnits,
        amount_minor_units: r.amountMinorUnits,
        currency: r.currency,
        direction: r.direction,
      }));

      const res = await fetch('/api/reconciliation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'upload_statement',
          rows,
          userRole: role,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload server error: HTTP ${res.status}`);
      }

      setShowUploadModal(false);
      setUploadText('');
      fetchPaymentsData();
    } catch (err: any) {
      setError(err.message || 'Failed to upload bank statement');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRunAiInvestigation = async (item: PaymentListItem) => {
    setIsInvestigating(true);
    setAiAnalysis(null);

    try {
      const res = await fetch('/api/agents/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: item.matchedInvoiceIds[0] || '',
          investigationType: 'receivable',
        }),
      });

      if (!res.ok) throw new Error(`Investigation error: HTTP ${res.status}`);
      const json = await res.json();
      if (json.data) {
        setAiAnalysis(json.data);
      }
    } catch (err: any) {
      setError(err.message || 'AI Payment Investigation failed');
    } finally {
      setIsInvestigating(false);
    }
  };

  const handleExportCSV = () => {
    if (!data?.items) return;
    const headers = ['Payment ID', 'Date', 'Customer', 'Reference', 'Amount (INR)', 'Allocated (INR)', 'Unallocated (INR)', 'Status', 'Matched Invoices', 'Source'];
    const rows = data.items.map((i) => [
      i.id,
      i.paymentDate,
      `"${i.customerName}"`,
      `"${i.reference}"`,
      (i.amountMinorUnits / 100).toFixed(2),
      (i.allocatedMinorUnits / 100).toFixed(2),
      (i.unallocatedMinorUnits / 100).toFixed(2),
      i.status,
      `"${i.matchedInvoiceNumbers.join('; ')}"`,
      i.source,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AIOSpark_Payments_Reconciliation_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="payments-page p-[#18181b] space-y-6 font-sans text-zinc-200 min-h-screen bg-[#050505] max-w-7xl mx-auto">
        {/* EXECUTIVE HEADER */}
        <SectionHeader
          title="PAYMENTS & RECONCILIATION"
          subtitle="Cash flow ledger, bank statement matching & unallocated remittance queue"
          signal
          action={
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold rounded-none flex items-center space-x-1.5 transition"
              >
                <Upload className="w-3.5 h-3.5 text-zinc-400" />
                <span>Import Statement</span>
              </button>
              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-semibold rounded-none flex items-center space-x-1.5 transition"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                <span>Export CSV</span>
              </button>
            </div>
          }
        />

        {/* FINANCIAL METRICS BAND */}
        <div className="payments-metrics grid grid-cols-2 md:grid-cols-5 gap-4">
          <FinancialMetric
            label="TOTAL RECEIVED"
            value={loading ? '...' : data?.kpis.totalReceivedFormatted ?? '₹0'}
            sublabel="Ingested ledger cash"
          />
          <FinancialMetric
            label="RECONCILED"
            value={loading ? '...' : data?.kpis.reconciledFormatted ?? '₹0'}
            sublabel="Fully allocated to open invoices"
            statusColor="emerald"
            statusText="VERIFIED"
          />
          <div
            onClick={() => setSelectedStatus('unmatched')}
            className="cursor-pointer hover:bg-zinc-900/50 p-1 -m-1 transition"
          >
            <FinancialMetric
              label="UNMATCHED CASH"
              value={loading ? '...' : data?.kpis.unmatchedFormatted ?? '₹0'}
              sublabel="Requires invoice matching"
              statusColor="red"
              statusText="ACTIONABLE"
            />
          </div>
          <div
            onClick={() => setSelectedStatus('partially_allocated')}
            className="cursor-pointer hover:bg-zinc-900/50 p-1 -m-1 transition"
          >
            <FinancialMetric
              label="PARTIALLY ALLOCATED"
              value={loading ? '...' : data?.kpis.partiallyAllocatedFormatted ?? '₹0'}
              sublabel="Remaining unallocated balance"
              statusColor="amber"
              statusText="WAITING"
            />
          </div>
          <FinancialMetric
            label="EXCEPTIONS"
            value={loading ? '...' : data?.kpis.reconciliationExceptionsCount ?? 0}
            sublabel="Pending review"
          />
        </div>

        {/* UNMATCHED PAYMENTS HIGH-PRIORITY QUEUE */}
        {data?.unmatchedQueue && data.unmatchedQueue.length > 0 && (
          <div className="payments-unmatched bg-[#09090b] border border-[#FF2D2D]/40 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <div className="flex items-center space-x-2 text-[#FF2D2D] font-mono text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-[#FF2D2D]" />
                <span>UNMATCHED RECONCILIATION QUEUE</span>
              </div>
              <span className="text-[10px] font-mono text-zinc-400">{data.unmatchedQueue.length} UNMATCHED TRANSACTIONS</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.unmatchedQueue.map((uq) => (
                <div key={uq.transactionId} className="p-3 bg-zinc-900 border border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-zinc-400">{uq.date}</span>
                    <span className="text-[#FF2D2D] font-bold">{uq.amountFormatted}</span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-100 truncate">{uq.narration}</div>
                  <div className="text-[10px] font-mono text-zinc-400 flex items-center justify-between pt-1">
                    <span>Reason: {uq.reason}</span>
                    {uq.suggestedInvoiceNumber && (
                      <span className="text-emerald-400 font-bold">
                        AI Match: {uq.suggestedInvoiceNumber} ({Math.round((uq.confidence || 0.8) * 100)}%)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WORKSPACE CONTROLS */}
        <div className="payments-controls bg-[#09090b] border border-zinc-800 p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reference, customer, or invoice..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-none text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600 font-mono"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 focus:outline-none"
            >
              <option value="all">ALL STATUSES</option>
              <option value="reconciled">RECONCILED</option>
              <option value="partially_allocated">PARTIALLY ALLOCATED</option>
              <option value="matched">MATCHED (PENDING)</option>
              <option value="unmatched">UNMATCHED</option>
              <option value="exception">EXCEPTION</option>
            </select>

            <select
              value={selectedSource}
              onChange={(e) => setSelectedSource(e.target.value)}
              className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 focus:outline-none"
            >
              <option value="all">ALL SOURCES</option>
              <option value="bank">BANK STATEMENT</option>
              <option value="manual">MANUAL ENTRY</option>
            </select>

            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [b, o] = e.target.value.split('-') as [any, any];
                setSortBy(b);
                setSortOrder(o);
              }}
              className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-300 focus:outline-none"
            >
              <option value="date-desc">NEWEST PAYMENT</option>
              <option value="date-asc">OLDEST PAYMENT</option>
              <option value="amount-desc">HIGHEST AMOUNT</option>
              <option value="unallocated-desc">HIGHEST UNALLOCATED</option>
            </select>
          </div>
        </div>

        {/* LEDGER TABLE */}
        <div className="payments-ledger bg-[#09090b] border border-zinc-800 overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Customer</th>
                <th className="py-2.5 px-3">Reference</th>
                <th className="py-2.5 px-3 text-right">Received</th>
                <th className="py-2.5 px-3 text-right">Allocated</th>
                <th className="py-2.5 px-3 text-right">Unallocated</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Matched Invoices</th>
                <th className="py-2.5 px-3">Source</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-zinc-500 font-mono">
                    Loading payments workspace...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-[#FF2D2D] font-mono">
                    {error}
                  </td>
                </tr>
              ) : data?.items && data.items.length > 0 ? (
                data.items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => setSelectedItem(item)}
                    className="hover:bg-zinc-900/60 transition cursor-pointer"
                  >
                    <td className="py-2.5 px-3 text-zinc-300">{item.paymentDate}</td>

                    <td className="py-2.5 px-3 text-zinc-100 font-semibold">
                      {item.customerId ? (
                        <Link
                          href={`/customers/${item.customerId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline"
                        >
                          {item.customerName}
                        </Link>
                      ) : (
                        item.customerName
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-zinc-400 max-w-xs truncate">{item.reference}</td>

                    <td className="py-2.5 px-3 text-right font-mono-num font-bold text-zinc-100">
                      {item.amountFormatted}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono-num text-emerald-400">
                      {item.allocatedFormatted}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono-num text-amber-400">
                      {item.unallocatedFormatted}
                    </td>

                    <td className="py-2.5 px-3">
                      <StatusIndicator
                        status={
                          item.status === 'reconciled'
                            ? 'VERIFIED'
                            : item.status === 'unmatched'
                            ? 'ACTIONABLE'
                            : 'WAITING'
                        }
                      />
                    </td>

                    <td className="py-2.5 px-3 text-zinc-300">
                      {item.matchedInvoiceNumbers.length > 0 ? (
                        item.matchedInvoiceNumbers.map((num, i) => (
                          <span key={i} className="inline-block mr-1 text-zinc-300">
                            {num}
                          </span>
                        ))
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-zinc-500 text-[10px] uppercase">{item.source}</td>

                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedItem(item);
                        }}
                        className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-[11px] transition"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-zinc-500 font-mono">
                    No payments matching current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* PAGINATION FOOTER */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between p-3 bg-zinc-900 border-t border-zinc-800 text-xs font-mono">
              <span className="text-zinc-500">
                Page {data.page} of {data.totalPages} ({data.totalCount} items)
              </span>
              <div className="flex items-center space-x-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800 text-zinc-300"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  className="p-1 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 border border-zinc-800 text-zinc-300"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* INSPECT PAYMENT DRAWER / MODAL */}
        {selectedItem && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-800 max-w-3xl w-full p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[90vh]">
              <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
                <div>
                  <div className="flex items-center space-x-3">
                    <StatusIndicator
                      status={selectedItem.status === 'reconciled' ? 'VERIFIED' : 'ACTIONABLE'}
                    />
                    <h2 className="text-lg font-bold text-zinc-100 font-mono">PAYMENT: {selectedItem.id}</h2>
                  </div>
                  <p className="text-xs text-zinc-500 font-mono mt-1">
                    DATE: {selectedItem.paymentDate} • SOURCE: {selectedItem.source} • REF: {selectedItem.reference}
                  </p>
                </div>

                <button
                  onClick={() => setSelectedItem(null)}
                  className="p-1 bg-zinc-900 text-zinc-400 hover:text-zinc-100 border border-zinc-800 text-xs font-mono"
                >
                  [ESC]
                </button>
              </div>

              {/* METRICS */}
              <div className="grid grid-cols-3 gap-3 bg-zinc-900 p-3 border border-zinc-800">
                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-mono block">Received</span>
                  <div className="text-base font-bold text-zinc-100 font-mono-num mt-0.5">{selectedItem.amountFormatted}</div>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-mono block">Allocated</span>
                  <div className="text-base font-bold text-emerald-400 font-mono-num mt-0.5">{selectedItem.allocatedFormatted}</div>
                </div>

                <div>
                  <span className="text-[10px] text-zinc-500 uppercase font-mono block">Unallocated</span>
                  <div className="text-base font-bold text-amber-400 font-mono-num mt-0.5">{selectedItem.unallocatedFormatted}</div>
                </div>
              </div>

              {/* ALLOCATIONS */}
              <div className="border border-zinc-800 p-4 space-y-2">
                <div className="text-xs font-bold text-zinc-400 font-mono uppercase">MATCHED INVOICE ALLOCATIONS</div>
                {selectedItem.matchedInvoiceNumbers.length > 0 ? (
                  <div className="space-y-1.5 font-mono text-xs">
                    {selectedItem.matchedInvoiceNumbers.map((num, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-zinc-900 border border-zinc-800">
                        <div className="flex items-center space-x-2">
                          <FileText className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-zinc-200 font-bold">{num}</span>
                        </div>
                        <Link href={`/invoices/${selectedItem.matchedInvoiceIds[idx] || ''}`} className="text-[#FF2D2D] hover:underline text-[11px]">
                          Inspect Invoice
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500 py-2 font-mono">No invoice allocations recorded for this payment yet.</div>
                )}
              </div>

              {/* AI EVIDENCE */}
              {aiAnalysis && (
                <div className="border border-zinc-800 p-4 space-y-3 bg-zinc-900/50">
                  <div className="text-xs font-bold text-zinc-200 flex items-center space-x-2 font-mono">
                    <Sparkles className="w-3.5 h-3.5 text-[#FF2D2D]" />
                    <span>RECONCILIATION INTELLIGENCE FINDINGS</span>
                  </div>
                  <StructurallyEnforcedEvidenceDisplay analysis={aiAnalysis} />
                </div>
              )}

              {/* ACTIONS */}
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => handleRunAiInvestigation(selectedItem)}
                  disabled={isInvestigating}
                  className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 text-xs font-mono font-bold flex items-center space-x-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#FF2D2D]" />
                  <span>{isInvestigating ? 'INVESTIGATING...' : 'RUN AI INVESTIGATION'}</span>
                </button>

                <Link
                  href="/approvals"
                  className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-mono"
                >
                  VIEW APPROVAL QUEUE
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* IMPORT STATEMENT MODAL */}
        {showUploadModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-950 border border-zinc-800 max-w-xl w-full p-6 space-y-4 shadow-2xl font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-zinc-400" />
                  <span>IMPORT BANK STATEMENT (CSV)</span>
                </h3>
                <button onClick={() => setShowUploadModal(false)} className="text-zinc-500 hover:text-zinc-200 text-xs">
                  [ESC]
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] text-zinc-400 block">
                  FORMAT: date, reference, narration, amount (INR / major units) or amount_paise (Paise / minor units)
                </label>
                <textarea
                  rows={5}
                  placeholder={`date,reference,narration,amount\n2026-09-09,TXN-90812,NEFT CREDIT GOTHAM HOLDINGS,12000.00\n2026-09-08,TXN-90813,RTGS CREDIT ACME CORP,50000.00`}
                  value={uploadText}
                  onChange={(e) => setUploadText(e.target.value)}
                  className="w-full p-3 bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none font-mono"
                />
                {uploadParseErrors.length > 0 && (
                  <div className="mt-2 p-3 bg-red-950/40 border border-red-800 rounded-lg text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                    <div className="text-red-400 font-bold mb-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Row Validation Errors ({uploadParseErrors.length})</span>
                    </div>
                    <ul className="list-disc list-inside text-zinc-300">
                      {uploadParseErrors.map((err) => (
                        <li key={`${err.row}-${err.field}`} className="mb-1">
                          Row {err.row} • {err.field}: {err.message} (value: "{err.value}")
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleUploadBankStatement}
                  disabled={isUploading}
                  className="px-3.5 py-1.5 bg-[#FF2D2D] hover:bg-red-600 text-white text-xs font-bold"
                >
                  {isUploading ? 'INGESTING...' : 'IMPORT & RUN RECONCILIATION'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainNavShell>
  );
}

