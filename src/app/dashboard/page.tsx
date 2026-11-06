"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogOut,
  UserPlus,
  ArrowRight,
  ChevronRight,
  Search,
  ShieldCheck,
  Activity,
  AlertOctagon,
  Clock,
  TrendingUp,
  Upload,
  FileSpreadsheet,
  RotateCw,
  Sparkles,
  Building2,
  AlertTriangle,
  CreditCard,
  FileCheck,
  CheckCircle2,
} from "lucide-react";
import { MainNavShell } from "@/components/MainNavShell";
import { TeammateInviteModal } from "@/components/tenant/TeammateInviteModal";
import { NotificationCenterBell } from "@/components/NotificationCenterBell";
import { Can } from "@/components/tenant/Can";
import { FinancialBand } from "@/components/system/FinancialBand";
import { IntelligencePanel } from "@/components/system/IntelligencePanel";
import { PriorityRow } from "@/components/system/PriorityRow";
import { SectionHeader } from "@/components/system/SectionHeader";
import { StatusIndicator } from "@/components/system/StatusIndicator";
import { Timeline } from "@/components/system/Timeline";
import { DetailDrawer } from "@/components/system/DetailDrawer";
import { CommandPalette } from "@/components/system/CommandPalette";

interface CFOOverviewData {
  totalReceivablesMinorUnits: number;
  overdueMinorUnits?: number;
  dsoDays?: number;
  actionableBlockersMinorUnits: number;
  categoryBreakdown: Array<{
    category: string;
    title: string;
    amountMinorUnits: number;
    percentageOfActionableTotal: number;
    exceptionCount: number;
  }>;
  topActions: Array<{
    rank: number;
    exceptionId: string;
    invoiceId: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    category: string;
    categoryTitle: string;
    outstandingAmountMinorUnits: number;
    confidenceScore: number;
    recommendedAction: string;
  }>;
  topCustomerExposures?: Array<{
    customerId: string;
    customerName: string;
    outstandingMinorUnits: number;
    overdueMinorUnits: number;
    atRiskMinorUnits: number;
    openExceptionCount: number;
    dsoDays: number;
    riskBand: string;
    percentageOfTotalReceivables: number;
  }>;
  unreconciledCashMinorUnits?: number;
  unreconciledCashSummary?: {
    unmatchedPaymentCount: number;
  };
  agingBuckets?: Array<{
    rangeLabel: string;
    rangeKey: string;
    amountMinorUnits: number;
    percentageOfTotal: number;
    invoiceCount: number;
  }>;
  managementAttentionItems?: Array<any>;
  computedAt: string;
}

