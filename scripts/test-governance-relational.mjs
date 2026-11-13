/**
 * HIGH-009R — Relational approvals, billing subscriptions and audit events.
 *
 * Seeds a version-2 database with large legacy snapshots, kills the version-3
 * migration while its WAL is growing, then verifies exact-once recovery,
 * schema constraints, tenant isolation, version conflicts and audit rollback.
 */
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-governance-${process.pid}.sqlite`);
const REQUESTS = 8000;
const AUDIT_EVENTS = 20000;
const SUBSCRIPTIONS = 600;
const CONFIGS = 8;
const NOW = '2026-10-01T00:00:00.000Z';

let passed = 0;
let failed = 0;

function check(condition, message, detail) {
  if (condition) {
    console.log(`  ✅ [GOV_PASS] ${message}`);
    passed++;
  } else {
    failed++;
    console.error(`  ❌ [GOV_FAIL] ${message}${detail ? `: ${detail}` : ''}`);
  }
}

async function checkThrows(name, fn, pattern) {
  try {
    await fn();
    check(false, name, 'operation succeeded but should have failed');
  } catch (error) {
    check(pattern.test(String(error?.message || error)), name, String(error?.message || error));
  }
}

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(`${DB}${suffix}`, { force: true });
    } catch {
      // Best-effort.
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const walSize = () => {
  try { return fs.statSync(`${DB}-wal`).size; } catch { return 0; }
};

function buildLegacySnapshots() {
  const requests = [];
  const logs = [];
  const audit = [];
  const subscriptions = [];
  const events = [];
  const payments = [];
  const webhookEvents = [];
  const refundEvents = [];
  const autonomyConfigs = [];

  for (let i = 0; i < REQUESTS; i++) {
    const id = i === 0 ? 'appr_pending_0' : `appr_mig_${i}`;
    const pending = i !== 1;
    requests.push({
      id,
      organization_id: 'org_gov_migration',
      subject_type: 'invoice',
      subject_id: `inv_mig_${i}`,
      action_type: 'OTHER_HIGH_RISK',
      proposed_action: { action: 'review', index: i },
      evidence: [{ source: 'legacy', index: i }],
      confidence: 0.9,
      proposed_by: 'legacy-agent',
      status: pending ? 'pending' : 'approved',
      reviewed_by_user_id: pending ? null : 'legacy-reviewer',
      reviewed_at: pending ? null : NOW,
      modification: null,
      rejection_reason: null,
      execution_status: pending ? 'not_applicable' : 'pending',
      execution_error: null,
      executed_at: null,
      created_at: NOW,
    });
    logs.push({
      id: `log_created_${i}`,
      approval_request_id: id,
      event_type: 'created',
      actor_user_id: null,
      details: { action_type: 'OTHER_HIGH_RISK' },
      created_at: NOW,
    });
    if (!pending) {
      logs.push({
        id: `log_approved_${i}`,
        approval_request_id: id,
        event_type: 'approved',
        actor_user_id: 'legacy-reviewer',
        details: { action_type: 'OTHER_HIGH_RISK' },
        created_at: NOW,
      });
    }
  }
  for (let i = 0; i < CONFIGS; i++) {
    autonomyConfigs.push({
      id: `auto_${i}`,
      organization_id: 'org_gov_migration',
      action_type: `ACTION_${i}`,
      auto_approve_enabled: false,
      min_confidence_threshold: 0.99,
    });
  }

  for (let i = 0; i < SUBSCRIPTIONS; i++) {
    const orgId = `org_gov_${i}`;
    subscriptions.push({
      id: `sub_mig_${i}`,
      organization_id: orgId,
      plan_id: i % 2 === 0 ? 'starter' : 'growth',
      status: 'active',
      billing_interval: 'monthly',
      current_period_start: NOW,
      current_period_end: '2026-11-01T00:00:00.000Z',
      created_at: NOW,
      updated_at: NOW,
      version: 0,
    });
    events.push({
      id: `use_mig_${i}`,
      organization_id: orgId,
      event_type: 'invoice.processed',
      quantity: 1,
      metadata: null,
      occurred_at: NOW,
    });
    payments.push({
      id: `pay_mig_${i}`,
      organization_id: orgId,
      source_system: 'legacy',
      source_id: `PAY-${i}`,
      customer_id: `cust_${i}`,
      provider_payment_id: `provider_pay_${i}`,
      amount_minor_units: 499900,
      currency: 'INR',
      date: '2026-10-01',
      status: 'paid',
      created_at: NOW,
      updated_at: NOW,
      refunded_amount_minor_units: 0,
    });
    webhookEvents.push({
      id: `wh_mig_${i}`,
      organization_id: orgId,
      provider_event_id: `evt_mig_${i}`,
      event_type: 'subscription.charged',
      status: 'PROCESSED',
      retry_count: 0,
      max_retries: 3,
      created_at: NOW,
      updated_at: NOW,
    });
    refundEvents.push({
      id: `ref_mig_${i}`,
      organization_id: orgId,
      provider_refund_id: `refund_mig_${i}`,
      payment_id: `pay_mig_${i}`,
      amount_minor_units: 1000,
      currency: 'INR',
      status: 'PROCESSED',
      created_at: NOW,
      updated_at: NOW,
    });
  }

  for (let i = 0; i < AUDIT_EVENTS; i++) {
    audit.push({
      id: `audit_mig_${i}`,
      organization_id: `org_gov_${i % SUBSCRIPTIONS}`,
      actor_user_id: null,
      actor_type: 'system',
      action_type: 'legacy.event',
      subject_type: 'invoice',
      subject_id: `inv_mig_${i}`,
      before_state: null,
      after_state: { index: i },
      ai_context: null,
      approval_context: null,
      result: 'success',
      created_at: NOW,
    });
  }

  return {
    approvals: { requests, logs, autonomyConfigs },
    billing: { events, subscriptions, payments, webhookEvents, refundEvents },
    audit,
  };
}

function seedLegacyDatabase(snapshots) {
  cleanup();
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`
    CREATE TABLE repository_snapshots (
      namespace TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE repository_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  db.prepare('INSERT INTO repository_schema_migrations(version, applied_at) VALUES (2, ?)').run(NOW);
  const insert = db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)');
  insert.run('approvals', JSON.stringify(snapshots.approvals), NOW);
  insert.run('billing', JSON.stringify(snapshots.billing), NOW);
  insert.run('audit', JSON.stringify(snapshots.audit), NOW);
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
}

