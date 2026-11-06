// AIOSpark Phase 4 - Execution Store

import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';
import { ExecutionRecord, ExecutionState } from './types';
import { AuditService } from '../audit/service';

type ExecutionStateStore = {
  executions: ExecutionRecord[];
};

export class ExecutionStore {
  private executions: Map<string, ExecutionRecord> = new Map();

  constructor() {
    const state = readSnapshot<ExecutionStateStore>('executions');
    if (state && state.executions) {
      for (const exec of state.executions) {
        this.executions.set(exec.id, exec);
      }
    }
  }

  private persist(): void {
    writeSnapshot<ExecutionStateStore>('executions', {
      executions: Array.from(this.executions.values()),
    });
  }

  public create(record: Omit<ExecutionRecord, 'created_at' | 'updated_at'>): ExecutionRecord {
    const now = new Date().toISOString();
    const fullRecord: ExecutionRecord = {
      ...record,
      created_at: now,
      updated_at: now,
    };
    this.executions.set(fullRecord.id, fullRecord);
    this.persist();
    return fullRecord;
  }

  public get(id: string): ExecutionRecord | null {
    return this.executions.get(id) || null;
  }

  public getByIdempotencyKey(orgId: string, idempotencyKey: string): ExecutionRecord | null {
    for (const exec of this.executions.values()) {
      if (exec.organization_id === orgId && exec.idempotency_key === idempotencyKey) {
        return exec;
      }
    }
    return null;
  }

  public getByApprovalRequestId(approvalRequestId: string): ExecutionRecord | null {
    for (const exec of this.executions.values()) {
      if (exec.approval_request_id === approvalRequestId) {
        return exec;
      }
    }
    return null;
  }

  public updateState(id: string, state: ExecutionState, updates: Partial<ExecutionRecord> = {}): ExecutionRecord {
    const exec = this.executions.get(id);
    if (!exec) throw new Error(`Execution record not found: ${id}`);
    
    const now = new Date().toISOString();
    const updated: ExecutionRecord = {
      ...exec,
      ...updates,
      state,
      updated_at: now,
    };
    
    this.executions.set(id, updated);
    this.persist();
    
    // Audit the state change
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
  }

  public getAll(orgId: string): ExecutionRecord[] {
    const results: ExecutionRecord[] = [];
    for (const exec of this.executions.values()) {
      if (exec.organization_id === orgId) {
        results.push(exec);
      }
    }
    return results;
  }

  public clearAll(): void {
    this.executions.clear();
    deleteSnapshot('executions');
  }
}

export const executionStore = new ExecutionStore();
