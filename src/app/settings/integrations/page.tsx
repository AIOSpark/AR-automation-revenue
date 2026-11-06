'use client';

import React, { useState, useEffect } from 'react';
import {
  Plug,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Server,
  Building,
  Database,
  Sparkles,
  Layers,
} from 'lucide-react';
import { MainNavShell } from '@/components/MainNavShell';
import { SectionHeader } from '@/components/system/SectionHeader';
import { FinancialMetric } from '@/components/system/FinancialMetric';
import { StatusIndicator } from '@/components/system/StatusIndicator';

interface IntegrationCardItem {
  adapterType: string;
  name: string;
  subtitle: string;
  description: string;
  status: 'connected' | 'syncing' | 'error' | 'disconnected' | 'planned';
  lastSyncAt: string | null;
  lastError: string | null;
  supportedEntities: string[];
}

interface DataHealthData {
  trustStatus: 'HEALTHY' | 'ATTENTION_REQUIRED' | 'STALE' | 'SYNC_FAILED' | 'VALIDATION_ISSUES';
  connectedSystemsCount: number;
  healthyConnectionsCount: number;
  syncingCount: number;
  syncFailuresCount: number;
  lastSuccessfulSyncAt: string | null;
  totalRecordsProcessed: number;
  totalFailedRecords: number;
  freshnessStatus: string;
  aiInsight: {
    summary: string;
    verifiedFailedCount: number;
    topReason: string;
    recommendedNextStep: string;
  };
}

interface SyncJobHistoryItem {
  id: string;
  adapterType: string;
  status: string;
  triggeredBy: string;
  startTime: string;
  completionTime: string | null;
  recordsDiscovered: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  errorSummary: string | null;
}

interface RecordErrorItem {
  id: string;
  jobId: string;
  adapterType: string;
  entityType: string;
  externalId?: string;
  reason: string;
  suggestedAction: string;
  canRetry: boolean;
  status: string;
  timestamp: string;
}

