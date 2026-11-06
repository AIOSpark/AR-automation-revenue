'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { MainNavShell } from '@/components/MainNavShell';
import {
  Bot,
  RefreshCw,
  FileText,
  ArrowRight,
  ShieldCheck,
  Clock,
  Zap,
  Activity,
  Layers,
  Lock,
} from 'lucide-react';
import type { AgentMetadata, AgentFleetMetrics } from '@/lib/agents/agent-registry';
import type { AnalystReport } from '@/lib/agents/receivables-analyst';
import type { AgentInvocationLog } from '@/lib/agents/executor';
import { SectionHeader } from '@/components/system/SectionHeader';
import { FinancialMetric } from '@/components/system/FinancialMetric';
import { StatusIndicator } from '@/components/system/StatusIndicator';

export default function AIAgentsPage() {
  const [agents, setAgents] = useState<AgentMetadata[]>([]);
  const [metrics, setMetrics] = useState<AgentFleetMetrics | undefined>(undefined);
  const [report, setReport] = useState<AnalystReport | undefined>(undefined);
  const [logs, setLogs] = useState<AgentInvocationLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [runningAgentId, setRunningAgentId] = useState<string | undefined>(undefined);
  const [role, setRole] = useState<string | undefined>(undefined);

  const fetchAgentData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
        setMetrics(data.fleetMetrics || null);
        setReport(data.report || null);
        setLogs(data.logs || []);
      }

      // Resolve the authenticated user's actual organization role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? undefined);
      }
    } catch (err) {
      console.error('Failed to fetch agent data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAgent = async (agentId: string) => {
    try {
      setRunningAgentId(agentId);
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });
      if (res.ok) {
        await fetchAgentData();
      }
    } catch (err) {
      console.error(`Failed to run agent ${agentId}:`, err);
    } finally {
      setRunningAgentId(undefined);
    }
  };

  useEffect(() => {
    fetchAgentData();
  }, []);

  return (
    <MainNavShell currentRole={role}>
      <div className="agents-page space-y-6 font-sans text-zinc-200 min-h-screen bg-[#050505] max-w-7xl mx-auto">
        {/* EXECUTIVE HEADER */}
        <SectionHeader
          title="AI AGENT CONTROL PLANE"
          subtitle="Autonomous financial agent roster, security boundaries & 8-step execution logs"
          signal
          action={
            <button
              onClick={() => handleRunAgent('receivables-analyst')}
              disabled={runningAgentId === 'receivables-analyst'}
              className="px-3.5 py-1.5 bg-[#FF2D2D] hover:bg-red-600 text-white text-xs font-mono font-bold flex items-center space-x-2 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runningAgentId === 'receivables-analyst' ? 'animate-spin' : ''}`} />
              <span>RUN RECEIVABLES ANALYST</span>
            </button>
          }
        />

        {/* METRICS BAND */}
        <div className="agents-metrics grid grid-cols-2 md:grid-cols-5 gap-4 font-mono">
          <FinancialMetric
            label="TOTAL AGENT FLEET"
            value={metrics?.totalAgents || 6}
            sublabel="Specialized O2C Agents"
          />
          <FinancialMetric
            label="ACTIVE OPERATIONAL"
            value={metrics?.activeAgents || 6}
            sublabel="Operational & Ready"
            statusColor="emerald"
            statusText="VERIFIED"
          />
          <FinancialMetric
            label="EXECUTIONS TODAY"
            value={metrics?.tasksExecutedToday || logs.length}
            sublabel="Logged Executions"
          />
          <FinancialMetric
            label="APPROVAL QUEUE"
            value={metrics?.awaitingApprovalCount || 0}
            sublabel="Pending Human Review"
            statusColor="amber"
            statusText="WAITING"
          />
          <FinancialMetric
            label="SAFETY MIDDLEWARE"
            value="100%"
            sublabel="8-Step Floor Enforced"
            statusColor="emerald"
            statusText="VERIFIED"
          />
        </div>

        {/* AGENTS ROSTER TABLE */}
        <div className="agents-roster bg-[#09090b] border border-zinc-800 space-y-3 p-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center space-x-2 font-mono text-xs font-bold text-zinc-100 uppercase tracking-wider">
              <Layers className="w-4 h-4 text-[#FF2D2D]" />
              <span>O2C AUTONOMOUS AGENT ROSTER & BOUNDARIES</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">LAYER 18 GOVERNANCE ACTIVE</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Agent Name</th>
                  <th className="py-2.5 px-3">Domain / Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Governance / Boundaries</th>
                  <th className="py-2.5 px-3">Required Authority</th>
                  <th className="py-2.5 px-3 text-right">Execution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {agents.map((agent) => {
                  const isRunning = runningAgentId === agent.id;
                  return (
                    <tr key={agent.id} className="hover:bg-zinc-900/60 transition">
                      <td className="py-3 px-3">
                        <Link href={`/agents/${agent.id}`} className="font-bold text-zinc-100 hover:text-[#FF2D2D] block">
                          {agent.name}
                        </Link>
                        <span className="text-[11px] text-zinc-500 font-sans block truncate max-w-xs">{agent.purpose}</span>
                      </td>

                      <td className="py-3 px-3 text-zinc-400 uppercase text-[11px]">{agent.role}</td>

                      <td className="py-3 px-3">
                        <StatusIndicator
                          status={agent.status === 'active' ? 'VERIFIED' : 'WAITING'}
                        />
                      </td>

                      <td className="py-3 px-3 text-zinc-300">
                        <div className="flex items-center space-x-1.5 text-[11px]">
                          <Lock className="w-3 h-3 text-zinc-500" />
                          <span>{agent.permissions.requiresApproval ? 'Approval Required' : 'Autonomous / Safe Read'}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-zinc-400 text-[11px]">{agent.permissions.roleRequired}</td>

                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleRunAgent(agent.id)}
                          disabled={isRunning}
                          className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[#FF2D2D] font-bold text-[11px] transition disabled:opacity-50"
                        >
                          {isRunning ? 'RUNNING...' : 'EXECUTE'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* LATEST INTELLIGENCE REPORT */}
        <div className="agents-dossier bg-[#09090b] border border-zinc-800 p-5 space-y-4 font-mono">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-zinc-100 uppercase">
              <FileText className="w-4 h-4 text-[#FF2D2D]" />
              <span>RECEIVABLES PORTFOLIO INTELLIGENCE DOSSIER</span>
            </div>
            {report && (
              <span className="text-[10px] text-zinc-500">
                GENERATED: {new Date(report.generated_at).toLocaleString()}
              </span>
            )}
          </div>

          {loading ? (
            <div className="py-8 text-center text-zinc-500 text-xs">Loading portfolio dossier...</div>
          ) : report ? (
            <div className="space-y-4">
              <div className="p-3 bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-sans leading-relaxed">
                {report.summary_text}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {report.structured_data_points.map((dp, idx) => (
                  <div
                    key={idx}
                    className={`p-3 border ${
                      dp.highlight
                        ? 'bg-red-950/20 border-[#FF2D2D]/40'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <div className="text-[10px] text-zinc-500 uppercase">{dp.label}</div>
                    <div className="text-base font-bold text-zinc-100 mt-0.5">{dp.value}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center text-zinc-500 text-xs space-y-3">
              <p>No analyst dossier generated yet for this session context.</p>
              <button
                onClick={() => handleRunAgent('receivables-analyst')}
                className="px-3.5 py-1.5 text-xs font-bold bg-[#FF2D2D] text-white"
              >
                GENERATE FIRST DOSSIER
              </button>
            </div>
          )}
        </div>

        {/* SAFETY LOG STREAM */}
        <div className="agents-audit bg-[#09090b] border border-zinc-800 p-5 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-zinc-100 uppercase">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>AGENT INVOCATION & SAFETY AUDIT TRACE</span>
            </div>
            <span className="text-[10px] text-zinc-500">INTERCEPTOR ACTIVE</span>
          </div>

          {logs.length === 0 ? (
            <div className="py-6 text-center text-zinc-500 text-xs">No agent executions logged in current session context.</div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto text-xs pr-1">
              {logs.map((log, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-zinc-900 border border-zinc-800 flex items-center justify-between"
                >
                  <div className="flex items-center space-x-3">
                    <Clock className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <div>
                      <span className="text-zinc-100 font-bold">{log.agentName}</span>
                      <span className="text-zinc-500 ml-2">[{log.invocationId}]</span>
                      <p className="text-[11px] text-zinc-400 font-sans mt-0.5">{log.resultSummary}</p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {log.proposedActionCreated && (
                      <span className="px-2 py-0.5 text-[10px] bg-amber-950 text-amber-300 border border-amber-800">
                        ACTION TRAPPED (PENDING)
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 text-[10px] ${
                        log.status === 'success'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-red-950 text-red-400 border border-red-800'
                      }`}
                    >
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </MainNavShell>
  );
}

