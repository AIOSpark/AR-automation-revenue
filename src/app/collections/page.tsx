'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import type { CollectionsQueryResult, CollectionItem } from '@/lib/collections/query-engine';
import { RefreshCw } from 'lucide-react';
import { FinancialBand } from '@/components/system/FinancialBand';
import { IntelligencePanel } from '@/components/system/IntelligencePanel';
import { PriorityRow } from '@/components/system/PriorityRow';
import { SectionHeader } from '@/components/system/SectionHeader';
import { StatusIndicator } from '@/components/system/StatusIndicator';

export default function CollectionsIntelligencePage() {
  const [data, setData] = useState<CollectionsQueryResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedItem, setSelectedItem] = useState<CollectionItem | null>(null);
  const [search, setSearch] = useState<string>('');
  const [role, setRole] = useState<string | undefined>(undefined);

  const fetchCollectionsData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/collections?search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      }

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch collections workspace', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollectionsData();
  }, [search]);

  return (
    <MainNavShell currentRole={role}>
      <div className="collections-page space-y-8 max-w-7xl mx-auto font-sans pb-16">
        {/* EXECUTIVE HEADER */}
        <div className="collections-header flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#09090b] border border-[#27272a] p-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-[10px] font-mono text-neutral-400">
              <span className="text-[#FF2D2D] font-bold">RECOVERY</span>
              <span>/</span>
              <span className="text-white">COLLECTIONS WORKLIST</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white uppercase">
              COLLECTIONS RECOVERY WORKLIST
            </h1>
            <p className="text-xs text-neutral-400 font-sans">
              Prioritized recovery worklist ordered by financial value, customer risk, and promise reliability.
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <button
              onClick={fetchCollectionsData}
              className="px-3 py-1.5 bg-[#121215] border border-[#27272a] hover:bg-neutral-800 text-white font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#FF2D2D]" />
              <span>REFRESH WORKLIST</span>
            </button>
          </div>
        </div>

        {/* FINANCIAL SUMMARY BAND */}
        <FinancialBand
          heroMetric={{
            label: "ACTIONABLE OVERDUE CASH",
            value: data?.kpis.actionableFormatted || "₹0",
            sublabel: "Overdue receivables unblocked & ready for recovery outreach.",
            signal: true,
          }}
          metrics={[
            { label: "TOTAL OVERDUE", value: data?.kpis.totalOverdueFormatted || "₹0", highlightColor: "red" },
            { label: "BROKEN PROMISES", value: `${data?.kpis.brokenPromisesCount ?? 0} CASES`, highlightColor: "amber" },
            { label: "RECOVERED CASH", value: data?.kpis.recoveredCashFormatted || "₹0", highlightColor: "emerald" },
          ]}
        />

        {/* WORKLIST QUEUE */}
        <div className="space-y-4">
          <SectionHeader
            title="PRIORITIZED COLLECTIONS WORKLIST"
            subtitle="Ranked queue ordered by financial impact"
            signal
          />

          <div className="space-y-3">
            {data?.items?.map((item, idx) => (
              <PriorityRow
                key={item.id}
                rankNumber={`0${idx + 1}`}
                title={item.customerName}
                subtitle={`Invoice ${item.invoiceNumber} • ${item.daysOverdue}d overdue (${item.riskBand.toUpperCase()} RISK)`}
                amount={item.outstandingFormatted}
                blockerCategory={item.hasBlocker ? item.blockerType || 'PO Mismatch' : 'Unblocked'}
                recommendedAction={item.nextBestAction}
                actionUrl={`/invoices/${item.invoiceId}`}
                onSelect={() => setSelectedItem(item)}
                isCritical={item.priority === 'critical'}
              />
            ))}
          </div>
        </div>
      </div>
    </MainNavShell>
  );
}
