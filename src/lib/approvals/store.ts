// AIOSpark Approval System Store & Types (Layer 18)
// Backs the Human Approval System with request management, append-only approval logs, and policy-mandated routing.

import { AuditService } from '../audit/service';
import { aiQualityStore } from '../observability/ai-quality';
import { isInWriteTransaction, withWriteTransaction } from '../db/durable-repository';
import {
  backfillGovernanceFromSnapshots,
  clearApprovalState,
  insertApprovalDecision,
  insertApprovalLog,
  insertApprovalRequest,
  readApprovalState,
  updateApprovalRequest,
  upsertAutonomyConfig,
} from '../db/governance-repository';

export type ApprovalActionType =
  | 'ALTER_INVOICE_VALUE'
  | 'ISSUE_CREDIT_NOTE'
  | 'RECORD_PAYMENT_MATCH'
  | 'SEND_CUSTOMER_COMMUNICATION'
  | 'MODIFY_ACCOUNTING_RECORD'
  | 'OTHER_HIGH_RISK';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ApprovalExecutionStatus = 'not_applicable' | 'pending' | 'succeeded' | 'failed';

export type ApprovalLogEventType = 'created' | 'approved' | 'rejected' | 'modified' | 'executed';

export interface ApprovalRequest {
  id: string;
  organization_id: string;
  subject_type: 'exception' | 'invoice' | 'customer' | 'payment' | string;
  subject_id: string;
  action_type: ApprovalActionType | string;
  proposed_action: Record<string, any>;
  evidence: any[]; // Copied from originating AIAnalysis
  confidence: number;
  proposed_by: string; // Agent name or "system"
  status: ApprovalStatus;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  modification?: Record<string, any> | null;
  rejection_reason?: string | null;
  execution_status?: ApprovalExecutionStatus;
  execution_error?: string | null;
  executed_at?: string | null;
  created_at: string;
}

export interface ApprovalLogEntry {
  id: string;
  approval_request_id: string;
  event_type: ApprovalLogEventType;
  actor_user_id?: string | null; // null for system events
  details: Record<string, any>;
  created_at: string;
}

export interface GraduatedAutonomyConfig {
  id: string;
  organization_id: string;
  action_type: string;
  auto_approve_enabled: boolean;
  min_confidence_threshold: number; // e.g. 0.95
}

/**
 * Raised when a competing process has already made a terminal decision.
 * Routes translate this to HTTP 409 rather than overwriting the decision.
 */
export class ApprovalConflictError extends Error {
  public readonly code = 'APPROVAL_DECISION_CONFLICT';

  constructor(id: string, status: ApprovalStatus) {
    super(`Approval request ${id} is already ${status}`);
    this.name = 'ApprovalConflictError';
  }
}

class ApprovalStore {
  private requests: Map<string, ApprovalRequest> = new Map();
  // APPEND-ONLY LOG: Array preserves append-only ordering
  private logs: ApprovalLogEntry[] = [];
  private autonomyConfigs: Map<string, GraduatedAutonomyConfig> = new Map();

  constructor() {
    backfillGovernanceFromSnapshots();
    this.reloadFromDurableState();
  }

  /**
   * Replace local caches with the latest committed snapshot. Called after the
   * database write lock is acquired, so a decision validates the current state.
   */
  private reloadFromDurableState(): void {
    backfillGovernanceFromSnapshots();
    const state = readApprovalState() as unknown as {
      requests: ApprovalRequest[];
      logs: ApprovalLogEntry[];
      autonomyConfigs: GraduatedAutonomyConfig[];
    };
    this.requests = new Map((state.requests || []).map((item) => [item.id, item]));
    this.logs = state.logs || [];
    this.autonomyConfigs = new Map((state.autonomyConfigs || []).map((item) => [item.id, item]));
  }

  private refreshForRead(): void {
    if (!isInWriteTransaction()) this.reloadFromDurableState();
  }