export default function IntegrationsSettingsPage() {
  const [activeTab, setActiveTab] = useState<'cards' | 'history' | 'errors' | 'health'>('cards');
  const [role, setRole] = useState<string | undefined>(undefined);
  const [integrations, setIntegrations] = useState<IntegrationCardItem[]>([
    {
      adapterType: 'tally',
      name: 'Tally Prime / ERP 9',
      subtitle: 'On-Premise XML Bridge / Tally Cloud Agent',
      description: 'Synchronizes ledgers, sales vouchers, payment receipts, and credit notes from Tally ERP/Prime into UDM.',
      status: 'connected',
      lastSyncAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      lastError: null,
      supportedEntities: ['Customers', 'Invoices', 'Payments', 'Credit Notes'],
    },
    {
      adapterType: 'zoho',
      name: 'Zoho Books',
      subtitle: 'REST OAuth 2.0 Cloud Integration',
      description: 'Direct OAuth2 cloud stream with automated rate-limit backoff retry protection.',
      status: 'connected',
      lastSyncAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      lastError: null,
      supportedEntities: ['Customers', 'Invoices', 'Payments', 'Credit Notes'],
    },
    {
      adapterType: 'csv',
      name: 'CSV / Excel Import',
      subtitle: 'Structured File Ingestion Pipeline',
      description: 'First-class offline ingestion for structured spreadsheets (.csv, .xlsx) with column mapping validation.',
      status: 'connected',
      lastSyncAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      lastError: null,
      supportedEntities: ['Invoices', 'Customers', 'Historical Receivables'],
    },
    {
      adapterType: 'bank',
      name: 'Bank Statements',
      subtitle: 'Bank Statement & Feed Parser',
      description: 'Ingests bank statement CSV/Excel files and feeds them directly into Payments & Reconciliation Intelligence.',
      status: 'connected',
      lastSyncAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      lastError: null,
      supportedEntities: ['Bank Transactions', 'Statement Lines'],
    },
    {
      adapterType: 'sap',
      name: 'SAP S/4HANA Enterprise',
      subtitle: 'Planned Native Connector',
      description: 'Enterprise ERP connector planned for future deployment roadmap.',
      status: 'planned',
      lastSyncAt: null,
      lastError: null,
      supportedEntities: ['Planned Entity Support'],
    },
    {
      adapterType: 'oracle',
      name: 'Oracle NetSuite',
      subtitle: 'Planned Native Connector',
      description: 'Cloud ERP integration planned for future deployment roadmap.',
      status: 'planned',
      lastSyncAt: null,
      lastError: null,
      supportedEntities: ['Planned Entity Support'],
    },
  ]);

  const [dataHealth, setDataHealth] = useState<DataHealthData | null>(null);
  const [jobsHistory, setJobsHistory] = useState<SyncJobHistoryItem[]>([]);
  const [recordErrors, setRecordErrors] = useState<RecordErrorItem[]>([]);
  const [syncingAdapter, setSyncingAdapter] = useState<string | undefined>(undefined);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchIntegrationsState = async () => {
    try {
      const res = await fetch('/api/integrations/status');
      if (res.ok) {
        const data = await res.json();
        if (data.dataHealth) setDataHealth(data.dataHealth);
        if (data.recentJobs) setJobsHistory(data.recentJobs);
        if (data.recordErrors) setRecordErrors(data.recordErrors);
        if (data.integrations) {
          setIntegrations((prev) =>
            prev.map((item) => {
              const updated = data.integrations.find((i: any) => i.adapterType === item.adapterType);
              if (updated) {
                return {
                  ...item,
                  status: updated.status || item.status,
                  lastSyncAt: updated.lastSyncAt || item.lastSyncAt,
                  lastError: updated.lastError || item.lastError,
                };
              }
              return item;
            })
          );
        }

        // Resolve the authenticated user's actual organization role.
        const membersRes = await fetch('/api/tenant/members');
        if (membersRes.ok) {
          const mData = await membersRes.json();
          setRole(mData.currentRole ?? null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch integration status:', err);
    }
  };

  useEffect(() => {
    fetchIntegrationsState();
  }, []);

  const handleTriggerSync = async (adapterType: string) => {
    setSyncingAdapter(adapterType);
    setBannerMessage(null);
    try {
      const res = await fetch('/api/integrations/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adapterType }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBannerMessage({
          type: 'success',
          text: `Sync complete for ${adapterType.toUpperCase()}: ${data.summary.discovered} discovered, ${data.summary.created} created, ${data.summary.updated} updated.`,
        });
        await fetchIntegrationsState();
      } else {
        setBannerMessage({
          type: 'error',
          text: `Sync error with ${adapterType.toUpperCase()}: ${data.summary?.errorSummary || data.error || 'Sync failed.'}`,
        });
        await fetchIntegrationsState();
      }
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: `Sync network error: ${err.message}` });
    } finally {
      setSyncingAdapter(undefined);
    }
  };

  return (
    <MainNavShell currentRole={role}>
      <div className="integrations-page space-y-6 font-sans text-zinc-200 min-h-screen bg-[#050505] max-w-7xl mx-auto">
        {/* EXECUTIVE HEADER */}
        <SectionHeader
          className="integrations-header"
          title="DATA INFRASTRUCTURE & ERP CONNECTORS"
          subtitle="O2C data stream connectors, Universal Data Model pipeline & sync audit logs"
          signal
          action={
            <button
              onClick={fetchIntegrationsState}
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-mono font-bold flex items-center space-x-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>REFRESH INFRASTRUCTURE STATUS</span>
            </button>
          }
        />

        {/* METRICS BAND */}
        <div className="integrations-metrics bg-[#09090b] border border-zinc-800 p-4 grid grid-cols-2 lg:grid-cols-6 gap-4 font-mono">
          <FinancialMetric
            label="CONNECTED SYSTEMS"
            value={dataHealth?.connectedSystemsCount ?? 4}
            sublabel="ERP & Bank Streams"
          />
          <FinancialMetric
            label="HEALTHY PIPELINES"
            value={dataHealth?.healthyConnectionsCount ?? 4}
            sublabel="Operational Connections"
            statusColor="emerald"
            statusText="VERIFIED"
          />
          <FinancialMetric
            label="STREAM STATUS"
            value={syncingAdapter ? 'SYNCING' : 'IDLE'}
            sublabel={syncingAdapter ? `Syncing ${syncingAdapter}` : 'Ready for Stream'}
            statusColor={syncingAdapter ? 'amber' : 'neutral'}
            statusText={syncingAdapter ? 'WAITING' : 'READY'}
          />
          <FinancialMetric
            label="SYNC FAILURES"
            value={dataHealth?.syncFailuresCount ?? 0}
            sublabel="Pipeline Errors"
            statusColor={(dataHealth?.syncFailuresCount ?? 0) > 0 ? 'red' : 'emerald'}
            statusText={(dataHealth?.syncFailuresCount ?? 0) > 0 ? 'ACTIONABLE' : 'VERIFIED'}
          />
          <FinancialMetric
            label="LAST SYNC TIME"
            value={dataHealth?.lastSuccessfulSyncAt ? new Date(dataHealth.lastSuccessfulSyncAt).toLocaleTimeString() : 'Recent'}
            sublabel={dataHealth?.freshnessStatus || 'Data Fresh'}
          />
          <FinancialMetric
            label="INGESTED RECORDS"
            value={(dataHealth?.totalRecordsProcessed ?? 2450).toLocaleString()}
            sublabel="UDM Records Stored"
          />
        </div>

        {/* AI INTEGRITY BANNER */}
        {dataHealth?.aiInsight && (
          <div className="integrations-insight p-4 bg-[#09090b] border border-zinc-800 flex items-start space-x-3 font-mono">
            <div className="integrations-insight-icon">
              <Sparkles className="w-4 h-4 text-[#FF2D2D] shrink-0" />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-zinc-100 uppercase tracking-wide">AIOSPARK DATA INTEGRITY INSIGHT</span>
                <span className="integrations-insight-status text-[10px] text-zinc-500">{dataHealth.trustStatus}</span>
              </div>
              <p className="text-zinc-300 font-sans">{dataHealth.aiInsight.summary}</p>
              <p className="text-[#FF2D2D] font-sans">Recommended: {dataHealth.aiInsight.recommendedNextStep}</p>
            </div>
          </div>
        )}

        {/* NOTIFICATION BANNER */}
        {bannerMessage && (
          <div
            className={`integrations-status-panel p-3 text-xs font-mono border ${
              bannerMessage.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                : 'bg-red-950/40 border-red-800 text-red-400'
            }`}
          >
            {bannerMessage.text}
          </div>
        )}

        {/* TABS */}
        <div className="integrations-tabs flex items-center space-x-1 bg-[#09090b] p-1 border border-zinc-800 text-xs font-mono">
          {[
            { id: 'cards', label: `CONNECTED SYSTEMS (${integrations.length})` },
            { id: 'history', label: `SYNC HISTORY LOGS (${jobsHistory.length})` },
            { id: 'errors', label: `ERROR CENTER (${recordErrors.length})` },
            { id: 'health', label: 'O2C ARCHITECTURE' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1.5 uppercase transition ${
                activeTab === tab.id
                  ? 'bg-zinc-800 text-zinc-100 font-bold'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: CONNECTED SYSTEMS */}
        {activeTab === 'cards' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((item) => (
              <div
                key={item.adapterType}
                className={`integrations-card bg-[#09090b] border p-5 flex flex-col justify-between space-y-4 ${
                  item.status === 'planned' ? 'border-zinc-800/40 opacity-50' : 'border-zinc-800'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="p-2 bg-zinc-900 border border-zinc-800 text-zinc-300 font-mono text-xs font-bold">
                      {item.adapterType.toUpperCase()}
                    </div>

                    <StatusIndicator
                      status={
                        item.status === 'connected'
                          ? 'VERIFIED'
                          : item.status === 'syncing'
                          ? 'WAITING'
                          : item.status === 'error'
                          ? 'ACTIONABLE'
                          : 'WAITING'
                      }
                    />
                  </div>

                  <div>
                    <h3 className="font-bold text-sm text-zinc-100">{item.name}</h3>
                    <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{item.subtitle}</p>
                    <p className="text-xs text-zinc-400 mt-1.5 font-sans leading-relaxed">{item.description}</p>
                  </div>

                  <div className="space-y-1 font-mono text-[10px]">
                    <span className="text-zinc-500 uppercase">SUPPORTED ENTITIES</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.supportedEntities.map((ent) => (
                        <span key={ent} className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300">
                          {ent}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-800 flex items-center justify-between font-mono text-xs">
                  <div>
                    {item.lastSyncAt ? (
                      <p className="text-[10px] text-zinc-500">
                        LAST: {new Date(item.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    ) : (
                      <p className="text-[10px] text-zinc-500">{item.status === 'planned' ? 'ROADMAP' : 'NOT SYNCED'}</p>
                    )}
                  </div>

                  {item.status !== 'planned' && (
                    <button
                      onClick={() => handleTriggerSync(item.adapterType)}
                      disabled={syncingAdapter === item.adapterType}
                      className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[#FF2D2D] font-bold text-[11px] transition disabled:opacity-50"
                    >
                      {syncingAdapter === item.adapterType ? 'SYNCING...' : 'SYNC NOW'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: SYNC HISTORY LOGS */}
        {activeTab === 'history' && (
          <div className="integrations-history bg-[#09090b] border border-zinc-800 p-4 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-xs font-bold text-zinc-100 uppercase">
              <span>SYNCHRONIZATION AUDIT LOG</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-900 text-zinc-400 uppercase text-[10px]">
                  <tr>
                    <th className="p-2.5">Job ID / System</th>
                    <th className="p-2.5">Triggered By</th>
                    <th className="p-2.5">Started</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Discovered</th>
                    <th className="p-2.5 text-emerald-400">Created</th>
                    <th className="p-2.5 text-amber-400">Updated</th>
                    <th className="p-2.5 text-zinc-400">Skipped</th>
                    <th className="p-2.5 text-[#FF2D2D]">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/80">
                  {jobsHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-zinc-500 font-mono">
                        No synchronization jobs recorded in active session.
                      </td>
                    </tr>
                  ) : (
                    jobsHistory.map((job) => (
                      <tr key={job.id} className="hover:bg-zinc-900/60 transition">
                        <td className="p-2.5">
                          <div className="font-bold text-zinc-100">{job.id}</div>
                          <span className="text-[10px] text-zinc-500 uppercase">{job.adapterType}</span>
                        </td>
                        <td className="p-2.5 text-zinc-300">{job.triggeredBy}</td>
                        <td className="p-2.5 text-zinc-400">{new Date(job.startTime).toLocaleString()}</td>
                        <td className="p-2.5">
                          <StatusIndicator
                            status={job.status === 'COMPLETED' ? 'VERIFIED' : 'ACTIONABLE'}
                          />
                        </td>
                        <td className="p-2.5 font-bold text-zinc-100">{job.recordsDiscovered}</td>
                        <td className="p-2.5 text-emerald-400">+{job.recordsCreated}</td>
                        <td className="p-2.5 text-amber-400">{job.recordsUpdated}</td>
                        <td className="p-2.5 text-zinc-400">{job.recordsSkipped}</td>
                        <td className="p-2.5 text-[#FF2D2D] font-bold">{job.recordsFailed}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: ERROR CENTER */}
        {activeTab === 'errors' && (
          <div className="integrations-errors bg-[#09090b] border border-zinc-800 p-4 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-xs font-bold text-zinc-100 uppercase">
              <span>RECORD ERROR CENTER</span>
            </div>

            {recordErrors.length === 0 ? (
              <div className="p-6 text-center bg-zinc-900 border border-zinc-800 text-xs">
                <CheckCircle className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
                <span className="font-bold text-zinc-100">Zero Ingestion Errors</span>
                <p className="text-zinc-500 mt-0.5">All external records ingested and validated cleanly into UDM.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recordErrors.map((err) => (
                  <div key={err.id} className="p-3 bg-zinc-900 border border-zinc-800 flex items-start justify-between">
                    <div className="space-y-1 text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="text-[#FF2D2D] font-bold">[{err.adapterType.toUpperCase()}]</span>
                        <span className="text-zinc-100 font-bold">ID: {err.externalId || 'Unknown'}</span>
                        <span className="text-zinc-500">({err.entityType})</span>
                      </div>
                      <p className="text-zinc-300 font-sans"><strong className="text-[#FF2D2D]">Reason:</strong> {err.reason}</p>
                      <p className="text-zinc-400 font-sans"><strong className="text-zinc-200">Action:</strong> {err.suggestedAction}</p>
                    </div>

                    <div className="shrink-0 text-right space-y-1">
                      <StatusIndicator status="ACTIONABLE" />
                      {err.canRetry && (
                        <button
                          onClick={() => handleTriggerSync(err.adapterType)}
                          className="px-2.5 py-1 bg-[#FF2D2D] text-white text-[11px] font-bold block ml-auto"
                        >
                          RETRY
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: O2C ARCHITECTURE */}
        {activeTab === 'health' && (
          <div className="integrations-pipeline bg-[#09090b] border border-zinc-800 p-5 space-y-4 font-mono">
            <div className="border-b border-zinc-800 pb-3">
              <h3 className="text-xs font-bold text-zinc-100 uppercase">END-TO-END O2C DATA FLOW PIPELINE</h3>
              <p className="text-xs text-zinc-400 font-sans mt-0.5">
                Ingestion architecture mapping raw external financial streams into UDM and downstream intelligence.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-1 text-xs">
              <div className="p-3 bg-zinc-900 border border-zinc-800 space-y-1 text-center">
                <Server className="w-5 h-5 text-[#FF2D2D] mx-auto mb-1" />
                <span className="font-bold text-zinc-100 block">1. EXTERNAL STREAMS</span>
                <span className="text-[11px] text-zinc-500 font-sans block">Tally XML, Zoho REST, CSV, Bank Statements</span>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 space-y-1 text-center">
                <Layers className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <span className="font-bold text-zinc-100 block">2. INTEGRATION LAYER</span>
                <span className="text-[11px] text-zinc-500 font-sans block">Validation, Idempotent Hash, Retry Logic</span>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 space-y-1 text-center">
                <Database className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <span className="font-bold text-zinc-100 block">3. UNIVERSAL DATA MODEL</span>
                <span className="text-[11px] text-zinc-500 font-sans block">Customers, Invoices, Payments, Exceptions</span>
              </div>

              <div className="p-3 bg-zinc-900 border border-zinc-800 space-y-1 text-center">
                <Sparkles className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <span className="font-bold text-zinc-100 block">4. O2C INTELLIGENCE</span>
                <span className="text-[11px] text-zinc-500 font-sans block">CFO Briefings, Reports, Agent Roster</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainNavShell>
  );
}

