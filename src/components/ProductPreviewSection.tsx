"use client";

import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Sparkles,
  Filter,
  ShieldAlert,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export function ProductPreviewSection() {
  return (
    <section id="product" className="py-24 bg-[#0A0B0E] border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tight mb-3">
            Real-time Financial Telemetry Workstation <br />
            <span className="font-serif-editorial text-[#FF3B30] font-normal italic">
              Built for precision cash flow visibility.
            </span>
          </h2>
          <p className="text-neutral-400 text-sm sm:text-base">
            Unified view of receivables health, root-cause diagnostics, and actionable recovery opportunities.
          </p>
        </div>

        {/* Workspace Card Header Badge */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-[#12141A] border-t border-x border-white/[0.08] rounded-t-2xl text-xs font-mono text-neutral-400">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#FF3B30] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#FF3B30]"></span>
            </span>
            <span className="font-semibold text-white">LIVE FINANCIAL TELEMETRY WORKSPACE</span>
            <span className="text-neutral-400 hidden sm:inline">• ENTERPRISE LEDGER</span>
          </div>
          <Link href="/dashboard" className="px-3 py-1 rounded bg-[#FF3B30]/15 text-[#FF3B30] text-[11px] font-mono font-semibold border border-[#FF3B30]/30 hover:bg-[#FF3B30]/25 transition-all flex items-center gap-1">
            Launch Interactive Portal
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Dashboard Mockup Frame */}
        <div className="bg-[#12141A] border border-white/[0.08] rounded-b-2xl p-4 sm:p-6 shadow-2xl overflow-hidden">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-white/[0.1]" />
              <div className="w-3 h-3 rounded-full bg-white/[0.1]" />
              <div className="w-3 h-3 rounded-full bg-white/[0.1]" />
              <span className="text-xs font-mono text-neutral-400 ml-2">
                app.aiospark.com/workstation/telemetry-intelligence
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 rounded-lg bg-white/[0.04] text-xs text-neutral-300 flex items-center gap-1.5 border border-white/[0.08]">
                <Filter className="w-3.5 h-3.5 text-[#FF3B30]" />
                <span>Filter Entity: All India Operating Units</span>
              </button>
            </div>
          </div>

          {/* Core Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-6">
            {/* Metric 1 */}
            <div className="p-4 rounded-xl bg-[#0A0B0E] border border-white/[0.08]">
              <span className="text-xs font-medium text-neutral-400">Total Receivables</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1 font-mono-num">
                ₹4.85 Cr
              </div>
              <div className="flex items-center gap-1 text-xs text-neutral-400 mt-2 font-mono">
                <span>142 Active B2B Invoices</span>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="p-4 rounded-xl bg-[#0A0B0E] border border-white/[0.08]">
              <span className="text-xs font-medium text-neutral-400">Overdue Portfolio</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-1 font-mono-num">
                ₹1.24 Cr
              </div>
              <div className="flex items-center gap-1 text-xs text-amber-400 mt-2 font-mono">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span>25.5% past agreed terms</span>
              </div>
            </div>

            {/* Metric 3 */}
            <div className="p-4 rounded-xl bg-[#0A0B0E] border border-white/[0.08]">
              <span className="text-xs font-medium text-neutral-400">At Risk (Disputed)</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-rose-400 mt-1 font-mono-num">
                ₹68 L
              </div>
              <div className="flex items-center gap-1 text-xs text-rose-400 mt-2 font-mono">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span>18 High-priority accounts</span>
              </div>
            </div>

            {/* Metric 4 */}
            <div className="p-4 rounded-xl bg-[#181B23] border border-[#FF3B30]/40">
              <span className="text-xs font-bold text-[#FF3B30]">Cash Unblock Potential</span>
              <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1 font-mono-num">
                ₹52 L
              </div>
              <div className="flex items-center gap-1 text-xs text-[#FF3B30] mt-2 font-mono font-semibold">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Actionable Blocker Queue</span>
              </div>
            </div>
          </div>

          {/* Table Preview */}
          <div className="bg-[#0A0B0E] rounded-xl border border-white/[0.08] overflow-x-auto">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#FF3B30]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Detected Operational Blockers & Resolution Queue
                </h3>
              </div>
              <span className="text-xs text-neutral-400 font-mono">Telemetry Data Feed</span>
            </div>

            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-[#12141A] text-neutral-400 font-mono uppercase tracking-wider border-b border-white/[0.08]">
                <tr>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Billed Amount</th>
                  <th className="py-3 px-4">Detected Operational Blocker</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Recommended Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono">
                <tr>
                  <td className="py-3.5 px-4 font-semibold text-white font-sans">Apex Tech Logistics</td>
                  <td className="py-3.5 px-4 font-mono-num font-medium">₹18,00,000</td>
                  <td className="py-3.5 px-4 font-sans">
                    <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-medium text-[11px]">
                      PO Qty Mismatch (950 vs 1,000)
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-neutral-400 font-sans">Investigation Ready</td>
                  <td className="py-3.5 px-4 text-right font-sans">
                    <Link href="/receivables" className="px-3 py-1.5 rounded btn-editorial-primary font-semibold text-xs inline-block">
                      Review Quantity Line
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-semibold text-white font-sans">Global Nexus Retail</td>
                  <td className="py-3.5 px-4 font-mono-num font-medium">₹22,50,000</td>
                  <td className="py-3.5 px-4 font-sans">
                    <span className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium text-[11px]">
                      Missing Vendor Tax Portal Certificate
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-neutral-400 font-sans">Action Required</td>
                  <td className="py-3.5 px-4 text-right font-sans">
                    <Link href="/receivables" className="px-3 py-1.5 rounded bg-white/[0.06] text-white border border-white/[0.1] hover:bg-white/[0.1] font-semibold text-xs inline-block transition-colors">
                      Attach Form 16A / Tax Doc
                    </Link>
                  </td>
                </tr>
                <tr>
                  <td className="py-3.5 px-4 font-semibold text-white font-sans">Horizon Health Systems</td>
                  <td className="py-3.5 px-4 font-mono-num font-medium">₹11,50,000</td>
                  <td className="py-3.5 px-4 font-sans">
                    <span className="px-2.5 py-1 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium text-[11px]">
                      Multi-Tier Buyer Approval Stall
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-neutral-400 font-sans">Escalated</td>
                  <td className="py-3.5 px-4 text-right font-sans">
                    <Link href="/receivables" className="px-3 py-1.5 rounded bg-white/[0.06] text-white border border-white/[0.1] hover:bg-white/[0.1] font-semibold text-xs inline-block transition-colors">
                      Ping AP Controller
                    </Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
