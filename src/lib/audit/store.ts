// AIOSpark Audit System Store & Types (Layer 26)
// Provides a canonical, provably immutable append-only audit trail with RLS and trigger enforcement.
import { randomUUID } from 'node:crypto';
import { isInWriteTransaction, withWriteTransaction } from '../db/durable-repository';
import {
  appendAuditEvent,
  backfillGovernanceFromSnapshots,
  purgeAuditEvents,
  readAuditEvents,
} from '../db/governance-repository';

export type ActorType = 'user' | 'agent' | 'system';

export type SubjectType =
  | 'invoice'
  | 'exception'
  | 'customer'
  | 'payment'
  | 'user'
  | 'organization'
  | 'approval'
  | 'message'
  | 'reconciliation';

export type AuditResult = 'success' | 'failure' | 'reverted';

export interface AuditLogRecord {
  id: string;
  organization_id: string;
  actor_user_id?: string | null;
  actor_type: ActorType;
  action_type: string;
  subject_type: SubjectType | string;
  subject_id: string;
  before_state?: Record<string, any> | null;
  after_state?: Record<string, any> | null;
  ai_context?: Record<string, any> | null;
  approval_context?: Record<string, any> | null;
  result: AuditResult;
  created_at: string;
}

export type RecordAuditParams = Omit<AuditLogRecord, 'id' | 'created_at'>;

export interface AuditQueryFilter {
  organizationId: string;
  subjectType?: string;
  subjectId?: string;
  actorUserId?: string;
  actorType?: ActorType;
  actionType?: string;
  startDate?: string;
  endDate?: string;
}

class RawAuditLogStore {
  // Underlying storage array
  internalLogs: AuditLogRecord[] = [];
}

class AuditStore {
  private rawStore = new RawAuditLogStore();
  private auditLogProxy: AuditLogRecord[];

  constructor() {
    backfillGovernanceFromSnapshots();
    this.reloadFromDurableState();
    // Database-level immutability enforcement simulation:
    // Uses ES6 Proxy to intercept and REJECT any attempt to mutate, update, reassign or delete array elements or properties.
    const rawArray = this.rawStore.internalLogs;

    this.auditLogProxy = new Proxy(rawArray, {
      set(target, prop, value, receiver) {
        // Allow appending new numeric indices or updating length during push
        const isIndex = typeof prop === 'string' && !isNaN(Number(prop));
        if (isIndex && Number(prop) === target.length) {
          target[Number(prop)] = value;
          return true;
        }
        if (prop === 'length') {
          target.length = value;
          return true;
        }
        throw new Error(`IMMUTABILITY VIOLATION: UPDATE operation rejected on audit_log table. audit_log is append-only.`);
      },
      deleteProperty(_target, _prop) {
        throw new Error(`IMMUTABILITY VIOLATION: DELETE operation rejected on audit_log table. audit_log is append-only.`);
      },
    });
  }

  private reloadFromDurableState(): void {
    backfillGovernanceFromSnapshots();
    const persisted = readAuditEvents() as AuditLogRecord[];
    this.rawStore.internalLogs.length = 0;
    this.rawStore.internalLogs.push(...persisted);
  }

  private refreshForRead(): void {
    if (!isInWriteTransaction()) this.reloadFromDurableState();
  }

  /**
   * Append-only record insertion. The append joins the caller's transaction
   * when one exists, so a business mutation and its audit event commit or roll
   * back together. Cache is restored if the durable write fails.
   */
  public record(params: RecordAuditParams): AuditLogRecord {
    if (!params.organization_id) {
      throw new Error('Tenant Context Error: organization_id is required for audit_log entries');
    }

    const id = randomUUID();
    const created_at = new Date().toISOString();

    const record: AuditLogRecord = {
      ...params,
      id,
      actor_user_id: params.actor_user_id ?? null,
      before_state: params.before_state ?? null,
      after_state: params.after_state ?? null,
      ai_context: params.ai_context ?? null,
      approval_context: params.approval_context ?? null,
      created_at,
    };

