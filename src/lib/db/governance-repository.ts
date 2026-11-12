// Relational persistence for HIGH-009R governance namespaces:
// approvals, billing subscriptions, and audit events.
// Each legacy snapshot is backfilled once, transactionally, and a marker row
// records completion. A crash rolls back both the rows and the snapshot
// deletion, so restarting the same migration is always safe.

import { randomUUID } from 'node:crypto';
import {
  deleteSnapshot,
  getDatabase,
  readSnapshot,
  registerDirectSnapshotProvider,
  withWriteTransaction,
  writeSnapshotExact,
} from './durable-repository';
import { readBillingOperationalState } from './operational-repository';

type Row = Record<string, any>;
type Db = ReturnType<typeof getDatabase>;

export type ApprovalState = {
  requests: Array<Row>;
  logs: Array<Row>;
  autonomyConfigs: Array<Row>;
};

export type BillingSubscriptionRow = Row & {
  organization_id: string;
  id: string;
  plan_id: string;
  status: string;
  version: number;
};

function json(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parse(value: string | null): any {
  return value === null ? null : JSON.parse(value);
}

function migrationExists(db: Db, namespace: string): boolean {
  return Boolean(
    db.prepare('SELECT 1 AS present FROM governance_migrations WHERE namespace = ?').get(namespace),
  );
}

function markMigration(db: Db, namespace: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO governance_migrations(namespace, migrated_at) VALUES (?, ?)',
  ).run(namespace, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

function approvalRequestValues(request: Row): unknown[] {
  return [
    String(request.id),
    String(request.organization_id),
    String(request.subject_type),
    String(request.subject_id),
    String(request.action_type),
    json(request.proposed_action),
    json(request.evidence ?? []),
    Number(request.confidence),
    String(request.proposed_by),
    String(request.status),
    request.reviewed_by_user_id ?? null,
    request.reviewed_at ?? null,
    request.modification === undefined ? null : json(request.modification),
    request.rejection_reason ?? null,
    String(request.execution_status ?? 'not_applicable'),
    request.execution_error ?? null,
    request.executed_at ?? null,
    String(request.created_at),
    json(request),
  ];
}

// ---- Audit-augmented insertApprovalRequest ----
export function insertApprovalRequest(request: Row): void {
  withWriteTransaction(() => {
    getDatabase().prepare(`
      INSERT INTO approval_requests(
        id, organization_id, subject_type, subject_id, action_type,
        proposed_action, evidence, confidence, proposed_by, status,
        reviewed_by_user_id, reviewed_at, modification, rejection_reason,
        execution_status, execution_error, executed_at, created_at, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(...approvalRequestValues(request));
    // Insert audit event in same transaction with a unique, collision-free ID
    appendAuditEvent({
      id: randomUUID(),
      organization_id: request.organization_id,
      actor_user_id: null,
      actor_type: 'system',
      action_type: 'approval_request_create',
      subject_type: 'approval' as const,
      subject_id: request.id,
      before_state: null,
      after_state: { status: request.status },
      ai_context: null,
      approval_context: null,
      result: 'success' as const,
      created_at: new Date().toISOString(),
    });
  });
}

// ---- Audit-augmented updateApprovalRequest ----
export function updateApprovalRequest(request: Row): void {
  // Capture before state from the database
  const db = getDatabase();
  const beforeRow = db.prepare('SELECT status, payload FROM approval_requests WHERE id = ?').get(request.id) as Row | null;
  const beforeStatus = beforeRow?.status;

  withWriteTransaction(() => {
    // Update the approval request
    db.prepare(`
      UPDATE approval_requests SET
        status = ?, reviewed_by_user_id = ?, reviewed_at = ?,
        modification = ?, rejection_reason = ?,
        execution_status = ?, execution_error = ?, executed_at = ?,
        payload = ?
      WHERE id = ?
    `).run(
      String(request.status),
      request.reviewed_by_user_id ?? null,
      request.reviewed_at ?? null,
      request.modification === undefined ? null : json(request.modification),
      request.rejection_reason ?? null,
      String(request.execution_status ?? 'not_applicable'),
      request.execution_error ?? null,
      request.executed_at ?? null,
      json(request),
      String(request.id),
    );
    // Insert audit event in same transaction with a unique, collision-free ID.
    // Each approval status transition (approve → execute) is a distinct event
    // and must never reuse the same audit ID.
    appendAuditEvent({
      id: randomUUID(),
      organization_id: request.organization_id,
      actor_user_id: null,
      actor_type: 'system',
      action_type: 'approval_request_update',
      subject_type: 'approval' as const,
      subject_id: request.id,
      before_state: beforeStatus ? { status: beforeStatus } : null,
      after_state: { status: request.status },
      ai_context: null,
      approval_context: null,
      result: 'success' as const,
      created_at: new Date().toISOString(),
    });
  });
}

export function insertApprovalDecision(request: Row): void {
  getDatabase().prepare(`
    INSERT INTO approval_decisions(
      approval_request_id, organization_id, decision,
      reviewer_user_id, decided_at, reason, modification
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(request.id),
    String(request.organization_id),
    String(request.status),
    String(request.reviewed_by_user_id ?? 'legacy_unknown'),
    String(request.reviewed_at ?? request.created_at),
    request.rejection_reason ?? null,
    request.modification === undefined ? null : json(request.modification),
  );
}

export function insertApprovalLog(entry: Row, organizationId: string): void {
  getDatabase().prepare(`
    INSERT INTO approval_logs(
      id, organization_id, approval_request_id,
      event_type, actor_user_id, details, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(entry.id),
    organizationId,
    String(entry.approval_request_id),
    String(entry.event_type),
    entry.actor_user_id ?? null,
    json(entry.details ?? {}),
    String(entry.created_at),
  );
}

export function upsertAutonomyConfig(config: Row): void {
  getDatabase().prepare(`
    INSERT INTO approval_autonomy_configs(
      id, organization_id, action_type, auto_approve_enabled, min_confidence_threshold
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, action_type) DO UPDATE SET
      id = excluded.id,
      auto_approve_enabled = excluded.auto_approve_enabled,
      min_confidence_threshold = excluded.min_confidence_threshold
  `).run(
    String(config.id),
    String(config.organization_id),
    String(config.action_type),
    config.auto_approve_enabled ? 1 : 0,
    Number(config.min_confidence_threshold),
  );
}

export function readApprovalState(): ApprovalState {
  const db = getDatabase();
  const requests = (db.prepare('SELECT payload FROM approval_requests ORDER BY created_at, id').all() as Array<{ payload: string }>)
    .map((row) => parse(row.payload) as Row);
  const logs = (db.prepare('SELECT details, actor_user_id, id, approval_request_id, event_type, created_at FROM approval_logs ORDER BY created_at, rowid').all() as Row[])
    .map((row) => ({
      id: row.id,
      approval_request_id: row.approval_request_id,
      event_type: row.event_type,
      actor_user_id: row.actor_user_id ?? null,
      details: parse(row.details),
      created_at: row.created_at,
    }));
  const autonomyConfigs = (db.prepare(`
    SELECT id, organization_id, action_type, auto_approve_enabled, min_confidence_threshold
    FROM approval_autonomy_configs ORDER BY organization_id, action_type
  `).all() as Row[]).map((row) => ({
    ...row,
    auto_approve_enabled: Boolean(row.auto_approve_enabled),
  }));
  return { requests, logs, autonomyConfigs };
}

export function clearApprovalState(): void {
  const db = getDatabase();
  db.exec('DELETE FROM approval_logs');
  db.exec('DELETE FROM approval_decisions');
  db.exec('DELETE FROM approval_requests');
  db.exec('DELETE FROM approval_autonomy_configs');
}

// ---------------------------------------------------------------------------
// Billing subscriptions
// ---------------------------------------------------------------------------

export function insertBillingSubscription(subscription: Row): void {
  withWriteTransaction(() => {
    getDatabase().prepare(`
      INSERT INTO billing_subscriptions(
        organization_id, id, plan_id, status, billing_interval,
        current_period_start, current_period_end, version, updated_at, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id) DO NOTHING
    `).run(
      String(subscription.organization_id),
      String(subscription.id),
      String(subscription.plan_id),
      String(subscription.status),
      subscription.billing_interval ?? null,
      String(subscription.current_period_start),
      String(subscription.current_period_end),
      Number(subscription.version ?? 0),
      String(subscription.updated_at),
      json(subscription),
    );
    // Insert audit event in same transaction with a unique, collision-free ID
    appendAuditEvent({
      id: randomUUID(),
      organization_id: subscription.organization_id,
      actor_user_id: null,
      actor_type: 'system',
      action_type: 'billing_subscription_create',
      subject_type: 'billing_subscription' as const,
      subject_id: subscription.id,
      before_state: null,
      after_state: { plan_id: subscription.plan_id, status: subscription.status, version: subscription.version },
      ai_context: null,
      approval_context: null,
      result: 'success' as const,
      created_at: new Date().toISOString(),
    });
  });
}

// ---- Audit-augmented updateBillingSubscription ----
export function updateBillingSubscription(subscription: Row, expectedVersion: number): boolean {
  return withWriteTransaction(() => {
    // Capture before state from the database within the transaction
    const db = getDatabase();
    const beforeRow = db.prepare('SELECT plan_id, status, version FROM billing_subscriptions WHERE organization_id = ?').get(subscription.organization_id) as Row | null;
    const beforePlanId = beforeRow?.plan_id;
    const beforeStatus = beforeRow?.status;
    const beforeVersion = beforeRow?.version;

    const result = db.prepare(`
        UPDATE billing_subscriptions SET
          id = ?, plan_id = ?, status = ?, billing_interval = ?,
          current_period_start = ?, current_period_end = ?,
          version = ?, updated_at = ?, payload = ?
        WHERE organization_id = ? AND version = ?
      `).run(
        String(subscription.id),
        String(subscription.plan_id),
        String(subscription.status),
        subscription.billing_interval ?? null,
        String(subscription.current_period_start),
        String(subscription.current_period_end),
        Number(subscription.version),
        String(subscription.updated_at),
        json(subscription),
        String(subscription.organization_id),
        expectedVersion,
      );
    // Insert audit event in same transaction with before/after state
    appendAuditEvent({
      id: randomUUID(),
      organization_id: subscription.organization_id,
      actor_user_id: null,
      actor_type: 'system',
      action_type: 'billing_subscription_update',
      subject_type: 'billing_subscription' as const,
      subject_id: subscription.organization_id,
      before_state: beforePlanId !== undefined ? { plan_id: beforePlanId, status: beforeStatus, version: beforeVersion } : null,
      after_state: { plan_id: subscription.plan_id, status: subscription.status, version: subscription.version },
      ai_context: null,
      approval_context: null,
      result: 'success' as const,
      created_at: new Date().toISOString(),
    });
    // The update may affect 0 rows (e.g., version mismatch) or 1+ rows; return accordingly
    return (result as any)?.changes > 0;
  });
}
export function insertBillingSubscriptionHistory(subscription: Row): void {
  getDatabase().prepare(`
    INSERT OR IGNORE INTO billing_subscription_history(
      id, organization_id, version, plan_id, status, changed_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `hist_${subscription.organization_id}_${subscription.version ?? 0}`,
    String(subscription.organization_id),
    Number(subscription.version ?? 0),
    String(subscription.plan_id),
    String(subscription.status),
    String(subscription.updated_at),
    json(subscription),
  );
}

export function readBillingSubscriptions(): BillingSubscriptionRow[] {
  return (getDatabase()
    .prepare('SELECT payload FROM billing_subscriptions ORDER BY organization_id')
    .all() as Array<{ payload: string }>).map((row) => parse(row.payload) as BillingSubscriptionRow);
}

export function readBillingSubscriptionHistory(organizationId: string): Row[] {
  return (getDatabase()
    .prepare('SELECT payload FROM billing_subscription_history WHERE organization_id = ? ORDER BY version')
    .all(organizationId) as Array<{ payload: string }>).map((row) => parse(row.payload) as Row);
}

export function clearBillingSubscriptions(): void {
  const db = getDatabase();
  db.exec('DELETE FROM billing_subscription_history');
  db.exec('DELETE FROM billing_subscriptions');
}

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

export function appendAuditEvent(record: Row): void {
  const id = record.id ?? randomUUID();
  // Idempotent retry: if an audit event with this ID already exists, skip.
  // This preserves append-only semantics while allowing safe retries of the
  // same logical event without silently discarding events.
  const existing = getDatabase().prepare('SELECT 1 AS present FROM audit_events WHERE id = ?').get(id);
  if (existing) return;
  getDatabase().prepare(`
    INSERT INTO audit_events(
      id, organization_id, actor_user_id, actor_type, action_type,
      subject_type, subject_id, before_state, after_state,
      ai_context, approval_context, result, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    String(record.organization_id),
    record.actor_user_id ?? null,
    String(record.actor_type),
    String(record.action_type),
    String(record.subject_type),
    String(record.subject_id),
    record.before_state === undefined ? null : json(record.before_state),
    record.after_state === undefined ? null : json(record.after_state),
    record.ai_context === undefined ? null : json(record.ai_context),
    record.approval_context === undefined ? null : json(record.approval_context),
    String(record.result),
    String(record.created_at),
  );
}

export function readAuditEvents(): Row[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, organization_id, actor_user_id, actor_type, action_type,
      subject_type, subject_id, before_state, after_state,
      ai_context, approval_context, result, created_at
    FROM audit_events ORDER BY created_at, rowid
  `).all() as Row[];
  return rows.map((row) => ({
    id: row.id,
    organization_id: row.organization_id,
    actor_user_id: row.actor_user_id ?? null,
    actor_type: row.actor_type,
    action_type: row.action_type,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    before_state: parse(row.before_state),
    after_state: parse(row.after_state),
    ai_context: parse(row.ai_context),
    approval_context: parse(row.approval_context),
    result: row.result,
    created_at: row.created_at,
  }));
}

/** Controlled purge for test cleanup and explicit administrative reset. The
 * append-only triggers are restored before the transaction commits.
 */
export function purgeAuditEvents(): void {
  const db = getDatabase();
  db.exec('DROP TRIGGER IF EXISTS audit_events_immutable_update');
  db.exec('DROP TRIGGER IF EXISTS audit_events_immutable_delete');
  try {
    db.exec('DELETE FROM audit_events');
  } finally {
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_events_immutable_update
      BEFORE UPDATE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
      END;
      CREATE TRIGGER IF NOT EXISTS audit_events_immutable_delete
      BEFORE DELETE ON audit_events
      BEGIN
        SELECT RAISE(ABORT, 'audit_events is append-only');
      END;
    `);
  }
}

// ---------------------------------------------------------------------------
// One-time legacy snapshot migration
// ---------------------------------------------------------------------------

function backfillApprovals(db: Db): void {
  if (migrationExists(db, 'approvals')) return;
  const snapshot = readSnapshot<ApprovalState>('approvals');
  if (snapshot) {
    for (const request of snapshot.requests || []) {
      db.prepare(`
        INSERT OR IGNORE INTO approval_requests(
          id, organization_id, subject_type, subject_id, action_type,
          proposed_action, evidence, confidence, proposed_by, status,
          reviewed_by_user_id, reviewed_at, modification, rejection_reason,
          execution_status, execution_error, executed_at, created_at, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...approvalRequestValues(request));
      if (request.status === 'approved' || request.status === 'rejected') {
        db.prepare(`
          INSERT OR IGNORE INTO approval_decisions(
            approval_request_id, organization_id, decision,
            reviewer_user_id, decided_at, reason, modification
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          String(request.id),
          String(request.organization_id),
          String(request.status),
          String(request.reviewed_by_user_id ?? 'legacy_unknown'),
          String(request.reviewed_at ?? request.created_at),
          request.rejection_reason ?? null,
          request.modification === undefined ? null : json(request.modification),
        );
      }
    }
    for (const entry of snapshot.logs || []) {
      const request = (snapshot.requests || []).find((item) => item.id === entry.approval_request_id);
      if (!request) continue;
      db.prepare(`
        INSERT OR IGNORE INTO approval_logs(
          id, organization_id, approval_request_id,
          event_type, actor_user_id, details, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(entry.id),
        String(request.organization_id),
        String(entry.approval_request_id),
        String(entry.event_type),
        entry.actor_user_id ?? null,
        json(entry.details ?? {}),
        String(entry.created_at),
      );
    }
    for (const config of snapshot.autonomyConfigs || []) {
      db.prepare(`
        INSERT OR IGNORE INTO approval_autonomy_configs(
          id, organization_id, action_type, auto_approve_enabled, min_confidence_threshold
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        String(config.id),
        String(config.organization_id),
        String(config.action_type),
        config.auto_approve_enabled ? 1 : 0,
        Number(config.min_confidence_threshold),
      );
    }
    deleteSnapshot('approvals');
  }
  markMigration(db, 'approvals');
}

function backfillBilling(db: Db): void {
  if (migrationExists(db, 'billing')) return;
  const snapshot = readSnapshot<Row>('billing');
  if (snapshot) {
    for (const subscription of snapshot.subscriptions || []) {
      db.prepare(`
        INSERT OR IGNORE INTO billing_subscriptions(
          organization_id, id, plan_id, status, billing_interval,
          current_period_start, current_period_end, version, updated_at, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(subscription.organization_id),
        String(subscription.id),
        String(subscription.plan_id),
        String(subscription.status),
        subscription.billing_interval ?? null,
        String(subscription.current_period_start),
        String(subscription.current_period_end),
        Number(subscription.version ?? 0),
        String(subscription.updated_at),
        json(subscription),
      );
      db.prepare(`
        INSERT OR IGNORE INTO billing_subscription_history(
          id, organization_id, version, plan_id, status, changed_at, payload
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `hist_${subscription.organization_id}_${subscription.version ?? 0}`,
        String(subscription.organization_id),
        Number(subscription.version ?? 0),
        String(subscription.plan_id),
        String(subscription.status),
        String(subscription.updated_at),
        json(subscription),
      );
    }

    // Billing still stores usage/payment/webhook/refund data as a snapshot.
    // Keep those fields, but remove subscriptions now that they are relational.
    const rest = { ...snapshot };
    delete rest.subscriptions;
    const hasOtherData = Object.values(rest).some((value) =>
      Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' && Object.keys(value).length > 0,
    );
    if (hasOtherData) writeSnapshotExact('billing', rest);
    else deleteSnapshot('billing');
  }
  markMigration(db, 'billing');
}

function backfillAudit(db: Db): void {
  if (migrationExists(db, 'audit')) return;
  const snapshot = readSnapshot<Row[]>('audit');
  if (snapshot) {
    for (const record of snapshot) {
      db.prepare(`
        INSERT OR IGNORE INTO audit_events(
          id, organization_id, actor_user_id, actor_type, action_type,
          subject_type, subject_id, before_state, after_state,
          ai_context, approval_context, result, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        String(record.id),
        String(record.organization_id),
        record.actor_user_id ?? null,
        String(record.actor_type),
        String(record.action_type),
        String(record.subject_type),
        String(record.subject_id),
        record.before_state === undefined ? null : json(record.before_state),
        record.after_state === undefined ? null : json(record.after_state),
        record.ai_context === undefined ? null : json(record.ai_context),
        record.approval_context === undefined ? null : json(record.approval_context),
        String(record.result),
        String(record.created_at),
      );
    }
    deleteSnapshot('audit');
  }
  markMigration(db, 'audit');
}

/** Migrate all governance namespaces in one transaction. Markers make each
 * namespace idempotent; a SIGKILL before commit leaves no marker, no rows and
 * the original snapshots intact.
 */
export function backfillGovernanceFromSnapshots(): boolean {
  const db = getDatabase();
  const namespaces = ['approvals', 'billing', 'audit'];
  // Fast path: completed migrations do not take the write lock on reads.
  if (namespaces.every((namespace) => migrationExists(db, namespace))) return false;

  return withWriteTransaction(() => {
    const missing = namespaces.filter((namespace) => !migrationExists(db, namespace));
    if (missing.length === 0) return false;
    backfillApprovals(db);
    backfillBilling(db);
    backfillAudit(db);
    return true;
  });
}

registerDirectSnapshotProvider((namespace) => {
  if (namespace === 'billing') {
    const raw = readSnapshot<Row>('billing');
    const subscriptions = readBillingSubscriptions();
    const operational = readBillingOperationalState();
    const hasOperational = Object.values(operational).some((value) => Array.isArray(value) && value.length > 0);
    if (!raw && subscriptions.length === 0 && !hasOperational) return null;
    return { ...(raw || {}), ...operational, subscriptions };
  }
  if (namespace === 'audit') {
    const events = readAuditEvents();
    return events.length > 0 ? events : null;
  }
  return null;
});