function runWorker(mode) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--import', './scripts/test-only-server-modules.mjs', '--import', 'tsx', 'scripts/governance-recovery-worker.mjs'],
      {
        cwd: process.cwd(),
        env: { ...process.env, AIOSPARK_DB_PATH: DB, AIOSPARK_TEST_MODE: 'false', WORKER_MODE: mode },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => {
      let result = null;
      for (const line of stdout.trim().split('\n').reverse()) {
        try { result = JSON.parse(line); break; } catch { /* loader output */ }
      }
      resolve({ code, signal, stdout, stderr, result });
    });
  });
}

function runMigrationAndKill() {
  return new Promise((resolve) => {
    const baseline = walSize();
    const child = spawn(
      process.execPath,
      ['--import', './scripts/test-only-server-modules.mjs', '--import', 'tsx', 'scripts/governance-recovery-worker.mjs'],
      {
        cwd: process.cwd(),
        env: { ...process.env, AIOSPARK_DB_PATH: DB, AIOSPARK_TEST_MODE: 'false', WORKER_MODE: 'migrate' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    let killed = false;
    let observed = 0;
    let closed = false;
    let timer = null;

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    const finish = (code, signal) => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      resolve({ code, signal, stdout, stderr, killed, baseline, observed });
    };
    child.on('close', (code, signal) => finish(code, signal));
    timer = setInterval(() => {
      const size = walSize();
      if (!killed && size - baseline >= 128 * 1024) {
        observed = size;
        killed = child.kill('SIGKILL');
      }
    }, 2);
  });
}

function inspectRaw() {
  const db = new DatabaseSync(DB);
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  const counts = {};
  for (const table of [
    'approval_requests', 'approval_decisions', 'approval_logs', 'approval_autonomy_configs',
    'billing_subscriptions', 'billing_subscription_history', 'audit_events',
  ]) {
    counts[table] = existing.has(table) ? db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count : 0;
  }
  const snapshotRows = existing.has('repository_snapshots')
    ? db.prepare('SELECT namespace, payload FROM repository_snapshots').all()
    : [];
  const snapshots = Object.fromEntries(snapshotRows.map((row) => [row.namespace, JSON.parse(row.payload)]));
  const result = {
    counts,
    snapshots,
    integrity: db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check),
    foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all().length,
    schemaVersion: db.prepare('SELECT MAX(version) AS version FROM repository_schema_migrations').get().version,
  };
  db.close();
  return result;
}

console.log('\n==========================================');
console.log('HIGH-009R GOVERNANCE RELATIONAL SUITE');
console.log('==========================================\n');
console.log(`DB_PATH=${DB}`);
console.log(`legacy: requests=${REQUESTS}, audit=${AUDIT_EVENTS}, subscriptions=${SUBSCRIPTIONS}`);

const snapshots = buildLegacySnapshots();
seedLegacyDatabase(snapshots);
const before = inspectRaw();
check(before.schemaVersion === 2, 'Seeded database starts at version 2', String(before.schemaVersion));
check(before.counts.approval_requests === 0, 'Relational approval tables are initially empty');
check(before.snapshots.approvals?.requests?.length === REQUESTS, 'Legacy approval snapshot is complete');
check(before.snapshots.audit?.length === AUDIT_EVENTS, 'Legacy audit snapshot is complete');
check(before.snapshots.billing?.subscriptions?.length === SUBSCRIPTIONS, 'Legacy subscriptions are complete');

const interrupted = await runMigrationAndKill();
console.log(`kill: signal=${interrupted.signal} killed=${interrupted.killed} baselineWal=${interrupted.baseline} killWal=${interrupted.observed}`);
check(interrupted.killed, 'Version-3 migration accepted SIGKILL', interrupted.stderr || interrupted.stdout);
check(interrupted.signal === 'SIGKILL', 'Version-3 migration was interrupted by SIGKILL', String(interrupted.signal));
check(interrupted.observed > interrupted.baseline, 'SIGKILL was sent while migration WAL was growing');

const afterKill = inspectRaw();
check(afterKill.integrity[0] === 'ok', 'Interrupted database passes integrity_check', JSON.stringify(afterKill.integrity));
check(afterKill.foreignKeyViolations === 0, 'Interrupted database has zero foreign-key violations');
check(afterKill.counts.approval_requests === 0, 'Uncommitted approval rows rolled back');
check(afterKill.counts.audit_events === 0, 'Uncommitted audit rows rolled back');
check(afterKill.counts.billing_subscriptions === 0, 'Uncommitted subscriptions rolled back');
check(afterKill.snapshots.approvals?.requests?.length === REQUESTS, 'Approval snapshot survives interrupted migration');
check(afterKill.snapshots.audit?.length === AUDIT_EVENTS, 'Audit snapshot survives interrupted migration');
check(afterKill.snapshots.billing?.subscriptions?.length === SUBSCRIPTIONS, 'Billing snapshot survives interrupted migration');

const migrated = await runWorker('verify');
check(migrated.code === 0 && migrated.result?.ok, 'Fresh-process migration succeeds', migrated.stderr);
const m = migrated.result;
check(m?.schemaVersion === 4, 'Migration records schema version 4', String(m?.schemaVersion));
check(m?.integrity?.[0] === 'ok', 'Migrated database passes integrity_check');
check(m?.foreignKeyViolations === 0, 'Migrated database has zero foreign-key violations');
check(m?.counts?.approval_requests === REQUESTS, 'All approval requests recovered', String(m?.counts?.approval_requests));
check(m?.counts?.approval_decisions === 1, 'Terminal decision recovered exactly once', String(m?.counts?.approval_decisions));
check(m?.counts?.approval_logs === REQUESTS + 1, 'All approval logs recovered', String(m?.counts?.approval_logs));
check(m?.counts?.approval_autonomy_configs === CONFIGS, 'Autonomy configs recovered', String(m?.counts?.approval_autonomy_configs));
check(m?.counts?.billing_subscriptions === SUBSCRIPTIONS, 'All subscriptions recovered', String(m?.counts?.billing_subscriptions));
check(m?.counts?.billing_subscription_history === SUBSCRIPTIONS, 'Subscription history initialized once per subscription');
check(m?.counts?.audit_events === AUDIT_EVENTS, 'All audit events recovered', String(m?.counts?.audit_events));
check(m?.migrations === 3, 'All three governance migration markers recorded', String(m?.migrations));
check(m?.snapshots?.approvals === false, 'Approval snapshot deleted after committed migration');
check(m?.snapshots?.audit === false, 'Audit snapshot deleted after committed migration');
check(m?.snapshots?.billing === true, 'Billing snapshot retains non-subscription data');
check(m?.directBillingSubscriptionCount === SUBSCRIPTIONS, 'Direct billing view exposes relational subscriptions');
check(m?.directAuditCount === AUDIT_EVENTS, 'Direct audit view exposes relational events');

const second = await runWorker('verify');
check(second.result?.migrated === false, 'Rerunning version-3 migration is a no-op');
check(second.result?.counts?.approval_requests === REQUESTS, 'Rerun does not duplicate approvals');
check(second.result?.counts?.audit_events === AUDIT_EVENTS, 'Rerun does not duplicate audit events');

// ---------------------------------------------------------------------------
// Store-level behavior, constraints and tenant isolation
// ---------------------------------------------------------------------------
process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';
const { approvalStore, ApprovalConflictError } = await import('../src/lib/approvals/store.ts');
const { auditStore } = await import('../src/lib/audit/store.ts');
const { billingStore, BillingConflictError } = await import('../src/lib/billing/store.ts');
const { AuditService } = await import('../src/lib/audit/service.ts');
const { getDatabase, getSchemaVersion, closeDatabase } = await import('../src/lib/db/durable-repository.ts');
const { readBillingSubscriptionHistory } = await import('../src/lib/db/governance-repository.ts');

const db = getDatabase();
check(getSchemaVersion() === 4, 'Runtime schema version is 4');
check(approvalStore.getRequest('appr_pending_0')?.status === 'pending', 'Pending approval readable relationally');
check(approvalStore.getLogs('appr_pending_0').length === 1, 'Approval log readable relationally');
check(auditStore.query({ organizationId: 'org_gov_0' }).length > 0, 'Audit events readable for their tenant');
check(auditStore.query({ organizationId: 'org_not_present' }).length === 0, 'Audit tenant isolation enforced');
check(approvalStore.getRequests('org_not_present').length === 0, 'Approval tenant isolation enforced');

await checkThrows('Invalid approval status is rejected by CHECK', () =>
  db.exec("UPDATE approval_requests SET status = 'invalid' WHERE id = 'appr_pending_0'"), /CHECK/i);
await checkThrows('Confidence outside 0..1 is rejected by CHECK', () =>
  db.exec("UPDATE approval_requests SET confidence = 2 WHERE id = 'appr_pending_0'"), /CHECK/i);
await checkThrows('Approval log with missing request violates FK', () =>
  db.exec(`INSERT INTO approval_logs(id, organization_id, approval_request_id, event_type, actor_user_id, details, created_at)
    VALUES ('log_bad_fk','org_gov_migration','missing_request','created',NULL,'{}','${NOW}')`), /FOREIGN KEY/i);
await checkThrows('Approval log tenant mismatch is rejected by trigger', () =>
  db.exec(`INSERT INTO approval_logs(id, organization_id, approval_request_id, event_type, actor_user_id, details, created_at)
    VALUES ('log_bad_org','org_other','appr_pending_0','created',NULL,'{}','${NOW}')`), /tenant does not match/i);
await checkThrows('Decision tenant mismatch is rejected by trigger', () =>
  db.exec(`INSERT INTO approval_decisions(approval_request_id, organization_id, decision, reviewer_user_id, decided_at)
    VALUES ('appr_mig_1','org_other','approved','reviewer','${NOW}')`), /tenant does not match/i);
await checkThrows('Decision must match request status', () =>
  db.exec(`INSERT INTO approval_decisions(approval_request_id, organization_id, decision, reviewer_user_id, decided_at)
    VALUES ('appr_pending_0','org_gov_migration','approved','reviewer','${NOW}')`), /does not match request status/i);
await checkThrows('Terminal decisions are immutable', () =>
  db.exec("UPDATE approval_decisions SET reason = 'tampered' WHERE approval_request_id = 'appr_mig_1'"), /immutable/i);
await checkThrows('Audit events reject UPDATE', () =>
  db.exec("UPDATE audit_events SET result = 'reverted' WHERE id = 'audit_mig_0'"), /append-only/i);
await checkThrows('Audit events reject DELETE', () =>
  db.exec("DELETE FROM audit_events WHERE id = 'audit_mig_0'"), /append-only/i);
await checkThrows('Subscription version cannot jump by more than one', () =>
  db.exec("UPDATE billing_subscriptions SET version = version + 2 WHERE organization_id = 'org_gov_0'"), /increase by exactly one/i);
await checkThrows('Duplicate subscription history version is rejected', () =>
  db.exec(`INSERT INTO billing_subscription_history(id, organization_id, version, plan_id, status, changed_at, payload)
    VALUES ('hist_duplicate','org_gov_0',0,'starter','active','${NOW}','{}')`), /UNIQUE/i);

const seededSubscription = billingStore.getSubscription('org_gov_0');
check(seededSubscription.version === 0, 'Subscription version loaded from relational row');
const updatedSubscription = billingStore.setSubscription('org_gov_0', { plan_id: 'growth' }, { expectedVersion: 0 });
check(updatedSubscription.version === 1, 'Versioned subscription update commits');
check(readBillingSubscriptionHistory('org_gov_0').length === 2, 'Subscription history records the new version');
await checkThrows('Stale subscription write is rejected', () =>
  billingStore.setSubscription('org_gov_0', { plan_id: 'starter' }, { expectedVersion: 0 }),
  /changed by another process/i);

const singleDecision = approvalStore.createRequest({
  organization_id: 'org_gov_migration',
  subject_type: 'invoice',
  subject_id: 'inv_single_decision',
  action_type: 'OTHER_HIGH_RISK',
  proposed_action: { action: 'review' },
  evidence: [],
  confidence: 0.9,
  proposed_by: 'gov-test',
});
approvalStore.approveRequest(singleDecision.id, 'reviewer-1');
check(approvalStore.getRequest(singleDecision.id)?.status === 'approved', 'Approval decision commits');
check(db.prepare('SELECT COUNT(*) AS count FROM approval_decisions WHERE approval_request_id = ?').get(singleDecision.id).count === 1,
  'One terminal decision row exists');
await checkThrows('Second terminal decision is rejected', () =>
  approvalStore.rejectRequest(singleDecision.id, 'reviewer-2', 'late'), /already approved/i);
check(approvalStore.getLogs(singleDecision.id).filter((log) => log.event_type === 'approved').length === 1,
  'Only one terminal approval log exists');

const rollbackTarget = approvalStore.createRequest({
  organization_id: 'org_gov_migration',
  subject_type: 'invoice',
  subject_id: 'inv_rollback',
  action_type: 'OTHER_HIGH_RISK',
  proposed_action: { action: 'review' },
  evidence: [],
  confidence: 0.9,
  proposed_by: 'gov-test',
});
const originalRecord = AuditService.record;
AuditService.record = () => { throw new Error('injected governance audit failure'); };
try {
  assert.throws(() => approvalStore.approveRequest(rollbackTarget.id, 'reviewer-3'), /injected governance audit failure/);
} finally {
  AuditService.record = originalRecord;
}
check(approvalStore.getRequest(rollbackTarget.id)?.status === 'pending', 'Audit failure rolls back approval request');
check(db.prepare('SELECT COUNT(*) AS count FROM approval_decisions WHERE approval_request_id = ?').get(rollbackTarget.id).count === 0,
  'Audit failure leaves no terminal decision');
check(approvalStore.getLogs(rollbackTarget.id).every((log) => log.event_type !== 'approved'), 'Audit failure leaves no approval decision log');
check(auditStore.query({ organizationId: 'org_gov_migration' })
  .filter((event) => event.approval_context?.approval_request_id === rollbackTarget.id && event.action_type.endsWith('.approved')).length === 0,
  'Audit failure leaves no decision audit event');

const retried = approvalStore.approveRequest(rollbackTarget.id, 'reviewer-3');
check(retried.status === 'approved', 'Rolled-back approval remains usable');
check(db.prepare('PRAGMA integrity_check').all()[0].integrity_check === 'ok', 'Final integrity_check is ok');
check(db.prepare('PRAGMA foreign_key_check').all().length === 0, 'Final foreign-key check is clean');

console.log(`\nGOVERNANCE SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
closeDatabase();
cleanup();
if (failed > 0) process.exit(1);
