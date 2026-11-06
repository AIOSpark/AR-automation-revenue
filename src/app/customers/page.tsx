"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  Search,
  ArrowRight,
  ChevronRight,
  Upload,
  RotateCw,
  ArrowUpDown,
  ShieldCheck,
  AlertOctagon,
  Clock,
  ArrowLeft,
  ExternalLink,
  FileText,
  DollarSign,
  TrendingUp,
  X,
} from "lucide-react";
import { MainNavShell } from "@/components/MainNavShell";
import { FinancialBand } from "@/components/system/FinancialBand";
import { SectionHeader } from "@/components/system/SectionHeader";
import { StatusIndicator } from "@/components/system/StatusIndicator";
import { DetailDrawer } from "@/components/system/DetailDrawer";

interface CustomerRecord {
  id: string;
  sourceId: string;
  name: string;
  industry: string;
  creditLimitMinorUnits: number;
  paymentTermsDays: number;
  currency: string;
  totalOutstandingMinorUnits: number;
  totalOverdueMinorUnits: number;
  atRiskMinorUnits: number;
  invoiceCount: number;
  openInvoiceCount: number;
  openExceptionCount: number;
  dsoDays: number;
  riskScore: number;
  riskBand: "high" | "medium" | "low";
  percentageOfTotalReceivables: number;
  createdAt: string;
}

interface PortfolioSummary {
  totalCustomers: number;
  totalOutstandingExposureMinorUnits: number;
  totalOverdueExposureMinorUnits: number;
  highRiskCount: number;
  avgDsoDays: number;
}

