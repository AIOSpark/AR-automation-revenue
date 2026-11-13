// AIOSpark Phase 4 - Execution Store

import { isInWriteTransaction, withWriteTransaction } from '../db/durable-repository';
import {
  backfillOperationalFromSnapshots,
  clearExecutions,
  insertExecution,
  readExecutions,
  updateExecution,
} from '../db/operational-repository';
import { ExecutionRecord, ExecutionState } from './types';
import { AuditService } from '../audit/service';

export class ExecutionStore {
  private executions: Map<string, ExecutionRecord> = new Map();

  constructor() {
    backfillOperationalFromSnapshots();
    this.reloadFromDurableState();
  }

  private reloadFromDurableState(): void {
    backfillOperationalFromSnapshots();
    this.executions = new Map(
      (readExecutions() as ExecutionRecord[]).map((execution) => [execution.id, execution]),
    );
  }

  private refreshForRead(): void {
    if (!isInWriteTransaction()) this.reloadFromDurableState();
  }

  public create(record: Omit<ExecutionRecord, 'created_at' | 'updated_at'>): ExecutionRecord {
    return withWriteTransaction(() => {
      this.reloadFromDurableState();

      // Cross-process idempotency: if an execution with this key already exists
      // (committed by another process while we waited for the write lock),
      // return it instead of inserting a duplicate that would violate the
      // UNIQUE (organization_id, idempotency_key) constraint.
      if (record.idempotency_key) {
        const existing = this.getByIdempotencyKey(record.organization_id, record.idempotency_key);
        if (existing) {
          return existing;
        }
      }

      const now = new Date().toISOString();
      const fullRecord: ExecutionRecord = {
        ...record,
        created_at: now,
        updated_at: now,
      };
      insertExecution(fullRecord);
      this.executions.set(fullRecord.id, fullRecord);
      return fullRecord;
    });
  }

  public get(id: string): ExecutionRecord | null {
    this.refreshForRead();
    return this.executions.get(id) || null;
  }

  public getByIdempotencyKey(orgId: string, idempotencyKey: string): ExecutionRecord | null {
    this.refreshForRead();
    for (const exec of this.executions.values()) {
      if (exec.organization_id === orgId && exec.idempotency_key === idempotencyKey) {
        return exec;
      }
    }
    return null;
  }

  public getByApprovalRequestId(approvalRequestId: string): ExecutionRecord | null {
    this.refreshForRead();
    for (const exec of this.executions.values()) {
      if (exec.approval_request_id === approvalRequestId) {
        return exec;
      }
    }
    return null;
  }

  /** State transition, execution row and audit event commit or roll back together. The audit write deliberately joins this transaction. */
  public updateState(id: string, state: ExecutionState, updates: Partial<ExecutionRecord> = {}): ExecutionRecord {
    return withWriteTransaction(() => {
      this.reloadFromDurableState();
      const exec = this.executions.get(id);
      if (!exec) throw new Error(`Execution record not found: ${id}`);

      const now = new Date().toISOString();
      const updated: ExecutionRecord = {
        ...exec,
        ...updates,
        state,
        updated_at: now,
      };

      updateExecution(updated);
      this.executions.set(id, updated);

      AuditService.record({
        organization_id: exec.organization_id,
        actor_user_id: exec.approving_user_id || exec.requesting_user_id,
        actor_type: exec.approving_user_id ? 'user' : (exec.requesting_user_id ? 'user' : 'system'),
        action_type: `execution.state_changed_to_${state}`,
        subject_type: exec.target_entity_type,
        subject_id: exec.target_entity_ids[0] || exec.id,
        before_state: { state: exec.state },
        after_state: { state, ...updates },
        approval_context: exec.approval_request_id ? { approval_request_id: exec.approval_request_id } : null,
        result: state === 'verified' ? 'success' : (state.includes('failed') ? 'failure' : 'success'),
      });

      return updated;
    });
  }

  public getAll(orgId: string): ExecutionRecord[] {
    this.refreshForRead();
    const results: ExecutionRecord[] = [];
    for (const exec of this.executions.values()) {
      if (exec.organization_id === orgId) {
        results.push(exec);
      }
    }
    return results;
  }

  public clearAll(): void {
    withWriteTransaction(() => {
      clearExecutions();
      this.executions.clear();
    });
  }
}

export const executionStore = new ExecutionStore();
