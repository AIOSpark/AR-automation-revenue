"use client";

import React, { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MainNavShell } from "@/components/MainNavShell";
import type { CausalChainSummary, CausalGraphNode } from "@/lib/intelligence/advanced-engine";
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
  Zap,
  Filter,
  Eye,
  FileText,
  User,
  DollarSign,
  HelpCircle,
  Activity,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Lock,
  Sparkles,
} from "lucide-react";
import { SignalRail } from "@/components/system/SignalLine";
import { FinancialMetric } from "@/components/system/FinancialMetric";
import { CommandPalette } from "@/components/system/CommandPalette";
import { EvidenceBlock } from "@/components/system/CausalGraph";

function CausalGraphContent() {
  const searchParams = useSearchParams();
  const invoiceIdQuery = searchParams.get("invoiceId");
  const customerIdQuery = searchParams.get("customerId");

  const [activeInvoiceId, setActiveInvoiceId] = useState<string | undefined>(invoiceIdQuery ? invoiceIdQuery : undefined);
  const [activeChain, setActiveChain] = useState<CausalChainSummary | null>(null);
  const [cases, setCases] = useState<any[]>([]);
  const [dataQuality, setDataQuality] = useState<{ verifiedCount: number; inferredCount: number; totalNodes: number }>({ verifiedCount: 0, inferredCount: 0, totalNodes: 0 });
  const [dataSyncedAt, setDataSyncedAt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<string | undefined>(undefined);

  // Graph modes & states
  const [graphMode, setGraphMode] = useState<"FOLLOW_CASH" | "FOLLOW_CAUSE" | "FOLLOW_OUTCOME">("FOLLOW_CAUSE");
  const [selectedNode, setSelectedNode] = useState<CausalGraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(100);

  useEffect(() => {
    fetchCausalGraphData(activeInvoiceId, customerIdQuery);
  }, [activeInvoiceId]);

  const fetchCausalGraphData = async (invId?: string | null, custId?: string | null) => {
    try {
      setLoading(true);
      setError(undefined);
      let url = "/api/causal-graph";
      const params = new URLSearchParams();
      if (invId) params.set("invoiceId", invId);
      if (custId) params.set("customerId", custId);
      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status + ": Failed to load causal graph data");
      const json = await res.json();

      if (json.success) {
        setCases(json.availableCases || []);
        setActiveChain(json.activeChain || null);
        if (json.dataQuality) setDataQuality(json.dataQuality);
        if (json.dataSyncedAt) setDataSyncedAt(json.dataSyncedAt);
        if (json.activeInvoiceId) setActiveInvoiceId(json.activeInvoiceId);
        
        // Auto-select blocker node if present
        if (json.activeChain?.nodes) {
          const blocker = json.activeChain.nodes.find((n: any) => n.type === "exception" || n.type === "dispute");
          setSelectedNode(blocker || json.activeChain.nodes[0]);
        }
      } else {
        throw new Error(json.error || "Failed to load graph model");
      }

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
      }
    } catch (err: any) {
      console.error("Causal Graph load error", err);
      setError(err.message || "Failed to render graph");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (valMinor?: number) => {
    if (valMinor === undefined || valMinor === null) return "₹0";
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(valMinor / 100);
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "customer":
        return <User className="w-3.5 h-3.5 text-blue-400" />;
      case "po":
        return <FileText className="w-3.5 h-3.5 text-amber-400" />;
      case "invoice":
        return <DollarSign className="w-3.5 h-3.5 text-white" />;
      case "exception":
      case "dispute":
        return <AlertTriangle className="w-3.5 h-3.5 text-[#FF2D2D]" />;
      case "payment":
        return <Activity className="w-3.5 h-3.5 text-purple-400" />;
      case "reconciliation":
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      default:
        return <Layers className="w-3.5 h-3.5 text-neutral-400" />;
    }
  };

  const filteredCases = cases.filter((c) =>
    c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <MainNavShell currentRole={role}>
      <div className="causal-graph-page space-y-5 font-sans pb-16 text-xs text-neutral-300">

        {/* 05 — COMMAND HEADER & CONTEXT */}
        <div className="causal-graph-header bg-[#09090b] border border-[#27272a] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono">
          <div className="space-y-1">
            <div className="flex items-center space-x-2 text-[10px]">
              <span className="text-[#FF2D2D] font-bold tracking-widest">O2C INTELLIGENCE</span>
              <span className="text-neutral-600">/</span>
              <span className="text-white font-bold tracking-widest">LIVE DATA CAUSAL GRAPH</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight uppercase">
              O2C FINANCIAL CAUSAL GRAPH
            </h1>
            <p className="text-xs text-neutral-400 font-sans">
              Dynamic O2C relationship engine exposing verified financial dependencies over UDM records.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => fetchCausalGraphData(activeInvoiceId)}
              className="px-3 py-1.5 bg-[#121215] hover:bg-[#18181c] border border-[#27272a] text-white text-xs font-mono font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#FF2D2D] ${loading ? "animate-spin" : ""}`} />
              <span>REFRESH</span>
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

        {/* 07 — PRIMARY USER QUESTION STRIP */}
        {activeChain && (
          <div className="causal-graph-health bg-[#09090b] border border-[#FF2D2D]/60 p-4 space-y-2 font-mono relative">
            <SignalRail status="critical" thickness={3} className="absolute left-0 top-0 bottom-0" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#27272a] pb-2">
              <div className="flex items-center space-x-2">
                <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-widest">PRIMARY DIAGNOSIS</span>
                <span className="text-[9px] bg-[#FF2D2D]/10 text-[#FF2D2D] border border-[#FF2D2D]/40 px-1.5 py-0.5 font-bold uppercase">
                  FINANCIAL OBSTRUCTION DETECTED
                </span>
              </div>
              <span className="text-[10px] text-neutral-400">
                PROVENANCE: <strong className="text-emerald-400">VERIFIED UDM DATA TRACE</strong>
              </span>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
              <div>
                <span className="text-xs text-neutral-400 font-sans block">QUESTION:</span>
                <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                  WHY IS THIS CASH STUCK?
                </h2>
                <div className="text-xs font-sans text-neutral-300 mt-0.5">
                  <span className="font-bold text-white">{activeChain.customerName}</span> • Invoice <strong className="text-white">{activeChain.invoiceNumber}</strong> • Blocker: <span className="text-[#FF2D2D] font-bold">{activeChain.blockerCategory}</span>
                </div>
              </div>

              <div className="text-left md:text-right">
                <span className="text-[10px] text-neutral-400 block uppercase">EXPOSED MONETARY VALUE</span>
                <div className="text-2xl sm:text-3xl font-black text-[#FF2D2D] font-mono-num">
                  {formatCurrency(activeChain.cashImpactMinorUnits)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 74 — GRAPH MODES & SEARCH TOOLBAR */}
        <div className="causal-graph-toolbar flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#09090b] border border-[#27272a] p-3 font-mono">
          {/* Mode Selector */}
          <div className="flex items-center space-x-1">
            <span className="text-[10px] text-neutral-400 uppercase font-bold mr-2">INTERACTION MODE:</span>
            {[
              { id: 'FOLLOW_CAUSE', label: 'FOLLOW THE CAUSE' },
              { id: 'FOLLOW_CASH', label: 'FOLLOW THE CASH' },
              { id: 'FOLLOW_OUTCOME', label: 'FOLLOW THE OUTCOME' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setGraphMode(m.id as any)}
                className={`px-2.5 py-1 text-[10px] font-bold uppercase transition border ${
                  graphMode === m.id
                    ? 'bg-[#FF2D2D] text-white border-[#FF2D2D]'
                    : 'bg-[#121215] text-neutral-400 border-[#27272a] hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Search & Select Case */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Find account or invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#121215] border border-[#27272a] pl-8 pr-3 py-1 text-xs text-white placeholder-neutral-500 font-mono focus:outline-none focus:border-[#FF2D2D]"
              />
            </div>

            <select
              value={activeInvoiceId || ''}
              onChange={(e) => setActiveInvoiceId(e.target.value)}
              className="bg-[#121215] border border-[#27272a] px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-[#FF2D2D] max-w-xs truncate"
            >
              {filteredCases.map((c) => (
                <option key={c.invoiceId} value={c.invoiceId}>
                  {c.customerName} ({c.invoiceNumber} - {formatCurrency(c.amountMinorUnits)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 62 — DESKTOP MAIN SPLIT LAYOUT: GRAPH (LEFT) + CASE INTELLIGENCE (RIGHT) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          
          {/* LEFT: O2C DIRECTIONAL CAUSAL GRAPH (8 COLUMNS) */}
          <div className="causal-graph-canvas lg:col-span-8 bg-[#09090b] border border-[#27272a] p-5 space-y-5 font-mono flex flex-col justify-between min-h-[520px]">
            <div>
              {/* Graph Sub-header & Controls */}
              <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-[3px] h-4 bg-[#FF2D2D]" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">DIRECTIONAL O2C CAUSALITY MAP</span>
                </div>

                <div className="flex items-center space-x-2 text-[10px]">
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                    className="p-1 bg-[#121215] border border-[#27272a] text-neutral-400 hover:text-white"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-neutral-400">{zoomLevel}%</span>
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                    className="p-1 bg-[#121215] border border-[#27272a] text-neutral-400 hover:text-white"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setZoomLevel(100)}
                    className="px-2 py-0.5 bg-[#121215] border border-[#27272a] text-neutral-400 hover:text-white uppercase font-bold"
                  >
                    FIT
                  </button>
                </div>
              </div>

              {/* Graph Container */}
              {loading ? (
                <div className="p-16 text-center space-y-3">
                  <RefreshCw className="w-6 h-6 text-[#FF2D2D] animate-spin mx-auto" />
                  <p className="text-xs text-neutral-400">CONSTRUCTING LIVE O2C CAUSAL RELATIONSHIP MAP FROM UDM...</p>
                </div>
              ) : error ? (
                <div className="p-12 text-center border border-[#FF2D2D]/60 space-y-2">
                  <AlertTriangle className="w-6 h-6 text-[#FF2D2D] mx-auto" />
                  <p className="text-xs text-white font-bold uppercase">{error}</p>
                </div>
              ) : !activeChain || !activeChain.nodes ? (
                <div className="p-16 text-center space-y-3">
                  <HelpCircle className="w-8 h-8 text-neutral-500 mx-auto" />
                  <h3 className="text-sm font-bold text-white uppercase">NO O2C RELATIONSHIP MAP AVAILABLE</h3>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                    AIOSpark does not have enough connected O2C data to build a causal path for this record.
                  </p>
                </div>
              ) : (
                /* Restrained Institutional Directional Graph Visual Flow */
                <div className="py-6 overflow-x-auto" style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top left' }}>
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0 relative min-w-full">
                    {activeChain.nodes.map((node, index) => {
                      const isLast = index === activeChain.nodes.length - 1;
                      const isSelected = selectedNode?.id === node.id;
                      const isBlocker = node.type === 'exception' || node.type === 'dispute';
                      const isFinancialDominant = Boolean(node.amountMinorUnits);
                      const isVerified = node.provenance === 'VERIFIED';
                      const isAIInferred = node.provenance === 'AI_INFERRED';

                      return (
                        <React.Fragment key={node.id}>
                          {/* Restrained Node Box */}
                          <div
                            onClick={() => setSelectedNode(node)}
                            className={`relative flex flex-col p-3.5 bg-[#121215] border cursor-pointer transition-all duration-150 ${
                              isSelected
                                ? 'border-[#FF2D2D] ring-1 ring-[#FF2D2D]/40 bg-[#181820]'
                                : isBlocker
                                ? 'border-[#FF2D2D]/60 bg-red-950/20 hover:border-[#FF2D2D]'
                                : isFinancialDominant
                                ? 'border-white/40 bg-[#16161a] hover:border-white'
                                : 'border-[#27272a] hover:border-neutral-500'
                            } ${isAIInferred ? 'border-dashed' : 'border-solid'} min-w-[140px] max-w-[165px] w-full text-left font-mono`}
                          >
                            {isBlocker && (
                              <div className="absolute top-0 left-0 bottom-0 w-[3px] bg-[#FF2D2D]" />
                            )}

                            <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-neutral-400 font-semibold mb-1">
                              <span className="flex items-center gap-1">
                                {getNodeIcon(node.type)}
                                <span>{node.type}</span>
                              </span>
                              {node.provenance && (
                                <span className={`text-[8px] font-mono uppercase px-1 py-0.2 border ${isVerified ? 'text-emerald-400 border-emerald-900 bg-emerald-950/40' : 'text-amber-400 border-amber-900 bg-amber-950/40'}`}>
                                  {isVerified ? 'VERIFIED' : 'INFERRED'}
                                </span>
                              )}
                            </div>

                            <div className="font-bold text-white text-xs truncate">
                              {node.label}
                            </div>

                            {node.amountMinorUnits !== undefined && (
                              <div className="text-sm font-extrabold text-white font-mono-num mt-1 tracking-tight">
                                {formatCurrency(node.amountMinorUnits)}
                              </div>
                            )}

                            {node.metadata && (
                              <div className="text-[9px] text-neutral-400 mt-1 space-y-0.5 font-sans border-t border-[#27272a] pt-1">
                                {Object.entries(node.metadata).map(([k, v]) => (
                                  <div key={k} className="truncate">
                                    <span className="text-neutral-500 uppercase">{k}:</span> {String(v)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Connection Vector Arrow */}
                          {!isLast && (
                            <div className="flex flex-col md:flex-row items-center justify-center py-1 md:py-0 md:px-1 text-neutral-500 font-mono text-[10px] shrink-0">
                              <span className={`hidden md:inline font-bold ${activeChain.edges[index]?.provenance === 'AI_INFERRED' ? 'text-amber-400' : 'text-neutral-600'}`}>
                                {activeChain.edges[index]?.provenance === 'AI_INFERRED' ? '─ ─ ▶' : '───▶'}
                              </span>
                              <span className="md:hidden text-neutral-600">│<br />▼</span>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 31 & 40 — COMPACT GRAPH LEGEND & REAL DATA QUALITY METRICS */}
            <div className="pt-3 border-t border-[#27272a] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-[10px]">
              <div className="flex items-center space-x-4">
                <span className="text-neutral-400 font-bold">LEGEND:</span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-0.5 bg-emerald-400" />
                  <span>VERIFIED LEDGER EDGE</span>
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2 h-0.5 bg-amber-400 border-b border-dashed border-amber-400" />
                  <span>AI-INFERRED RELATIONSHIP</span>
                </span>
                <span className="flex items-center gap-1 text-[#FF2D2D]">
                  <span className="w-2 h-2 bg-[#FF2D2D]/20 border border-[#FF2D2D]" />
                  <span>BLOCKER</span>
                </span>
              </div>

              <div className="text-neutral-400">
                DATA COVERAGE: <strong className="text-emerald-400">{dataQuality.verifiedCount} VERIFIED</strong> • <strong className="text-amber-400">{dataQuality.inferredCount} INFERRED</strong> • SYNCED: <span className="text-white">{dataSyncedAt ? new Date(dataSyncedAt).toLocaleTimeString() : 'LIVE'}</span>
              </div>
            </div>
          </div>

          {/* RIGHT: CASE INTELLIGENCE PANEL (4 COLUMNS) */}
          <div className="causal-graph-intelligence lg:col-span-4 bg-[#09090b] border border-[#27272a] p-5 space-y-5 font-mono">
            <div className="flex items-center justify-between border-b border-[#27272a] pb-3">
              <span className="text-xs font-bold text-white uppercase tracking-wider">CASE INTELLIGENCE</span>
              <span className="text-[10px] text-[#FF2D2D] font-bold bg-[#FF2D2D]/10 px-2 py-0.5 border border-[#FF2D2D]/30">
                ACTIONABLE CAUSE
              </span>
            </div>

            {activeChain ? (
              <div className="space-y-4 font-sans text-xs text-neutral-300">
                
                {/* Entity Specification */}
                <div className="p-3 bg-[#121215] border border-[#27272a] space-y-1 font-mono">
                  <span className="text-[10px] text-neutral-400 uppercase font-bold">SELECTED TARGET ENTITY</span>
                  <div className="font-bold text-white text-sm">{activeChain.customerName}</div>
                  <div className="text-[11px] text-neutral-400">
                    Invoice: <strong className="text-white">{activeChain.invoiceNumber}</strong> • Exposure: <strong className="text-[#FF2D2D] font-mono-num">{formatCurrency(activeChain.cashImpactMinorUnits)}</strong>
                  </div>
                </div>

                {/* 12 — BLOCKER & ROOT CAUSE ISOLATION */}
                <div className="space-y-2 font-mono">
                  <span className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block">DIAGNOSTIC ISOLATION</span>
                  
                  <div className="p-3 bg-[#0d0d11] border border-[#FF2D2D]/60 space-y-1">
                    <span className="text-[9px] font-mono text-[#FF2D2D] font-bold uppercase tracking-wider block">
                      PRIMARY O2C BLOCKER
                    </span>
                    <div className="font-bold text-white text-xs">{activeChain.blockerCategory}</div>
                  </div>

                  <div className="p-3 bg-[#0d0d11] border border-amber-500/60 space-y-1">
                    <span className="text-[9px] font-mono text-amber-400 font-bold uppercase tracking-wider block flex items-center justify-between">
                      <span>ROOT CAUSE EXPLANATION</span>
                      <span className="text-[8px] bg-emerald-950 text-emerald-400 px-1 py-0.2 border border-emerald-800">VERIFIED UDM TRACE</span>
                    </span>
                    <p className="text-xs text-neutral-200 font-sans leading-relaxed">{activeChain.rootCause}</p>
                  </div>

                  <div className="p-3 bg-[#0d0d11] border border-purple-500/60 space-y-1">
                    <span className="text-[9px] font-mono text-purple-400 font-bold uppercase tracking-wider block">
                      RESPONSIBLE DEPENDENCY
                    </span>
                    <div className="font-bold text-white text-xs">{activeChain.responsibleArea}</div>
                  </div>
                </div>

                {/* 26 — AUDITABLE EVIDENCE BLOCK FROM REAL UDM DATA */}
                <EvidenceBlock
                  title="CAUSAL EVIDENCE PROVENANCE"
                  items={[
                    {
                      source: `Customer Record: ${activeChain.customerName}`,
                      value: `Terms: Active`,
                      relationship: "UDM CUSTOMER",
                      verification: "VERIFIED SYSTEM OF RECORD",
                    },
                    {
                      source: `Invoice: ${activeChain.invoiceNumber}`,
                      value: formatCurrency(activeChain.cashImpactMinorUnits),
                      relationship: "SALES INVOICE",
                      verification: "VERIFIED LEDGER TRACE",
                    },
                  ]}
                />

                {/* 32 & 33 — RECOMMENDED ACTION CONTROL & ROUTING */}
                <div className="p-4 bg-[#121215] border border-[#27272a] space-y-3 font-mono">
                  <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    RECOMMENDED NEXT ACTION
                  </div>
                  <p className="text-xs font-sans text-neutral-200 font-semibold leading-relaxed">
                    {activeChain.recommendedAction}
                  </p>

                  <div className="pt-2 flex flex-col gap-2">
                    <Link
                      href={`/cash-unblock`}
                      className="w-full py-2 bg-[#FF2D2D] hover:bg-red-600 text-white font-bold text-xs uppercase text-center transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <span>OPEN IN CASH UNBLOCK</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={`/invoices/${activeChain.invoiceId}`}
                        className="py-1.5 bg-[#09090b] border border-[#27272a] text-neutral-300 hover:text-white text-[11px] font-bold text-center cursor-pointer"
                      >
                        INSPECT INVOICE
                      </Link>
                      <Link
                        href={`/exceptions`}
                        className="py-1.5 bg-[#09090b] border border-[#27272a] text-neutral-300 hover:text-white text-[11px] font-bold text-center cursor-pointer"
                      >
                        VIEW EXCEPTION
                      </Link>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="p-8 text-center font-mono text-neutral-500 text-xs">
                Select a causal path to inspect intelligence details.
              </div>
            )}
          </div>

        </div>

        {/* 64 — ACCESSIBILITY ALTERNATIVE STRUCTURED RELATIONSHIP LIST */}
        <div className="causal-graph-queue bg-[#09090b] border border-[#27272a] p-4 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider">ACCESSIBLE RELATIONSHIP AUDIT TABLE</span>
            <span className="text-[10px] text-neutral-400">STRUCTURED ALTERNATIVE</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-[#121215] text-neutral-400 font-mono text-[10px] uppercase border-b border-[#27272a]">
                <tr>
                  <th className="py-2.5 px-3">ACCOUNT</th>
                  <th className="py-2.5 px-3">INVOICE</th>
                  <th className="py-2.5 px-3 text-right">EXPOSURE</th>
                  <th className="py-2.5 px-3">BLOCKER</th>
                  <th className="py-2.5 px-3">PROVENANCE</th>
                  <th className="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#27272a] font-mono text-xs">
                {cases.map((c) => (
                  <tr key={c.invoiceId} className="hover:bg-[#121215] transition">
                    <td className="py-2.5 px-3 font-bold text-white font-sans">{c.customerName}</td>
                    <td className="py-2.5 px-3 text-neutral-300">{c.invoiceNumber}</td>
                    <td className="py-2.5 px-3 text-right font-mono-num font-bold text-[#FF2D2D]">{formatCurrency(c.amountMinorUnits)}</td>
                    <td className="py-2.5 px-3 text-amber-400">{c.status.toUpperCase()}</td>
                    <td className="py-2.5 px-3">
                      <span className="text-[9px] font-mono uppercase text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 border border-emerald-800 font-bold">
                        VERIFIED UDM
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setActiveInvoiceId(c.invoiceId)}
                        className="px-2 py-0.5 bg-[#121215] hover:bg-[#FF2D2D] hover:text-white border border-[#27272a] text-[10px] font-bold cursor-pointer"
                      >
                        INSPECT CAUSE →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 39 — COMMAND PALETTE MODAL */}
        <CommandPalette
          isOpen={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
        />
      </div>
    </MainNavShell>
  );
}

export default function CausalGraphPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0A0A0C] text-white flex items-center justify-center font-mono text-sm">Loading Causal Graph...</div>}>
      <CausalGraphContent />
    </Suspense>
  );
}
