"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MainNavShell } from "@/components/MainNavShell";
import {
  TrendingUp,
  RefreshCw,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import type { CFOIntelligenceOverview } from "@/lib/cfo/engine";
import { FinancialBand } from "@/components/system/FinancialBand";
import { IntelligencePanel } from "@/components/system/IntelligencePanel";
import { SectionHeader } from "@/components/system/SectionHeader";
import { StatusIndicator } from "@/components/system/StatusIndicator";

export default function CFOIntelligencePage() {
  const [data, setData] = useState<CFOIntelligenceOverview | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState<string>("30D");
  const [role, setRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchData();
  }, [dateRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/cfo/overview");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? undefined);
      }
    } catch (err) {
      console.error("Failed to fetch CFO intelligence data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  const formatCurrency = (amountMinorUnits: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amountMinorUnits / 100);
  };

  if (loading) {
    return (
    <MainNavShell currentRole={role}>
        <div className="flex-1 p-8 text-center text-neutral-400 text-xs font-mono flex items-center justify-center">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 bg-[#FF2D2D]" />
            <span>INITIALIZING CFO EXECUTIVE COMMAND CENTER...</span>
          </div>
        </div>
      </MainNavShell>
    );
  }

  return (
    <MainNavShell currentRole={role}>
      <div className="cfo-page space-y-8 max-w-7xl mx-auto w-full font-sans pb-16">
        {/* 1. EXECUTIVE CFO HEADER */}
        <div className="cfo-header flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#09090b] border border-[#27272a] p-6">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-[10px] font-mono text-neutral-400">
              <span className="text-[#FF2D2D] font-bold">MANAGEMENT</span>
              <span>/</span>
              <span className="text-white">CFO COMMAND CENTER</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-white uppercase">
              CFO COMMAND CENTER
            </h1>
            <p className="text-xs text-neutral-400 max-w-2xl font-sans">
              Executive cash position, capital exposure & management decision plane.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-[#121215] border border-[#27272a] p-0.5 text-xs font-mono">
              {["Today", "7D", "30D", "90D", "6M"].map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-3 py-1 transition ${
                    dateRange === range
                      ? "bg-[#FF2D2D] text-white font-bold"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 bg-[#121215] border border-[#27272a] hover:border-neutral-700 text-white transition disabled:opacity-50"
              title="Refresh CFO Engine Data"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* 2. EXECUTIVE FINANCIAL BAND */}
        <FinancialBand
          className="cfo-financial-band"
          heroMetric={{
            label: "ACTIONABLE CASH BLOCKERS",
            value: formatCurrency(data?.actionableBlockersMinorUnits || 0),
            sublabel: "Cash associated with defined issues requiring executive intervention.",
            signal: true,
          }}
          metrics={[
            {
              label: "TOTAL RECEIVABLES",
              value: formatCurrency(data?.totalReceivablesMinorUnits || 0),
              sublabel: "100% active ledger balance",
              highlightColor: "default",
            },
            {
              label: "OVERDUE CAPITAL",
              value: formatCurrency(data?.overdueMinorUnits || 0),
              sublabel: "Delayed past terms",
              highlightColor: "red",
            },
            {
              label: "DSO",
              value: `${data?.dsoDays || 0} DAYS`,
              sublabel: `Prev: ${data?.dsoPreviousPeriodDays || 0}d`,
              highlightColor: "emerald",
            },
            {
              label: "UNRECONCILED DEPOSITS",
              value: formatCurrency(data?.unreconciledCashMinorUnits || 0),
              sublabel: "Awaiting bank match",
              highlightColor: "amber",
            },
          ]}
        />

        {/* 3. EDITORIAL EXECUTIVE SYNTHESIS & TRENDS */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-4">
            <IntelligencePanel
              title="AIOSPARK EXECUTIVE SYNTHESIS"
              whatChanged={data?.executiveInsight?.observation || "No active O2C blockers detected."}
              whyItMatters={data?.executiveInsight?.impact || "All active receivables are within normal payment term windows."}
              evidence={data?.executiveInsight?.evidence || "Ledger sync verified across active enterprise accounts."}
              recommendedAction={data?.executiveInsight?.recommendation || "Maintain standard automated collection schedule."}
              financialImpact={formatCurrency(data?.actionableBlockersMinorUnits || 0)}
              actionUrl="/investigations"
            />
          </div>

          {/* Executive Trend Signals */}
          <div className="lg:col-span-4 space-y-4">
            <SectionHeader title="EXECUTIVE TREND SIGNALS" signal />

            <div className="cfo-trend-list bg-[#09090b] border border-[#27272a] p-4 space-y-3 font-mono text-xs">
              {data?.executiveTrends?.map((tr, idx) => (
                <div key={idx} className="cfo-trend-item p-3 bg-[#121215] border border-[#27272a] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{tr.metric}</span>
                    <span
                      className={`text-[9px] uppercase font-bold px-1.5 py-0.2 ${
                        tr.direction === "improving"
                          ? "text-emerald-400 border border-emerald-900/60 bg-emerald-950/40"
                          : tr.direction === "worsening"
                          ? "text-[#FF2D2D] border border-red-900/60 bg-red-950/40"
                          : "text-neutral-400 border border-neutral-800"
                      }`}
                    >
                      {tr.direction}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 font-sans">{tr.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 4. WHY IS CASH STUCK? (CFO CATEGORY BREAKDOWN) */}
        <div className="space-y-4">
          <SectionHeader
            title="WHY IS CASH STUCK?"
            subtitle="Root cause breakdown categorized using locked O2C taxonomy"
            signal
            action={
              <Link href="/exceptions" className="text-xs text-[#FF2D2D] font-mono hover:underline">
                VIEW EXCEPTION WORKSPACE →
              </Link>
            }
          />

          <div className="cfo-category-grid grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            {data?.categoryBreakdown?.map((cat) => (
              <div key={cat.category} className="bg-[#09090b] border border-[#27272a] p-5 space-y-2">
                <span className="text-[10px] text-neutral-400 uppercase font-bold">{cat.category}</span>
                <div className="text-lg font-bold text-white">{cat.title}</div>
                <div className="text-xl font-extrabold text-[#FF2D2D] font-mono-num">
                  {formatCurrency(cat.amountMinorUnits)}
                </div>
                <div className="text-[11px] text-neutral-400 font-sans pt-2 border-t border-[#27272a]">
                  {cat.percentageOfActionableTotal}% of total actionable cash ({cat.exceptionCount} cases)
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5. TOP CUSTOMER CONCENTRATION */}
        <div className="space-y-4">
          <SectionHeader
            title="TOP CUSTOMER FINANCIAL EXPOSURE"
            subtitle="Top 5 accounts represent largest receivables concentrations"
            signal
          />

          <div className="cfo-customer-table bg-[#09090b] border border-[#27272a] overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#121215] text-neutral-400 font-mono text-[10px] uppercase border-b border-[#27272a]">
                <tr>
                  <th className="py-3 px-4">CUSTOMER</th>
                  <th className="py-3 px-4 text-right">OUTSTANDING EXPOSURE</th>
                  <th className="py-3 px-4 text-right">OVERDUE</th>
                  <th className="py-3 px-4">DSO</th>
                  <th className="py-3 px-4">RISK BAND</th>
                  <th className="py-3 px-4 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a] font-mono">
                {data?.topCustomerExposures?.slice(0, 5).map((c) => (
                  <tr key={c.customerId} className="hover:bg-[#121215] transition">
                    <td className="py-3.5 px-4 font-bold text-white text-sm">{c.customerName}</td>
                    <td className="py-3.5 px-4 text-right font-mono-num text-white text-sm">{formatCurrency(c.outstandingMinorUnits)}</td>
                    <td className="py-3.5 px-4 text-right font-mono-num text-[#FF2D2D]">{formatCurrency(c.overdueMinorUnits)}</td>
                    <td className="py-3.5 px-4 text-neutral-300">{c.dsoDays} days</td>
                    <td className="py-3.5 px-4">
                      <StatusIndicator status={c.riskBand === 'high' ? 'CRITICAL' : 'HIGH'} />
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link href={`/customers/${c.customerId}`} className="text-[#FF2D2D] font-bold hover:underline">
                        DRILL IN →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 6. MANAGEMENT ATTENTION REQUIRED */}
        <div className="space-y-4">
          <SectionHeader
            title="MANAGEMENT ATTENTION REQUIRED"
            subtitle="Executive escalation decisions requiring CFO authorization"
            signal
            action={
              <Link href="/approvals" className="text-xs text-[#FF2D2D] font-mono hover:underline">
                APPROVAL CENTER →
              </Link>
            }
          />

          <div className="cfo-attention-grid grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
            {data?.managementAttentionItems?.map((item) => (
              <div key={item.id} className="bg-[#09090b] border border-[#27272a] p-5 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="text-sm font-bold text-white">{item.issue}</div>
                  <div className="text-base font-bold text-emerald-400 font-mono-num">
                    {formatCurrency(item.financialImpactMinorUnits)}
                  </div>
                  <p className="text-[11px] text-neutral-400 font-sans leading-relaxed">{item.reason}</p>
                </div>

                <Link
                  href={item.targetModule}
                  className="px-3.5 py-1.5 bg-[#FF2D2D] hover:bg-[#e02424] text-white text-xs font-mono font-bold text-center transition"
                >
                  AUTHORIZE ACTION →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </MainNavShell>
  );
}
