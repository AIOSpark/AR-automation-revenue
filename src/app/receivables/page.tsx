'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import type { ReceivablesTableItem } from '@/lib/receivables/engine';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Download,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { FinancialBand } from '@/components/system/FinancialBand';
import { SectionHeader } from '@/components/system/SectionHeader';
import { StatusIndicator } from '@/components/system/StatusIndicator';

function ReceivablesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [items, setItems] = useState<ReceivablesTableItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | undefined>(undefined);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>(searchParams.get('q') || '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') || '');
  const [selectedRisk, setSelectedRisk] = useState<string>(searchParams.get('risk') || '');
  const [selectedAge, setSelectedAge] = useState<string>(searchParams.get('ageBucket') || '');
  const [sortBy, setSortBy] = useState<string>(searchParams.get('sortBy') || 'due_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>((searchParams.get('sortOrder') as any) || 'asc');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchReceivables = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (selectedStatus) params.set('status', selectedStatus);
      if (selectedRisk) params.set('risk', selectedRisk);
      if (selectedAge) params.set('ageBucket', selectedAge);
      if (sortBy) params.set('sortBy', sortBy);
      if (sortOrder) params.set('sortOrder', sortOrder);
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());

      router.replace(`/receivables?${params.toString()}`);

      const res = await fetch(`/api/receivables?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data.items || []);
        setTotalCount(json.data.totalCount || 0);
        setTotalPages(json.data.totalPages || 1);
      }

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
      }
    } catch (e) {
      console.error('Failed to load receivables', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceivables();
  }, [page, pageSize, selectedStatus, selectedRisk, selectedAge, sortBy, sortOrder]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const totalReceivablesVal = items.reduce((acc, i) => acc + i.amountMinorUnits, 0) / 100;
  const overdueVal = items.reduce((acc, i) => acc + (i.isOverdue ? i.amountMinorUnits : 0), 0) / 100;
  const actionableVal = items.reduce((acc, i) => acc + (i.risk === 'high' || i.isOverdue ? i.amountMinorUnits : 0), 0) / 100;

  // Aging buckets computed from actual invoice due dates
  const todayMs = new Date().getTime();
  const agingBuckets = [
    { label: 'CURRENT', bucket: '', cond: (i: any) => !i.isOverdue },
    { label: '1–30 DAYS', bucket: '0-30', cond: (i: any) => i.isOverdue && Math.floor((todayMs - new Date(i.dueDate).getTime()) / 86400000) <= 30 },
    { label: '31–60 DAYS', bucket: '31-60', cond: (i: any) => { const d = Math.floor((todayMs - new Date(i.dueDate).getTime()) / 86400000); return i.isOverdue && d >= 31 && d <= 60; } },
    { label: '61–90 DAYS', bucket: '61-90', cond: (i: any) => { const d = Math.floor((todayMs - new Date(i.dueDate).getTime()) / 86400000); return i.isOverdue && d >= 61 && d <= 90; } },
    { label: '90+ DAYS', bucket: '90+', cond: (i: any) => i.isOverdue && Math.floor((todayMs - new Date(i.dueDate).getTime()) / 86400000) > 90 },
  ].map((b) => {
    const bi = items.filter(b.cond);
    const amt = bi.reduce((s, i) => s + i.amountMinorUnits, 0) / 100;
    const pct = totalReceivablesVal > 0 ? Math.round((amt / totalReceivablesVal) * 100) : 0;
    return { ...b, amount: amt, pct };
  });

  return (
    <MainNavShell currentRole={role}>
      <div className="receivables-page space-y-8 font-sans pb-16">
        {/* EXECUTIVE HEADER */}
        <div className="receivables-header flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#09090b] border border-[#27272a] p-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-[10px] font-mono text-neutral-400">
              <span className="text-[#FF2D2D] font-bold">O2C</span>
              <span>/</span>
              <span className="text-white">RECEIVABLES LEDGER</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white uppercase">
              RECEIVABLE EXPOSURE LEDGER
            </h1>
            <p className="text-xs text-neutral-400 font-sans">
              Analytical receivables ledger with deterministic aging, risk ratings, and blocker tracking.
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <button
              onClick={fetchReceivables}
              className="px-3 py-1.5 bg-[#121215] border border-[#27272a] hover:bg-neutral-800 text-white font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#FF2D2D]" />
              <span>REFRESH LEDGER</span>
            </button>
          </div>
        </div>

        {/* FINANCIAL SUMMARY BAND */}
        <FinancialBand
          heroMetric={{
            label: "RECEIVABLES ON THIS PAGE",
            value: formatCurrency(totalReceivablesVal),
            sublabel: "Sum of invoices on the current page only. Use the full ledger for portfolio totals.",
            signal: true,
          }}
          metrics={[
            { label: "OVERDUE ON THIS PAGE", value: formatCurrency(overdueVal), highlightColor: "red" },
            { label: "ACTIONABLE ON THIS PAGE", value: formatCurrency(actionableVal), highlightColor: "emerald" },
            { label: "ACTIVE LEDGER INVOICES", value: `${totalCount} RECORDS` },
          ]}
        />

        {/* AGING STRIP */}
        <div className="space-y-4 font-mono text-xs">
          <SectionHeader title="PORTFOLIO AGING BUCKETS" signal />

          <div className="receivables-aging-grid grid grid-cols-2 sm:grid-cols-5 gap-3">
            {agingBuckets.map((b) => (
              <div
                key={b.label}
                onClick={() => setSelectedAge(selectedAge === b.bucket ? '' : b.bucket)}
                className={`p-4 workstation-card-interactive border ${
                  selectedAge === b.bucket ? 'border-[#FF3B30] bg-[#FF3B30]/10' : 'border-white/[0.08]'
                } cursor-pointer space-y-1.5`}
              >
                <div className="flex justify-between text-[10px] text-neutral-400 uppercase tracking-wider font-semibold">
                  <span>{b.label}</span>
                  <span className="text-white font-bold">{b.pct}%</span>
                </div>
                <div className="text-base font-bold font-mono text-white tracking-tight">{formatCurrency(b.amount)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RECEIVABLES LEDGER TABLE */}
        <div className="space-y-4">
          <SectionHeader
            title="RECEIVABLE LEDGER"
            subtitle="Dense analytical table with real-time risk indicators"
            action={
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="Search invoice or customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-[#12141A] border border-white/[0.12] rounded-lg px-3.5 py-1.5 text-xs text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-[#FF3B30] focus:ring-1 focus:ring-[#FF3B30]"
                />
              </div>
            }
          />

          <div className="receivables-ledger workstation-card border border-white/[0.08] overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-[#181B23] text-neutral-400 font-mono text-[10px] uppercase tracking-wider border-b border-white/[0.08]">
                  <tr>
                    <th onClick={() => handleSort('customer_name')} className="py-3.5 px-4 cursor-pointer hover:text-white">CUSTOMER</th>
                    <th onClick={() => handleSort('number')} className="py-3.5 px-4 cursor-pointer hover:text-white">INVOICE</th>
                    <th onClick={() => handleSort('amount')} className="py-3.5 px-4 text-right cursor-pointer hover:text-white">AMOUNT</th>
                    <th className="py-3.5 px-4 text-right">OUTSTANDING</th>
                    <th onClick={() => handleSort('due_date')} className="py-3.5 px-4 cursor-pointer hover:text-white">DUE DATE</th>
                    <th className="py-3.5 px-4">STATUS</th>
                    <th className="py-3.5 px-4">RISK</th>
                    <th className="py-3.5 px-4">BLOCKER</th>
                    <th className="py-3.5 px-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06] font-mono">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-[#181B23]/70 transition-colors cursor-pointer group" onClick={() => router.push(`/invoices/${item.id}`)}>
                      <td className="py-3.5 px-4 font-bold text-white text-sm font-sans">{item.customerName}</td>
                      <td className="py-3.5 px-4 text-neutral-300 font-mono">{item.invoiceNumber}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-white">{item.amountFormatted}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-[#FF3B30] font-bold">
                        {formatCurrency((item.outstandingMinorUnits || item.amountMinorUnits) / 100)}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400 font-mono">{item.dueDate}</td>
                      <td className="py-3.5 px-4">
                        <StatusIndicator status={item.isOverdue ? 'CRITICAL' : 'VERIFIED'} />
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[#FF3B30]">{item.risk.toUpperCase()}</td>
                      <td className="py-3.5 px-4 text-neutral-300 font-sans">{item.isOverdue ? 'PO Mismatch' : 'None'}</td>
                      <td className="py-3.5 px-4 text-right text-[#FF3B30] font-bold group-hover:translate-x-0.5 transition-transform">
                        INSPECT →
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </MainNavShell>
  );
}

export default function ReceivablesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505] text-white p-8 font-mono text-xs">Loading Receivables Ledger...</div>}>
      <ReceivablesContent />
    </Suspense>
  );
}
