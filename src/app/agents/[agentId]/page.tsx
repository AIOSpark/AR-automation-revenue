'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import {
  Bot,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
  Clock,
  Shield,
  Zap,
  Activity,
  Layers,
  Database,
  Lock,
  XCircle,
  ExternalLink,
} from 'lucide-react';
import type { AgentDetailState } from '@/lib/agents/agent-registry';

export default function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const unwrappedParams = React.use(params);
  const agentId = unwrappedParams.agentId;
  const [detail, setDetail] = useState<AgentDetailState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'boundaries' | 'permissions' | 'activity'>('overview');
  const [role, setRole] = useState<string | undefined>(undefined);

  const fetchAgentDetail = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/agents/${agentId}`);
      if (res.ok) {
        const data = await res.json();
        setDetail(data);
      }
    } catch (err) {
      console.error(`Failed to fetch detail for agent ${agentId}:`, err);
    } finally {
      setLoading(false);
      // Resolve the authenticated user's actual organization role.
      try {
        const membersRes = await fetch('/api/tenant/members');
        if (membersRes.ok) {
          const mData = await membersRes.json();
          setRole(mData.currentRole ?? undefined);
        }
      } catch {
        // Role resolution failure - role stays null (fail closed)
      }
    }
  };

  const handleRunAgent = async () => {
    try {
      setRunning(true);
      const res = await fetch(`/api/agents/${agentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchAgentDetail();
      }
    } catch (err) {
      console.error(`Failed to execute trigger for agent ${agentId}:`, err);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchAgentDetail();
  }, [agentId]);

  if (loading) {
    return (
      <MainNavShell currentRole={role}>
        <div className="flex-1 p-8 text-center text-neutral-500 text-sm">
          Loading Agent Configuration & Security Detail...
        </div>
      </MainNavShell>
    );
  }

  if (!detail) {
    return (
      <MainNavShell currentRole={role}>
        <div className="flex-1 p-8 max-w-4xl mx-auto space-y-4">
          <Link href="/agents" className="text-xs text-[#FF2D2D] hover:underline flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Agent Control Center
          </Link>
          <div className="p-6 bg-red-950/20 border border-red-900 rounded-xl text-red-300 text-sm">
            Agent '{agentId}' not found in registry.
          </div>
        </div>
      </MainNavShell>
    );
  }

  const { metadata, recentLogs, pendingApprovals, stats } = detail;

  return (
    <MainNavShell currentRole="Owner">
      <div className="flex-1 p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full">
        {/* Back Link */}
        <div>
          <Link
            href="/agents"
            className="inline-flex items-center text-xs font-mono text-neutral-400 hover:text-white transition gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>BACK TO AGENT CONTROL CENTER</span>
          </Link>
        </div>

        {/* Agent Header Banner */}
        <div className="bg-neutral-900/80 border border-neutral-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono text-[#FF2D2D] bg-[#FF2D2D]/10 px-2 py-0.5 rounded border border-[#FF2D2D]/20">
                {metadata.role}
              </span>
              <span className="text-xs font-mono text-neutral-400">ID: {metadata.id}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded font-mono border ${
                  metadata.status === 'active'
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                    : 'bg-amber-950/60 text-amber-400 border-amber-800'
                }`}
              >
                {metadata.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <Bot className="w-7 h-7 text-[#FF2D2D]" />
              {metadata.name}
            </h1>

            <p className="text-sm text-neutral-300 max-w-3xl leading-relaxed">
              {metadata.purpose}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <Link
              href={metadata.targetModule}
              className="px-4 py-2.5 rounded-xl border border-neutral-800 bg-neutral-900 hover:bg-neutral-800 text-xs font-semibold text-white transition flex items-center justify-center gap-1.5"
            >
              <span>View Associated Workspace</span>
              <ExternalLink className="w-3.5 h-3.5 text-neutral-400" />
            </Link>

            <button
              onClick={handleRunAgent}
              disabled={running}
              className="px-4 py-2.5 rounded-xl bg-[#FF2D2D] hover:bg-[#FF2D2D]/90 text-xs font-semibold text-white transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
              <span>Trigger Scoped Execution</span>
            </button>
          </div>
        </div>

        {/* Stats Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs font-mono text-neutral-400">TOTAL EXECUTION RUNS</div>
            <div className="text-xl font-bold text-white mt-1">{stats.totalRuns}</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs font-mono text-neutral-400">SUCCESS RATE</div>
            <div className="text-xl font-bold text-emerald-400 mt-1">{stats.successRate}%</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs font-mono text-neutral-400">ACTIONS PROPOSED</div>
            <div className="text-xl font-bold text-amber-400 mt-1">{stats.actionsProposed}</div>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-4">
            <div className="text-xs font-mono text-neutral-400">LAST EXECUTED</div>
            <div className="text-xs font-mono text-neutral-300 mt-2 truncate">
              {stats.lastExecutedAt ? new Date(stats.lastExecutedAt).toLocaleTimeString() : 'Never'}
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-neutral-800 space-x-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 text-sm font-semibold transition border-b-2 ${
              activeTab === 'overview'
                ? 'border-[#FF2D2D] text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Overview & Triggers
          </button>
          <button
            onClick={() => setActiveTab('boundaries')}
            className={`pb-3 text-sm font-semibold transition border-b-2 ${
              activeTab === 'boundaries'
                ? 'border-[#FF2D2D] text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Capabilities & Boundaries (CAN vs CANNOT)
          </button>
          <button
            onClick={() => setActiveTab('permissions')}
            className={`pb-3 text-sm font-semibold transition border-b-2 ${
              activeTab === 'permissions'
                ? 'border-[#FF2D2D] text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Permissions & Data Sources
          </button>
          <button
            onClick={() => setActiveTab('activity')}
            className={`pb-3 text-sm font-semibold transition border-b-2 ${
              activeTab === 'activity'
                ? 'border-[#FF2D2D] text-white'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Execution Logs ({recentLogs.length})
          </button>
        </div>

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Zap className="w-4 h-4 text-[#FF2D2D]" />
                Event Action Triggers
              </h3>
              <div className="space-y-2">
                {metadata.actionTriggers.map((trig, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl text-xs font-mono text-neutral-300 flex items-center justify-between"
                  >
                    <span>{trig}</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800">
                      REGISTERED
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                Pending Approval Requests ({pendingApprovals.length})
              </h3>
              {pendingApprovals.length === 0 ? (
                <div className="py-6 text-center text-neutral-500 text-xs">
                  No pending approval requests generated by this agent.
                </div>
              ) : (
                <div className="space-y-2">
                  {pendingApprovals.map((appr) => (
                    <div
                      key={appr.id}
                      className="p-3 bg-amber-950/20 border border-amber-900/50 rounded-xl text-xs font-mono flex items-center justify-between"
                    >
                      <div>
                        <div className="text-amber-300 font-semibold">{appr.action_type}</div>
                        <div className="text-neutral-400 text-[11px] mt-0.5">Target: {appr.subject_id}</div>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] bg-amber-900/50 text-amber-300 border border-amber-700 rounded">
                        PENDING
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CAN VS CANNOT BOUNDARIES */}
        {activeTab === 'boundaries' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CAN LIST */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center space-x-2 border-b border-neutral-800 pb-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-semibold text-white">Allowed Capabilities (CAN)</h3>
              </div>
              <ul className="space-y-3">
                {metadata.capabilities.can.map((item, idx) => (
                  <li key={idx} className="flex items-start space-x-3 text-xs text-neutral-300 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CANNOT LIST */}
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4">
              <div className="flex items-center space-x-2 border-b border-neutral-800 pb-3">
                <XCircle className="w-5 h-5 text-red-400" />
                <h3 className="text-base font-semibold text-white">Strict Product Boundaries (CANNOT)</h3>
              </div>
              <ul className="space-y-3">
                {metadata.capabilities.cannot.map((item, idx) => (
                  <li key={idx} className="flex items-start space-x-3 text-xs text-neutral-300 leading-relaxed">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* TAB 3: PERMISSIONS & DATA SOURCES */}
        {activeTab === 'permissions' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                RBAC & Policy Matrix
              </h3>
              <div className="space-y-3 font-mono text-xs">
                <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex justify-between">
                  <span className="text-neutral-400">Required Role:</span>
                  <span className="text-white font-semibold">{metadata.permissions.roleRequired}</span>
                </div>
                <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex justify-between">
                  <span className="text-neutral-400">Requires Approval:</span>
                  <span className={metadata.permissions.requiresApproval ? 'text-amber-400' : 'text-emerald-400'}>
                    {metadata.permissions.requiresApproval ? 'YES (Layer 18 Mandatory Floor)' : 'NO (Read-Only Insights)'}
                  </span>
                </div>
                <div className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl flex justify-between">
                  <span className="text-neutral-400">Policy Floor:</span>
                  <span className="text-white">{metadata.permissions.approvalPolicy}</span>
                </div>
              </div>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-400" />
                Connected Data Sources
              </h3>
              <div className="space-y-2">
                {metadata.dataSources.map((ds, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-neutral-900/60 border border-neutral-800 rounded-xl text-xs font-mono text-neutral-300 flex items-center justify-between"
                  >
                    <span>{ds}</span>
                    <span className="text-[10px] text-blue-400 bg-blue-950/50 px-2 py-0.5 rounded border border-blue-800">
                      CONNECTED
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: ACTIVITY LOGS */}
        {activeTab === 'activity' && (
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              Recent Invocation Audit Logs
            </h3>

            {recentLogs.length === 0 ? (
              <div className="py-8 text-center text-neutral-500 text-xs">
                No recent executions logged for {metadata.name}.
              </div>
            ) : (
              <div className="space-y-2 font-mono text-xs">
                {recentLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-neutral-900/60 border border-neutral-800/80 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center space-x-3">
                      <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <div>
                        <span className="text-white font-semibold">{log.invocationId}</span>
                        <span className="text-neutral-500 ml-2">({new Date(log.timestamp).toLocaleTimeString()})</span>
                        <p className="text-[11px] text-neutral-400 mt-0.5">{log.resultSummary}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 text-[10px] rounded ${
                        log.status === 'success'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-red-950 text-red-400 border border-red-800'
                      }`}
                    >
                      {log.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </MainNavShell>
  );
}
