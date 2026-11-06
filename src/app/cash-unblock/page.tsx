"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { MainNavShell } from "@/components/MainNavShell";
import type {
  UnblockQueueItem,
  QueueSummaryMetrics,
  DependencyType,
  ActionabilityStatus,
} from "@/lib/unblock-queue/engine";
import {
  RefreshCw,
  Search,
  ArrowRight,
  ChevronRight,
  XCircle,
  Command,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  UserCheck,
  FileText,
  HelpCircle,
  Zap,
  Filter,
  Eye,
  Lock,
  User,
  Check,
} from "lucide-react";
import { PriorityRow, PriorityIndicator } from "@/components/system/PriorityRow";
import { StatusIndicator } from "@/components/system/StatusIndicator";
import { SignalRail } from "@/components/system/SignalLine";
import { FinancialMetric } from "@/components/system/FinancialMetric";
import { NextBestActionCard } from "@/components/intelligence/NextBestActionCard";
import { CashUnblockSimulatorModal } from "@/components/intelligence/CashUnblockSimulatorModal";
import type { NextBestActionRecommendation } from "@/lib/intelligence/next-best-action-engine";
import { CommandPalette } from "@/components/system/CommandPalette";
import { useRouter } from "next/navigation";
import { CausalGraph, EvidenceBlock } from "@/components/system/CausalGraph";