  /**
   * Run one mutation inside `BEGIN IMMEDIATE`, after reloading committed state.
   * On failure the cache is reloaded so a rolled-back decision is not visible.
   */
  private runMutation<T>(callback: () => T): T {
    try {
      return withWriteTransaction(() => {
        this.reloadFromDurableState();
        return callback();
      });
    } catch (error) {
      this.reloadFromDurableState();
      throw error;
    }
  }

  public createRequest(
    data: Omit<ApprovalRequest, 'id' | 'status' | 'created_at'>
  ): ApprovalRequest {
    return this.runMutation(() => {
    const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const req: ApprovalRequest = {
      ...data,
      id,
      status: 'pending',
      execution_status: 'not_applicable',
      created_at: now,
    };

    this.requests.set(id, req);

    // Write the request and its append-only creation log.
    const creationLog: ApprovalLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      approval_request_id: id,
      event_type: 'created',
      actor_user_id: null,
      details: { proposed_action: req.proposed_action, action_type: req.action_type },
      created_at: now,
    };
    insertApprovalRequest(req);
    this.appendLog(creationLog);
    insertApprovalLog(creationLog, req.organization_id);

    // Wire into Layer 26 Audit Log
    AuditService.record({
      organization_id: req.organization_id,
      actor_user_id: null,
      actor_type: req.proposed_by ? 'agent' : 'system',
      action_type: `approval_request.created`,
      subject_type: req.subject_type || 'approval',
      subject_id: req.subject_id || id,
      after_state: { status: 'pending', action_type: req.action_type, proposed_action: req.proposed_action },
      ai_context: req.evidence ? { evidence: req.evidence, confidence: req.confidence, agent_name: req.proposed_by } : null,
      approval_context: { approval_request_id: id, status: 'pending' },
      result: 'success',
    });

    return req;
    });
  }

  public getRequest(id: string): ApprovalRequest | null {
    this.refreshForRead();
    return this.requests.get(id) || null;
  }

  public getRequests(orgId: string, statusFilter?: ApprovalStatus): ApprovalRequest[] {
    this.refreshForRead();
    const orgReqs = Array.from(this.requests.values()).filter((r) => r.organization_id === orgId);
    if (statusFilter) {
      return orgReqs.filter((r) => r.status === statusFilter);
    }
    return orgReqs;
  }

  public findByIdempotencyKey(orgId: string, idempotencyKey: string): ApprovalRequest | null {
    this.refreshForRead();
    return Array.from(this.requests.values()).find(
      (request) => request.organization_id === orgId && request.proposed_action?.idempotency_key === idempotencyKey
    ) || null;
  }

  public approveRequest(id: string, reviewerUserId: string): ApprovalRequest {
    return this.runMutation(() => {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Approval request not found: ${id}`);
    if (req.status !== 'pending') throw new ApprovalConflictError(id, req.status);

    const now = new Date().toISOString();
    const beforeState = { status: req.status };
    req.status = 'approved';
    req.execution_status = 'pending';
    req.execution_error = null;
    req.executed_at = null;
    req.reviewed_by_user_id = reviewerUserId;
    req.reviewed_at = now;

    const decisionLog: ApprovalLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      approval_request_id: id,
      event_type: 'approved',
      actor_user_id: reviewerUserId,
      details: { action_type: req.action_type },
      created_at: now,
    };
    updateApprovalRequest(req);
    insertApprovalDecision(req);
    this.appendLog(decisionLog);
    insertApprovalLog(decisionLog, req.organization_id);

    // Wire into Layer 26 Audit Log
    AuditService.record({
      organization_id: req.organization_id,
      actor_user_id: reviewerUserId,
      actor_type: 'user',
      action_type: `${req.subject_type}.${req.action_type.toLowerCase()}.approved`,
      subject_type: req.subject_type,
      subject_id: req.subject_id,
      before_state: beforeState,
      after_state: { status: 'approved', action_type: req.action_type },
      ai_context: req.evidence ? { evidence: req.evidence, confidence: req.confidence, agent_name: req.proposed_by } : null,
      approval_context: { approval_request_id: id, status: 'approved', reviewer_id: reviewerUserId },
      result: 'success',
    });

    // Wire into Layer 29 Observability AI Quality Feedback Loop
    aiQualityStore.recordFromApprovalRequest(req, 'approved');

    return req;
    });
  }

  public rejectRequest(id: string, reviewerUserId: string, reason?: string): ApprovalRequest {
    return this.runMutation(() => {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Approval request not found: ${id}`);
    if (req.status !== 'pending') throw new ApprovalConflictError(id, req.status);

    const now = new Date().toISOString();
    const beforeState = { status: req.status };
    req.status = 'rejected';
    req.execution_status = 'not_applicable';
    req.execution_error = null;
    req.executed_at = null;
    req.reviewed_by_user_id = reviewerUserId;
    req.reviewed_at = now;
    req.rejection_reason = reason || null;

    const rejectionLog: ApprovalLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      approval_request_id: id,
      event_type: 'rejected',
      actor_user_id: reviewerUserId,
      details: { reason: req.rejection_reason },
      created_at: now,
    };
    updateApprovalRequest(req);
    insertApprovalDecision(req);
    this.appendLog(rejectionLog);
    insertApprovalLog(rejectionLog, req.organization_id);

    // Wire into Layer 26 Audit Log
    AuditService.record({
      organization_id: req.organization_id,
      actor_user_id: reviewerUserId,
      actor_type: 'user',
      action_type: `${req.subject_type}.${req.action_type.toLowerCase()}.rejected`,
      subject_type: req.subject_type,
      subject_id: req.subject_id,
      before_state: beforeState,
      after_state: { status: 'rejected', rejection_reason: reason },
      ai_context: req.evidence ? { evidence: req.evidence, confidence: req.confidence, agent_name: req.proposed_by } : null,
      approval_context: { approval_request_id: id, status: 'rejected', reviewer_id: reviewerUserId, reason },
      result: 'success',
    });

    // Wire into Layer 29 Observability AI Quality Feedback Loop
    aiQualityStore.recordFromApprovalRequest(req, 'rejected');

    return req;
    });
  }

  public modifyAndApproveRequest(
    id: string,
    reviewerUserId: string,
    modificationPayload: Record<string, any>
  ): ApprovalRequest {
    return this.runMutation(() => {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Approval request not found: ${id}`);
    if (req.status !== 'pending') throw new ApprovalConflictError(id, req.status);

    const now = new Date().toISOString();
    const beforeState = { status: req.status, proposed_action: req.proposed_action };
    req.status = 'approved';
    req.execution_status = 'pending';
    req.execution_error = null;
    req.executed_at = null;
    req.reviewed_by_user_id = reviewerUserId;
    req.reviewed_at = now;
    req.modification = modificationPayload;

    const modificationLog: ApprovalLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      approval_request_id: id,
      event_type: 'modified',
      actor_user_id: reviewerUserId,
      details: { original: req.proposed_action, modified: modificationPayload },
      created_at: now,
    };
    const modifiedApprovalLog: ApprovalLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      approval_request_id: id,
      event_type: 'approved',
      actor_user_id: reviewerUserId,
      details: { was_modified: true },
      created_at: now,
    };
    updateApprovalRequest(req);
    insertApprovalDecision(req);
    this.appendLog(modificationLog);
    this.appendLog(modifiedApprovalLog);
    insertApprovalLog(modificationLog, req.organization_id);
    insertApprovalLog(modifiedApprovalLog, req.organization_id);

    // Wire into Layer 26 Audit Log
    AuditService.record({
      organization_id: req.organization_id,
      actor_user_id: reviewerUserId,
      actor_type: 'user',
      action_type: `${req.subject_type}.${req.action_type.toLowerCase()}.modified_and_approved`,
      subject_type: req.subject_type,
      subject_id: req.subject_id,
      before_state: beforeState,
      after_state: { status: 'approved', modification: modificationPayload },
      ai_context: req.evidence ? { evidence: req.evidence, confidence: req.confidence, agent_name: req.proposed_by } : null,
      approval_context: { approval_request_id: id, status: 'approved', modification: modificationPayload, reviewer_id: reviewerUserId },
      result: 'success',
    });

    // Wire into Layer 29 Observability AI Quality Feedback Loop
    aiQualityStore.recordFromApprovalRequest(req, 'modified', modificationPayload);

    return req;
    });
  }

  public markExecutionResult(id: string, result: 'succeeded' | 'failed', error?: string): ApprovalRequest {
    return this.runMutation(() => {
    const req = this.requests.get(id);
    if (!req) throw new Error(`Approval request not found: ${id}`);
    if (req.status !== 'approved') throw new Error(`Approval request ${id} is not approved`);

    // Idempotent: if this execution result is already recorded, return early.
    // Repeated execution requests must be safe and must not create duplicate
    // financial effects or duplicate audit events.
    if (req.execution_status === result && req.executed_at !== null) {
      return req;
    }

    const now = new Date().toISOString();
    req.execution_status = result;
    req.execution_error = result === 'failed' ? (error || 'Approval execution failed') : null;
    req.executed_at = now;

    const executionLog: ApprovalLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      approval_request_id: id,
      event_type: 'executed',
      actor_user_id: req.reviewed_by_user_id || null,
      details: { result, error: req.execution_error },
      created_at: now,
    };
    updateApprovalRequest(req);
    this.appendLog(executionLog);
    insertApprovalLog(executionLog, req.organization_id);

    AuditService.record({
      organization_id: req.organization_id,
      actor_user_id: req.reviewed_by_user_id || null,
      actor_type: 'user',
      action_type: `approval_request.execution_${result}`,
      subject_type: req.subject_type,
      subject_id: req.subject_id,
      after_state: { status: req.status, execution_status: result, error: req.execution_error },
      approval_context: { approval_request_id: id, status: req.status, execution_status: result },
      result: result === 'succeeded' ? 'success' : 'failure',
    });

    return req;
    });
  }

  // --- APPEND-ONLY LOG GUARANTEE ---
  // Note: Only append is supported. Update and Delete methods DO NOT exist.
  private appendLog(entry: ApprovalLogEntry): void {
    this.logs.push(entry);
  }

  public getLogs(requestId?: string): ApprovalLogEntry[] {
    this.refreshForRead();
    if (requestId) {
      return this.logs.filter((l) => l.approval_request_id === requestId);
    }
    return [...this.logs];
  }

  // --- GRADUATED AUTONOMY CONFIG STORE ---
  public setAutonomyConfig(config: GraduatedAutonomyConfig): void {
    this.runMutation(() => {
      this.autonomyConfigs.set(config.id, config);
      upsertAutonomyConfig(config);
    });
  }

  public getAutonomyConfig(orgId: string, actionType: string): GraduatedAutonomyConfig | null {
    this.refreshForRead();
    const key = `${orgId}:${actionType}`;
    const cfg = Array.from(this.autonomyConfigs.values()).find(
      (c) => c.organization_id === orgId && c.action_type === actionType
    );
    if (cfg) return cfg;

    // Default configuration is ALWAYS disabled (auto_approve_enabled = false)
    return {
      id: `default_autonomy_${orgId}`,
      organization_id: orgId,
      action_type: actionType,
      auto_approve_enabled: false,
      min_confidence_threshold: 0.99,
    };
  }

  public clearAll(): void {
    clearApprovalState();
    this.requests.clear();
    this.logs = [];
    this.autonomyConfigs.clear();
  }
}

export const approvalStore = new ApprovalStore();
