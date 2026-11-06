"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  ArrowRight,
  Building2,
  Calendar,
  Layers,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Info,
  ChevronRight,
  X,
  FileText,
} from "lucide-react";
import { trackOnboardingEvent } from "@/lib/onboarding/analytics";
import { TARGET_FIELDS } from "@/lib/onboarding/fields";

export default function OnboardingPage() {
  const router = useRouter();

  // Step 1: Welcome | Step 2: Setup | Step 3: Connect | Step 4: Map | Step 5: Progress | Step 6: Complete
  const [step, setStep] = useState<number>(1);

  // Step 2 Setup State
  const [setupData, setSetupData] = useState({
    industry: "IT Services & SaaS",
    annual_revenue_range: "10-50Cr",
    currency: "INR",
    fy_start_month: "April",
    default_payment_terms: "Net 30",
    timezone: "Asia/Kolkata",
    country: "India",
  });

  // Step 3 Connector State
  const [connectorModal, setConnectorModal] = useState<"tally" | "zoho" | null>(null);
  const [tallyEndpoint, setTallyEndpoint] = useState("http://127.0.0.1:9000");
  const [connectorLoading, setConnectorLoading] = useState(false);
  const [connectorNotice, setConnectorNotice] = useState<string | null>(null);

  // Step 4 File & Mapping State
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<{
    headers: string[];
    rows: Record<string, unknown>[];
    filename: string;
    totalRows: number;
    suggestedMapping: Record<string, string>;
    isSavedMapping?: boolean;
    targetFields?: any[];
  } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Step 5 Progress State
  const [progressStage, setProgressStage] = useState<number>(1);

  // Step 6 Completion & Batch Results State
  const [batchResult, setBatchResult] = useState<any | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackOnboardingEvent("onboarding_welcome_viewed");

    const params = new URLSearchParams(window.location.search);
    if (params.get("status") === "zoho_connected") {
      setStep(3);
      setConnectorNotice("Zoho Books connected. Your secure OAuth connection is ready to sync.");
    } else if (params.get("error")) {
      setStep(3);
      setConnectorNotice("Zoho Books authorization was not completed. Please try again.");
    }
  }, []);

  const handleTallyConnect = async () => {
    setConnectorLoading(true);
    setConnectorNotice(null);

    try {
      const res = await fetch("/api/integrations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adapterType: "tally",
          customConfig: { tallyCloudUrl: tallyEndpoint.trim() },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to connect to Tally");

      trackOnboardingEvent("onboarding_connection_method_chosen", { method: "tally" });
      setConnectorNotice(
        `Tally connected. ${data.summary?.discovered || 0} records discovered and ${data.summary?.created || 0} new records synced.`
      );
    } catch (err: any) {
      setConnectorNotice(err?.message || "Unable to connect to Tally. Check the endpoint and Tally bridge.");
    } finally {
      setConnectorLoading(false);
    }
  };

  const handleZohoConnect = async () => {
    setConnectorLoading(true);
    setConnectorNotice(null);

    try {
      const res = await fetch("/api/integrations/zoho/auth?returnTo=%2Fonboarding");
      const data = await res.json();
      if (!res.ok || !data.authUrl) throw new Error(data.error || "Unable to start Zoho authorization");

      trackOnboardingEvent("onboarding_connection_method_chosen", { method: "zoho" });
      window.location.assign(data.authUrl);
    } catch (err: any) {
      setConnectorNotice(err?.message || "Unable to start Zoho authorization.");
      setConnectorLoading(false);
    }
  };

  // Step 2 Submission: Save Company Setup Parameters
  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupData),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save company setup");

      setStep(3);
    } catch (err: any) {
      setError(err?.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Step 3 File Selection Handlers
  const handleFileUpload = async (selectedFile: File) => {
    setError(null);
    setLoading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/onboarding/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to parse file");

      setFile(selectedFile);
      setParsedData(data);
      setColumnMapping(data.suggestedMapping || {});
      setStep(4);
    } catch (err: any) {
      setError(err?.message || "Error parsing file");
    } finally {
      setLoading(false);
    }
  };

  // Step 4 Mapping Confirmation & Execution of Fault-Tolerant Import
  const handleConfirmImport = async () => {
    if (!parsedData) return;
    setError(null);
    setStep(5);
    setProgressStage(1);

    try {
      const res = await fetch("/api/onboarding/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: parsedData.rows,
          columnMapping,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to execute data import");

      setProgressStage(4);
      setBatchResult(data.batchResult);
      setStep(6);
    } catch (err: any) {
      setError(err?.message || "Failed to import data");
      setStep(4);
    }
  };

  return (
    <div className="onboarding-page min-h-screen workstation-shell text-[#F3F4F6] flex flex-col justify-between p-4 sm:p-8 font-sans selection:bg-[#FF3B30]/30 selection:text-white">
      {/* Top Header Logo & Financial Workstation Badge */}
      <div className="onboarding-header max-w-7xl mx-auto w-full flex items-center justify-between py-4 border-b border-white/[0.08] mb-6">
        <Link href="/" className="flex items-center gap-3 group">
          <img src="/logo.png" alt="AIOSpark" className="h-10 w-10 rounded-xl object-contain" />
          <div className="flex flex-col">
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-white group-hover:text-[#FF3B30] transition-colors flex items-center gap-1.5">
              <span>AIOSPARK</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF3B30]" />
            </span>
            <span className="text-[9px] font-mono text-neutral-400 tracking-widest uppercase font-medium">
              ACTIVATION & INGESTION WIZARD
            </span>
          </div>
        </Link>

        {/* Step Timeline Pills */}
        <div className="hidden sm:flex items-center gap-2 font-mono text-xs">
          {[
            { id: 1, label: "Welcome" },
            { id: 2, label: "Setup" },
            { id: 3, label: "Connect Source" },
            { id: 4, label: "Map Columns" },
            { id: 5, label: "Ingest" },
            { id: 6, label: "Complete" },
          ].map((s) => (
            <div
              key={s.id}
              className={`px-3 py-1 rounded-full border text-[11px] transition-all flex items-center gap-1.5 ${
                step === s.id
                  ? "bg-[#FF3B30]/15 border-[#FF3B30] text-white font-bold shadow-[0_0_12px_rgba(255,59,48,0.2)]"
                  : step > s.id
                  ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-400 font-medium"
                  : "bg-[#12141A] border-white/[0.08] text-neutral-500"
              }`}
            >
              <span>{s.id}.</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="text-xs font-mono text-neutral-400 sm:hidden">
          Step <span className="text-[#FF3B30] font-bold">{step}</span> of 6
        </div>
      </div>

      {connectorNotice && !connectorModal && (
        <div className="onboarding-connector-return max-w-6xl mx-auto w-full mb-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-300">
          {connectorNotice}
        </div>
      )}

      {/* Main Split Content Area */}
      <div className="max-w-6xl mx-auto w-full my-4 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Vertical Stepper Timeline (Desktop) */}
        <div className="onboarding-stepper hidden lg:block lg:col-span-4 workstation-card p-6 space-y-6">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-[#FF3B30] uppercase tracking-widest font-bold block">
              Activation Funnel
            </span>
            <h3 className="text-lg font-bold text-white font-sans">Ingestion Workflow</h3>
            <p className="text-xs text-neutral-400">
              Configure parameters & map Excel headers into your tenant ledger context.
            </p>
          </div>

          <div className="space-y-4 font-mono text-xs">
            {[
              { id: 1, title: "1. Welcome & Scope", desc: "Workspace creation & activation checklist" },
              { id: 2, title: "2. Financial Parameters", desc: "Currency, FY start, & default payment terms" },
              { id: 3, title: "3. Choose Source", desc: "Tally, Zoho, or Excel/CSV ingestion" },
              { id: 4, title: "4. Column Mapping Matrix", desc: "Auto-detect & save header mappings" },
              { id: 5, title: "5. Real-Time Ingestion", desc: "Schema validation & exception parsing" },
              { id: 6, title: "6. Ledger Activation", desc: "Direct route to operational dashboard" },
            ].map((s) => (
              <div
                key={s.id}
                className={`onboarding-step p-3 rounded-xl border transition-all ${
                  step === s.id
                    ? "bg-[#181B23] border-[#FF3B30]/60 text-white shadow-md shadow-[#FF3B30]/10"
                    : step > s.id
                    ? "bg-[#12141A] border-emerald-500/30 text-emerald-400 opacity-90"
                    : "bg-[#0A0B0E]/60 border-white/[0.04] text-neutral-500"
                }`}
              >
                <div className="font-bold flex items-center justify-between">
                  <span>{s.title}</span>
                  {step > s.id && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                </div>
                <div className="text-[11px] text-neutral-400 font-sans mt-0.5">{s.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Active Step Workstation Card */}
        <div className="lg:col-span-8 w-full">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-red-950/60 border border-[#FF3B30]/60 text-red-200 text-xs flex items-center gap-2 font-mono shadow-lg shadow-red-950/40">
              <AlertTriangle className="w-4 h-4 text-[#FF3B30] shrink-0" />
              <span>{error}</span>
            </div>
          )}

        {/* STEP 1: WELCOME SCREEN */}
        {step === 1 && (
          <div className="onboarding-welcome bg-neutral-900 border border-neutral-800 rounded-3xl p-8 sm:p-12 text-center shadow-2xl relative overflow-hidden">
            <div className="onboarding-welcome-icon w-16 h-16 rounded-full bg-[#FF2D2D]/10 text-[#FF2D2D] border border-[#FF2D2D]/20 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="w-8 h-8" />
            </div>

            <h1 className="onboarding-welcome-title text-3xl sm:text-4xl font-bold text-white tracking-tight mb-4">
              Welcome to AIOSpark
            </h1>

            <p className="onboarding-welcome-copy text-base text-neutral-300 max-w-xl mx-auto mb-8 leading-relaxed">
              Your organization workspace has been created successfully. Let's configure your financial parameters and ingest your invoices so you can see real receivables intelligence in minutes.
            </p>

            <button
              onClick={() => setStep(2)}
              className="px-8 py-4 rounded-xl font-semibold text-base text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all cursor-pointer shadow-lg shadow-[#FF2D2D]/25 inline-flex items-center gap-2 active:scale-95"
            >
              <span>Get Started</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* STEP 2: COMPANY SETUP FORM */}
        {step === 2 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-5 h-5 text-[#FF2D2D]" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#FF2D2D] font-bold">
                Company Financial Setup
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
              Configure Financial Parameters
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mb-8">
              These settings explicitly drive aging calculations, DSO metrics, and currency formatting.
            </p>

            <form onSubmit={handleSetupSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Industry <span className="text-[#FF2D2D]">*</span>
                  </label>
                  <select
                    value={setupData.industry}
                    onChange={(e) => setSetupData({ ...setupData, industry: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer"
                  >
                    <option value="IT Services & SaaS">IT Services & SaaS</option>
                    <option value="Logistics & Supply Chain">Logistics & Supply Chain</option>
                    <option value="Manufacturing & Industrial">Manufacturing & Industrial</option>
                    <option value="Healthcare & Pharmaceuticals">Healthcare & Pharmaceuticals</option>
                    <option value="Retail & E-commerce">Retail & E-commerce</option>
                    <option value="Consulting & Professional Services">Consulting & Professional Services</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Annual Revenue Range <span className="text-[#FF2D2D]">*</span>
                  </label>
                  <select
                    value={setupData.annual_revenue_range}
                    onChange={(e) => setSetupData({ ...setupData, annual_revenue_range: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer font-mono"
                  >
                    <option value="< 1Cr">&lt; ₹1 Cr</option>
                    <option value="1-10Cr">₹1 Cr – ₹10 Cr</option>
                    <option value="10-50Cr">₹10 Cr – ₹50 Cr</option>
                    <option value="50-200Cr">₹50 Cr – ₹200 Cr</option>
                    <option value="200Cr+">₹200 Cr+</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Currency <span className="text-[#FF2D2D]">*</span>
                  </label>
                  <select
                    value={setupData.currency}
                    onChange={(e) => setSetupData({ ...setupData, currency: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer font-mono"
                  >
                    <option value="INR">INR (₹) — Indian Rupee</option>
                    <option value="USD">USD ($) — US Dollar</option>
                    <option value="EUR">EUR (€) — Euro</option>
                    <option value="GBP">GBP (£) — British Pound</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Financial Year Start Month <span className="text-[#FF2D2D]">*</span>
                  </label>
                  <select
                    value={setupData.fy_start_month}
                    onChange={(e) => setSetupData({ ...setupData, fy_start_month: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer font-sans"
                  >
                    <option value="April">April (Standard India FY)</option>
                    <option value="January">January (Calendar Year)</option>
                    <option value="October">October</option>
                    <option value="July">July</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Default Payment Terms <span className="text-[#FF2D2D]">*</span>
                  </label>
                  <select
                    value={setupData.default_payment_terms}
                    onChange={(e) => setSetupData({ ...setupData, default_payment_terms: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer font-mono"
                  >
                    <option value="Net 15">Net 15 Days</option>
                    <option value="Net 30">Net 30 Days</option>
                    <option value="Net 45">Net 45 Days</option>
                    <option value="Net 60">Net 60 Days</option>
                    <option value="Custom">Custom Terms</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Timezone
                  </label>
                  <select
                    value={setupData.timezone}
                    onChange={(e) => setSetupData({ ...setupData, timezone: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer font-mono text-xs"
                  >
                    <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                    Country
                  </label>
                  <select
                    value={setupData.country}
                    onChange={(e) => setSetupData({ ...setupData, country: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-[#050505] border border-neutral-800 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 focus:border-[#FF2D2D] transition-all cursor-pointer"
                  >
                    <option value="India">India</option>
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-800">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-xl font-semibold text-base text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all disabled:opacity-50 cursor-pointer shadow-lg shadow-[#FF2D2D]/25 flex items-center justify-center gap-2 active:scale-95"
                >
                  {loading ? (
                    <span>Saving Parameters...</span>
                  ) : (
                    <>
                      <span>Save & Continue to Ingestion</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* STEP 3: CONNECT FINANCIAL SYSTEM (3 Equal Prominence Options) */}
        {step === 3 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-5 h-5 text-[#FF2D2D]" />
              <span className="text-xs font-mono uppercase tracking-widest text-[#FF2D2D] font-bold">
                Connect Financial Data Source
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
              Choose Ingestion Method
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mb-8">
              Select how you want to load your B2B invoices and ledger data into AIOSpark.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Option 1: Tally */}
              <div
                onClick={() => setConnectorModal("tally")}
                className="p-6 rounded-2xl bg-[#050505] border border-neutral-800 hover:border-[#FF2D2D]/60 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
                    Tally
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">Tally ERP / Prime</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Sync directly with Tally vouchers, ledgers, and credit terms.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-neutral-900 flex items-center justify-between text-xs text-[#FF2D2D] font-semibold">
                  <span>Connect Tally</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>

              {/* Option 2: Zoho Books */}
              <div
                onClick={() => setConnectorModal("zoho")}
                className="p-6 rounded-2xl bg-[#050505] border border-neutral-800 hover:border-[#FF2D2D]/60 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-white font-bold text-lg mb-4 group-hover:scale-105 transition-transform">
                    Zoho
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">Zoho Books</h3>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    Automated OAuth API synchronization for Zoho invoices.
                  </p>
                </div>
                <div className="mt-6 pt-4 border-t border-neutral-900 flex items-center justify-between text-xs text-[#FF2D2D] font-semibold">
                  <span>Connect Zoho</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>

              {/* Option 3: Upload CSV / Excel (First-class functional path!) */}
              <div className="p-6 rounded-2xl bg-[#050505] border-2 border-[#FF2D2D]/60 shadow-xl shadow-[#FF2D2D]/10 flex flex-col justify-between">
                <div>
                  <div className="w-12 h-12 rounded-xl bg-[#FF2D2D]/10 border border-[#FF2D2D]/20 flex items-center justify-center text-[#FF2D2D] mb-4">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white mb-1">Upload CSV / Excel</h3>
                    <span className="px-2 py-0.5 rounded bg-[#FF2D2D]/20 text-[#FF2D2D] text-[10px] font-mono font-bold">
                      Ready Now
                    </span>
                  </div>
                  <p className="text-xs text-neutral-300 leading-relaxed mt-1">
                    Instant file upload for `.csv`, `.xlsx`, or `.xls` spreadsheet ledgers.
                  </p>
                </div>

                <div className="mt-6 pt-4 border-t border-neutral-900">
                  <label className="w-full py-3 rounded-xl font-semibold text-xs text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all cursor-pointer shadow-md shadow-[#FF2D2D]/20 flex items-center justify-center gap-2 active:scale-95">
                    <Upload className="w-4 h-4" />
                    <span>Select File to Ingest</span>
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: COLUMN MAPPING SCREEN */}
        {step === 4 && parsedData && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-10 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-6">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-[#FF2D2D]" />
                  <h2 className="text-xl sm:text-2xl font-bold text-white">
                    Confirm Column Mapping
                  </h2>
                </div>
                <p className="text-xs text-neutral-400 mt-1 font-mono">
                  File: <span className="text-white font-bold">{parsedData.filename}</span> ({parsedData.totalRows} records detected)
                </p>
              </div>

              <span className="px-3 py-1 rounded-full bg-neutral-800 text-xs font-mono text-neutral-300 border border-neutral-700">
                {parsedData.isSavedMapping ? "Loaded Saved Org Mapping" : "Auto-Suggested Mappings"}
              </span>
            </div>

            <div className="space-y-4 mb-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#050505] p-3 rounded-xl border border-neutral-800 text-xs font-mono font-bold text-neutral-400">
                <div>AIOSpark Target Field</div>
                <div>Uploaded File Column Header</div>
              </div>

              {(parsedData.targetFields || TARGET_FIELDS).map((field: any) => (
                <div key={field.key} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center p-3 rounded-xl bg-[#050505] border border-neutral-800">
                  <div className="flex items-center gap-2 text-xs font-medium text-neutral-200">
                    <span>{field.label}</span>
                    {field.required && <span className="text-[#FF2D2D] font-bold">*</span>}
                  </div>

                  <select
                    value={columnMapping[field.key] || ""}
                    onChange={(e) => setColumnMapping({ ...columnMapping, [field.key]: e.target.value })}
                    className="w-full px-3 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#FF2D2D]/50 cursor-pointer"
                  >
                    <option value="">-- Select Header --</option>
                    {parsedData.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-neutral-800 flex items-center justify-between">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold"
              >
                ← Back
              </button>

              <button
                onClick={handleConfirmImport}
                className="px-8 py-3.5 rounded-xl font-semibold text-sm text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-all cursor-pointer shadow-lg shadow-[#FF2D2D]/25 flex items-center gap-2 active:scale-95"
              >
                <span>Save Mapping & Ingest Data</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: REAL-TIME PROGRESS FEEDBACK */}
        {step === 5 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 sm:p-12 text-center shadow-2xl">
            <RefreshCw className="w-12 h-12 text-[#FF2D2D] animate-spin mx-auto mb-6" />

            <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight mb-2">
              Ingesting Receivables Data…
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 mb-8 font-mono">
              Processing {parsedData?.totalRows || 0} records into organization ledger context
            </p>

            <div className="max-w-md mx-auto space-y-3 text-xs font-mono text-left">
              <div className={`p-3 rounded-xl border flex items-center justify-between ${progressStage >= 1 ? "bg-[#050505] border-[#FF2D2D]/40 text-white" : "bg-neutral-950 border-neutral-800 text-neutral-500"}`}>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#FF2D2D]" /> 1. Uploading file buffer & headers…
                </span>
                <span>Done</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${progressStage >= 2 ? "bg-[#050505] border-[#FF2D2D]/40 text-white" : "bg-neutral-950 border-neutral-800 text-neutral-500"}`}>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#FF2D2D]" /> 2. Validating column schema & row data…
                </span>
                <span>{progressStage >= 2 ? "Verified" : "Pending"}</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${progressStage >= 3 ? "bg-[#050505] border-[#FF2D2D]/40 text-white" : "bg-neutral-950 border-neutral-800 text-neutral-500"}`}>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#FF2D2D]" /> 3. Ingesting invoices into tenant ledgers…
                </span>
                <span>{progressStage >= 3 ? "Complete" : "Pending"}</span>
              </div>

              <div className={`p-3 rounded-xl border flex items-center justify-between ${progressStage >= 4 ? "bg-[#050505] border-[#FF2D2D]/40 text-white" : "bg-neutral-950 border-neutral-800 text-neutral-500"}`}>
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#FF2D2D]" /> 4. Analyzing records & detecting exceptions…
                </span>
                <span>{progressStage >= 4 ? "Finished" : "Running"}</span>
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: COMPLETION SUMMARY */}
        {step === 6 && batchResult && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-8 sm:p-12 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h2 className="text-3xl font-bold text-white tracking-tight mb-2">
              Ingestion Completed Successfully
            </h2>

            <p className="text-sm sm:text-base text-neutral-200 max-w-xl mx-auto mb-6">
              <span className="font-bold text-white">{batchResult.successCount} invoices</span> imported successfully into your ledger.
              {batchResult.skippedCount > 0 && (
                <span className="text-amber-400 font-semibold block mt-1">
                  {batchResult.skippedCount} rows skipped due to missing or invalid fields.
                </span>
              )}
            </p>

            {batchResult.skippedCount > 0 && (
              <button
                onClick={() => setShowErrorModal(true)}
                className="mb-8 text-xs font-mono text-[#FF2D2D] hover:underline font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Info className="w-4 h-4" />
                <span>View Skipped-Row Error Details ({batchResult.skippedCount})</span>
              </button>
            )}

            <div className="pt-4 border-t border-[#27272a]">
              <button
                onClick={() => router.push("/dashboard")}
                className="px-8 py-4 rounded-xl font-semibold text-base text-white bg-[#FF3B30] hover:bg-[#e02424] transition-all cursor-pointer shadow-lg shadow-[#FF3B30]/25 inline-flex items-center gap-2 active:scale-95"
              >
                <span>Launch Dashboard with Real Data →</span>
              </button>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Tally / Zoho Connector Placeholder Modal */}
      {connectorModal && (
        <div
          className="onboarding-connector-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setConnectorModal(null)}
        >
          <div
            className="onboarding-connector-modal relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setConnectorModal(null)}
              className="onboarding-connector-close absolute top-5 right-5 text-neutral-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="onboarding-connector-icon w-12 h-12 rounded-2xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-white font-bold text-lg mx-auto mb-4">
              {connectorModal === "tally" ? "Tally" : "Zoho"}
            </div>

            <h3 className="onboarding-connector-title text-xl font-bold text-white mb-2">
              {connectorModal === "tally" ? "Tally ERP Connector" : "Zoho Books OAuth Connector"}
            </h3>

            {connectorModal === "tally" ? (
              <>
                <p className="onboarding-connector-copy text-xs text-neutral-300 mb-4 leading-relaxed">
                  Connect a running Tally HTTP server or your hosted Tally bridge. The onboarding sync will import customers, invoices, payments, and credit notes into AIOSpark.
                </p>
                <label className="block text-left text-[11px] font-mono text-neutral-400 mb-2">
                  TALLY HTTP ENDPOINT
                  <input
                    value={tallyEndpoint}
                    onChange={(e) => setTallyEndpoint(e.target.value)}
                    placeholder="http://127.0.0.1:9000"
                    className="mt-1 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none transition focus:border-[#FF2D2D]"
                  />
                </label>
                {connectorNotice && (
                  <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-left text-xs text-emerald-300">
                    {connectorNotice}
                  </p>
                )}
                <button
                  onClick={handleTallyConnect}
                  disabled={connectorLoading || !tallyEndpoint.trim()}
                  className="w-full py-3 rounded-xl font-semibold text-xs text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-colors disabled:opacity-50"
                >
                  {connectorLoading ? "Connecting to Tally..." : "Connect & Sync Tally →"}
                </button>
              </>
            ) : (
              <>
                <p className="onboarding-connector-copy text-xs text-neutral-300 mb-6 leading-relaxed">
                  Authorize AIOSpark with Zoho Books to import your customers, invoices, payments, and credit notes through the secure OAuth flow.
                </p>
                {connectorNotice && (
                  <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-left text-xs text-red-300">
                    {connectorNotice}
                  </p>
                )}
                <button
                  onClick={handleZohoConnect}
                  disabled={connectorLoading}
                  className="w-full py-3 rounded-xl font-semibold text-xs text-white bg-[#FF2D2D] hover:bg-[#e02424] transition-colors disabled:opacity-50"
                >
                  {connectorLoading ? "Opening Zoho Authorization..." : "Authorize Zoho Books →"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Skipped Row Error Inspector Modal */}
      {showErrorModal && batchResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setShowErrorModal(false)}
        >
          <div
            className="relative w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-left"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowErrorModal(false)}
              className="absolute top-5 right-5 text-neutral-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-white mb-1">
              Skipped Row Error Log ({batchResult.errors.length})
            </h3>
            <p className="text-xs text-neutral-400 mb-4 font-mono">
              The following rows contained missing or invalid formatting and were excluded without halting valid row ingestion.
            </p>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-2 font-mono text-xs">
              {batchResult.errors.map((err: any, idx: number) => (
                <div key={idx} className="p-3 rounded-xl bg-[#050505] border border-neutral-800 flex items-start justify-between">
                  <div>
                    <span className="text-[#FF2D2D] font-bold block">Excel Row #{err.rowNumber}</span>
                    <span className="text-neutral-300 text-[11px] font-sans">{err.reason}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-neutral-800 text-right">
              <button
                onClick={() => setShowErrorModal(false)}
                className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
