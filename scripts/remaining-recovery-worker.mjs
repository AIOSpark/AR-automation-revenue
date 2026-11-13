/**
 * HIGH-009S: remaining-namespace migration recovery test.
 *
 * Seeds a version-0 SQLite database with legacy operational snapshots for all
 * namespaces not yet migrated, starts the v4 backfill in another OS process,
 * kills it with SIGKILL while the backfill WAL is growing, then restarts and
 * verifies every record exactly once, zero foreign-key violations, and that
 * rerunning is a no-op.
 *
 * Run with:
 *   node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/remaining-recovery-worker.mjs
 */

import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-remaining-recovery-${process.pid}.sqlite`);
const ORG = 'org_remaining_recovery';

process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';

const TABLES = [
  'execution_records',
  'reconciliation_outcomes',
  'import_batches',
  'import_errors',
  'import_duplicates',
  'auth_users',
  'auth_organizations',
  'auth_session_revocations',
  'tenant_members',
  'tenant_invites',
  'tenant_records',
  'billing_usage_events',
  'billing_payments',
  'billing_webhook_events',
  'billing_refund_events',
  'billing_event_log',
];

const EXPECTED_COUNTS = {
  execution_records: 0,
  reconciliation_outcomes: 0,
  import_batches: 3,
  import_errors: 6,
  import_duplicates: 3,
  auth_users: 3,
  auth_organizations: 3,
  auth_session_revocations: 3,
  tenant_members: 6,
  tenant_invites: 3,
  tenant_records: 3,
  billing_usage_events: 9,
  billing_payments: 6,
  billing_webhook_events: 3,
  billing_refund_events: 3,
  billing_event_log: 3,
};

// Seed tables with operator records from legacy snapshots
function seedLegacyDatabase() {
  const now = '2026-10-01T00:00:00.000Z';
  const now_sec = '2026-10-01T00:00:00';

  const db = new DatabaseSync(DB);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE repository_snapshots (
      namespace TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE repository_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  db.prepare('INSERT INTO repository_schema_migrations(version, applied_at) VALUES (0, ?)').run('2026-09-01T00:00:00.000Z');

  // UDMAuth organizations
  const org1 = { id: 'org_rem_1', name: 'Org Rem 1', size: 'small', industry: 'tech', created_by_user_id: 'usr_admin', created_at: now, updated_at: now };
  const org2 = { id: 'org_rem_2', name: 'Org Rem 2', size: 'medium', industry: 'health', created_by_user_id: 'usr_admin', created_at: now, updated_at: now };
  const org3 = { id: 'org_rem_3', name: 'Org Rem 3', size: 'large', industry: 'finance', created_by_user_id: 'usr_admin', created_at: now, updated_at: now };

  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run('auth', JSON.stringify({
    users: [
      { id: 'usr_rem_1', auth_provider_id: 'google-1', email: 'a@test.com', first_name: 'Alice', last_name: 'Admin', phone: null, role_title: 'admin', email_verified: true, created_at: now, updated_at: now },
      { id: 'usr_rem_2', auth_provider_id: 'google-2', email: 'b@test.com', first_name: 'Bob', last_name: 'User', phone: '+15551234', role_title: 'viewer', email_verified: false, created_at: now, updated_at: now },
    ],
    organizations: [org1, org2, org3],
  }), '2026-10-01T00:00:00.000Z');

  // Tenant data
  const members = [
    { id: 'mem_rem_1', user_id: 'usr_rem_1', organization_id: 'org_rem_1', role: 'admin', created_at: now },
    { id: 'mem_rem_2', user_id: 'usr_rem_2', organization_id: 'org_rem_1', role: 'viewer', created_at: now },
    { id: 'mem_rem_3', user_id: 'usr_rem_1', organization_id: 'org_rem_2', role: 'editor', created_at: now },
    { id: 'mem_rem_4', user_id: 'usr_rem_2', organization_id: 'org_rem_2', role: 'viewer', created_at: now },
    { id: 'mem_rem_5', user_id: 'usr_rem_1', organization_id: 'org_rem_3', role: 'admin', created_at: now },
    { id: 'mem_rem_6', user_id: 'usr_rem_2', organization_id: 'org_rem_3', role: 'viewer', created_at: now },
  ];

  const invites = [
    { id: 'inv_rem_1', organization_id: 'org_rem_1', email: 'carol@test.com', role: 'admin', invited_by_user_id: 'usr_rem_1', status: 'pending', token: 'tok_rem_1', created_at: now },
    { id: 'inv_rem_2', organization_id: 'org_rem_2', email: 'dave@test.com', role: 'viewer', invited_by_user_id: 'usr_rem_2', status: 'pending', token: 'tok_rem_2', created_at: now },
    { id: 'inv_rem_3', organization_id: 'org_rem_3', email: 'eve@test.com', role: 'editor', invited_by_user_id: 'usr_rem_3', status: 'pending', token: 'tok_rem_3', created_at: now },
  ];

  const tenantRecords = [
    { table_name: 'customers', id: 'rec_rem_1', organization_id: 'org_rem_1', row_data: { name: 'Rec 1' }, created_at: now },
    { table_name: 'invoices', id: 'rec_rem_2', organization_id: 'org_rem_2', row_data: { amount: 100 }, created_at: now },
    { table_name: 'payments', id: 'rec_rem_3', organization_id: 'org_rem_3', row_data: { amount: 50 }, created_at: now },
  ];

  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run('tenant', JSON.stringify({
    members,
    invites,
    tenantTables: { customers: members, invoices: members.slice(0,2), payments: members.slice(0,1) },
  }), '2026-10-01T00:00:00.000Z');

  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run('tenant_records', JSON.stringify({
    records: tenantRecords,
  }), '2026-10-01T00:00:00.000Z');

  // Execution data
  const executions = [
    { id: 'exc_rem_1', organization_id: 'org_rem_1', idempotency_key: 'idem_rem_1', status: 'completed', payload: {}, created_at: now, updated_at: now },
    { id: 'exc_rem_2', organization_id: 'org_rem_2', idempotency_key: 'idem_rem_2', status: 'processing', payload: {}, created_at: now, updated_at: now },
    { id: 'exc_rem_3', organization_id: 'org_rem_3', idempotency_key: 'idem_rem_3', status: 'pending', payload: {}, created_at: now, updated_at: now },
  ];

  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run('execution', JSON.stringify({ executions }), '2026-10-01T00:00:00.000Z');

  // Reconciliation outcomes
  const outcomes = [
    { id: 'outc_rem_1', organization_id: 'org_rem_1', bank_transaction_id: 'bank_rem_1', original_confidence: 0.95, original_match_method: 'deterministic', action_type: 'payment_reconciliation_match', outcome: 'approved', final_invoice_ids: ['inv_rem_1'], reviewed_by_user_id: 'usr_rem_1', reviewed_at: now, created_at: now },
    { id: 'outc_rem_2', organization_id: 'org_rem_2', bank_transaction_id: 'bank_rem_2', original_confidence: 0.78, original_match_method: 'fuzzy', action_type: 'payment_reconciliation_match', outcome: 'rejected', final_invoice_ids: [], reviewed_by_user_id: 'usr_rem_2', rejection_reason: null, reviewed_at: now, created_at: now },
  ];

  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run('reconciliation_outcomes', JSON.stringify({ outcomes }), '2026-10-01T00:00:00.000Z');

  // Import data
  const importBatches = [
    { id: 'batch_rem_1', organization_id: 'org_rem_1', status: 'completed', total_rows: 100, created_at: now, updated_at: now },
    { id: 'batch_rem_2', organization_id: 'org_rem_2', status: 'completed', total_rows: 85, created_at: now, updated_at: now },
    { id: 'batch_rem_3', organization_id: 'org_rem_3', status: 'pending', total_rows: 42, created_at: now, updated_at: now },
  ];

  const importErrors = [
    { id: 'err_rem_1', organization_id: 'org_rem_1', import_batch_id: 'batch_rem_1', raw_row_reference: 'row-1', reason: 'Invalid amount', field: 'amount', created_at: now },
    { id: 'err_rem_2', organization_id: 'org_rem_1', import_batch_id: 'batch_rem_1', raw_row_reference: 'row-2', reason: 'Missing required field', field: 'name', created_at: now },
    { id: 'err_rem_3', organization_id: 'org_rem_2', import_batch_id: 'batch_rem_2', raw_row_reference: 'row-1', reason: 'Unparseable date', field: 'due_date', created_at: now },
    { id: 'err_rem_4', organization_id: 'org_rem_2', import_batch_id: 'batch_rem_2', raw_row_reference: 'row-2', reason: 'Duplicate invoice', field: 'invoice_id', created_at: now },
    { id: 'err_rem_5', organization_id: 'org_rem_3', import_batch_id: 'batch_rem_3', raw_row_reference: 'row-1', reason: 'Invalid currency', field: 'currency', created_at: now },
    { id: 'err_rem_6', organization_id: 'org_rem_3', import_batch_id: 'batch_rem_3', raw_row_reference: 'row-2', reason: 'Missing invoice', field: 'invoice_id', created_at: now },
  ];

  const importDuplicates = [
    { id: 'dup_rem_1', organization_id: 'org_rem_1', import_batch_id: 'batch_rem_1', incoming_record_json: 'json-row-1', existing_record_id: 'inv_rem_1', confidence: 0.85, status: 'pending', created_at: now },
    { id: 'dup_rem_2', organization_id: 'org_rem_2', import_batch_id: 'batch_rem_2', incoming_record_json: 'json-row-2', existing_record_id: 'inv_rem_2', confidence: 0.88, status: 'pending', created_at: now },
    { id: 'dup_rem_3', organization_id: 'org_rem_3', import_batch_id: 'batch_rem_3', incoming_record_json: 'json-row-3', existing_record_id: 'inv_rem_3', confidence: 0.91, status: 'pending', created_at: now },
  ];

  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run('import', JSON.stringify({
    batches: importBatches,
    errors: importErrors,
    duplicates: importDuplicates,
  }), '2026-10-01T00:00:00.000Z');

  // Session revocations
  const revocations = [
    { jti: 'rev_rem_1', exp: Math.floor(Date.now() / 1000) + 86400, organization_id: 'org_rem_1', created_at: now_sec },
    { jti: 'rev_rem_2', exp: Math.floor(Date.now() / 1000) + 86400, organization_id: 'org_rem_2', created_at: now_sec },
    { jti: 'rev_rem_3', exp: Math.floor(Date.now() / 1000) + 86400, organization_id: 'org_rem_3', created_at: now_sec },
  ];

  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run('auth_session_revocations', JSON.stringify({ revocations }), '2026-10-01T00:00:00.000Z');

  // Billing data
  const billingPayments = [
    { id: 'pay_rem_1', organization_id: 'org_rem_1', amount_minor_units: 50000, currency: 'INR', status: 'succeeded', provider: 'razorpay', provider_payment_id: 'py_rem_1', created_at: now },
    { id: 'pay_rem_2', organization_id: 'org_rem_2', amount_minor_units: 35000, currency: 'INR', status: 'succeeded', provider: 'razorpay', provider_payment_id: 'py_rem_2', created_at: now },
    { id: 'pay_rem_3', organization_id: 'org_rem_3', amount_minor_units: 75000, currency: 'INR', status: 'succeeded', provider: 'razorpay', provider_payment_id: 'py_rem_3', created_at: now },
  ];

  const billingUsageEvents = [
    { id: 'use_rem_1', organization_id: 'org_rem_1', event_type: 'invoice_created', quantity: 1, metadata: null, occurred_at: now },
    { id: 'use_rem_2', organization_id: 'org_rem_1', event_type: 'invoice_created', quantity: 1, metadata: null, occurred_at: now },
    { id: 'use_rem_3', organization_id: 'org_rem_2', event_type: 'payment_succeeded', quantity: 1, metadata: null, occurred_at: now },
    { id: 'use_rem_4', organization_id: 'org_rem_2', event_type: 'payment_succeeded', quantity: 1, metadata: null, occurred_at: now },
    { id: 'use_rem_5', organization_id: 'org_rem_3', event_type: 'invoice_created', quantity: 1, metadata: null, occurred_at: now },
    { id: 'use_rem_6', organization_id: 'org_rem_3', event_type: 'invoice_created', quantity: 1, metadata: null, occurred_at: now },
    { id: 'use_rem_7', organization_id: 'org_rem_1', event_type: 'invoice_created', quantity: 1, metadata: null, occurred_at: now },
    { id: 'use_rem_8', organization_id: 'org_rem_2', event_type: 'invoice_created', quantity: 1, metadata: null, occurred_at: now },
    { id: 'use_rem_9', organization_id: 'org_rem_3', event_type: 'invoice_created', quantity: 1, metadata: null, occurred_at: now },
  ];

  const billingWebhookEvents = [
    { provider_event_id: 'we_rem_1', organization_id: 'org_rem_1', event_type: 'payment_success', signature_verified: true, created_at: now },
    { provider_event_id: 'we_rem_2', organization_id: 'org_rem_2', event_type: 'payment_failed', signature_verified: false, created_at: now },
    { provider_event_id: 'we_rem_3', organization_id: 'org_rem_3', event_type: 'refund_initiated', signature_verified: true, created_at: now },
  ];

  const billingRefundEvents = [
    { provider_refund_id: 'ref_rem_1', organization_id: 'org_rem_1', amount_minor_units: 25000, currency: 'INR', status: 'succeeded', provider: 'razorpay', created_at: now },
    { provider_refund_id: 'ref_rem_2', organization_id: 'org_rem_2', amount_minor_units: 15000, currency: 'INR', status: 'succeeded', provider: 'razorpay', created_at: now },
    { provider_refund_id: 'ref_rem_3', organization_id: 'org_rem_3', amount_minor_units: 35000, currency: 'INR', status: 'succeeded', provider: 'razorpay', created_at: now },
  ];

  const billingEventLog = [
    { id: 'log_rem_1', organization_id: 'org_rem_1', event_type: 'payment_reconciliation_match', result: 'success', created_at: now },
    { id: 'log_rem_2', organization_id: 'org_rem_2', event_type: 'payment_reconciliation_match', result: 'success', created_at: now },
    { id: 'log_rem_3', organization_id: 'org_rem_3', event_type: 'payment_reconciliation_match', result: 'success', created_at: now },
  ];

  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)').run('billing', JSON.stringify({
    payments: billingPayments,
    usage_events: billingUsageEvents,
    webhook_events: billingWebhookEvents,
    refund_events: billingRefundEvents,
    event_log: billingEventLog,
  }), '2026-10-01T00:00:00.000Z');

  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  return { db, now, now_sec, org1, org2, org3, members, invites, tenantRecords, executions, outcomes, importBatches, importErrors, importDuplicates, revocations, billingPayments, billingUsageEvents, billingWebhookEvents, billingRefundEvents, billingEventLog };
}

// ... rest of the script continues below