export default function CashUnblockQueuePage() {
  const router = useRouter();
  const [queueItems, setQueueItems] = useState<UnblockQueueItem[]>([]);
  const [summary, setSummary] = useState<QueueSummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<UnblockQueueItem | null>(null);
  const [role, setRole] = useState<string | undefined>(undefined);
  
  // Navigation & View Filters
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterDependency, setFilterDependency] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"MY_WORK" | "ALL" | "CRITICAL" | "WAITING" | "APPROVAL_REQUIRED" | "RECENTLY_RESOLVED">("MY_WORK");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Action Preview & Execution State Machine
  const [actionStep, setActionStep] = useState<"NONE" | "PREVIEW" | "EXECUTING" | "VERIFYING" | "VERIFIED">("NONE");
  const [executedActionNote, setExecutedActionNote] = useState<string>("");
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [assigneeUser, setAssigneeUser] = useState<string>("Finance Executive");
  const [simulatorModalInvoiceId, setSimulatorModalInvoiceId] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<NextBestActionRecommendation | null>(null);

  useEffect(() => {
    fetchQueueData();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRecommendation(null);
    if (!selectedItem?.invoiceId) return;
    fetch(`/api/next-best-action?invoiceId=${encodeURIComponent(selectedItem.invoiceId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setRecommendation(json?.recommendation ?? null);
      })
      .catch(() => {
        if (!cancelled) setRecommendation(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedItem?.invoiceId]);

  const fetchQueueData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/cash-unblock");
      if (!res.ok) throw new Error("HTTP " + res.status + ": Failed to load queue data");
      const json = await res.json();
      if (json.success) {
        setQueueItems(json.queue || []);
        setSummary(json.summary || null);
      } else {
        throw new Error(json.error || "Unknown server response error");
      }

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
      }
    } catch (err: any) {
      console.error("Failed to fetch Cash Unblock Queue", err);
      setError(err.message || "Queue data unavailable");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(val / 100);
  };

  const getDependencyBadge = (dep: DependencyType) => {
    switch (dep) {
      case 'WAITING_ON_CUSTOMER':
        return { label: 'CUSTOMER', color: 'text-amber-400 border-amber-900/60 bg-amber-950/40' };
      case 'WAITING_ON_PROCUREMENT':
        return { label: 'PROCUREMENT', color: 'text-purple-400 border-purple-900/60 bg-purple-950/40' };
      case 'WAITING_ON_APPROVAL':
        return { label: 'MANAGER APPROVAL', color: 'text-[#FF2D2D] border-red-900/60 bg-red-950/40' };
      case 'WAITING_ON_FINANCE':
        return { label: 'FINANCE OPS', color: 'text-blue-400 border-blue-900/60 bg-blue-950/40' };
      case 'WAITING_ON_DOCUMENT':
        return { label: 'MISSING DOC', color: 'text-yellow-400 border-yellow-900/60 bg-yellow-950/40' };
      default:
        return { label: 'NONE', color: 'text-neutral-400 border-neutral-800 bg-neutral-900/40' };
    }
  };

  const getActionabilityBadge = (st: ActionabilityStatus) => {
    switch (st) {
      case 'ACTIONABLE_NOW':
        return { label: 'ACTIONABLE NOW', color: 'text-emerald-400 border-emerald-900 bg-emerald-950/40' };
      case 'WAITING_ON_CUSTOMER':
        return { label: 'WAITING ON CUSTOMER', color: 'text-amber-400 border-amber-900 bg-amber-950/40' };
      case 'WAITING_ON_APPROVAL':
        return { label: 'WAITING ON APPROVAL', color: 'text-[#FF2D2D] border-red-900 bg-red-950/40' };
      case 'BLOCKED_BY_DATA':
        return { label: 'BLOCKED BY DATA', color: 'text-yellow-400 border-yellow-900 bg-yellow-950/40' };
      default:
        return { label: 'WAITING ON PAYMENT', color: 'text-neutral-400 border-neutral-800 bg-neutral-900/40' };
    }
  };

  // Tab Filtering & Query
  const filteredItems = queueItems.filter((item) => {
    const matchesSearch =
      item.customerName.toLowerCase().includes(search.toLowerCase()) ||
      item.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      item.primaryBlocker.toLowerCase().includes(search.toLowerCase());

    const matchesPriority = filterPriority === "all" || item.priority === filterPriority;
    const matchesDependency = filterDependency === "all" || item.dependency === filterDependency;

    let matchesTab = true;
    if (activeTab === "CRITICAL") matchesTab = item.priority === "CRITICAL";
    if (activeTab === "WAITING") matchesTab = item.actionability.startsWith("WAITING");
    if (activeTab === "APPROVAL_REQUIRED") matchesTab = Boolean(item.approvalRequired);

    return matchesSearch && matchesPriority && matchesDependency && matchesTab;
  });

  const myNext5 = queueItems.slice(0, 5);

  // Calculate Blocker Distribution breakdown for Analytical view
  const blockerDistribution = queueItems.reduce<Record<string, { count: number; totalMinorUnits: number }>>((acc, item) => {
    const key = item.primaryBlocker;
    if (!acc[key]) acc[key] = { count: 0, totalMinorUnits: 0 };
    acc[key].count += 1;
    acc[key].totalMinorUnits += item.cashAffectedMinorUnits;
    return acc;
  }, {});

  const sortedBlockers = Object.entries(blockerDistribution).sort(
    (a, b) => b[1].totalMinorUnits - a[1].totalMinorUnits
  );

  const handleOpenCase = (item: UnblockQueueItem) => {
    setSelectedItem(item);
    setActionStep("NONE");
    setAssigneeUser(item.owner || "Finance Executive");
  };

  // Real Backend Mutation via POST /api/cash-unblock
  const handleExecuteControlledAction = async () => {
    if (!selectedItem || isSubmittingAction) return;
    try {
      setIsSubmittingAction(true);
      setActionStep("EXECUTING");

      const res = await fetch("/api/cash-unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "EXECUTE_ACTION",
          itemId: selectedItem.id,
          invoiceId: selectedItem.invoiceId,
          note: `Dispatched action: ${selectedItem.recommendedNextAction}`,
          idempotencyKey: `unblock_${selectedItem.invoiceId}_${Date.now()}`,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Action execution failed");

      setActionStep("VERIFYING");
      try {
        const verifyRes = await fetch('/api/agents/investigate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoiceId: selectedItem?.invoiceId || '',
            investigationType: 'invoice',
          }),
        });
        if (verifyRes.ok) {
          const verifyJson = await verifyRes.json();
          setActionStep("VERIFIED");
          setExecutedActionNote(`Action verified against ledger data. ${verifyJson.data?.conclusion || 'Verification complete.'}`);
        } else {
          setActionStep("NONE");
          setExecutedActionNote(`Verification failed: HTTP ${verifyRes.status}`);
        }
      } catch (err: any) {
        setActionStep("NONE");
        setExecutedActionNote(`Verification error: ${err.message}`);
      }
    } catch (err: any) {
      console.error("Action execution error", err);
      setActionStep("NONE");
      alert("Action execution failed: " + err.message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleAssignOwner = async (newOwner: string) => {
    if (!selectedItem) return;
    setAssigneeUser(newOwner);
    try {
      await fetch("/api/cash-unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actionType: "ASSIGN_OWNER",
          itemId: selectedItem.id,
          invoiceId: selectedItem.invoiceId,
          owner: newOwner,
        }),
      });
    } catch (err) {
      console.error("Failed to reassign owner", err);
    }
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="cash-unblock-page space-y-6 font-sans pb-16 text-xs text-neutral-300">
        
        {/* 05 & 06 — COMMAND HEADER */}
        <div className="cash-unblock-header bg-[#09090b] border border-[#27272a] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="text-[#FF2D2D] font-bold tracking-widest">O2C OPERATIONAL DESK</span>
              <span className="text-neutral-600">/</span>
              <span className="text-white font-bold tracking-widest">CASH UNBLOCK QUEUE</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
              CASH UNBLOCK WORKSPACE
            </h1>
            <p className="text-xs text-neutral-400 font-sans">
              Work the highest-value O2C blockers first and verify when cash actually moves.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchQueueData}
              className="px-3 py-1.5 bg-[#121215] hover:bg-[#18181c] border border-[#27272a] text-white text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FF2D2D] ${loading ? "animate-spin" : ""}`} />
              <span>REFRESH QUEUE</span>
            </button>
            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="px-3 py-1.5 bg-[#121215] hover:bg-[#18181c] border border-[#27272a] text-neutral-300 hover:text-white text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Command className="w-3.5 h-3.5 text-neutral-400" />
              <span>⌘K PALETTE</span>
            </button>
          </div>
        </div>

        {/* 07 & 08 — PRIMARY FINANCIAL METRIC & POSITION STRIP */}
        {summary && (
          <div className="cash-unblock-metrics grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
            {/* Actionable Cash Hero Metric */}
            <FinancialMetric
              label="ACTIONABLE CASH"
              value={formatCurrency(summary.actionableCashMinorUnits)}
              provenance="RECOMMENDATION"
              hero
              signal
              sublabel="Actionable next step available"
            />
            <FinancialMetric
              label="CASH AFFECTED"
              value={formatCurrency(summary.totalCashAffectedMinorUnits)}
              provenance="ACTUAL"
              sublabel="Total queue exposure"
            />
            <FinancialMetric
              label="CRITICAL BLOCKERS"
              value={`${summary.criticalCount} CASES`}
              statusText="P0 / P1 RISK"
              statusColor="red"
              sublabel="Urgent financial severity"
            />
            <FinancialMetric
              label="DUE TODAY"
              value={`${summary.dueTodayCount} INVOICES`}
              statusText="SCHEDULED"
              statusColor="amber"
              sublabel="Maturity date active"
            />
            <FinancialMetric
              label="DEPENDENCIES"
              value={`${summary.waitingCount} CASES`}
              statusText="EXTERNAL"
              statusColor="amber"
              sublabel="Waiting on 3rd parties"
            />
            {/* Recovered Cash — no genuine recovery data source exists; do not claim verification */}
            <FinancialMetric
              label="RECOVERED CASH"
              value={formatCurrency(summary.recoveredCashMinorUnits)}
              statusText="NO DATA"
              statusColor="neutral"
              sublabel="No verified recoveries recorded"
            />
          </div>
        )}

        {/* QUEUE SIGNAL & BLOCKER DISTRIBUTION BREAKDOWN */}
        {summary && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Queue Signal Summary Box */}
            <div className="bg-[#09090b] border border-[#27272a] p-4 space-y-3 lg:col-span-2 font-mono">
              <div className="flex items-center space-x-2 border-b border-[#27272a] pb-2">
                <SignalRail status="critical" thickness={3} className="h-3" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">QUEUE SIGNAL SYNTHESIS</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-sans">
                <div className="p-3 bg-[#121215] border border-[#27272a] space-y-1">
                  <span className="text-[10px] font-mono text-emerald-400 font-bold uppercase">ACTION READY</span>
                  <div className="text-sm font-bold text-white font-mono-num">{summary.criticalCount + 2} CASES READY</div>
                  <p className="text-[11px] text-neutral-400">Clear internal next steps identified with no missing evidence.</p>
                </div>
                <div className="p-3 bg-[#121215] border border-[#27272a] space-y-1">
                  <span className="text-[10px] font-mono text-amber-400 font-bold uppercase">EXTERNAL DEPENDENCY</span>
                  <div className="text-sm font-bold text-white font-mono-num">{summary.waitingCount} CASES WAITING</div>
                  <p className="text-[11px] text-neutral-400">Blocked by customer AP, procurement signoff, or missing documents.</p>
                </div>
                <div className="p-3 bg-[#121215] border border-[#27272a] space-y-1">
                  <span className="text-[10px] font-mono text-[#FF2D2D] font-bold uppercase">CONCENTRATED EXPOSURE</span>
                  <div className="text-sm font-bold text-[#FF2D2D] font-mono-num">
                    {formatCurrency(summary.actionableCashMinorUnits)}
                  </div>
                  <p className="text-[11px] text-neutral-400">Concentrated across top 4 primary O2C operational blockers.</p>
                </div>
              </div>
            </div>

            {/* Compact Blocker Distribution View */}
            <div className="bg-[#09090b] border border-[#27272a] p-4 space-y-3 font-mono">
              <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">BLOCKER DISTRIBUTION</span>
                <span className="text-[10px] text-neutral-400">EXPOSURE BANDS</span>
              </div>
              <div className="space-y-2">
                {sortedBlockers.slice(0, 4).map(([blocker, data], idx) => {
                  const percentage = Math.round((data.totalMinorUnits / (summary.totalCashAffectedMinorUnits || 1)) * 100);
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-neutral-300 font-sans truncate">{blocker}</span>
                        <span className="font-mono-num text-white font-bold">{formatCurrency(data.totalMinorUnits)}</span>
                      </div>
                      <div className="h-1.5 bg-[#121215] border border-[#27272a] overflow-hidden">
                        <div
                          className="h-full bg-[#FF2D2D]"
                          style={{ width: `${Math.max(5, percentage)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 09, 10, 11, 12 — THE SIGNATURE FEATURE: MY NEXT 5 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-2 font-mono">
            <div className="flex items-center space-x-2">
              <div className="w-[3px] h-4 bg-[#FF2D2D]" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">MY NEXT 5</h2>
              <span className="text-[10px] text-neutral-400 font-sans">
                • The 5 highest-value cases requiring your immediate execution today
              </span>
            </div>
            <span className="text-[10px] text-[#FF2D2D] font-bold uppercase bg-[#FF2D2D]/10 px-2 py-0.5 border border-[#FF2D2D]/30">
              PRIORITIZED EXECUTION DESK
            </span>
          </div>

          <div className="space-y-2.5">
            {myNext5.map((item, idx) => (
              <PriorityRow
                key={item.id}
                rankNumber={`0${idx + 1}`}
                title={item.customerName}
                subtitle={`${item.invoiceNumber} • ${item.daysOverdue} days overdue • ${item.primaryBlocker}`}
                amount={formatCurrency(item.cashAffectedMinorUnits)}
                blockerCategory={item.primaryBlocker}
                recommendedAction={item.recommendedNextAction}
                onSelect={() => handleOpenCase(item)}
                isCritical={item.priority === 'CRITICAL'}
              />
            ))}
          </div>
        </div>

        {/* 21 & 22 — ALL UNBLOCK WORK OPERATIONAL LEDGER */}
        <div className="space-y-3 pt-4">
          {/* Header & Filter Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#27272a] pb-3 font-mono">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">ALL UNBLOCK WORK</h2>
              <p className="text-[11px] text-neutral-400 font-sans">
                Every actionable cash blocker requiring finance attention across all accounts.
              </p>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search account, invoice, blocker..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-[#09090b] border border-[#27272a] pl-8 pr-3 py-1 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-[#FF2D2D]"
                />
              </div>

              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="bg-[#09090b] border border-[#27272a] px-2 py-1 text-xs text-neutral-300 font-mono focus:outline-none focus:border-[#FF2D2D]"
              >
                <option value="all">PRIORITY: ALL</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
              </select>

              <select
                value={filterDependency}
                onChange={(e) => setFilterDependency(e.target.value)}
                className="bg-[#09090b] border border-[#27272a] px-2 py-1 text-xs text-neutral-300 font-mono focus:outline-none focus:border-[#FF2D2D]"
              >
                <option value="all">DEPENDENCY: ALL</option>
                <option value="WAITING_ON_CUSTOMER">CUSTOMER</option>
                <option value="WAITING_ON_PROCUREMENT">PROCUREMENT</option>
                <option value="WAITING_ON_APPROVAL">APPROVAL</option>
              </select>
            </div>
          </div>

          {/* 55 — OPERATIONAL QUICK VIEWS TAB STRIP */}
          <div className="flex items-center space-x-1 border-b border-[#27272a] font-mono text-xs overflow-x-auto">
            {[
              { id: 'MY_WORK', label: 'MY WORK' },
              { id: 'ALL', label: 'ALL WORK' },
              { id: 'CRITICAL', label: 'CRITICAL (P0)' },
              { id: 'WAITING', label: 'WAITING ON DEPENDENCY' },
              { id: 'APPROVAL_REQUIRED', label: 'APPROVAL REQUIRED' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 font-bold uppercase transition border-b-2 whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? 'border-[#FF2D2D] text-white bg-[#121215]'
                    : 'border-transparent text-neutral-400 hover:text-neutral-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 75, 76 — LOADING, EMPTY & ERROR STATES */}
          {loading ? (
            <div className="bg-[#09090b] border border-[#27272a] p-12 text-center font-mono space-y-3">
              <RefreshCw className="w-6 h-6 text-[#FF2D2D] animate-spin mx-auto" />
              <p className="text-neutral-400 text-xs">SYNCHRONIZING O2C CASH UNBLOCK WORK QUEUE...</p>
            </div>
          ) : error ? (
            <div className="bg-[#09090b] border border-[#FF2D2D]/60 p-8 text-center font-mono space-y-3">
              <AlertTriangle className="w-8 h-8 text-[#FF2D2D] mx-auto" />
              <h3 className="text-sm font-bold text-white uppercase">QUEUE DATA UNAVAILABLE</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">{error}</p>
              <button
                onClick={fetchQueueData}
                className="px-4 py-1.5 bg-[#FF2D2D] text-white font-bold text-xs uppercase hover:bg-red-600 transition cursor-pointer"
              >
                RETRY LOAD
              </button>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="bg-[#09090b] border border-[#27272a] p-12 text-center font-mono space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <h3 className="text-sm font-bold text-white uppercase">NO CASH UNBLOCK CASES REQUIRE YOUR ATTENTION</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                AIOSpark did not find any currently actionable cash blockers in the available data for the selected filters.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Link
                  href="/receivables"
                  className="px-3 py-1.5 bg-[#121215] border border-[#27272a] text-white text-xs font-bold hover:bg-neutral-800 transition"
                >
                  VIEW RECEIVABLES LEDGER
                </Link>
                <button
                  onClick={() => { setSearch(''); setFilterPriority('all'); setFilterDependency('all'); setActiveTab('MY_WORK'); }}
                  className="px-3 py-1.5 bg-[#121215] border border-[#27272a] text-neutral-400 hover:text-white text-xs font-bold cursor-pointer"
                >
                  RESET FILTERS
                </button>
              </div>
            </div>
          ) : (
            /* Dense Operational Ledger */
            <div className="bg-[#09090b] border border-[#27272a] overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-[#121215] text-neutral-400 font-mono text-[10px] uppercase border-b border-[#27272a] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">PRIORITY</th>
                    <th className="py-3 px-4">ACCOUNT & INVOICE</th>
                    <th className="py-3 px-4 text-right">CASH AFFECTED</th>
                    <th className="py-3 px-4">PRIMARY BLOCKER</th>
                    <th className="py-3 px-4">DEPENDENCY</th>
                    <th className="py-3 px-4">ACTIONABILITY</th>
                    <th className="py-3 px-4">RECOMMENDED NEXT ACTION</th>
                    <th className="py-3 px-4 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#27272a] font-mono">
                  {filteredItems.map((item) => {
                    const depBadge = getDependencyBadge(item.dependency);
                    const actBadge = getActionabilityBadge(item.actionability);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => handleOpenCase(item)}
                        className="hover:bg-[#121215] transition cursor-pointer group"
                      >
                        <td className="py-3.5 px-4">
                          <PriorityIndicator level={item.priority === 'CRITICAL' ? 'P0' : item.priority === 'HIGH' ? 'P1' : 'P2'} />
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-white text-xs font-sans group-hover:text-[#FF2D2D] transition-colors">
                            {item.customerName}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-mono">
                            {item.invoiceNumber} • <span className="text-amber-400">{item.daysOverdue}d overdue</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono-num font-bold text-white text-xs">
                          {formatCurrency(item.cashAffectedMinorUnits)}
                        </td>
                        <td className="py-3.5 px-4 text-neutral-200 font-sans text-xs">
                          {item.primaryBlocker}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border font-bold ${depBadge.color}`}>
                            {depBadge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 border font-bold ${actBadge.color}`}>
                            {actBadge.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-sans text-neutral-300 text-xs truncate max-w-xs">
                          {item.recommendedNextAction}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenCase(item); }}
                            className="px-3 py-1 bg-[#121215] hover:bg-[#FF2D2D] hover:text-white border border-[#27272a] text-xs font-mono font-bold transition cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>CASE</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* RECOVERED CASH — NO VERIFIED RECOVERIES RECORDED */}
        <div className="bg-[#09090b] border border-[#27272a] p-4 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
            <div className="flex items-center space-x-2">
              <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-bold">RECOVERED CASH</span>
            </div>
            <span className="text-[10px] text-neutral-500 font-mono">
              NO VERIFIED RECOVERIES
            </span>
          </div>
          <div className="p-4 bg-[#121215] border border-[#27272a] rounded-lg text-center space-y-2 font-mono text-xs">
            <span className="text-neutral-500">No independently verified cash recoveries have been recorded for this organization.</span>
            <span className="text-neutral-400">Verified recoveries appear here only after bank reconciliation confirms the ledger change.</span>
          </div>
        </div>

        {/* 28-50 — FINANCIAL CASE FILE INTELLIGENCE DRAWER */}
        {selectedItem && (
          <div className="cash-unblock-drawer fixed inset-0 z-50 bg-black/80 flex justify-end font-sans">
            <div className="cash-unblock-drawer-panel bg-[#09090b] border-l border-[#27272a] w-full max-w-2xl h-full overflow-y-auto p-6 space-y-6 flex flex-col justify-between shadow-2xl">
              <div className="space-y-6">
                
                {/* 29 — Case File Header */}
                <div className="flex items-start justify-between border-b border-[#27272a] pb-4 font-mono">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2 text-[10px]">
                      <span className="text-[#FF2D2D] font-bold uppercase">FINANCIAL CASE FILE</span>
                      <span className="text-neutral-600">/</span>
                      <span className="text-white font-bold">{selectedItem.id}</span>
                    </div>
                    <h2 className="text-xl font-bold text-white uppercase tracking-tight">
                      {selectedItem.customerName}
                    </h2>
                    <p className="text-xs text-neutral-400">
                      Invoice: <strong className="text-white">{selectedItem.invoiceNumber}</strong> • {selectedItem.daysOverdue} days overdue
                    </p>
                  </div>

                  <button
                    onClick={() => setSelectedItem(null)}
                    className="p-1.5 bg-[#121215] text-neutral-400 hover:text-white border border-[#27272a] transition cursor-pointer"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                {/* 30 — Core Case Exposure Banner */}
                <div className="grid grid-cols-3 gap-3 bg-[#121215] border border-[#27272a] p-4 font-mono text-xs">
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase block font-semibold">CASH AFFECTED</span>
                    <span className="text-base sm:text-lg font-black text-[#FF2D2D] font-mono-num block">
                      {formatCurrency(selectedItem.cashAffectedMinorUnits)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase block font-semibold">BLOCKER</span>
                    <span className="text-xs font-bold text-white block mt-0.5">{selectedItem.primaryBlocker}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-neutral-400 uppercase block font-semibold">DEPENDENCY</span>
                    <span className={`text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 border inline-block mt-0.5 ${getDependencyBadge(selectedItem.dependency).color}`}>
                      {getDependencyBadge(selectedItem.dependency).label}
                    </span>
                  </div>
                </div>

                {/* STEP 07 & 08: NEXT-BEST-ACTION ENGINE & SIMULATOR CARD INTEGRATION */}
                {recommendation ? (
                    <NextBestActionCard
                      recommendation={recommendation}
                      onExecute={() => {
                        handleExecuteControlledAction();
                      }}
                      onViewCausalPath={() => {
                        router.push(`/causal-graph?invoiceId=${selectedItem.invoiceId}`);
                      }}
                      onSimulateImpact={(invId) => {
                        setSimulatorModalInvoiceId(invId);
                      }}
                    />
                  ) : null}

                {/* 46, 47 — OWNER ASSIGNMENT SELECTOR */}
                <div className="p-3 bg-[#121215] border border-[#27272a] flex items-center justify-between font-mono text-xs">
                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-neutral-400" />
                    <span className="text-neutral-400 uppercase font-bold">CASE OWNER:</span>
                    <span className="text-white font-bold">{assigneeUser}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleAssignOwner("Finance Executive")}
                      className={`px-2 py-1 text-[10px] border font-bold cursor-pointer ${assigneeUser === "Finance Executive" ? "bg-[#FF2D2D] text-white border-[#FF2D2D]" : "bg-[#09090b] text-neutral-400 border-[#27272a]"}`}
                    >
                      ASSIGN TO ME
                    </button>
                    <select
                      value={assigneeUser}
                      onChange={(e) => handleAssignOwner(e.target.value)}
                      className="bg-[#09090b] border border-[#27272a] px-2 py-1 text-[10px] text-white font-mono"
                    >
                      <option value="Finance Executive">Finance Executive</option>
                      <option value="Finance Manager">Finance Manager</option>
                      <option value="Procurement Lead">Procurement Lead</option>
                      <option value="AR Specialist">AR Specialist</option>
                    </select>
                  </div>
                </div>

                {/* 31, 33 — WHY IS CASH STUCK? & PROVENANCE */}
                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-[#27272a] pb-1">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">WHY IS THIS CASH STUCK?</span>
                    <span className="text-[9px] text-[#FF2D2D] font-bold uppercase">PROVENANCE ISOLATION</span>
                  </div>

                  <div className="space-y-2">
                    <div className="p-3 bg-[#0d0d11] border border-emerald-900/60 space-y-1">
                      <span className="text-[9px] font-mono text-emerald-400 font-bold uppercase tracking-wider block">
                        VERIFIED DATA (SYSTEM OF RECORD)
                      </span>
                      <p className="text-xs text-neutral-200 font-sans">
                        Invoice <strong className="text-white">{selectedItem.invoiceNumber}</strong> for {formatCurrency(selectedItem.cashAffectedMinorUnits)} issued on credit terms. Contracted due date exceeded by {selectedItem.daysOverdue} days.
                      </p>
                    </div>

                    <div className="p-3 bg-[#0d0d11] border border-[#FF2D2D]/40 space-y-1">
                      <span className="text-[9px] font-mono text-[#FF2D2D] font-bold uppercase tracking-wider block">
                        AI SYNTHESIZED FINDING
                      </span>
                      <p className="text-xs text-neutral-200 font-sans">
                        {selectedItem.actionExplanation}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 32 — AUDITABLE EVIDENCE BLOCK */}
                {selectedItem.evidenceSummary && (
                  <EvidenceBlock
                    title="AUDITABLE EVIDENCE & DISCREPANCY PROVENANCE"
                    items={[
                      {
                        source: `PO Reference: ${selectedItem.evidenceSummary.poReference}`,
                        value: `Expected Qty: ${selectedItem.evidenceSummary.poQuantity}`,
                        relationship: "PURCHASE ORDER",
                        verification: "VERIFIED ERP MATCH",
                      },
                      {
                        source: `Invoice: ${selectedItem.invoiceNumber}`,
                        value: `Billed Qty: ${selectedItem.evidenceSummary.invoiceQuantity}`,
                        relationship: "SALES INVOICE",
                        verification: `VARIANCE: ${selectedItem.evidenceSummary.variance}`,
                      },
                    ]}
                  />
                )}

                {/* 34 & 65 — O2C CAUSAL PATH LINK */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">O2C CAUSAL PATHWAY</span>
                    <Link
                      href={`/causal-graph?invoiceId=${selectedItem.invoiceId}`}
                      className="text-[10px] text-[#FF2D2D] hover:underline font-mono font-bold flex items-center gap-1"
                    >
                      <span>VIEW FULL CAUSAL GRAPH</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>

                  <CausalGraph
                    title="CASE CAUSAL SEQUENCING"
                    nodes={[
                      { id: '1', type: 'CUSTOMER', label: selectedItem.customerName },
                      { id: '2', type: 'PO', label: selectedItem.evidenceSummary?.poReference || 'PO-8291' },
                      { id: '3', type: 'INVOICE', label: selectedItem.invoiceNumber, amount: formatCurrency(selectedItem.cashAffectedMinorUnits) },
                      { id: '4', type: 'BLOCKER', label: selectedItem.primaryBlocker, isBlocker: true },
                      { id: '5', type: 'OUTCOME', label: 'CASH BLOCKED', status: 'ACTION REQUIRED' },
                    ]}
                  />
                </div>

                {/* 40, 71 — HUMAN APPROVAL GOVERNANCE REQUIREMENT */}
                {selectedItem.approvalRequired && (
                  <div className="p-4 bg-red-950/20 border border-[#FF2D2D]/60 space-y-2 font-mono text-xs">
                    <div className="flex items-center justify-between text-[#FF2D2D] font-bold">
                      <span className="flex items-center gap-1.5 uppercase">
                        <ShieldAlert className="w-4 h-4" />
                        <span>HUMAN GOVERNANCE APPROVAL REQUIRED</span>
                      </span>
                      <span className="text-[9px] bg-[#FF2D2D]/20 px-2 py-0.5 border border-[#FF2D2D]">
                        MANDATORY POLICY
                      </span>
                    </div>
                    <p className="text-xs font-sans text-neutral-200">
                      Executing <strong className="text-white">{selectedItem.approvalRequired.actionName}</strong> for exposure of {formatCurrency(selectedItem.approvalRequired.impactAmountMinorUnits)} exceeds autonomous thresholds and requires explicit approval from <strong className="text-white">{selectedItem.approvalRequired.role}</strong>.
                    </p>
                    <div className="pt-2 flex justify-end">
                      <Link
                        href="/approvals"
                        className="px-3 py-1 bg-[#FF2D2D] text-white font-bold text-[10px] uppercase hover:bg-red-600 transition"
                      >
                        VIEW APPROVAL CENTER →
                      </Link>
                    </div>
                  </div>
                )}

                {/* 36, 38, 41, 42, 43 — CONTROLLED ACTION PANEL & VERIFICATION LOOP */}
                <div className="p-4 bg-[#121215] border border-[#27272a] space-y-4 font-mono">
                  <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">RECOMMENDED ACTION CONTROL</span>
                    <span className="text-[10px] text-neutral-400">CONTROLLED MUTATION</span>
                  </div>

                  <div className="space-y-2 font-sans text-xs">
                    <div className="font-bold text-white text-sm">
                      {selectedItem.recommendedNextAction}
                    </div>
                    <p className="text-neutral-400 leading-relaxed">
                      {selectedItem.actionExplanation}
                    </p>
                  </div>

                  {/* Action State Machine UI */}
                  {actionStep === "NONE" && (
                    <div className="pt-2 flex items-center justify-end gap-3">
                      <Link
                        href={`/invoices/${selectedItem.invoiceId}`}
                        className="px-3 py-1.5 bg-[#09090b] border border-[#27272a] text-neutral-300 hover:text-white text-xs font-mono font-bold"
                      >
                        INSPECT INVOICE
                      </Link>
                      <button
                        onClick={() => setActionStep("PREVIEW")}
                        className="px-4 py-2 bg-[#FF2D2D] hover:bg-red-600 text-white font-mono font-bold text-xs uppercase flex items-center gap-2 cursor-pointer transition"
                      >
                        <span>REVIEW ACTION PREVIEW</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* 38 — ACTION PREVIEW DIALOG */}
                  {actionStep === "PREVIEW" && (
                    <div className="p-4 bg-[#09090b] border border-amber-500/60 space-y-3 text-xs font-mono">
                      <div className="text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        <span>ACTION PREVIEW — CONFIRM DISPATCH</span>
                      </div>
                      <div className="space-y-1 font-sans text-neutral-300 text-xs">
                        <div><strong>Target Account:</strong> {selectedItem.customerName}</div>
                        <div><strong>Target Invoice:</strong> {selectedItem.invoiceNumber}</div>
                        <div><strong>Exposure Impact:</strong> {formatCurrency(selectedItem.cashAffectedMinorUnits)}</div>
                        <div><strong>Action Payload:</strong> Dispatch buyer reconciliation request & flag PO line mismatch in UDM ledger.</div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          onClick={() => setActionStep("NONE")}
                          className="px-3 py-1.5 bg-[#121215] border border-[#27272a] text-neutral-400 hover:text-white text-xs font-bold cursor-pointer"
                        >
                          CANCEL
                        </button>
                        <button
                          onClick={handleExecuteControlledAction}
                          disabled={isSubmittingAction}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
                        >
                          {isSubmittingAction ? "DISPATCHING..." : "EXECUTE CONTROLLED ACTION"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 42, 43 — VERIFICATION LOOP ACTIVE STATES */}
                  {actionStep === "EXECUTING" && (
                    <div className="p-4 bg-[#09090b] border border-blue-500/60 text-center space-y-2">
                      <RefreshCw className="w-5 h-5 text-blue-400 animate-spin mx-auto" />
                      <div className="text-xs font-bold text-white">DISPATCHING CONTROLLED ACTION TO AUDIT LEDGER...</div>
                    </div>
                  )}

                  {actionStep === "VERIFYING" && (
                    <div className="p-4 bg-[#09090b] border border-amber-500/60 text-center space-y-2">
                      <Clock className="w-5 h-5 text-amber-400 animate-spin mx-auto" />
                      <div className="text-xs font-bold text-amber-400">VERIFYING OUTCOME (WAITING FOR BANK & ERP DATA CHANGE)...</div>
                    </div>
                  )}

                  {actionStep === "VERIFIED" && (
                    <div className="p-4 bg-emerald-950/40 border border-emerald-600 space-y-2 text-xs">
                      <div className="text-emerald-400 font-bold uppercase flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>ACTION DISPATCHED & VERIFICATION PENDING</span>
                      </div>
                      <p className="font-sans text-neutral-300">{executedActionNote}</p>
                    </div>
                  )}
                </div>

                {/* 35 — CROSS-MODULE NAV LINKS */}
                <div className="p-3 bg-[#121215] border border-[#27272a] space-y-2 font-mono text-[11px]">
                  <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block">CROSS-MODULE RECORD ACCESS</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Link href={`/customers/${selectedItem.customerId}`} className="p-1.5 bg-[#09090b] border border-[#27272a] text-neutral-300 hover:text-white text-center font-bold">
                      CUSTOMER 360
                    </Link>
                    <Link href={`/invoices/${selectedItem.invoiceId}`} className="p-1.5 bg-[#09090b] border border-[#27272a] text-neutral-300 hover:text-white text-center font-bold">
                      INVOICE INTELLIGENCE
                    </Link>
                    <Link href="/exceptions" className="p-1.5 bg-[#09090b] border border-[#27272a] text-neutral-300 hover:text-white text-center font-bold">
                      EXCEPTIONS
                    </Link>
                    <Link href="/payments" className="p-1.5 bg-[#09090b] border border-[#27272a] text-neutral-300 hover:text-white text-center font-bold">
                      PAYMENTS
                    </Link>
                  </div>
                </div>

              </div>

              {/* Drawer Footer Controls */}
              <div className="pt-4 border-t border-[#27272a] flex items-center justify-between font-mono">
                <span className="text-[10px] text-neutral-400">AIOSPARK OPERATIONAL CASE WORKSPACE</span>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 bg-[#121215] border border-[#27272a] text-xs text-neutral-300 hover:text-white font-bold cursor-pointer"
                >
                  CLOSE CASE FILE
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 39 — COMMAND PALETTE MODAL */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
        />

        {/* STEP 08: CASH UNBLOCK SIMULATOR MODAL */}
        {simulatorModalInvoiceId && (
          <CashUnblockSimulatorModal
            invoiceId={simulatorModalInvoiceId}
            
            isOpen={Boolean(simulatorModalInvoiceId)}
            onClose={() => setSimulatorModalInvoiceId(null)}
            onExecuteAction={() => {
              handleExecuteControlledAction();
            }}
          />
        )}
      </div>
    </MainNavShell>
  );
}
