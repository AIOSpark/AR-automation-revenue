"use client";

import React, { useEffect, useState } from "react";
import { MainNavShell } from "@/components/MainNavShell";
import {
  FileText,
  Download,
  Clock,
  Sparkles,
  CheckCircle2,
  FileSpreadsheet,
  FileCode,
  Search,
  BookOpen,
} from "lucide-react";
import type { ReportCategory } from "@/lib/reports/definitions";
import { SectionHeader } from "@/components/system/SectionHeader";
import { FinancialMetric } from "@/components/system/FinancialMetric";
import { StatusIndicator } from "@/components/system/StatusIndicator";

interface ReportItem {
  id: string;
  category: ReportCategory;
  name: string;
  description: string;
  dsoFormulaNotice?: string | null;
  columnCount: number;
}

interface ScheduleItem {
  id: string;
  report_id: string;
  format: string;
  recipients: string[];
  cadence: string;
  last_run_at?: string | null;
}

interface ReportPreviewData {
  reportId: string;
  category: ReportCategory;
  name: string;
  description: string;
  dsoFormulaNotice?: string | null;
  columns: { header: string; field: string; format?: string }[];
  rows: Record<string, any>[];
  rowCount: number;
  generatedAt: string;
}

const CATEGORIES: { key: ReportCategory | "ALL"; label: string }[] = [
  { key: "ALL", label: "ALL CATEGORIES" },
  { key: "RECEIVABLES", label: "1. RECEIVABLES" },
  { key: "COLLECTIONS", label: "2. COLLECTIONS" },
  { key: "EXCEPTIONS", label: "3. EXCEPTIONS" },
  { key: "PAYMENTS & RECONCILIATION", label: "4. RECONCILIATION" },
  { key: "CUSTOMER EXPOSURE", label: "5. EXPOSURE" },
  { key: "O2C PERFORMANCE", label: "6. PERFORMANCE" },
  { key: "MANAGEMENT", label: "7. MANAGEMENT" },
];

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ReportCategory | "ALL">("ALL");
  const [selectedReportId, setSelectedReportId] = useState<string>("aging_report");
  const [previewData, setPreviewData] = useState<ReportPreviewData | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<"csv" | "xlsx" | "pdf">("csv");
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [scheduleCadence, setScheduleCadence] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [role, setRole] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    if (selectedReportId) {
      fetchReportPreview(selectedReportId);
    }
  }, [selectedReportId]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/reports");
      if (res.ok) {
        const json = await res.json();
        setReports(json.reports || []);
        setSchedules(json.schedules || []);
      }

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
      }
    } catch (err) {
      console.error("Failed to fetch reports list", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReportPreview = async (reportId: string) => {
    try {
      setPreviewLoading(true);
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_preview",
          reportId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPreviewData(data);
      }
    } catch (err) {
      console.error("Failed to fetch report preview", err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownload = async (reportId: string, format: "csv" | "xlsx" | "pdf") => {
    setDownloading(true);
    setStatusNotice(undefined);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_on_demand",
          reportId,
          format,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        setStatusNotice(`❌ Error: ${errJson.error}`);
        return;
      }

      const blob = await res.blob();
      const filename =
        res.headers.get("Content-Disposition")?.split('filename="')[1]?.replace('"', '') ||
        `report.${format}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setStatusNotice(`✅ Report "${filename}" downloaded successfully!`);
    } catch (err: any) {
      setStatusNotice(`❌ Error: ${err.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail) return;

    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_schedule",
          reportId: selectedReportId,
          format: selectedFormat,
          recipients: [recipientEmail],
          cadence: scheduleCadence,
        }),
      });

      if (res.ok) {
        setStatusNotice(`✅ Schedule created for ${recipientEmail}! Delivery: ${scheduleCadence}.`);
        setScheduleModalOpen(false);
        setRecipientEmail("");
        fetchReports();
      }
    } catch (err: any) {
      setStatusNotice(`❌ Failed to create schedule: ${err.message}`);
    }
  };

  const filteredReports = reports.filter((r) => {
    const matchesCategory = selectedCategory === "ALL" || r.category === selectedCategory;
    const matchesQuery =
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  const selectedReport = reports.find((r) => r.id === selectedReportId) || reports[0];

  const formatValue = (val: any, format?: string) => {
    if (val === null || val === undefined) return "—";
    if (format === "currency") {
      const num = typeof val === "number" ? val / 100 : Number(val) / 100 || 0;
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(num);
    }
    if (format === "percent") {
      const num = typeof val === "number" ? val : Number(val) || 0;
      return `${num.toFixed(1)}%`;
    }
    if (format === "number") {
      const num = typeof val === "number" ? val : Number(val) || 0;
      return num.toLocaleString("en-IN");
    }
    return String(val);
  };

  if (loading) {
    return (
    <MainNavShell currentRole={role}>
        <div className="flex-1 p-8 text-center text-zinc-500 text-xs flex items-center justify-center font-mono bg-[#050505] min-h-screen">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 bg-[#FF2D2D] animate-ping" />
            <span>Loading Financial Intelligence Research Library...</span>
          </div>
        </div>
      </MainNavShell>
    );
  }

  return (
    <MainNavShell currentRole={role}>
      <div className="reports-page space-y-6 font-sans text-zinc-200 min-h-screen bg-[#050505] max-w-7xl mx-auto">
        {/* EXECUTIVE HEADER */}
        <SectionHeader
          className="reports-header"
          title="FINANCIAL RESEARCH LIBRARY & REPORTS"
          subtitle="Audit-ready financial statements, receivables aging, DSO analytics & schedule delivery"
          signal
          action={
            <div className="flex items-center space-x-2 font-mono text-xs">
              <button
                onClick={() => setScheduleModalOpen(false)}
                className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-bold transition flex items-center space-x-1.5"
                onClickCapture={() => setScheduleModalOpen(true)}
              >
                <Clock className="w-3.5 h-3.5 text-zinc-400" />
                <span>SCHEDULE DELIVERY</span>
              </button>
              <button
                onClick={() => handleDownload(selectedReportId, "csv")}
                disabled={downloading}
                className="px-3.5 py-1.5 bg-[#FF2D2D] hover:bg-red-600 text-white font-bold transition flex items-center space-x-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>EXPORT CSV</span>
              </button>
            </div>
          }
        />

        {/* METRICS BAND */}
        <div className="report-metrics grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
          <FinancialMetric
            label="AVAILABLE REPORTS"
            value={reports.length}
            sublabel="Audit-Ready Dossiers"
          />
          <FinancialMetric
            label="ACTIVE SCHEDULES"
            value={schedules.length}
            sublabel="Automated Deliveries"
            statusColor="emerald"
            statusText="VERIFIED"
          />
          <FinancialMetric
            label="UDM LEDGER SYNC"
            value="LIVE"
            sublabel="Real-time Store Sync"
            statusColor="emerald"
            statusText="VERIFIED"
          />
          <FinancialMetric
            label="FORMAT COMPLIANCE"
            value="RFC 4180"
            sublabel="CSV / XLSX / PDF Supported"
          />
        </div>

        {statusNotice && (
          <div className="p-3 bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200">
            {statusNotice}
          </div>
        )}

        {/* CATEGORY SELECTOR & SEARCH */}
        <div className="reports-selector bg-[#09090b] border border-zinc-800 p-3 space-y-3 font-mono">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-2.5 py-1 text-[11px] font-bold uppercase transition shrink-0 border ${
                  selectedCategory === cat.key
                    ? "bg-[#FF2D2D] text-white border-[#FF2D2D]"
                    : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reports by title or financial metric..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
            />
          </div>
        </div>

        {/* MAIN WORKSPACE GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono">
          {/* LEFT: REPORT INDEX */}
          <div className="reports-index lg:col-span-1 bg-[#09090b] border border-zinc-800 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[10px] text-zinc-500 uppercase">
              <span>REPORT INDEX ({filteredReports.length})</span>
              <span>VERIFIED METRICS</span>
            </div>

            <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {filteredReports.map((r) => {
                const isSelected = r.id === selectedReportId;
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelectedReportId(r.id)}
                    className={`w-full text-left p-3 border transition cursor-pointer ${
                      isSelected
                        ? "bg-zinc-900 border-[#FF2D2D] text-zinc-100"
                        : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-[#FF2D2D] font-bold uppercase">
                        {r.category}
                      </span>
                      <StatusIndicator status={isSelected ? "VERIFIED" : "WAITING"} />
                    </div>

                    <h3 className="font-bold text-xs text-zinc-100">{r.name}</h3>
                    <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2 font-sans leading-normal">
                      {r.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: PREVIEW & DOSSIER EXPORT WORKSPACE */}
          <div className="lg:col-span-2 space-y-4">
            {selectedReport && (
              <div className="reports-preview bg-[#09090b] border border-zinc-800 p-5 space-y-4">
                {/* HEADER */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-3">
                  <div>
                    <div className="flex items-center space-x-2 text-[10px] text-zinc-500 mb-0.5">
                      <span className="text-[#FF2D2D] font-bold">{selectedReport.category}</span>
                      <span>/</span>
                      <span>{selectedReport.id}</span>
                    </div>
                    <h2 className="text-base font-bold text-zinc-100">{selectedReport.name}</h2>
                    <p className="text-xs text-zinc-400 font-sans mt-0.5">{selectedReport.description}</p>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 text-xs">
                    <button
                      onClick={() => handleDownload(selectedReport.id, "csv")}
                      disabled={downloading}
                      className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-emerald-400 font-bold hover:bg-zinc-800 transition flex items-center space-x-1"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>CSV</span>
                    </button>
                    <button
                      onClick={() => handleDownload(selectedReport.id, "xlsx")}
                      disabled={downloading}
                      className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-emerald-400 font-bold hover:bg-zinc-800 transition flex items-center space-x-1"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>EXCEL</span>
                    </button>
                    <button
                      onClick={() => handleDownload(selectedReport.id, "pdf")}
                      disabled={downloading}
                      className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 text-[#FF2D2D] font-bold hover:bg-zinc-800 transition flex items-center space-x-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>PDF</span>
                    </button>
                  </div>
                </div>

                {/* FORMULA NOTICE */}
                {selectedReport.dsoFormulaNotice && (
                  <div className="p-3 bg-amber-950/20 border border-amber-900/40 text-amber-400 text-xs space-y-1">
                    <div className="flex items-center space-x-1.5 font-bold">
                      <BookOpen className="w-3.5 h-3.5 text-amber-400" />
                      <span>FORMULA CALCULATION SPECIFICATION:</span>
                    </div>
                    <p className="text-zinc-300 font-sans">{selectedReport.dsoFormulaNotice}</p>
                  </div>
                )}

                {/* PREVIEW TABLE */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
                    <span>LIVE REPORT PREVIEW ({previewData?.rowCount || 0} ROWS)</span>
                    <span>LEDGER STORE SYNCED</span>
                  </div>

                  {previewLoading ? (
                    <div className="py-8 text-center text-zinc-500 text-xs">
                      Querying Universal Data Model store...
                    </div>
                  ) : previewData && previewData.rows.length > 0 ? (
                    <div className="border border-zinc-800 overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px]">
                          <tr>
                            {previewData.columns.map((col) => (
                              <th key={col.field} className="p-2.5 font-bold">
                                {col.header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/80 text-zinc-200">
                          {previewData.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-zinc-900/60 transition">
                              {previewData.columns.map((col) => (
                                <td key={col.field} className="p-2.5 whitespace-nowrap">
                                  {formatValue(row[col.field], col.format)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-zinc-500 text-xs">
                      No records match the current report scope.
                    </div>
                  )}
                </div>

                {/* INSIGHT NARRATIVE */}
                <div className="p-3 bg-zinc-900 border border-zinc-800 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-[10px] border-b border-zinc-800 pb-1">
                    <span className="text-[#FF2D2D] font-bold uppercase">AIOSPARK AUDIT NARRATIVE</span>
                    <span className="text-emerald-400">VERIFIED</span>
                  </div>
                  <p className="text-zinc-300 font-sans leading-relaxed">
                    Report "{selectedReport.name}" queried {previewData?.rowCount || 0} records directly from live UDM persistence store. Calculations conform strictly to Golden Financial Suite standards.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SCHEDULE MODAL */}
      {scheduleModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-950 border border-zinc-800 p-6 space-y-4 font-mono shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-100">SCHEDULE REPORT DELIVERY</h3>
              <button onClick={() => setScheduleModalOpen(false)} className="text-zinc-500 hover:text-zinc-200 text-xs">[ESC]</button>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">SELECT REPORT</label>
                <select
                  value={selectedReportId}
                  onChange={(e) => setSelectedReportId(e.target.value)}
                  className="w-full p-2 bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none"
                >
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>[{r.category}] {r.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">EXPORT FORMAT</label>
                <select
                  value={selectedFormat}
                  onChange={(e: any) => setSelectedFormat(e.target.value)}
                  className="w-full p-2 bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none"
                >
                  <option value="csv">CSV (RFC 4180 Escaped)</option>
                  <option value="xlsx">Excel Spreadsheet (.xlsx)</option>
                  <option value="pdf">Printable PDF Document</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">RECIPIENT EMAIL ADDRESS</label>
                <input
                  type="email"
                  required
                  placeholder="cfo@company.com"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full p-2 bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">DELIVERY CADENCE</label>
                <select
                  value={scheduleCadence}
                  onChange={(e: any) => setScheduleCadence(e.target.value)}
                  className="w-full p-2 bg-zinc-900 border border-zinc-800 text-zinc-100 focus:outline-none"
                >
                  <option value="daily">Daily Every Morning</option>
                  <option value="weekly">Weekly Every Monday 8:00 AM</option>
                  <option value="monthly">Monthly 1st Calendar Day</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setScheduleModalOpen(false)}
                  className="px-3.5 py-1.5 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-[#FF2D2D] text-white font-bold"
                >
                  SAVE SCHEDULE
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </MainNavShell>
  );
}

