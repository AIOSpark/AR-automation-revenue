// Relational persistence for the remaining HIGH-009S namespaces.
//
// Migration v4 covers execution records, reconciliation outcomes, import
// control data, auth/tenant state, session revocations and non-subscription
// billing records. Each namespace is backfilled once behind a marker.

import {
  deleteSnapshot,
  getDatabase,
  readSnapshot,
  registerDirectSnapshotProvider,
  withWriteTransaction,
  writeSnapshotExact,
} from './durable-repository';

type Row = Record<string, any>;
type Db = ReturnType<typeof getDatabase>;

const json = (value: unknown) => JSON.stringify(value ?? null);
const parse = (value: string | null) => (value === null ? null : JSON.parse(value));

function markerExists(db: Db, namespace: string): boolean {
  return Boolean(db.prepare('SELECT 1 AS present FROM operational_migrations WHERE namespace = ?').get(namespace));
}

function mark(db: Db, namespace: string): void {
  db.prepare('INSERT OR IGNORE INTO operational_migrations(namespace, migrated_at) VALUES (?, ?)')
    .run(namespace, new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Executions
// ---------------------------------------------------------------------------

export function insertExecution(record: Row): void {
  getDatabase().prepare(`
    INSERT INTO execution_records(
      id, organization_id, requesting_user_id, approving_user_id, action_type,
      target_entity_type, target_entity_ids, action_payload, action_payload_hash,
      idempotency_key, approval_request_id, execution_attempt_id, state,
      before_state_snapshot, expected_outcome, commit_reference, executed_at,
      committed_at, verified_at, verification_result, failure_reason,
      failure_classification, recovery_attempts, created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(record.id), String(record.organization_id),
    record.requesting_user_id ?? null, record.approving_user_id ?? null,
    String(record.action_type), String(record.target_entity_type),
    json(record.target_entity_ids ?? []), json(record.action_payload ?? {}),
    String(record.action_payload_hash), String(record.idempotency_key),
    record.approval_request_id ?? null, String(record.execution_attempt_id),
    String(record.state), json(record.before_state_snapshot ?? {}),
    json(record.expected_outcome ?? {}), record.commit_reference ?? null,
    record.executed_at ?? null, record.committed_at ?? null, record.verified_at ?? null,
    record.verification_result === null ? null : json(record.verification_result),
    record.failure_reason ?? null, record.failure_classification ?? null,
    Number(record.recovery_attempts ?? 0), String(record.created_at), String(record.updated_at),
    json(record),
  );
}

export function updateExecution(record: Row): void {
  getDatabase().prepare(`
    UPDATE execution_records SET
      state = ?, commit_reference = ?, executed_at = ?, committed_at = ?,
      verified_at = ?, verification_result = ?, failure_reason = ?,
      failure_classification = ?, recovery_attempts = ?, updated_at = ?, payload = ?
    WHERE id = ?
  `).run(
    String(record.state), record.commit_reference ?? null, record.executed_at ?? null,
    record.committed_at ?? null, record.verified_at ?? null,
    record.verification_result === null ? null : json(record.verification_result),
    record.failure_reason ?? null, record.failure_classification ?? null,
    Number(record.recovery_attempts ?? 0), String(record.updated_at), json(record), String(record.id),
  );
}

export function readExecutions(): Row[] {
  return (getDatabase().prepare('SELECT payload FROM execution_records ORDER BY created_at, id').all() as Array<{ payload: string }>)
    .map((row) => parse(row.payload) as Row);
}

export function clearExecutions(): void {
  getDatabase().exec('DELETE FROM execution_records');
}

// ---------------------------------------------------------------------------
// Reconciliation outcomes
// ---------------------------------------------------------------------------

export function insertReconciliationOutcome(outcome: Row): void {
  getDatabase().prepare(`
    INSERT INTO reconciliation_outcomes(
      id, organization_id, bank_transaction_id, original_confidence,
      original_match_method, action_type, outcome, final_invoice_ids,
      reviewed_by_user_id, rejection_reason, reviewed_at, created_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(outcome.id), String(outcome.organizationId), String(outcome.bankTransactionId),
    Number(outcome.originalConfidence), String(outcome.originalMatchMethod),
    String(outcome.actionType), String(outcome.outcome), json(outcome.finalInvoiceIds ?? []),
    outcome.reviewedByUserId ?? null, outcome.rejectionReason ?? null,
    String(outcome.reviewedAt), String(outcome.created_at), json(outcome),
  );
}

export function readReconciliationOutcomes(): Row[] {
  return (getDatabase().prepare('SELECT payload FROM reconciliation_outcomes ORDER BY created_at, id').all() as Array<{ payload: string }>)
    .map((row) => parse(row.payload) as Row);
}

export function clearReconciliationOutcomes(): void {
  getDatabase().exec('DELETE FROM reconciliation_outcomes');
}

// ---------------------------------------------------------------------------
// Import batches
// ---------------------------------------------------------------------------

export function insertImportBatch(batch: Row): void {
  getDatabase().prepare(`
    INSERT INTO import_batches(
      id, organization_id, source_system, status, date_format_convention,
      total_rows, success_count, skipped_count, started_at, completed_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(batch.id), String(batch.organization_id), String(batch.source_system),
    String(batch.status), String(batch.date_format_convention),
    Number(batch.total_rows), Number(batch.success_count), Number(batch.skipped_count),
    String(batch.started_at), batch.completed_at ?? null, json(batch),
  );
}

export function updateImportBatch(batch: Row): void {
  getDatabase().prepare(`
    UPDATE import_batches SET
      status = ?, success_count = ?, skipped_count = ?, completed_at = ?, payload = ?
    WHERE id = ?
  `).run(
    String(batch.status), Number(batch.success_count), Number(batch.skipped_count),
    batch.completed_at ?? null, json(batch), String(batch.id),
  );
}

export function insertImportError(record: Row): void {
  getDatabase().prepare(`
    INSERT INTO import_errors(
      id, organization_id, import_batch_id, raw_row_reference, reason, field, created_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(record.id), String(record.organization_id), String(record.import_batch_id),
    json(record.raw_row_reference ?? {}), String(record.reason), record.field ?? null,
    String(record.created_at), json(record),
  );
}

export function insertImportDuplicate(record: Row): void {
  getDatabase().prepare(`
    INSERT INTO import_duplicates(
      id, organization_id, import_batch_id, incoming_record_json,
      existing_record_id, confidence, status, created_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(record.id), String(record.organization_id), String(record.import_batch_id),
    json(record.incoming_record_json ?? {}), String(record.existing_record_id),
    Number(record.confidence), String(record.status), String(record.created_at), json(record),
  );
}

export function readImportState(): { batches: Row[]; errors: Row[]; duplicates: Row[] } {
  const db = getDatabase();
  return {
    batches: (db.prepare('SELECT payload FROM import_batches ORDER BY started_at, id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
    errors: (db.prepare('SELECT payload FROM import_errors ORDER BY created_at, id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
    duplicates: (db.prepare('SELECT payload FROM import_duplicates ORDER BY created_at, id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
  };
}

export function clearImportState(): void {
  const db = getDatabase();
  db.exec('DELETE FROM import_duplicates');
  db.exec('DELETE FROM import_errors');
  db.exec('DELETE FROM import_batches');
}

// ---------------------------------------------------------------------------
// Auth and tenant state
// ---------------------------------------------------------------------------

export function insertAuthUser(user: Row): boolean {
  const result = getDatabase().prepare(`
    INSERT INTO auth_users(
      id, auth_provider_id, email, email_normalized, first_name, last_name,
      phone, role_title, email_verified, created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email_normalized) DO NOTHING
  `).run(
    String(user.id), String(user.auth_provider_id), String(user.email),
    String(user.email).toLowerCase(), String(user.first_name), String(user.last_name),
    user.phone ?? null, user.role_title ?? null, user.email_verified ? 1 : 0,
    String(user.created_at), String(user.updated_at), json(user),
  );
  return Number((result as { changes?: number | bigint }).changes ?? 0) === 1;
}

export function updateAuthUser(user: Row): void {
  getDatabase().prepare(`
    UPDATE auth_users SET
      email = ?, email_normalized = ?, first_name = ?, last_name = ?, phone = ?,
      role_title = ?, email_verified = ?, updated_at = ?, payload = ?
    WHERE id = ?
  `).run(
    String(user.email), String(user.email).toLowerCase(), String(user.first_name),
    String(user.last_name), user.phone ?? null, user.role_title ?? null,
    user.email_verified ? 1 : 0, String(user.updated_at), json(user), String(user.id),
  );
}

export function insertAuthOrganization(org: Row): void {
  getDatabase().prepare(`
    INSERT INTO auth_organizations(
      id, name, size, industry, created_by_user_id, pilot_mode, currency,
      created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(org.id), String(org.name), String(org.size), String(org.industry),
    String(org.created_by_user_id), org.pilotMode ? 1 : 0, org.currency ?? null,
    String(org.created_at), String(org.updated_at), json(org),
  );
}

export function updateAuthOrganization(org: Row): void {
  getDatabase().prepare(`
    UPDATE auth_organizations SET
      name = ?, size = ?, industry = ?, pilot_mode = ?, currency = ?,
      updated_at = ?, payload = ?
    WHERE id = ?
  `).run(
    String(org.name), String(org.size), String(org.industry), org.pilotMode ? 1 : 0,
    org.currency ?? null, String(org.updated_at), json(org), String(org.id),
  );
}

export function readAuthState(): { users: Row[]; organizations: Row[] } {
  const db = getDatabase();
  return {
    users: (db.prepare('SELECT payload FROM auth_users ORDER BY created_at, id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
    organizations: (db.prepare('SELECT payload FROM auth_organizations ORDER BY created_at, id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
  };
}

export function clearAuthState(): void {
  const db = getDatabase();
  db.exec('DELETE FROM auth_users');
  db.exec('DELETE FROM auth_organizations');
}

export function insertRevokedSession(jti: string, exp: number): void {
  getDatabase().prepare(`
    INSERT INTO auth_session_revocations(jti, exp) VALUES (?, ?)
    ON CONFLICT(jti) DO UPDATE SET exp = excluded.exp
  `).run(jti, exp);
}

export function readRevokedSessions(): Array<{ jti: string; exp: number }> {
  return getDatabase().prepare('SELECT jti, exp FROM auth_session_revocations ORDER BY exp').all() as Array<{ jti: string; exp: number }>;
}

export function deleteExpiredRevokedSessions(nowEpochSeconds: number): void {
  getDatabase().prepare('DELETE FROM auth_session_revocations WHERE exp <= ?').run(nowEpochSeconds);
}

export function clearRevokedSessions(): void {
  getDatabase().exec('DELETE FROM auth_session_revocations');
}

export function insertTenantMember(member: Row): void {
  getDatabase().prepare(`
    INSERT INTO tenant_members(id, user_id, organization_id, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(String(member.id), String(member.user_id), String(member.organization_id), String(member.role), String(member.created_at));
}

export function updateTenantMemberRole(id: string, role: string): void {
  getDatabase().prepare('UPDATE tenant_members SET role = ? WHERE id = ?').run(role, id);
}

export function insertTenantInvite(invite: Row): void {
  getDatabase().prepare(`
    INSERT INTO tenant_invites(
      id, organization_id, email, role, invited_by_user_id, status, token, created_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(invite.id), String(invite.organization_id), String(invite.email),
    String(invite.role), String(invite.invited_by_user_id), String(invite.status),
    String(invite.token), String(invite.created_at), json(invite),
  );
}

export function insertTenantRecord(tableName: string, record: Row): void {
  getDatabase().prepare(`
    INSERT INTO tenant_records(table_name, id, organization_id, payload) VALUES (?, ?, ?, ?)
  `).run(tableName, String(record.id), String(record.organization_id), json(record));
}

export function readTenantState(): {
  members: Row[];
  invites: Row[];
  tenantTables: Record<string, Row[]>;
} {
  const db = getDatabase();
  const members = db.prepare('SELECT id, user_id, organization_id, role, created_at FROM tenant_members ORDER BY created_at, id')
    .all() as Row[];
  const invites = (db.prepare('SELECT payload FROM tenant_invites ORDER BY created_at, id').all() as Array<{ payload: string }>)
    .map((row) => parse(row.payload) as Row);
  const tenantTables: Record<string, Row[]> = {};
  for (const row of db.prepare('SELECT table_name, payload FROM tenant_records ORDER BY table_name, id').all() as Array<{ table_name: string; payload: string }>) {
    if (!tenantTables[row.table_name]) tenantTables[row.table_name] = [];
    tenantTables[row.table_name].push(parse(row.payload) as Row);
  }
  return { members, invites, tenantTables };
}

export function clearTenantState(): void {
  const db = getDatabase();
  db.exec('DELETE FROM tenant_records');
  db.exec('DELETE FROM tenant_invites');
  db.exec('DELETE FROM tenant_members');
}

// ---------------------------------------------------------------------------
// Non-subscription billing records
// ---------------------------------------------------------------------------

export function insertBillingUsageEvent(event: Row): void {
  getDatabase().prepare(`
    INSERT INTO billing_usage_events(
      id, organization_id, event_type, quantity, metadata, occurred_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(event.id), String(event.organization_id), String(event.event_type),
    Number(event.quantity), event.metadata == null ? null : json(event.metadata),
    String(event.occurred_at), json(event),
  );
}

export function insertBillingPayment(payment: Row): void {
  getDatabase().prepare(`
    INSERT INTO billing_payments(
      id, organization_id, provider_payment_id, amount_minor_units,
      currency, status, refunded_amount_minor_units, date, created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(payment.id), String(payment.organization_id), String(payment.provider_payment_id),
    Number(payment.amount_minor_units), String(payment.currency), String(payment.status),
    Number(payment.refunded_amount_minor_units ?? 0), String(payment.date),
    String(payment.created_at), String(payment.updated_at), json(payment),
  );
}

export function insertBillingWebhookEvent(event: Row): void {
  getDatabase().prepare(`
    INSERT INTO billing_webhook_events(
      provider_event_id, id, organization_id, event_type, status,
      retry_count, max_retries, error_message, created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(event.provider_event_id), String(event.id), String(event.organization_id),
    String(event.event_type), String(event.status), Number(event.retry_count),
    Number(event.max_retries), event.error_message ?? null,
    String(event.created_at), String(event.updated_at), json(event),
  );
}

export function updateBillingWebhookStatus(providerEventId: string, status: string, updatedAt: string): void {
  getDatabase().prepare(`
    UPDATE billing_webhook_events
    SET status = ?, updated_at = ?, payload = json_set(payload, '$.status', ?, '$.updated_at', ?)
    WHERE provider_event_id = ?
  `).run(status, updatedAt, status, updatedAt, providerEventId);
}

export function insertBillingRefundEvent(refund: Row): void {
  getDatabase().prepare(`
    INSERT INTO billing_refund_events(
      id, organization_id, provider_refund_id, payment_id,
      amount_minor_units, currency, status, created_at, updated_at, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(refund.id), String(refund.organization_id), String(refund.provider_refund_id),
    String(refund.payment_id), Number(refund.amount_minor_units), String(refund.currency),
    String(refund.status), String(refund.created_at), String(refund.updated_at), json(refund),
  );
}

export function readBillingOperationalState(): {
  events: Row[];
  payments: Row[];
  webhookEvents: Row[];
  refundEvents: Row[];
} {
  const db = getDatabase();
  return {
    events: (db.prepare('SELECT payload FROM billing_usage_events ORDER BY occurred_at, id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
    payments: (db.prepare('SELECT payload FROM billing_payments ORDER BY created_at, id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
    webhookEvents: (db.prepare('SELECT payload FROM billing_webhook_events ORDER BY created_at, provider_event_id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
    refundEvents: (db.prepare('SELECT payload FROM billing_refund_events ORDER BY created_at, id').all() as Array<{ payload: string }>)
      .map((row) => parse(row.payload) as Row),
  };
}

export function clearBillingOperationalState(): void {
  const db = getDatabase();
  db.exec('DELETE FROM billing_refund_events');
  db.exec('DELETE FROM billing_webhook_events');
  db.exec('DELETE FROM billing_payments');
  db.exec('DELETE FROM billing_usage_events');
  db.exec('DELETE FROM billing_event_log');
}

export function insertBillingEventLog(event: Row): void {
  getDatabase().prepare(`
    INSERT INTO billing_event_log(
      id, organization_id, razorpay_event_id, event_type,
      razorpay_subscription_id, razorpay_payment_id, payload,
      signature_verified, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(event.id), String(event.organization_id), event.razorpay_event_id ?? null,
    String(event.event_type), event.razorpay_subscription_id ?? null,
    event.razorpay_payment_id ?? null, json(event.payload ?? {}),
    event.signature_verified ? 1 : 0, String(event.created_at),
  );
}

export function readBillingEventLog(): Row[] {
  return (getDatabase().prepare(`
    SELECT id, organization_id, razorpay_event_id, event_type,
           razorpay_subscription_id, razorpay_payment_id, payload,
           signature_verified, created_at
    FROM billing_event_log ORDER BY created_at, id
  `).all() as Row[]).map((row) => ({
    ...row,
    payload: parse(row.payload),
    signature_verified: Boolean(row.signature_verified),
  }));
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

function backfillExecutions(db: Db): void {
  if (markerExists(db, 'executions')) return;
  const snapshot = readSnapshot<{ executions?: Row[] }>('executions');
  for (const record of snapshot?.executions || []) {
    try {
      insertExecution(record);
    } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  if (snapshot) deleteSnapshot('executions');
  mark(db, 'executions');
}

function backfillReconciliation(db: Db): void {
  if (markerExists(db, 'reconciliation_outcomes')) return;
  const snapshot = readSnapshot<Row[]>('reconciliation_outcomes');
  for (const outcome of snapshot || []) {
    try { insertReconciliationOutcome(outcome); } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  if (snapshot) deleteSnapshot('reconciliation_outcomes');
  mark(db, 'reconciliation_outcomes');
}

function backfillImport(db: Db): void {
  if (markerExists(db, 'import_batches')) return;
  const snapshot = readSnapshot<{ batches?: Row[]; errors?: Row[]; duplicates?: Row[] }>('import_batches');
  for (const batch of snapshot?.batches || []) {
    try { insertImportBatch(batch); } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  for (const error of snapshot?.errors || []) {
    try { insertImportError(error); } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  for (const duplicate of snapshot?.duplicates || []) {
    try { insertImportDuplicate(duplicate); } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  if (snapshot) deleteSnapshot('import_batches');
  mark(db, 'import_batches');
}

function backfillAuth(db: Db): void {
  if (markerExists(db, 'auth')) return;
  const snapshot = readSnapshot<{ users?: Row[]; organizations?: Row[] }>('auth');
  for (const user of snapshot?.users || []) {
    try { insertAuthUser(user); } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  for (const org of snapshot?.organizations || []) {
    try { insertAuthOrganization(org); } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  if (snapshot) deleteSnapshot('auth');
  mark(db, 'auth');
}

function backfillTenant(db: Db): void {
  if (markerExists(db, 'tenant')) return;
  const snapshot = readSnapshot<{ members?: Row[]; invites?: Row[]; tenantTables?: Record<string, Row[]> }>('tenant');
  for (const member of snapshot?.members || []) {
    try { insertTenantMember(member); } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  for (const invite of snapshot?.invites || []) {
    try { insertTenantInvite(invite); } catch (error) {
      if (!String((error as Error).message).includes('UNIQUE')) throw error;
    }
  }
  for (const [tableName, records] of Object.entries(snapshot?.tenantTables || {})) {
    for (const record of records) {
      try { insertTenantRecord(tableName, record); } catch (error) {
        if (!String((error as Error).message).includes('UNIQUE')) throw error;
      }
    }
  }
  if (snapshot) deleteSnapshot('tenant');
  mark(db, 'tenant');
}

function backfillSessionRevocations(db: Db): void {
  if (markerExists(db, 'auth_session_revocations')) return;
  const snapshot = readSnapshot<Array<{ jti: string; exp: number }>>('auth_session_revocations');
  for (const record of snapshot || []) insertRevokedSession(record.jti, record.exp);
  if (snapshot) deleteSnapshot('auth_session_revocations');
  mark(db, 'auth_session_revocations');
}

function backfillBillingOperational(db: Db): void {
  if (markerExists(db, 'billing_operational')) return;
  const snapshot = readSnapshot<Row>('billing');
  if (snapshot) {
    for (const event of snapshot.events || []) insertBillingUsageEvent(event);
    for (const payment of snapshot.payments || []) insertBillingPayment(payment);
    for (const event of snapshot.webhookEvents || []) insertBillingWebhookEvent(event);
    for (const refund of snapshot.refundEvents || []) insertBillingRefundEvent(refund);
    const rest = { ...snapshot };
    delete rest.events;
    delete rest.payments;
    delete rest.webhookEvents;
    delete rest.refundEvents;
    const hasOther = Object.values(rest).some((value) =>
      Array.isArray(value) ? value.length > 0 : value && typeof value === 'object' && Object.keys(value).length > 0,
    );
    if (hasOther) writeSnapshotExact('billing', rest);
    else deleteSnapshot('billing');
  }
  mark(db, 'billing_operational');
}

function backfillBillingEventLog(db: Db): void {
  if (markerExists(db, 'razorpay_billing_events')) return;
  const snapshot = readSnapshot<Row[]>('razorpay_billing_events');
  for (const event of snapshot || []) insertBillingEventLog(event);
  if (snapshot) deleteSnapshot('razorpay_billing_events');
  mark(db, 'razorpay_billing_events');
}

export function backfillOperationalFromSnapshots(): boolean {
  const db = getDatabase();
  const namespaces = [
    'executions', 'reconciliation_outcomes', 'import_batches', 'auth',
    'tenant', 'auth_session_revocations', 'billing_operational', 'razorpay_billing_events',
  ];
  if (namespaces.every((namespace) => markerExists(db, namespace))) return false;

  return withWriteTransaction(() => {
    const missing = namespaces.filter((namespace) => !markerExists(db, namespace));
    if (missing.length === 0) return false;
    backfillExecutions(db);
    backfillReconciliation(db);
    backfillImport(db);
    backfillAuth(db);
    backfillTenant(db);
    backfillSessionRevocations(db);
    backfillBillingOperational(db);
    backfillBillingEventLog(db);
    return true;
  });
}

registerDirectSnapshotProvider((namespace) => {
  if (namespace === 'executions') {
    const executions = readExecutions();
    return executions.length > 0 ? { executions } : null;
  }
  if (namespace === 'reconciliation_outcomes') {
    const outcomes = readReconciliationOutcomes();
    return outcomes.length > 0 ? outcomes : null;
  }
  if (namespace === 'import_batches') {
    const state = readImportState();
    const hasData = state.batches.length || state.errors.length || state.duplicates.length;
    return hasData ? state : null;
  }
  if (namespace === 'auth') {
    const state = readAuthState();
    return state.users.length || state.organizations.length ? state : null;
  }
  if (namespace === 'tenant') {
    const state = readTenantState();
    return state.members.length || state.invites.length || Object.keys(state.tenantTables).length ? state : null;
  }
  if (namespace === 'auth_session_revocations') {
    const revoked = readRevokedSessions();
    return revoked.length > 0 ? revoked : null;
  }
  if (namespace === 'razorpay_billing_events') {
    const events = readBillingEventLog();
    return events.length > 0 ? events : null;
  }
  return null;
});