const getCategoryIcon = (category: string) => {
  switch (category) {
    case 'PO_MISMATCH':
      return <FileSpreadsheet className="w-3.5 h-3.5 text-[#FF3B30]" />;
    case 'MISSING_DOCUMENT':
      return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    case 'CUSTOMER_DISPUTE':
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    case 'PAYMENT_PROMISED':
      return <CreditCard className="w-3.5 h-3.5 text-emerald-400" />;
    default:
      return <AlertOctagon className="w-3.5 h-3.5 text-[#FF3B30]" />;
  }
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [organization, setOrganization] = useState<any>(null);
  const [role, setRole] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cfoData, setCfoData] = useState<CFOOverviewData | undefined>(undefined);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  // Contextual Detail Drawer State
  const [selectedDrawerItem, setSelectedDrawerItem] = useState<{
    title: string;
    subtitle?: string;
    content: React.ReactNode;
  } | null>(null);

  // Advanced View Modes
  const [viewMode, setViewMode] = useState<"TERMINAL" | "WATERFALL" | "MATRIX">("TERMINAL");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchSessionAndData();
  }, []);

  useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
        return;
      }
      if (e.key === '1') {
        setViewMode('TERMINAL');
      } else if (e.key === '2') {
        setViewMode('WATERFALL');
      } else if (e.key === '3') {
        setViewMode('MATRIX');
      }
    };
    window.addEventListener('keydown', handleKeyNav);
    return () => window.removeEventListener('keydown', handleKeyNav);
  }, []);

  const fetchSessionAndData = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const meRes = await fetch("/api/auth/me");
      if (!meRes.ok) {
        router.push("/login");
        return;
      }
      const meData = await meRes.json();
      setUser(meData.user);
      setOrganization(meData.organization);

      // Fetch CFO Overview Data
      const cfoRes = await fetch("/api/cfo/overview");
      if (cfoRes.ok) {
        const data = await cfoRes.json();
        setCfoData(data);
      }

      // Fetch Tenant Invoices & Approval Logs
      const dataRes = await fetch("/api/tenant/data");
      if (dataRes.ok) {
        const dData = await dataRes.json();
        setInvoices(dData.invoices || []);
      }

      const appRes = await fetch(`/api/approvals?organization_id=${encodeURIComponent(meData.organization.id)}`);
      if (appRes.ok) {
        const aData = await appRes.json();
        setRecentLogs(aData.logs || []);
      }

      const membersRes = await fetch("/api/tenant/members");
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  const formatCurrency = (amountInMinorUnits: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amountInMinorUnits / 100);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0B0E] text-neutral-300 p-8 font-sans">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-28 workstation-card rounded-xl border border-white/[0.08] animate-pulse bg-white/[0.02]" />
          <div className="h-32 workstation-card rounded-xl border border-white/[0.08] animate-pulse bg-white/[0.02]" />
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-24 workstation-card rounded-xl border border-white/[0.08] animate-pulse bg-white/[0.02]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Calculated Financial Metrics
  const totalReceivables = cfoData?.totalReceivablesMinorUnits || 0;
  const actionableCash = cfoData?.actionableBlockersMinorUnits || 0;
  const overdueAmount = cfoData?.overdueMinorUnits || 0;

  // Blocker breakdown for "WHY CASH IS STUCK"
  const blockerCategories = cfoData?.categoryBreakdown || [];

  const topActions = cfoData?.topActions?.slice(0, 5) || [];

  const filteredActions = activeCategoryFilter
    ? topActions.filter(a => a.category === activeCategoryFilter)
    : topActions;

  // Timeline events for Recent Financial Activity
  const timelineEvents = recentLogs.map((log: any) => ({
    date: new Date(log.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    title: log.action || 'Financial event logged',
    status: log.status === 'approved' ? 'VERIFIED' : 'ACTIONABLE',
    isCurrent: false,
    description: log.notes || log.exception_id || 'System audit trace recorded',
  }));

  const openStageDrawer = (stage: {
    num: string;
    name: string;
    amount: number;
    description: string;
    countLabel: string;
    actionHref: string;
    isBottleneck?: boolean;
  }) => {
    setSelectedDrawerItem({
      title: `Stage ${stage.num} • ${stage.name}`,
      subtitle: `Order-to-Cash Lifecycle Telemetry • Exposure: ${formatCurrency(stage.amount)}`,
      content: (
        <div className="space-y-4 text-xs font-sans">
          <div className={`p-4 rounded-xl border ${stage.isBottleneck ? 'bg-[#FF3B30]/10 border-[#FF3B30]/30' : 'bg-[#181B23] border-white/[0.08]'} space-y-2`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase font-semibold text-neutral-400 font-sans">Exposure in Stage</span>
              {stage.isBottleneck && (
                <span className="text-[10px] font-semibold text-[#FF3B30] bg-[#FF3B30]/20 px-2 py-0.5 rounded border border-[#FF3B30]/30 font-sans">
                  Primary Bottleneck
                </span>
              )}
            </div>
            <div className={`text-2xl font-bold font-mono-num tabular-nums ${stage.isBottleneck ? 'text-[#FF3B30]' : 'text-white'}`}>
              {formatCurrency(stage.amount)}
            </div>
            <p className="text-neutral-300 text-xs font-sans">
              {stage.countLabel}
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] text-neutral-400 uppercase font-semibold font-sans">Operational Lifecycle Context</span>
            <div className="p-3.5 bg-[#181B23]/60 border border-white/[0.08] rounded-xl space-y-2 font-sans text-xs text-neutral-300 leading-relaxed">
              {stage.description}
            </div>
          </div>

          <Link
            href={stage.actionHref}
            className="w-full py-2.5 btn-editorial-primary text-white font-semibold text-center block rounded-xl shadow-md transition-all font-sans"
          >
            Inspect Stage Exceptions →
          </Link>
        </div>
      ),
    });
  };

  const openAgingDrawer = (bucket: { rangeLabel: string; rangeKey: string; amountMinorUnits: number; percentageOfTotal: number; invoiceCount: number }) => {
    setSelectedDrawerItem({
      title: `Aging Bracket • ${bucket.rangeLabel}`,
      subtitle: `${bucket.percentageOfTotal}% of Gross Receivables • ${formatCurrency(bucket.amountMinorUnits)}`,
      content: (
        <div className="space-y-4 text-xs font-sans">
          <div className="p-4 bg-[#181B23] border border-white/[0.08] rounded-xl space-y-2">
            <div className="text-[11px] uppercase font-semibold text-neutral-400 font-sans">Total Bracket Exposure</div>
            <div className="text-2xl font-bold font-mono-num tabular-nums text-white">
              {formatCurrency(bucket.amountMinorUnits)}
            </div>
            <p className="text-neutral-300 text-xs font-sans">
              Contains {bucket.invoiceCount} open invoice(s) across customer accounts.
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] text-neutral-400 uppercase font-semibold font-sans">Risk & Collection Policy</span>
            <div className="p-3.5 bg-[#181B23]/60 border border-white/[0.08] rounded-xl space-y-2 font-sans text-xs text-neutral-300 leading-relaxed">
              {bucket.rangeKey === '90_plus' || bucket.rangeKey === '61_90'
                ? 'High overdue exposure requiring immediate controller review or dispute escalation. Prioritize high-concentration customer accounts.'
                : 'Standard operational dunning cadence active. Invoices within healthy or near-due billing cycles.'}
            </div>
          </div>

          <Link
            href="/receivables"
            className="w-full py-2.5 btn-editorial-primary text-white font-semibold text-center block rounded-xl shadow-md transition-all font-sans"
          >
            Inspect Receivables Schedule →
          </Link>
        </div>
      ),
    });
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="dashboard-page space-y-8 font-sans pb-16">
        
        {/* A. COMMAND HEADER */}
        <div className="dashboard-command-header flex flex-col xl:flex-row xl:items-center justify-between gap-6 workstation-card p-6 md:p-8 rounded-xl border border-white/[0.08] shadow-2xl relative overflow-hidden bg-gradient-to-br from-[#14161E] via-[#12141A] to-[#0D0E12]">
          {/* Subtle ambient luxury highlight */}
          <div className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 bg-[#FF3B30]/[0.03] rounded-full blur-3xl" />

          <div className="space-y-3 z-10">
            {/* Live Telemetry Strip */}
            <div className="flex items-center space-x-3 text-xs text-neutral-400 font-sans flex-wrap gap-y-2">
              <span className="text-[#FF3B30] font-semibold text-[11px] tracking-wide uppercase bg-[#FF3B30]/10 px-2.5 py-0.5 rounded border border-[#FF3B30]/20 font-mono">
                Order-to-Cash Workstation
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-neutral-300 font-medium">{organization?.name || "Enterprise Ledger"}</span>
              <span className="text-neutral-500">•</span>
              <span className="text-neutral-400 text-[11px] font-mono-num tabular-nums">
                {cfoData?.computedAt ? new Date(cfoData.computedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not computed'}
              </span>
              <button
                onClick={() => fetchSessionAndData(true)}
                disabled={refreshing}
                className="p-1 text-neutral-400 hover:text-white transition rounded hover:bg-white/[0.06] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30] group"
                title="Refresh financial telemetry"
                aria-label="Refresh financial telemetry"
              >
                <RotateCw className={`w-3.5 h-3.5 transition-transform duration-300 group-hover:rotate-180 ${refreshing ? 'animate-spin text-[#FF3B30]' : ''}`} />
              </button>
            </div>
            
            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-4xl font-bold font-sans tracking-tight text-white">
                Where is your cash stuck?
              </h1>
              <p className="font-serif-editorial text-[#FF3B30] font-normal italic text-lg sm:text-2xl">
                Automated root cause resolution & audit governance.
              </p>
              <p className="text-xs sm:text-sm text-neutral-400 font-sans max-w-2xl leading-relaxed">
                Real-time financial exposure telemetry, dispute classification, and policy-gated resolution workflows.
              </p>
            </div>

            {/* OPERATIONAL MODE SWITCHER */}
            <div className="dashboard-mode-switcher inline-flex items-center p-1 bg-[#0A0B0E]/80 border border-white/[0.08] rounded-xl backdrop-blur-sm gap-1 pt-1">
              <button
                onClick={() => setViewMode("TERMINAL")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer font-sans text-xs font-semibold flex items-center gap-1.5 ${
                  viewMode === "TERMINAL"
                    ? "btn-editorial-primary text-white shadow-sm"
                    : "text-neutral-400 hover:text-white hover:bg-white/[0.04]"
                }`}
                title="Switch to Telemetry Matrix (HotKey: 1)"
              >
                <span>Telemetry Matrix</span>
                <kbd className={`text-[10px] px-1 py-0.2 rounded font-mono ${viewMode === "TERMINAL" ? "bg-white/20 text-white" : "bg-black/40 text-neutral-400 border border-white/[0.06]"}`}>1</kbd>
              </button>
              <button
                onClick={() => setViewMode("WATERFALL")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer font-sans text-xs font-semibold flex items-center gap-1.5 ${
                  viewMode === "WATERFALL"
                    ? "btn-editorial-primary text-white shadow-sm"
                    : "text-neutral-400 hover:text-white hover:bg-white/[0.04]"
                }`}
                title="Switch to Cash Waterfall (HotKey: 2)"
              >
                <span>Cash Waterfall</span>
                <kbd className={`text-[10px] px-1 py-0.2 rounded font-mono ${viewMode === "WATERFALL" ? "bg-white/20 text-white" : "bg-black/40 text-neutral-400 border border-white/[0.06]"}`}>2</kbd>
              </button>
              <button
                onClick={() => setViewMode("MATRIX")}
                className={`px-3 py-1.5 rounded-lg transition cursor-pointer font-sans text-xs font-semibold flex items-center gap-1.5 ${
                  viewMode === "MATRIX"
                    ? "btn-editorial-primary text-white shadow-sm"
                    : "text-neutral-400 hover:text-white hover:bg-white/[0.04]"
                }`}
                title="Switch to Action Focus (HotKey: 3)"
              >
                <span>Action Focus</span>
                <kbd className={`text-[10px] px-1 py-0.2 rounded font-mono ${viewMode === "MATRIX" ? "bg-white/20 text-white" : "bg-black/40 text-neutral-400 border border-white/[0.06]"}`}>3</kbd>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 z-10 self-start xl:self-center">
            <Link
              href="/onboarding"
              className="btn-editorial-primary px-3.5 py-2 text-xs font-semibold font-sans rounded-lg flex items-center gap-2 cursor-pointer shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Data / Sync ERP</span>
            </Link>

            <button
              onClick={() => {
                const event = new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true });
                window.dispatchEvent(event);
              }}
              className="px-3 py-2 bg-[#181B23] border border-[#FF3B30]/30 hover:border-[#FF3B30] text-white font-sans text-xs font-semibold flex items-center gap-2 cursor-pointer transition-all rounded-lg shadow-sm group"
              title="Open Spark Copilot (⌘J)"
            >
              <div className="w-4 h-4 rounded-full bg-[#FF3B30] flex items-center justify-center shadow-[0_0_8px_#FF3B30]">
                <Sparkles className="w-2.5 h-2.5 text-white animate-pulse" />
              </div>
              <span>Spark Copilot</span>
              <kbd className="text-[10px] bg-white/[0.08] px-1.5 py-0.5 rounded text-neutral-400 font-mono border border-white/[0.06]">⌘J</kbd>
            </button>

            <button
              onClick={() => setCommandPaletteOpen(true)}
              className="px-3 py-2 bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-sans text-xs font-medium flex items-center gap-2 cursor-pointer transition-all rounded-lg"
              title="Search command palette (⌘K)"
            >
              <Search className="w-3.5 h-3.5 text-[#FF3B30]" />
              <span>Search</span>
              <kbd className="text-[10px] bg-white/[0.08] px-1.5 py-0.5 rounded text-neutral-400 font-mono border border-white/[0.06]">⌘K</kbd>
            </button>

            <NotificationCenterBell />

            <Can I="create" a="users_invites" role={role || ''}>
              <button
                onClick={() => setInviteModalOpen(true)}
                className="px-3 py-2 bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-sans text-xs font-medium rounded-lg flex items-center gap-2 cursor-pointer transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite Team</span>
              </button>
            </Can>

            <button
              onClick={handleLogout}
              className="p-2 bg-[#181B23] hover:bg-white/[0.06] text-neutral-400 hover:text-white transition cursor-pointer border border-white/[0.08] rounded-lg"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* B. FINANCIAL POSITION */}
        <div className="space-y-4">
          <SectionHeader
            title="Financial Position & Cash Velocity"
            subtitle="Ledger exposure breakdown highlighting actionable cash"
            editorial
            signal={false}
          />
          <FinancialBand
            heroMetric={{
              label: "Actionable Cash at Risk",
              value: formatCurrency(actionableCash),
              sublabel: "Cash associated with defined, actionable Next-Best-Action blockers.",
              signal: actionableCash > 0,
            }}
            metrics={[
              {
                label: "Total Receivables",
                value: formatCurrency(totalReceivables),
                sublabel: "Active gross ledger balance",
                highlightColor: "default",
              },
              {
                label: "Overdue Exposure",
                value: formatCurrency(overdueAmount),
                sublabel: "Past 30-day contracted terms",
                highlightColor: overdueAmount > 0 ? "red" : "default",
              },
              {
                label: "Days Sales Outstanding",
                value: `${cfoData?.dsoDays || 0} Days`,
                sublabel: "Target baseline: 30 days",
                highlightColor: (cfoData?.dsoDays || 0) > 45 ? "red" : (cfoData?.dsoDays || 0) > 30 ? "amber" : "emerald",
              },
            ]}
          />

          {/* Real-time AR Aging Distribution Ribbon */}
          {cfoData?.agingBuckets && cfoData.agingBuckets.length > 0 && totalReceivables > 0 && (
            <div className="workstation-card p-4 rounded-xl border border-white/[0.08] space-y-2.5">
              <div className="flex items-center justify-between text-xs font-sans">
                <span className="text-neutral-400 font-medium">Receivables Aging Distribution</span>
                <span className="text-neutral-300 font-mono-num tabular-nums text-[11px]">
                  Gross Exposure: {formatCurrency(totalReceivables)}
                </span>
              </div>
              <div className="h-2.5 w-full flex rounded-full overflow-hidden bg-white/[0.04] border border-white/[0.06]">
                {cfoData.agingBuckets.map((bucket, idx) => {
                  const pct = bucket.percentageOfTotal || 0;
                  if (pct === 0) return null;
                  const color =
                    idx === 0 ? "bg-emerald-500 hover:bg-emerald-400" :
                    idx === 1 ? "bg-emerald-400/80 hover:bg-emerald-300" :
                    idx === 2 ? "bg-amber-400 hover:bg-amber-300" :
                    idx === 3 ? "bg-orange-500 hover:bg-orange-400" :
                    "bg-[#FF3B30] hover:bg-[#FF3B30]/90";
                  return (
                    <div
                      key={bucket.rangeKey}
                      onClick={() => openAgingDrawer(bucket)}
                      style={{ width: `${pct}%` }}
                      className={`${color} h-full border-r border-[#0A0B0E] last:border-r-0 transition-all duration-200 cursor-pointer`}
                      title={`${bucket.rangeLabel}: ${pct}% (${formatCurrency(bucket.amountMinorUnits)}) — Click for details`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] font-sans">
                {cfoData.agingBuckets.map((bucket, idx) => (
                  <button
                    key={bucket.rangeKey}
                    onClick={() => openAgingDrawer(bucket)}
                    className="flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer group"
                    title={`View schedule for ${bucket.rangeLabel}`}
                  >
                    <span className={`w-2 h-2 rounded-full transition-transform group-hover:scale-125 ${
                      idx === 0 ? "bg-emerald-500" :
                      idx === 1 ? "bg-emerald-400/70" :
                      idx === 2 ? "bg-amber-400" :
                      idx === 3 ? "bg-orange-500" :
                      "bg-[#FF3B30]"
                    }`} />
                    <span className="group-hover:underline">{bucket.rangeLabel}</span>
                    <span className="font-mono-num tabular-nums text-neutral-300 font-medium">
                      ({bucket.percentageOfTotal}% • {formatCurrency(bucket.amountMinorUnits)})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* C. CASH PRESSURE MAP - ORDER-TO-CASH PIPELINE */}
        <div className="space-y-4">
          <SectionHeader
            title="Order-to-Cash Pressure Map"
            subtitle="Where financial exposure is accumulating across each stage of the receivables lifecycle"
            editorial
            signal={false}
          />

          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 text-xs">
            {/* 1. ORDER */}
            <div
              onClick={() => openStageDrawer({
                num: '01',
                name: 'Order Intake',
                amount: 0,
                description: 'Valid purchase order acquisition and commercial credit agreement. No active order validation blockers recorded.',
                countLabel: '0 open order blockers',
                actionHref: '/receivables',
              })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStageDrawer({ num: '01', name: 'Order Intake', amount: 0, description: 'Valid purchase order acquisition and commercial credit agreement.', countLabel: '0 open order blockers', actionHref: '/receivables' }); } }}
              tabIndex={0}
              className="workstation-card p-4 rounded-xl border border-white/[0.08] hover:border-white/30 transition-all duration-150 space-y-2 flex flex-col justify-between cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300 font-semibold group-hover:text-white transition-colors font-sans">Order</span>
                  <span className="text-[10px] text-neutral-400 font-mono-num tabular-nums">01</span>
                </div>
                <div className="text-base font-bold text-white font-mono-num tabular-nums mt-1">₹0</div>
              </div>
              <div className="text-[11px] text-neutral-400 font-sans flex items-center justify-between">
                <span>0 open orders</span>
                <span className="text-[#FF3B30] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>

            {/* 2. FULFILLMENT */}
            <div
              onClick={() => openStageDrawer({
                num: '02',
                name: 'Fulfillment & POD',
                amount: cfoData?.categoryBreakdown?.find(c => c.category === 'MISSING_DOCUMENT')?.amountMinorUnits || 0,
                description: 'Consignment delivery receipts and proof-of-delivery (POD) tracking. Missing POD documents delay customer acceptance.',
                countLabel: `${cfoData?.categoryBreakdown?.find(c => c.category === 'MISSING_DOCUMENT')?.exceptionCount || 0} POD document(s) missing`,
                actionHref: '/exceptions',
              })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStageDrawer({ num: '02', name: 'Fulfillment & POD', amount: cfoData?.categoryBreakdown?.find(c => c.category === 'MISSING_DOCUMENT')?.amountMinorUnits || 0, description: 'Consignment delivery receipts and proof-of-delivery (POD) tracking.', countLabel: `${cfoData?.categoryBreakdown?.find(c => c.category === 'MISSING_DOCUMENT')?.exceptionCount || 0} POD document(s) missing`, actionHref: '/exceptions' }); } }}
              tabIndex={0}
              className="workstation-card p-4 rounded-xl border border-white/[0.08] hover:border-white/30 transition-all duration-150 space-y-2 flex flex-col justify-between cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300 font-semibold group-hover:text-white transition-colors font-sans">Fulfillment</span>
                  <span className="text-[10px] text-neutral-400 font-mono-num tabular-nums">02</span>
                </div>
                <div className="text-base font-bold text-white font-mono-num tabular-nums mt-1">
                  {formatCurrency(cfoData?.categoryBreakdown?.find(c => c.category === 'MISSING_DOCUMENT')?.amountMinorUnits || 0)}
                </div>
              </div>
              <div className="text-[11px] text-amber-400 font-sans font-medium flex items-center justify-between">
                <span>{cfoData?.categoryBreakdown?.find(c => c.category === 'MISSING_DOCUMENT')?.exceptionCount || 0} POD missing</span>
                <span className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>

            {/* 3. INVOICING / PO */}
            <div
              onClick={() => openStageDrawer({
                num: '03',
                name: 'Invoicing & PO Matching',
                amount: cfoData?.categoryBreakdown?.find(c => c.category === 'PO_MISMATCH')?.amountMinorUnits || 0,
                description: 'Three-way matching between Purchase Order, Bill of Lading, and Invoice line items. Price or quantity discrepancies trap cash at invoicing.',
                countLabel: `${cfoData?.categoryBreakdown?.find(c => c.category === 'PO_MISMATCH')?.exceptionCount || 0} PO mismatch exceptions trapped`,
                actionHref: '/exceptions',
                isBottleneck: true,
              })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStageDrawer({ num: '03', name: 'Invoicing & PO Matching', amount: cfoData?.categoryBreakdown?.find(c => c.category === 'PO_MISMATCH')?.amountMinorUnits || 0, description: 'Three-way matching between Purchase Order, Bill of Lading, and Invoice line items.', countLabel: `${cfoData?.categoryBreakdown?.find(c => c.category === 'PO_MISMATCH')?.exceptionCount || 0} PO mismatch exceptions trapped`, actionHref: '/exceptions', isBottleneck: true }); } }}
              tabIndex={0}
              className="workstation-card p-4 rounded-xl border border-[#FF3B30]/60 bg-[#FF3B30]/[0.04] hover:border-[#FF3B30]/90 transition-all duration-150 space-y-2 flex flex-col justify-between cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30] hover:-translate-y-0.5 shadow-md shadow-[#FF3B30]/10"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#FF3B30] font-semibold font-sans">Invoicing (PO)</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30] animate-pulse" />
                    <span className="text-[10px] text-[#FF3B30] font-mono-num tabular-nums font-bold">03</span>
                  </div>
                </div>
                <div className="text-base font-bold text-white font-mono-num tabular-nums mt-1">
                  {formatCurrency(cfoData?.categoryBreakdown?.find(c => c.category === 'PO_MISMATCH')?.amountMinorUnits || 0)}
                </div>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-mono uppercase bg-[#FF3B30]/20 text-[#FF3B30] border border-[#FF3B30]/30 px-1.5 py-0.2 rounded font-bold inline-block">
                  Primary Bottleneck
                </span>
                <div className="text-[11px] text-[#FF3B30] font-sans font-semibold flex items-center justify-between">
                  <span>{cfoData?.categoryBreakdown?.find(c => c.category === 'PO_MISMATCH')?.exceptionCount || 0} PO mismatches</span>
                  <span>→</span>
                </div>
              </div>
            </div>

            {/* 4. DISPUTE */}
            <div
              onClick={() => openStageDrawer({
                num: '04',
                name: 'Dispute Resolution',
                amount: cfoData?.categoryBreakdown?.find(c => c.category === 'CUSTOMER_DISPUTE')?.amountMinorUnits || 0,
                description: 'Commercial disputes, freight claims, and debit note claims raised by customer AP teams awaiting credit note issuance.',
                countLabel: `${cfoData?.categoryBreakdown?.find(c => c.category === 'CUSTOMER_DISPUTE')?.exceptionCount || 0} active commercial dispute(s)`,
                actionHref: '/exceptions',
              })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStageDrawer({ num: '04', name: 'Dispute Resolution', amount: cfoData?.categoryBreakdown?.find(c => c.category === 'CUSTOMER_DISPUTE')?.amountMinorUnits || 0, description: 'Commercial disputes, freight claims, and debit note claims.', countLabel: `${cfoData?.categoryBreakdown?.find(c => c.category === 'CUSTOMER_DISPUTE')?.exceptionCount || 0} active commercial dispute(s)`, actionHref: '/exceptions' }); } }}
              tabIndex={0}
              className="workstation-card p-4 rounded-xl border border-white/[0.08] hover:border-white/30 transition-all duration-150 space-y-2 flex flex-col justify-between cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300 font-semibold group-hover:text-white transition-colors font-sans">Dispute</span>
                  <span className="text-[10px] text-neutral-400 font-mono-num tabular-nums">04</span>
                </div>
                <div className="text-base font-bold text-white font-mono-num tabular-nums mt-1">
                  {formatCurrency(cfoData?.categoryBreakdown?.find(c => c.category === 'CUSTOMER_DISPUTE')?.amountMinorUnits || 0)}
                </div>
              </div>
              <div className="text-[11px] text-amber-400 font-sans font-medium flex items-center justify-between">
                <span>{cfoData?.categoryBreakdown?.find(c => c.category === 'CUSTOMER_DISPUTE')?.exceptionCount || 0} disputes</span>
                <span className="text-amber-400 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>

            {/* 5. COLLECTION */}
            <div
              onClick={() => openStageDrawer({
                num: '05',
                name: 'Collections & Dunning',
                amount: overdueAmount,
                description: 'Autonomous payment follow-up cadences, escalation workflows, and finance controller reminders across open receivables.',
                countLabel: `${invoices.filter(i => i.status === 'open').length} open invoices tracked`,
                actionHref: '/collections',
              })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStageDrawer({ num: '05', name: 'Collections & Dunning', amount: overdueAmount, description: 'Autonomous payment follow-up cadences.', countLabel: `${invoices.filter(i => i.status === 'open').length} open invoices tracked`, actionHref: '/collections' }); } }}
              tabIndex={0}
              className="workstation-card p-4 rounded-xl border border-white/[0.08] hover:border-white/30 transition-all duration-150 space-y-2 flex flex-col justify-between cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300 font-semibold group-hover:text-white transition-colors font-sans">Collections</span>
                  <span className="text-[10px] text-neutral-400 font-mono-num tabular-nums">05</span>
                </div>
                <div className="text-base font-bold text-white font-mono-num tabular-nums mt-1">
                  {formatCurrency(overdueAmount)}
                </div>
              </div>
              <div className="text-[11px] text-neutral-400 font-sans flex items-center justify-between">
                <span>{invoices.filter(i => i.status === 'open').length} open invoices</span>
                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>

            {/* 6. PAYMENT */}
            <div
              onClick={() => openStageDrawer({
                num: '06',
                name: 'Payment Settlement',
                amount: cfoData?.categoryBreakdown?.find(c => c.category === 'PAYMENT_PROMISED')?.amountMinorUnits || 0,
                description: 'Customer payment commitments, scheduled ACH remittances, and banking confirmations tracked by AI collectors.',
                countLabel: `${cfoData?.categoryBreakdown?.find(c => c.category === 'PAYMENT_PROMISED')?.exceptionCount || 0} payment promises kept`,
                actionHref: '/payments',
              })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStageDrawer({ num: '06', name: 'Payment Settlement', amount: cfoData?.categoryBreakdown?.find(c => c.category === 'PAYMENT_PROMISED')?.amountMinorUnits || 0, description: 'Customer payment commitments and banking confirmations.', countLabel: `${cfoData?.categoryBreakdown?.find(c => c.category === 'PAYMENT_PROMISED')?.exceptionCount || 0} payment promises kept`, actionHref: '/payments' }); } }}
              tabIndex={0}
              className="workstation-card p-4 rounded-xl border border-white/[0.08] hover:border-white/30 transition-all duration-150 space-y-2 flex flex-col justify-between cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300 font-semibold group-hover:text-white transition-colors font-sans">Payment</span>
                  <span className="text-[10px] text-neutral-400 font-mono-num tabular-nums">06</span>
                </div>
                <div className="text-base font-bold text-white font-mono-num tabular-nums mt-1">
                  {formatCurrency(cfoData?.categoryBreakdown?.find(c => c.category === 'PAYMENT_PROMISED')?.amountMinorUnits || 0)}
                </div>
              </div>
              <div className="text-[11px] text-emerald-400 font-sans font-medium flex items-center justify-between">
                <span>{cfoData?.categoryBreakdown?.find(c => c.category === 'PAYMENT_PROMISED')?.exceptionCount || 0} promises kept</span>
                <span className="text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>

            {/* 7. RECONCILIATION */}
            <div
              onClick={() => openStageDrawer({
                num: '07',
                name: 'Cash Reconciliation',
                amount: cfoData?.unreconciledCashMinorUnits || 0,
                description: 'Automated 2-way and 3-way matching of bank statement entries with open ERP invoice ledger records.',
                countLabel: `${cfoData?.unreconciledCashSummary?.unmatchedPaymentCount || 0} pending remittance matches`,
                actionHref: '/payments',
              })}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStageDrawer({ num: '07', name: 'Cash Reconciliation', amount: cfoData?.unreconciledCashMinorUnits || 0, description: 'Automated 2-way and 3-way matching of bank statement entries.', countLabel: `${cfoData?.unreconciledCashSummary?.unmatchedPaymentCount || 0} pending remittance matches`, actionHref: '/payments' }); } }}
              tabIndex={0}
              className="workstation-card p-4 rounded-xl border border-white/[0.08] hover:border-white/30 transition-all duration-150 space-y-2 flex flex-col justify-between cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-300 font-semibold group-hover:text-white transition-colors font-sans">Reconcile</span>
                  <span className="text-[10px] text-neutral-400 font-mono-num tabular-nums">07</span>
                </div>
                <div className="text-base font-bold text-white font-mono-num tabular-nums mt-1">
                  {formatCurrency(cfoData?.unreconciledCashMinorUnits || 0)}
                </div>
              </div>
              <div className="text-[11px] text-neutral-400 font-sans flex items-center justify-between">
                <span>{cfoData?.unreconciledCashSummary?.unmatchedPaymentCount || 0} pending matches</span>
                <span className="text-white opacity-0 group-hover:opacity-100 transition-opacity">→</span>
              </div>
            </div>
          </div>
        </div>

        {/* CONDITIONALLY RENDERED VIEW MODES */}
        {viewMode === "WATERFALL" && (
          <div className="workstation-card p-6 space-y-6 rounded-xl border border-white/[0.08]">
            <SectionHeader
              title="Cash Flow Waterfall & DSO Bridge"
              subtitle="Step-by-step reduction from Gross Receivables to Realizable Recovery Capacity"
              editorial
              signal={false}
            />

            <div className="space-y-3 font-sans text-xs">
              <div className="flex items-center justify-between p-4 bg-[#181B23] border border-white/[0.08] rounded-xl">
                <div className="space-y-1">
                  <div className="font-semibold text-white text-sm">Total Gross Receivables</div>
                  <div className="text-neutral-400 text-xs">Total ledger balance across all active customer accounts</div>
                </div>
                <div className="text-lg font-bold font-mono-num tabular-nums text-white">
                  {formatCurrency(totalReceivables)}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-xl ml-3">
                <div className="space-y-1">
                  <div className="font-semibold text-[#FF3B30] text-sm">[-] Overdue Contractual Breaches</div>
                  <div className="text-neutral-300 text-xs">Invoices exceeding contracted payment terms</div>
                </div>
                <div className="text-lg font-bold font-mono-num tabular-nums text-[#FF3B30]">
                  - {formatCurrency(overdueAmount)}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl ml-6">
                <div className="space-y-1">
                  <div className="font-semibold text-amber-400 text-sm">[-] Actionable Agent Blockers</div>
                  <div className="text-neutral-300 text-xs">Trapped cash pending PO reconciliation or dispute resolution</div>
                </div>
                <div className="text-lg font-bold font-mono-num tabular-nums text-amber-400">
                  - {formatCurrency(actionableCash)}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl ml-9 shadow-lg">
                <div className="space-y-1">
                  <div className="font-semibold text-emerald-400 text-sm">[=] Realizable Recovery Capacity</div>
                  <div className="text-neutral-300 text-xs">Recoverable working capital upon executing priority unblock actions</div>
                </div>
                <div className="text-xl font-bold font-mono-num tabular-nums text-emerald-400">
                  {formatCurrency(totalReceivables - actionableCash)}
                </div>
              </div>
            </div>

            <div className="p-4 bg-[#181B23] border border-white/[0.08] rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-sans">
              <div className="space-y-0.5 text-center sm:text-left">
                <span className="text-white font-semibold">Simulate Cash Acceleration</span>
                <p className="text-neutral-400 text-[11px]">Model policy adjustments, early settlement discounts, and dispute unblock velocity.</p>
              </div>
              <Link
                href="/cash-unblock"
                className="btn-editorial-primary px-4 py-2 rounded-lg text-xs font-semibold text-white inline-flex items-center gap-1.5 shrink-0 shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Launch Cash Unblock Engine</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {viewMode === "MATRIX" && (
          <div className="workstation-card p-6 space-y-6 rounded-xl border border-white/[0.08]">
            <SectionHeader
              title="Executive Action Focus Matrix"
              subtitle="Filterable portfolio of cash blockers by category severity"
              editorial
              signal={false}
            />

            <div className="flex flex-wrap gap-2 pb-2">
              <button
              onClick={() => setActiveCategoryFilter(undefined)}
              className="px-3 py-1.5 font-sans text-xs font-semibold rounded-lg border transition cursor-pointer"
            >
              All Categories ({topActions.length})
            </button>
              {blockerCategories.map((c) => (
                <button
                  key={c.category}
                  onClick={() => setActiveCategoryFilter(c.category === activeCategoryFilter ? undefined : c.category)}>                  className={`px-3 py-1.5 font-sans text-xs font-semibold rounded-lg border transition cursor-pointer ${
                    activeCategoryFilter === c.category
                      ? "btn-editorial-primary text-white"
                      : "bg-[#181B23] text-neutral-300 border-white/[0.08] hover:text-white"
                  }`}
                {c.title} ({c.exceptionCount})
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {filteredActions.length > 0 ? (
                filteredActions.map((act, index) => (
                  <PriorityRow
                    key={act.exceptionId}
                    rankNumber={`P${index + 1}`}
                    title={act.customerName}
                    subtitle={`Invoice ${act.invoiceNumber} • ${act.categoryTitle}`}
                    amount={formatCurrency(act.outstandingAmountMinorUnits)}
                    blockerCategory={act.categoryTitle}
                    recommendedAction={act.recommendedAction}
                    actionUrl={`/invoices/${act.invoiceId}`}
                    isCritical={index === 0}
                    confidenceScore={act.confidenceScore}
                  />
                ))
              ) : (
                <div className="p-8 workstation-card border border-white/[0.08] text-center space-y-2 rounded-xl text-xs font-sans">
                  <div className="text-white font-semibold">No Actions in this Category</div>
                  <p className="text-neutral-400">Select another filter or reset to All Categories.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* D & E. WHY IS CASH STUCK & TODAY'S PRIORITIES (DEFAULT TERMINAL MATRIX MODE) */}
        {viewMode === "TERMINAL" && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
            
            {/* D. WHY IS CASH STUCK? (5 COLS) */}
            <div className="xl:col-span-5 space-y-4">
              <SectionHeader
                title="Why is Cash Stuck?"
                subtitle="Financial exposure grouped by root cause category"
                editorial
                signal={true}
                action={
                  <Link href="/exceptions" className="text-xs text-[#FF3B30] font-sans hover:underline flex items-center gap-1.5 font-semibold">
                    <span>Exception Room</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                }
              />

              <div className="space-y-3 text-xs">
                {blockerCategories.length > 0 ? (
                  blockerCategories.map((cat, idx) => {
                    const percentage = Math.min(Math.max(cat.percentageOfActionableTotal, 5), 100);
                    const isSelected = activeCategoryFilter === cat.category;
                    return (
                      <div
                        key={cat.category}
                        onClick={() => {
                          setSelectedDrawerItem({
                            title: cat.title,
                            subtitle: `${cat.exceptionCount} line items trapped • Action required in ERP`,
                            content: (
                              <div className="space-y-4 text-xs font-sans">
                                <div className="p-4 bg-[#181B23] border border-white/[0.08] rounded-xl space-y-2">
                                  <div className="text-[11px] text-neutral-400 uppercase font-semibold">Affected Exposure</div>
                                  <div className="text-2xl font-bold font-mono-num tabular-nums text-[#FF3B30]">{formatCurrency(cat.amountMinorUnits)}</div>
                                  <p className="text-neutral-300 text-xs pt-1">
                                    Represents {cat.percentageOfActionableTotal}% of total actionable cash currently delayed past payment terms.
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <span className="text-[11px] text-neutral-400 uppercase font-semibold">Causal Path to Root Cause</span>
                                  <div className="p-3.5 bg-[#181B23]/60 border border-white/[0.08] rounded-xl space-y-2 font-sans">
                                    <div className="flex items-center justify-between text-xs">
                                      <span className="font-semibold text-white">{cat.title}</span>
                                      <span className="text-[#FF3B30] font-semibold">{cat.exceptionCount} cases</span>
                                    </div>
                                    <div className="text-xs text-neutral-400">
                                      Actionable line item discrepancy trapped in ERP workflow.
                                    </div>
                                  </div>
                                </div>

                                <Link
                                  href="/causal-graph"
                                  className="w-full py-2.5 btn-editorial-primary text-white font-semibold text-center block rounded-xl"
                                >
                                  View Causal Path →
                                </Link>
                              </div>
                            ),
                          });
                        }}
                        className={`workstation-card p-4 rounded-xl border ${
                          isSelected ? 'border-[#FF3B30]' : 'border-white/[0.08]'
                        } transition-all cursor-pointer space-y-3 group relative overflow-hidden`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-semibold text-[#FF3B30] bg-[#FF3B30]/10 px-2 py-0.5 rounded border border-[#FF3B30]/20 font-mono">#{idx + 1}</span>
                              <span className="p-1 rounded bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                                {getCategoryIcon(cat.category)}
                              </span>
                              <span className="font-semibold text-white text-sm group-hover:text-[#FF3B30] transition-colors">{cat.title}</span>
                            </div>
                            <p className="text-neutral-400 text-xs font-sans">
                              {cat.exceptionCount} line items trapped • Action required in ERP
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-base font-bold text-white font-mono-num tabular-nums">
                              {formatCurrency(cat.amountMinorUnits)}
                            </div>
                            <span className="text-xs text-[#FF3B30] group-hover:underline flex items-center justify-end gap-1 font-semibold pt-0.5">
                              <span>Inspect</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </div>

                        {/* Financial Concentration Bar */}
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px] text-neutral-400 font-sans">
                            <span>Share of Actionable Cash</span>
                            <span className="font-mono-num tabular-nums font-semibold text-neutral-200">{cat.percentageOfActionableTotal}%</span>
                          </div>
                          <div className="h-1.5 bg-white/[0.04] w-full overflow-hidden border border-white/[0.06] rounded-full">
                            <div
                              className="h-full bg-gradient-to-r from-[#FF3B30]/80 to-[#FF3B30] rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 workstation-card border border-white/[0.08] text-center space-y-3 rounded-xl font-sans text-xs">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-white font-semibold text-sm">No Trapped Cash Blockers</div>
                      <p className="text-neutral-400 max-w-sm mx-auto leading-relaxed">
                        All active invoices are operating within standard credit terms. Import or sync ledger data to track priority unblock actions.
                      </p>
                    </div>
                    <div className="pt-1.5">
                      <Link
                        href="/onboarding"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181B23] border border-white/[0.12] hover:border-[#FF3B30]/40 text-neutral-300 hover:text-white transition-all text-xs font-medium cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5 text-[#FF3B30]" />
                        <span>Upload Ledger File</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* E. TODAY'S PRIORITIES (7 COLS) */}
            <div className="xl:col-span-7 space-y-4">
              <SectionHeader
                title="Today's Priorities"
                subtitle="The highest-value actions requiring immediate finance attention"
                editorial
                signal={true}
                action={
                  <Link href="/cash-unblock" className="text-xs text-[#FF3B30] font-sans hover:underline flex items-center gap-1.5 font-semibold">
                    <span>Open Cash Unblock →</span>
                  </Link>
                }
              />

              <div className="space-y-3">
                {topActions.length > 0 ? (
                  topActions.map((act, index) => (
                    <PriorityRow
                      key={act.exceptionId}
                      rankNumber={`P${index + 1}`}
                      title={act.customerName}
                      subtitle={`Invoice ${act.invoiceNumber} • ${act.categoryTitle}`}
                      amount={formatCurrency(act.outstandingAmountMinorUnits)}
                      blockerCategory={act.categoryTitle}
                      recommendedAction={act.recommendedAction}
                      actionUrl={`/invoices/${act.invoiceId}`}
                      isCritical={index === 0}
                      confidenceScore={act.confidenceScore}
                    />
                  ))
                ) : (
                  <div className="p-8 workstation-card border border-white/[0.08] text-center space-y-3 rounded-xl font-sans text-xs">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center mx-auto">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-white font-semibold text-sm">No Operational Blockers Detected</div>
                      <p className="text-neutral-400 max-w-md mx-auto leading-relaxed">
                        All active receivables are within agreed terms. Connect your ERP integration or import ledger files to stream exception intelligence.
                      </p>
                    </div>
                    <div className="pt-1.5">
                      <Link
                        href="/settings/integrations"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#181B23] border border-white/[0.12] hover:border-[#FF3B30]/40 text-neutral-300 hover:text-white transition-all text-xs font-medium cursor-pointer"
                      >
                        <Activity className="w-3.5 h-3.5 text-[#FF3B30]" />
                        <span>Configure ERP Sync</span>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* F. CUSTOMER EXPOSURE */}
        <div className="space-y-4">
          <SectionHeader
            title="Customer Exposure"
            subtitle="Largest receivables concentrations mapped to operational blocker status"
            editorial
            signal={false}
            action={
              <Link href="/customers" className="text-xs text-[#FF3B30] font-sans hover:underline flex items-center gap-1.5 font-semibold">
                <span>View All Customers Directory</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            }
          />

          <div className="workstation-card border border-white/[0.08] overflow-x-auto shadow-xl rounded-xl">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#181B23] text-neutral-300 font-sans text-xs border-b border-white/[0.08]">
                <tr>
                  <th className="py-3 px-4 font-semibold text-neutral-300">Customer Account</th>
                  <th className="py-3 px-4 text-right font-semibold text-neutral-300">Ledger Exposure</th>
                  <th className="py-3 px-4 text-right font-semibold text-neutral-300">Overdue (&gt;30D)</th>
                  <th className="py-3 px-4 text-center font-semibold text-neutral-300">DSO Velocity</th>
                  <th className="py-3 px-4 font-semibold text-neutral-300">Blocker Synthesis</th>
                  <th className="py-3 px-4 text-center font-semibold text-neutral-300">Audit Status</th>
                  <th className="py-3 px-4 text-right font-semibold text-neutral-300">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-sans">
                {cfoData?.topCustomerExposures && cfoData.topCustomerExposures.length > 0 ? (
                  cfoData.topCustomerExposures.map((cust) => (
                    <tr
                      key={cust.customerId}
                      onClick={() => router.push(`/customers/${cust.customerId}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          router.push(`/customers/${cust.customerId}`);
                        }
                      }}
                      className="hover:bg-white/[0.03] transition-colors duration-150 ease-in-out cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]/50 focus-visible:bg-white/[0.04]"
                      tabIndex={0}
                    >
                      <td className="py-4 px-4 font-semibold text-white flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${cust.riskBand === 'high' ? 'bg-[#FF3B30]' : cust.riskBand === 'medium' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        <span className="group-hover:text-[#FF3B30] transition-colors">{cust.customerName}</span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="font-mono-num tabular-nums text-white font-semibold">
                          {formatCurrency(cust.outstandingMinorUnits)}
                        </div>
                        {cust.percentageOfTotalReceivables > 0 && (
                          <div className="text-[10px] text-neutral-400 font-mono-num tabular-nums mt-0.5">
                            {cust.percentageOfTotalReceivables}% of AR
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-right font-mono-num tabular-nums text-[#FF3B30] font-semibold">
                        {formatCurrency(cust.overdueMinorUnits)}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded font-mono-num tabular-nums text-xs font-semibold ${
                          (cust.dsoDays || 30) > 45 ? "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/30" :
                          (cust.dsoDays || 30) > 30 ? "bg-amber-400/10 text-amber-400 border border-amber-400/30" :
                          "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30"
                        }`}>
                          {cust.dsoDays || 30}d DSO
                        </span>
                      </td>
                      <td className="py-4 px-4 text-neutral-300">
                        {cust.openExceptionCount > 0 ? `${cust.openExceptionCount} active O2C blocker(s)` : 'Normal billing cycle'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <StatusIndicator status={cust.riskBand === 'high' ? 'ACTIONABLE' : cust.riskBand === 'medium' ? 'INVESTIGATING' : 'VERIFIED'} />
                      </td>
                      <td className="py-4 px-4 text-right text-[#FF3B30] font-semibold group-hover:underline">
                        Inspect →
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-neutral-400 font-sans">
                      <div className="space-y-1.5 max-w-sm mx-auto">
                        <div className="text-white font-semibold text-xs">No Customer Concentrations Recorded</div>
                        <p className="text-xs text-neutral-400">Import your ledger or sync your ERP to view exposure intelligence and risk profiles.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* G. AIOSPARK INTELLIGENCE */}
        <IntelligencePanel
          title="AIOSpark Intelligence • Cash Synthesis Engine"
          whatChanged={topActions.length > 0 ? `Primary cash blocker today is ${topActions[0].categoryTitle} on ${topActions[0].invoiceNumber}.` : "Active ledger intelligence synchronized."}
          whyItMatters={formatCurrency(actionableCash) + " in actionable cash is currently delayed past contracted payment terms."}
          evidence={topActions.length > 0 ? [
            `Top Blocker: ${topActions[0].categoryTitle} (${topActions[0].customerName})`,
            `Invoice: ${topActions[0].invoiceNumber}`,
            `Actionable Amount: ${formatCurrency(topActions[0].outstandingAmountMinorUnits)}`,
          ] : [
            "No open operational blockers detected across active ledger.",
          ]}
          recommendedAction={topActions.length > 0 ? topActions[0].recommendedAction : "Maintain standard credit monitoring"}
          financialImpact={formatCurrency(actionableCash)}
          confidence={0.94}
          actionUrl="/exceptions"
        />

        {/* H. MANAGEMENT ATTENTION */}
        <div className="space-y-4">
          <SectionHeader
            title="Management Attention"
            subtitle="High-stakes financial decisions requiring controller & leadership involvement"
            editorial
            signal={false}
          />

          <div className="dashboard-management-panel p-5 workstation-card border border-white/[0.08] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans bg-gradient-to-r from-[#181B23] via-[#15171E] to-[#12141A]">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                <span className="w-2 h-2 rounded-full bg-[#FF3B30] animate-pulse" />
                <span className="text-white font-semibold text-sm">
                  Actionable Working Capital Exposure: {formatCurrency(actionableCash)}
                </span>
                <span className="text-[10px] font-mono uppercase bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/30 px-2 py-0.5 rounded font-semibold">
                  Threshold: &gt;₹5,00,000
                </span>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-2xl">
                {actionableCash > 0
                  ? "Unresolved PO mismatches, pricing discrepancies, and rate disputes exceeding controller review threshold."
                  : "No high-value operational blockers or commercial disputes requiring management escalation."}
              </p>
            </div>

            <Link
              href="/approvals"
              className="btn-editorial-primary px-4 py-2.5 text-xs font-semibold font-sans transition flex items-center justify-center gap-1.5 shrink-0 rounded-xl shadow-md hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Review Management Cases →</span>
            </Link>
          </div>
        </div>

        {/* I. RECENT FINANCIAL ACTIVITY */}
        <div className="space-y-4">
          <SectionHeader
            title="Recent Financial Activity"
            subtitle="Audit-tracked operational event stream across O2C agents and finance team"
            editorial
            signal={false}
            action={
              <Link href="/approvals" className="text-xs text-[#FF3B30] font-sans hover:underline flex items-center gap-1.5 font-semibold">
                <span>Full Audit Log</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            }
          />

          <div className="workstation-card border border-white/[0.08] p-5 rounded-xl">
            <Timeline events={timelineEvents} />
          </div>
        </div>

      </div>

      {/* Reusable Contextual Detail Drawer */}
      {selectedDrawerItem && (
        <DetailDrawer
          isOpen={Boolean(selectedDrawerItem)}
          onClose={() => setSelectedDrawerItem(null)}
          title={selectedDrawerItem.title}
          subtitle={selectedDrawerItem.subtitle}
        >
          {selectedDrawerItem.content}
        </DetailDrawer>
      )}

      {/* Command Palette (⌘K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />

      {/* Teammate Invite Modal */}
      <TeammateInviteModal
        isOpen={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onSuccess={() => fetchSessionAndData()}
      />
    </MainNavShell>
  );
}