export default function CustomersDirectoryPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>({
    totalCustomers: 0,
    totalOutstandingExposureMinorUnits: 0,
    totalOverdueExposureMinorUnits: 0,
    highRiskCount: 0,
    avgDsoDays: 30,
  });

  // Search, Filters & Sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string | undefined>(undefined);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"outstanding" | "overdue" | "dso" | "name" | "risk">("outstanding");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Contextual Preview Drawer
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRecord | null>(null);
  const [role, setRole] = useState<string | undefined>(undefined);

  const fetchCustomers = useCallback(async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);
      if (riskFilter) params.set("risk", riskFilter);
      if (overdueOnly) params.set("hasOverdue", "true");
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);

      const res = await fetch(`/api/customers?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
        if (data.summary) {
          setSummary(data.summary);
        }
      }

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? undefined);
      }
    } catch (err) {
      console.error("Failed to fetch customer directory:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, riskFilter, overdueOnly, sortBy, sortOrder]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers();
    }, 150);
    return () => clearTimeout(timer);
  }, [fetchCustomers]);

  const handleSort = (field: "outstanding" | "overdue" | "dso" | "name" | "risk") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const formatCurrency = (amountInMinorUnits: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amountInMinorUnits / 100);
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="customers-page space-y-8 font-sans pb-16">
        
        {/* A. COMMAND HEADER */}
        <div className="customers-header flex flex-col xl:flex-row xl:items-center justify-between gap-6 workstation-card p-6 md:p-8 rounded-xl border border-white/[0.08] shadow-2xl relative overflow-hidden bg-gradient-to-br from-[#14161E] via-[#12141A] to-[#0D0E12]">
          <div className="space-y-3 z-10">
            {/* Telemetry Strip */}
            <div className="flex items-center space-x-3 text-xs text-neutral-400 font-sans flex-wrap gap-y-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-neutral-400 hover:text-white transition-colors group text-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#FF3B30] group-hover:-translate-x-0.5 transition-transform" />
                <span>Command Center</span>
              </Link>
              <span className="text-neutral-500">•</span>
              <span className="text-[#FF3B30] font-semibold text-[11px] tracking-wide uppercase bg-[#FF3B30]/10 px-2.5 py-0.5 rounded border border-[#FF3B30]/20 font-mono">
                Customer 360 Intelligence
              </span>
              <span className="text-neutral-500">•</span>
              <span className="text-neutral-400 text-[11px] font-mono-num tabular-nums">
                {summary.totalCustomers} Accounts Monitored
              </span>
              <button
                onClick={() => fetchCustomers(true)}
                disabled={refreshing}
                className="p-1 text-neutral-400 hover:text-white transition rounded hover:bg-white/[0.06] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]"
                title="Refresh customer telemetry"
                aria-label="Refresh customer telemetry"
              >
                <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#FF3B30]" : ""}`} />
              </button>
            </div>

            <div className="space-y-1.5">
              <h1 className="text-2xl sm:text-4xl font-bold font-sans tracking-tight text-white">
                Customer Exposure Directory
              </h1>
              <p className="font-serif-editorial text-[#FF3B30] font-normal italic text-lg sm:text-2xl">
                Account risk scoring, payment velocity, and concentration telemetry.
              </p>
              <p className="text-xs sm:text-sm text-neutral-400 font-sans max-w-2xl leading-relaxed">
                Granular debtor risk synthesis, days-sales-outstanding tracking, and automated exception links across all buyer ledgers.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 z-10 self-start xl:self-center">
            <Link
              href="/onboarding"
              className="btn-editorial-primary px-3.5 py-2 text-xs font-semibold font-sans rounded-lg flex items-center gap-2 cursor-pointer shadow-md hover:scale-[1.02] active:scale-[0.98] transition-transform"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Ledger Data</span>
            </Link>

            <Link
              href="/cash-unblock"
              className="px-3 py-2 bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white font-sans text-xs font-medium rounded-lg flex items-center gap-2 cursor-pointer transition-all"
            >
              <TrendingUp className="w-3.5 h-3.5 text-[#FF3B30]" />
              <span>Unblock Simulation</span>
            </Link>
          </div>
        </div>

        {/* B. FINANCIAL EXPOSURE METRICS */}
        <FinancialBand
          heroMetric={{
            label: "Total Customer Exposure",
            value: formatCurrency(summary.totalOutstandingExposureMinorUnits),
            sublabel: `Gross outstanding receivables across ${summary.totalCustomers} customer account(s).`,
            signal: summary.totalOutstandingExposureMinorUnits > 0,
          }}
          metrics={[
            {
              label: "Overdue Capital",
              value: formatCurrency(summary.totalOverdueExposureMinorUnits),
              sublabel: "Past contracted terms",
              highlightColor: summary.totalOverdueExposureMinorUnits > 0 ? "red" : "default",
            },
            {
              label: "High-Risk Concentration",
              value: `${summary.highRiskCount} Accounts`,
              sublabel: "Escalated risk scoring",
              highlightColor: summary.highRiskCount > 0 ? "amber" : "emerald",
            },
            {
              label: "Average DSO",
              value: `${summary.avgDsoDays} Days`,
              sublabel: "Target baseline: 30 days",
              highlightColor: summary.avgDsoDays > 45 ? "red" : summary.avgDsoDays > 30 ? "amber" : "emerald",
            },
          ]}
        />

        {/* C. CONTROLS, SEARCH & FILTER TOOLBAR */}
        <div className="customers-toolbar workstation-card p-4 rounded-xl border border-white/[0.08] space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by customer name, account ID, or industry..."
                className="w-full pl-9 pr-8 py-2 bg-[#181B23] border border-white/[0.08] rounded-lg text-xs font-sans text-white placeholder-neutral-500 focus:outline-none focus:border-[#FF3B30]/60 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
                  title="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-sans">
              <span className="text-neutral-500 text-[11px] font-medium mr-1 uppercase tracking-wider">Risk:</span>
              <button
                onClick={() => setRiskFilter(undefined)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                  riskFilter === null
                    ? "btn-editorial-primary text-white"
                    : "bg-[#181B23] border-white/[0.08] text-neutral-400 hover:text-white"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setRiskFilter(riskFilter === "high" ? undefined : "high")}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  riskFilter === "high"
                    ? "bg-[#FF3B30]/20 border-[#FF3B30] text-[#FF3B30] font-semibold"
                    : "bg-[#181B23] border-white/[0.08] text-neutral-400 hover:text-[#FF3B30]"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]" />
                <span>High Risk</span>
              </button>
              <button
                onClick={() => setRiskFilter(riskFilter === "medium" ? undefined : "medium")}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  riskFilter === "medium"
                    ? "bg-amber-400/20 border-amber-400 text-amber-400 font-semibold"
                    : "bg-[#181B23] border-white/[0.08] text-neutral-400 hover:text-amber-400"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Medium</span>
              </button>
              <button
                onClick={() => setRiskFilter(riskFilter === "low" ? undefined : "low")}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  riskFilter === "low"
                    ? "bg-emerald-400/20 border-emerald-400 text-emerald-400 font-semibold"
                    : "bg-[#181B23] border-white/[0.08] text-neutral-400 hover:text-emerald-400"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Low</span>
              </button>

              <div className="h-4 w-[1px] bg-white/[0.1] mx-1 hidden sm:block" />

              {/* Overdue Only Filter */}
              <button
                onClick={() => setOverdueOnly(!overdueOnly)}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
                  overdueOnly
                    ? "bg-[#FF3B30]/20 border-[#FF3B30] text-[#FF3B30] font-semibold"
                    : "bg-[#181B23] border-white/[0.08] text-neutral-400 hover:text-white"
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5 text-[#FF3B30]" />
                <span>Overdue Only</span>
              </button>
            </div>
          </div>
        </div>

        {/* D. CUSTOMERS DIRECTORY TABLE */}
        <div className="space-y-4">
          <SectionHeader
            title="Customer Portfolio Directory"
            subtitle="Complete debtor roster sorted by financial exposure and risk classification"
            editorial
            signal={false}
          />

          <div className="customers-directory workstation-card border border-white/[0.08] overflow-x-auto shadow-xl rounded-xl">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#181B23] text-neutral-300 font-sans text-xs border-b border-white/[0.08]">
                <tr>
                  <th
                    onClick={() => handleSort("name")}
                    className="py-3 px-4 font-semibold text-neutral-300 cursor-pointer hover:text-white transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>Customer Account</span>
                      <ArrowUpDown className="w-3 h-3 text-neutral-500" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("outstanding")}
                    className="py-3 px-4 text-right font-semibold text-neutral-300 cursor-pointer hover:text-white transition-colors select-none"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Ledger Exposure</span>
                      <ArrowUpDown className="w-3 h-3 text-neutral-500" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("overdue")}
                    className="py-3 px-4 text-right font-semibold text-neutral-300 cursor-pointer hover:text-white transition-colors select-none"
                  >
                    <div className="flex items-center justify-end gap-1.5">
                      <span>Overdue (&gt;30D)</span>
                      <ArrowUpDown className="w-3 h-3 text-neutral-500" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("dso")}
                    className="py-3 px-4 text-center font-semibold text-neutral-300 cursor-pointer hover:text-white transition-colors select-none"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>DSO Velocity</span>
                      <ArrowUpDown className="w-3 h-3 text-neutral-500" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-center font-semibold text-neutral-300">
                    Open Blockers
                  </th>
                  <th
                    onClick={() => handleSort("risk")}
                    className="py-3 px-4 text-center font-semibold text-neutral-300 cursor-pointer hover:text-white transition-colors select-none"
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      <span>Risk Band</span>
                      <ArrowUpDown className="w-3 h-3 text-neutral-500" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-neutral-300">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-sans">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="py-4 px-4">
                        <div className="h-6 bg-white/[0.02] rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : customers.length > 0 ? (
                  customers.map((cust) => (
                    <tr
                      key={cust.id}
                      onClick={() => router.push(`/customers/${cust.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/customers/${cust.id}`);
                        }
                      }}
                      tabIndex={0}
                      className="hover:bg-white/[0.03] transition-colors duration-150 ease-in-out cursor-pointer group focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF3B30]/50 focus-visible:bg-white/[0.04]"
                    >
                      {/* Customer Name & Meta */}
                      <td className="py-4 px-4 font-semibold text-white">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-[#181B23] border border-white/[0.08] text-[#FF3B30] shrink-0 mt-0.5">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="font-bold text-sm text-white group-hover:text-[#FF3B30] transition-colors truncate">
                              {cust.name}
                            </div>
                            <div className="text-[11px] text-neutral-400 font-sans flex items-center gap-2">
                              <span className="font-mono text-neutral-500">{cust.sourceId || cust.id}</span>
                              <span className="text-neutral-600">•</span>
                              <span>{cust.industry}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Outstanding Exposure & Share */}
                      <td className="py-4 px-4 text-right">
                        <div className="font-mono-num tabular-nums text-white font-semibold text-sm">
                          {formatCurrency(cust.totalOutstandingMinorUnits)}
                        </div>
                        {cust.percentageOfTotalReceivables > 0 && (
                          <div className="text-[10px] text-neutral-400 font-mono-num tabular-nums mt-0.5">
                            {cust.percentageOfTotalReceivables}% of AR
                          </div>
                        )}
                      </td>

                      {/* Overdue Amount */}
                      <td className="py-4 px-4 text-right">
                        <div className={`font-mono-num tabular-nums font-semibold text-sm ${cust.totalOverdueMinorUnits > 0 ? "text-[#FF3B30]" : "text-emerald-400"}`}>
                          {formatCurrency(cust.totalOverdueMinorUnits)}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-sans mt-0.5">
                          {cust.totalOverdueMinorUnits > 0 ? "Past contracted terms" : "Within terms"}
                        </div>
                      </td>

                      {/* DSO Velocity */}
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded font-mono-num tabular-nums text-xs font-semibold ${
                            cust.dsoDays > 45
                              ? "bg-[#FF3B30]/10 text-[#FF3B30] border border-[#FF3B30]/30"
                              : cust.dsoDays > 30
                              ? "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                              : "bg-emerald-400/10 text-emerald-400 border border-emerald-400/30"
                          }`}
                        >
                          {cust.dsoDays}d DSO
                        </span>
                      </td>

                      {/* Open Blockers */}
                      <td className="py-4 px-4 text-center">
                        {cust.openExceptionCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FF3B30] bg-[#FF3B30]/10 px-2 py-0.5 rounded border border-[#FF3B30]/20">
                            <AlertOctagon className="w-3 h-3" />
                            <span>{cust.openExceptionCount} active</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-neutral-500 font-medium">
                            0 blockers
                          </span>
                        )}
                      </td>

                      {/* Risk Band */}
                      <td className="py-4 px-4 text-center">
                        <StatusIndicator
                          status={cust.riskBand === "high" ? "CRITICAL" : cust.riskBand === "medium" ? "WAITING" : "VERIFIED"}
                        />
                      </td>

                      {/* Action */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomer(cust);
                            }}
                            className="px-2.5 py-1 rounded bg-[#181B23] border border-white/[0.08] hover:border-white/20 text-neutral-300 hover:text-white text-xs font-medium transition cursor-pointer"
                            title="Quick preview account telemetry"
                          >
                            Preview
                          </button>
                          <Link
                            href={`/customers/${cust.id}`}
                            className="px-2.5 py-1 rounded btn-editorial-primary text-white text-xs font-semibold inline-flex items-center gap-1 shadow-sm transition"
                          >
                            <span>Inspect 360</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-14 text-center text-neutral-400 font-sans">
                      <div className="space-y-3 max-w-md mx-auto">
                        <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto text-neutral-400">
                          <Building2 className="w-5 h-5 text-[#FF3B30]" />
                        </div>
                        <div className="space-y-1">
                          <div className="text-white font-semibold text-sm">
                            {searchQuery || riskFilter || overdueOnly
                              ? "No Customers Match Your Filters"
                              : "No Customer Accounts Recorded"}
                          </div>
                          <p className="text-xs text-neutral-400 leading-relaxed">
                            {searchQuery || riskFilter || overdueOnly
                              ? "Try adjusting your search terms or clearing active filters to view all debtor accounts."
                              : "Import your receivables ledger or connect your ERP to monitor customer risk profiles, DSO velocity, and exposure concentration."}
                          </p>
                        </div>
                        <div className="pt-2 flex items-center justify-center gap-3">
                          {searchQuery || riskFilter || overdueOnly ? (
                            <button
                              onClick={() => {
                                setSearchQuery("");
                                setRiskFilter(undefined);
                                setOverdueOnly(false);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[#181B23] border border-white/[0.12] hover:border-[#FF3B30]/40 text-neutral-300 hover:text-white transition-all text-xs font-medium cursor-pointer"
                            >
                              Reset Filters
                            </button>
                          ) : (
                            <Link
                              href="/onboarding"
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg btn-editorial-primary text-white text-xs font-semibold cursor-pointer shadow-md"
                            >
                              <Upload className="w-3.5 h-3.5" />
                              <span>Upload Customer Ledger</span>
                            </Link>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Contextual Quick Preview Drawer */}
      {selectedCustomer && (
        <DetailDrawer
          isOpen={Boolean(selectedCustomer)}
          onClose={() => setSelectedCustomer(null)}
          title={selectedCustomer.name}
          subtitle={`Account ID: ${selectedCustomer.sourceId || selectedCustomer.id} • ${selectedCustomer.industry}`}
        >
          <div className="space-y-4 text-xs font-sans">
            {/* Risk & Exposure Overview */}
            <div className="p-4 bg-[#181B23] border border-white/[0.08] rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase font-semibold text-neutral-400">Total Outstanding</span>
                <StatusIndicator
                  status={selectedCustomer.riskBand === "high" ? "CRITICAL" : selectedCustomer.riskBand === "medium" ? "WAITING" : "VERIFIED"}
                />
              </div>
              <div className="text-2xl font-bold font-mono-num tabular-nums text-white">
                {formatCurrency(selectedCustomer.totalOutstandingMinorUnits)}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/[0.06] text-neutral-300">
                <div>
                  <span className="text-[10px] text-neutral-400 block uppercase">Overdue Amount</span>
                  <span className={`font-mono-num tabular-nums font-semibold ${selectedCustomer.totalOverdueMinorUnits > 0 ? "text-[#FF3B30]" : "text-emerald-400"}`}>
                    {formatCurrency(selectedCustomer.totalOverdueMinorUnits)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 block uppercase">Payment Velocity</span>
                  <span className="font-mono-num tabular-nums font-semibold text-white">
                    {selectedCustomer.dsoDays} Days DSO
                  </span>
                </div>
              </div>
            </div>

            {/* Contractual Parameters */}
            <div className="space-y-2">
              <span className="text-[11px] text-neutral-400 uppercase font-semibold">Contractual Terms</span>
              <div className="p-3.5 bg-[#181B23]/60 border border-white/[0.08] rounded-xl space-y-2 text-neutral-300">
                <div className="flex justify-between">
                  <span className="text-neutral-400">Standard Payment Terms:</span>
                  <span className="font-semibold text-white">Net {selectedCustomer.paymentTermsDays} Days</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Credit Limit:</span>
                  <span className="font-mono-num tabular-nums font-semibold text-white">
                    {formatCurrency(selectedCustomer.creditLimitMinorUnits)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Open Invoices:</span>
                  <span className="font-semibold text-white">{selectedCustomer.openInvoiceCount} open / {selectedCustomer.invoiceCount} total</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-400">Active Exceptions:</span>
                  <span className="font-semibold text-[#FF3B30]">{selectedCustomer.openExceptionCount} active blocker(s)</span>
                </div>
              </div>
            </div>

            {/* Direct Navigation */}
            <Link
              href={`/customers/${selectedCustomer.id}`}
              className="w-full py-2.5 btn-editorial-primary text-white font-semibold text-center block rounded-xl shadow-md transition-all font-sans"
            >
              Open Full Customer 360 Workspace →
            </Link>
          </div>
        </DetailDrawer>
      )}
    </MainNavShell>
  );
}