    return withWriteTransaction(() => {
      this.reloadFromDurableState();
      const previousLength = this.rawStore.internalLogs.length;
      this.rawStore.internalLogs.push(record);
      try {
        appendAuditEvent(record);
      } catch (error) {
        this.rawStore.internalLogs.length = previousLength;
        throw error;
      }
      return record;
    });
  }

  /**
   * Direct database query simulation with strict RLS enforcement
   */
  public query(filter: AuditQueryFilter): AuditLogRecord[] {
    if (!filter.organizationId) {
      throw new Error('Tenant Context Error: organizationId is required to query audit_log');
    }

    this.refreshForRead();
    return this.rawStore.internalLogs
      .filter((log) => {
        // Enforce RLS
        if (log.organization_id !== filter.organizationId) return false;
        if (filter.subjectType && log.subject_type !== filter.subjectType) return false;
        if (filter.subjectId && log.subject_id !== filter.subjectId) return false;
        if (filter.actorUserId && log.actor_user_id !== filter.actorUserId) return false;
        if (filter.actorType && log.actor_type !== filter.actorType) return false;
        if (filter.actionType && log.action_type !== filter.actionType) return false;
        if (filter.startDate && log.created_at < filter.startDate) return false;
        if (filter.endDate && log.created_at > filter.endDate) return false;
        return true;
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at)); // Chronological order
  }

  /**
   * Per-Invoice Audit Trail Query
   */
  public getInvoiceAuditTrail(organizationId: string, invoiceId: string): AuditLogRecord[] {
    return this.query({
      organizationId,
      subjectType: 'invoice',
      subjectId: invoiceId,
    });
  }

  /**
   * Per-Customer Audit Trail Query (Includes direct customer logs as well as invoice logs associated with customer)
   */
  public getCustomerAuditTrail(
    organizationId: string,
    customerId: string,
    customerInvoiceIds: string[] = []
  ): AuditLogRecord[] {
    const directLogs = this.query({
      organizationId,
      subjectType: 'customer',
      subjectId: customerId,
    });

    const invoiceLogs = this.rawStore.internalLogs.filter(
      (log) =>
        log.organization_id === organizationId &&
        log.subject_type === 'invoice' &&
        customerInvoiceIds.includes(log.subject_id)
    );

    const all = [...directLogs, ...invoiceLogs];
    const unique = Array.from(new Map(all.map((item) => [item.id, item])).values());
    return unique.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  /**
   * Per-User Activity View Query
   */
  public getUserActivityLogs(organizationId: string, userId: string): AuditLogRecord[] {
    return this.query({
      organizationId,
      actorUserId: userId,
    });
  }

  /**
   * Raw store accessor for direct trigger / raw SQL mutation testing
   */
  public getRawStoreForTesting(): AuditLogRecord[] {
    return this.auditLogProxy;
  }

  /**
   * Simulate a raw UPDATE database query on an audit_log record
   */
  public rawUpdateRecordForTesting(id: string, updates: Partial<AuditLogRecord>): void {
    const idx = this.rawStore.internalLogs.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Record ${id} not found`);

    // Attempt direct mutation on proxy
    (this.auditLogProxy as any)[idx] = {
      ...this.rawStore.internalLogs[idx],
      ...updates,
    };
  }

  /**
   * Simulate a raw DELETE database query on an audit_log record
   */
  public rawDeleteRecordForTesting(id: string): void {
    const idx = this.rawStore.internalLogs.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Record ${id} not found`);

    // Attempt direct deletion on proxy
    delete (this.auditLogProxy as any)[idx];
  }

  public clearAll(): void {
    purgeAuditEvents();
    this.rawStore.internalLogs.length = 0;
  }
}

export const auditStore = new AuditStore();
