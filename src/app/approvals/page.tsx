'use client';

import React, { useState, useEffect } from 'react';
import { MainNavShell } from '@/components/MainNavShell';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  ShieldCheck,
  Clock,
  Lock,
} from 'lucide-react';
import type { ApprovalRequest, ApprovalLogEntry } from '@/lib/approvals/store';
import { StructurallyEnforcedEvidenceDisplay } from '@/components/StructurallyEnforcedEvidenceDisplay';
import { SectionHeader } from '@/components/system/SectionHeader';
import { FinancialMetric } from '@/components/system/FinancialMetric';
import { StatusIndicator } from '@/components/system/StatusIndicator';

export default function ApprovalCenterPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [logs, setLogs] = useState<ApprovalLogEntry[]>([]);
  const [selectedReq, setSelectedReq] = useState<ApprovalRequest | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [role, setRole] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);

  // Form states for Reject & Modify modals
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  const [showModifyModal, setShowModifyModal] = useState<boolean>(false);
  const [modCategory, setModCategory] = useState<string>('');
  const [modActionText, setModActionText] = useState<string>('');

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/approvals');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
        setLogs(data.logs || []);
        if (data.requests && data.requests.length > 0 && !selectedReq) {
          setSelectedReq(data.requests[0]);
        }
      }

      // Resolve the authenticated user's actual organization role.
      // Do not let the client choose or modify its authoritative role.
      const membersRes = await fetch('/api/tenant/members');
      if (membersRes.ok) {
        const mData = await membersRes.json();
        setRole(mData.currentRole ?? null);
      }
    } catch (err) {
      console.error('Failed to fetch approvals:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleApprove = async (reqId: string) => {
    try {
      const res = await fetch(`/api/approvals/${reqId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', reviewerRole: role }),
      });
      if (res.ok) {
        await fetchApprovals();
      } else {
        const err = await res.json();
        alert(err.error || 'Approval failed');
      }
    } catch (err) {
      console.error('Approve failed:', err);
    }
  };

  const handleRejectSubmit = async () => {
    if (!selectedReq) return;
    try {
      const res = await fetch(`/api/approvals/${selectedReq.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reviewerRole: role, reason: rejectionReason }),
      });
      if (res.ok) {
        setShowRejectModal(false);
        setRejectionReason('');
        await fetchApprovals();
      } else {
        const err = await res.json();
        alert(err.error || 'Rejection failed');
      }
    } catch (err) {
      console.error('Reject failed:', err);
    }
  };

  const handleModifySubmit = async () => {
    if (!selectedReq) return;
    try {
      const res = await fetch(`/api/approvals/${selectedReq.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'modify',
          reviewerRole: role,
          modification: {
            category: modCategory || selectedReq.proposed_action?.type,
            recommended_action: modActionText || selectedReq.proposed_action?.action,
          },
        }),
      });
      if (res.ok) {
        setShowModifyModal(false);
        await fetchApprovals();
      } else {
        const err = await res.json();
        alert(err.error || 'Modification failed');
      }
    } catch (err) {
      console.error('Modify failed:', err);
    }
  };

  const openModifyModal = (req: ApprovalRequest) => {
    setSelectedReq(req);
    setModCategory(req.proposed_action?.type || '');
    setModActionText(req.proposed_action?.action || req.proposed_action?.recommended_action || '');
    setShowModifyModal(true);
  };

  const filteredRequests = requests.filter((r) => {
    if (filterType === 'pending') return r.status === 'pending';
    if (filterType === 'approved') return r.status === 'approved';
    if (filterType === 'rejected') return r.status === 'rejected';
    return true;
  });

  return (
    <MainNavShell currentRole={role}>
      <div className="approval-page p-[#18181b] space-y-6 font-sans text-zinc-200 min-h-screen bg-[#050505] max-w-7xl mx-auto">
        {/* EXECUTIVE HEADER */}
        <SectionHeader
          title="DECISION CONTROL ROOM"
          subtitle="Human-in-the-Loop policy gate & financial mutation approval queue"
          signal
          className="approval-header"
          action={
            <div className="approval-role flex items-center space-x-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 font-mono text-xs">
              <span className="text-zinc-400">ROLE:</span>
              <span className="text-zinc-100 font-bold">{role}</span>
            </div>
          }
        />

        {/* METRICS BAND */}
        <div className="approval-metrics grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
          <FinancialMetric
            label="PENDING APPROVALS"
            value={requests.filter((r) => r.status === 'pending').length}
            sublabel="Awaiting Review"
            statusColor="amber"
            statusText="WAITING"
          />
          <FinancialMetric
            label="APPROVED ACTIONS"
            value={requests.filter((r) => r.status === 'approved').length}
            sublabel="Mutated Ledger Actions"
            statusColor="emerald"
            statusText="VERIFIED"
          />
          <FinancialMetric
            label="REJECTED ACTIONS"
            value={requests.filter((r) => r.status === 'rejected').length}
            sublabel="Blocked Mutations"
            statusColor="red"
            statusText="CRITICAL"
          />
          <FinancialMetric
            label="POLICY ENGINE"
            value="ENFORCED"
            sublabel="Layer 18 Governance"
            statusColor="emerald"
            statusText="VERIFIED"
          />
        </div>

        {/* MAIN 2-COLUMN CONTROL WORKSPACE */}
        <div className="approval-workspace grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: APPROVAL QUEUE */}
          <div className="approval-queue lg:col-span-5 bg-[#09090b] border border-zinc-800 p-4 space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-zinc-100 uppercase">
                <Clock className="w-4 h-4 text-[#FF2D2D]" />
                <span>PENDING MUTATION QUEUE</span>
              </div>
              <span className="text-[10px] text-zinc-500">
                {requests.filter((r) => r.status === 'pending').length} ITEMS
              </span>
            </div>

            {/* TABS */}
            <div className="approval-tabs flex items-center space-x-1 bg-zinc-900 p-1 border border-zinc-800 text-xs">
              {['all', 'pending', 'approved', 'rejected'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterType(tab)}
                  className={`flex-1 py-1 uppercase text-[10px] transition ${
                    filterType === tab
                      ? 'bg-zinc-800 text-zinc-100 font-bold'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* QUEUE LIST */}
            {loading ? (
              <div className="py-8 text-center text-zinc-500 text-xs font-mono">Loading queue...</div>
            ) : filteredRequests.length === 0 ? (
              <div className="approval-empty py-12 px-5 text-center text-zinc-500 text-xs font-mono">
                <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-emerald-500" />
                <p className="font-semibold text-zinc-200">Queue is clear</p>
                <p className="mt-1 font-sans text-zinc-500">No approval items match this filter. New policy-gated actions will appear here for review.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[550px] overflow-y-auto pr-1">
                {filteredRequests.map((req) => {
                  const isSelected = selectedReq?.id === req.id;
                  return (
                    <div
                      key={req.id}
                      onClick={() => setSelectedReq(req)}
                      className={`p-3 border cursor-pointer transition ${
                        isSelected
                          ? 'bg-zinc-900 border-[#FF2D2D]'
                          : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[#FF2D2D] font-bold">{req.action_type}</span>
                        <StatusIndicator
                          status={
                            req.status === 'pending'
                              ? 'WAITING'
                              : req.status === 'approved'
                              ? 'VERIFIED'
                              : 'ACTIONABLE'
                          }
                        />
                      </div>
                      <p className="text-xs text-zinc-200 line-clamp-2 font-sans font-medium">
                        {req.proposed_action?.action || req.action_type}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-2">
                        <span>SUBJECT: {req.subject_type} / {req.subject_id}</span>
                        <span>{new Date(req.created_at).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: EVIDENCE & ACTION DECISION PANEL */}
          <div className="approval-detail lg:col-span-7 bg-[#09090b] border border-zinc-800 p-5 space-y-5">
            {selectedReq ? (
              <div className="space-y-5 font-mono">
                {/* PROPOSED ACTION CARD */}
                <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2 text-[10px] text-zinc-400">
                    <div>
                      <span>PROPOSED BY: {selectedReq.proposed_by.toUpperCase()}</span>
                      <span className="mx-2">•</span>
                      <span>CONFIDENCE: {(selectedReq.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <span>{selectedReq.id}</span>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">
                      ACTION: {selectedReq.action_type}
                    </h3>
                    <p className="text-xs text-zinc-300 mt-1 font-sans leading-relaxed">
                      {selectedReq.proposed_action?.action ||
                        selectedReq.proposed_action?.recommended_action ||
                        JSON.stringify(selectedReq.proposed_action)}
                    </p>
                  </div>

                  {selectedReq.modification && (
                    <div className="p-3 bg-blue-950/30 border border-blue-900/60 text-xs space-y-1">
                      <span className="text-blue-400 font-bold flex items-center gap-1">
                        <Edit3 className="w-3.5 h-3.5" /> HUMAN MODIFIED PAYLOAD:
                      </span>
                      <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap">
                        {JSON.stringify(selectedReq.modification, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedReq.rejection_reason && (
                    <div className="p-3 bg-red-950/30 border border-red-900/60 text-xs space-y-1">
                      <span className="text-red-400 font-bold">REJECTION REASON:</span>
                      <p className="text-zinc-300 font-sans">{selectedReq.rejection_reason}</p>
                    </div>
                  )}
                </div>

                {/* EVIDENCE DISPLAY */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-zinc-400 uppercase">
                    BACKING EVIDENCE & REASONING CONTEXT
                  </div>
                  <StructurallyEnforcedEvidenceDisplay
                    analysis={{
                      conclusion: selectedReq.proposed_action?.action || selectedReq.action_type,
                      category: selectedReq.proposed_action?.type || 'PROPOSED_ACTION',
                      confidence: selectedReq.confidence,
                      evidence: selectedReq.evidence || [],
                      source: selectedReq.proposed_by,
                      generatedAt: selectedReq.created_at,
                    }}
                  />
                </div>

                {/* ACTION BUTTONS */}
                {selectedReq.status === 'pending' ? (
                  <div className="flex items-center space-x-3 pt-3 border-t border-zinc-800">
                    <button
                      onClick={() => handleApprove(selectedReq.id)}
                      className="flex-1 py-2.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center space-x-2 transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>APPROVE ACTION</span>
                    </button>

                    <button
                      onClick={() => openModifyModal(selectedReq)}
                      className="flex-1 py-2.5 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-100 flex items-center justify-center space-x-2 transition"
                    >
                      <Edit3 className="w-4 h-4 text-amber-400" />
                      <span>MODIFY & APPROVE</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedReq(selectedReq);
                        setShowRejectModal(true);
                      }}
                      className="flex-1 py-2.5 text-xs font-bold bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 flex items-center justify-center space-x-2 transition"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>REJECT</span>
                    </button>
                  </div>
                ) : (
                  <div className="py-2.5 px-3 bg-zinc-900 border border-zinc-800 text-xs text-zinc-400 flex items-center justify-between">
                    <span>
                      STATUS: <strong className="text-zinc-100 capitalize">{selectedReq.status}</strong> BY {selectedReq.reviewed_by_user_id}
                    </span>
                    <span>REVIEWED: {selectedReq.reviewed_at ? new Date(selectedReq.reviewed_at).toLocaleTimeString() : 'N/A'}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="approval-detail-empty py-20 px-6 text-center text-zinc-500 text-xs font-mono">
                <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-[#FF3B30]" />
                <p className="font-semibold text-zinc-200">Decision workspace ready</p>
                <p className="mt-1 font-sans text-zinc-500">Select an item from the queue to review evidence, modify the proposal, or approve the action.</p>
              </div>
            )}
          </div>
        </div>

        {/* AUDIT TRAIL LOG */}
        <div className="approval-audit bg-[#09090b] border border-zinc-800 p-5 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-zinc-100 uppercase">
              <Lock className="w-4 h-4 text-amber-400" />
              <span>APPEND-ONLY APPROVAL AUDIT LOG (`approval_log`)</span>
            </div>
            <span className="text-[10px] text-zinc-500">IMMUTABLE LEDGER</span>
          </div>

          {logs.length === 0 ? (
            <div className="py-6 text-center text-zinc-500 text-xs">No log entries recorded yet.</div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto text-xs pr-1">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 bg-zinc-900 border border-zinc-800 flex items-center justify-between"
                >
                  <div>
                    <span className="text-zinc-100 font-bold">[{log.event_type.toUpperCase()}]</span>
                    <span className="text-zinc-400 ml-2">Req: {log.approval_request_id}</span>
                    <span className="text-zinc-500 ml-2">Actor: {log.actor_user_id || 'SYSTEM'}</span>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Details: {JSON.stringify(log.details)}
                    </p>
                  </div>
                  <span className="text-[10px] text-zinc-500">{new Date(log.created_at).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* REJECT MODAL */}
      {showRejectModal && selectedReq && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div role="dialog" aria-modal="true" aria-labelledby="reject-approval-title" className="workstation-dialog-panel rounded-2xl p-6 max-w-md w-full space-y-4 font-mono">
            <h3 id="reject-approval-title" className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-500" /> REJECT PROPOSED ACTION
            </h3>
            <p className="text-xs text-zinc-400 font-sans">
              Provide an optional rejection reason to record in the audit trail.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Disagree with proposed category adjustment..."
              className="w-full h-24 bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-100 focus:outline-none"
            />
            <div className="flex items-center justify-end space-x-3">
              <button
                onClick={() => setShowRejectModal(false)}
                className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-900 border border-zinc-800"
              >
                CANCEL
              </button>
              <button
                onClick={handleRejectSubmit}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500"
              >
                CONFIRM REJECTION
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODIFY MODAL */}
      {showModifyModal && selectedReq && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div role="dialog" aria-modal="true" aria-labelledby="modify-approval-title" className="workstation-dialog-panel rounded-2xl p-6 max-w-md w-full space-y-4 font-mono">
            <h3 id="modify-approval-title" className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-amber-400" /> MODIFY & APPROVE ACTION
            </h3>
            <p className="text-xs text-zinc-400 font-sans">
              Both original proposed values and your modifications will be saved to capture human correction data.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">TARGET CATEGORY / ACTION TYPE</label>
                <input
                  type="text"
                  value={modCategory}
                  onChange={(e) => setModCategory(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 p-2 text-zinc-100 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">ACTION DESCRIPTION / RECOMMENDATION</label>
                <textarea
                  value={modActionText}
                  onChange={(e) => setModActionText(e.target.value)}
                  className="w-full h-20 bg-zinc-900 border border-zinc-800 p-2 text-zinc-100 focus:outline-none font-sans"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowModifyModal(false)}
                className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-zinc-100 bg-zinc-900 border border-zinc-800"
              >
                CANCEL
              </button>
              <button
                onClick={handleModifySubmit}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-500"
              >
                SUBMIT MODIFIED APPROVAL
              </button>
            </div>
          </div>
        </div>
      )}
    </MainNavShell>
  );
}

