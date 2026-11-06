'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import type { ExceptionQueryResult, ExceptionListItem } from '@/lib/exceptions/query-engine';
import { RefreshCw, Search } from 'lucide-react';
import { FinancialBand } from '@/components/system/FinancialBand';
import { IntelligencePanel } from '@/components/system/IntelligencePanel';
import { PriorityRow } from '@/components/system/PriorityRow';
import { SectionHeader } from '@/components/system/SectionHeader';
import { StatusIndicator } from '@/components/system/StatusIndicator';

export default function ExceptionIntelligencePage() {
  const [data, setData] = useState<ExceptionQueryResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedItem, setSelectedItem] = useState<ExceptionListItem | null>(null);
  const [search, setSearch] = useState<string>('');
  const [role, setRole] = useState<string | undefined>(undefined);

  const fetchWorkspaceData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/exceptions?search=${encodeURIComponent(search)}`);
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
      console.error('Failed to load exceptions workspace', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaceData();
  }, [search]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val / 100);
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="exceptions-page space-y-8 max-w-7xl mx-auto font-sans pb-16">
        {/* EXECUTIVE HEADER */}
        <div className="exceptions-header flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#09090b] border border-[#27272a] p-5">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-[10px] font-mono text-neutral-400">
              <span className="text-[#FF2D2D] font-bold">OPERATIONS</span>
              <span>/</span>
              <span className="text-white">EXCEPTION INCIDENT ROOM</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-white uppercase">
              EXCEPTION INTELLIGENCE INCIDENT ROOM
            </h1>
            <p className="text-xs text-neutral-400 font-sans">
              Find what is blocking cash and resolve the highest-impact operational discrepancies first.
            </p>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <button
              onClick={fetchWorkspaceData}
              className="px-3 py-1.5 bg-[#121215] border border-[#27272a] hover:bg-neutral-800 text-white font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#FF2D2D]" />
              <span>REFRESH INCIDENTS</span>
            </button>
          </div>
        </div>

        {/* FINANCIAL SUMMARY BAND */}
        <FinancialBand
          heroMetric={{
            label: "CASH AT RISK",
            value: data?.kpis.cashAffectedFormatted || formatCurrency(0),
            sublabel: "Cash tied up in active operational exceptions.",
            signal: (data?.kpis.openExceptions || 0) > 0,
          }}
          metrics={[
            { label: "OPEN BLOCKERS", value: `${data?.kpis.openExceptions ?? 0} INCIDENTS`, highlightColor: "red" },
            { label: "CRITICAL INCIDENTS", value: `${data?.kpis.criticalExceptions ?? 0} CASES`, highlightColor: "amber" },
            { label: "UNASSIGNED", value: `${data?.kpis.unassignedExceptions ?? 0} CASES` },
          ]}
        />

        {/* RANKED BLOCKERS */}
        <div className="space-y-4">
          <SectionHeader
            title="RANKED OPERATIONAL BLOCKERS"
            subtitle="Prioritized list ordered by cash impact"
            signal
          />

          <div className="space-y-3">
            {data?.items && data.items.length > 0 ? (
              data.items.map((item, idx) => (
                <PriorityRow
                  key={item.id}
                  rankNumber={`0${idx + 1}`}
                  title={item.categoryTitle}
                  subtitle={`${item.customerName} • ${item.invoiceNumber} (${item.ageDays}d old)`}
                  amount={item.affectedAmountFormatted}
                  blockerCategory={item.categoryTitle}
                  recommendedAction={item.nextActionLabel}
                  actionUrl={item.invoiceId ? `/invoices/${item.invoiceId}` : undefined}
                  onSelect={() => setSelectedItem(item)}
                  isCritical={item.severity === 'critical'}
                />
              ))
            ) : (
              <div className="exceptions-empty p-8 text-center bg-[#09090b] border border-[#27272a] text-neutral-400 font-mono text-xs">
                No active operational exceptions logged.
              </div>
            )}
          </div>
        </div>

        {/* ANALYST REPORT */}
        {data?.items && data.items.length > 0 && (
          <div className="space-y-4">
            <SectionHeader title="INCIDENT ANALYSIS REPORT" signal />

            <IntelligencePanel
              title="AIOSPARK EXCEPTION SYNTHESIS"
              whatChanged={`Primary blocker is ${data.items[0].categoryTitle} on ${data.items[0].invoiceNumber}.`}
              whyItMatters={`${data.items[0].affectedAmountFormatted} in actionable cash is currently delayed past terms.`}
              evidence={[
                `Discrepancy active for ${data.items[0].ageDays} days`,
                `Assigned owner: ${data.items[0].ownerLabel || 'Unassigned'}`,
              ]}
              recommendedAction={data.items[0].nextActionLabel}
              financialImpact={data.items[0].affectedAmountFormatted}
              actionUrl="/investigations"
            />
          </div>
        )}
      </div>
    </MainNavShell>
  );
}
