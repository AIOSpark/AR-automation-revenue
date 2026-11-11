/**
 * HIGH-009 migration recovery acceptance test.
 *
 * Seeds a version-1 SQLite database with a large legacy UDM snapshot, starts
 * the real version-2 backfill in another OS process, kills it with SIGKILL
 * while the backfill WAL is growing, then restarts and verifies the migration
 * preserved every record exactly once.
 *
 * Run with:
 *   node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/test-migration-recovery.mjs
 */
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-migration-recovery-${process.pid}.sqlite`);
const ORG = 'org_migration_recovery';
const CUSTOMERS = 400;
const INVOICES = 30000;
const PAYMENTS = 4000;
const MATCHES = 4000;
const CREDIT_NOTES = 400;
const ALLOCATIONS = 400;
const DISPUTES = 400;
const EVIDENCES = 400;
const EXCEPTIONS = 400;
const BANK_TRANSACTIONS = 400;
const IDEMPOTENCY_KEYS = 4000;
const API_KEYS = 400;

const EXPECTED_COUNTS = {
  udm_customers: CUSTOMERS,
  udm_contacts: CUSTOMERS,
  udm_invoices: INVOICES,
  udm_payments: PAYMENTS,
  udm_payment_matches: MATCHES,
  udm_credit_notes: CREDIT_NOTES,
  udm_credit_allocations: ALLOCATIONS,
  udm_disputes: DISPUTES,
  udm_dispute_evidence: EVIDENCES,
  udm_exceptions: EXCEPTIONS,
  udm_bank_transactions: BANK_TRANSACTIONS,
  udm_idempotency_keys: IDEMPOTENCY_KEYS,
  udm_api_idempotency_keys: API_KEYS,
};

const INVOICE_TOTAL = INVOICES * 100000 + Array.from({ length: INVOICES }, (_, i) => i % 1000)
  .reduce((sum, value) => sum + value, 0);
const PAYMENT_TOTAL = PAYMENTS * 50000;
const MATCH_TOTAL = MATCHES * 25000;

let passed = 0;
let failed = 0;

function check(condition, message, detail) {
  if (condition) {
    console.log(`  ✅ [MIGRATION_RECOVERY_PASS] ${message}`);
    passed++;
  } else {
    failed++;
    console.error(`  ❌ [MIGRATION_RECOVERY_FAIL] ${message}${detail ? `: ${detail}` : ''}`);
  }
}

function cleanupDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.rmSync(`${DB}${suffix}`, { force: true });
    } catch {
      // Best-effort cleanup.
    }
  }
}

function walSize() {
  try {
    return fs.statSync(`${DB}-wal`).size;
  } catch {
    return 0;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildLegacyState() {
  const now = '2026-10-01T00:00:00.000Z';
  const customers = Array.from({ length: CUSTOMERS }, (_, i) => ({
    id: `cust_mr_${i}`,
    organization_id: ORG,
    source_system: 'csv',
    source_id: `C-${i}`,
    name: `Migration Customer ${i}`,
    credit_limit_minor_units: 1000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_at: now,
    updated_at: now,
  }));
  const contacts = Array.from({ length: CUSTOMERS }, (_, i) => ({
    id: `contact_mr_${i}`,
    organization_id: ORG,
    customer_id: `cust_mr_${i}`,
    name: `Contact ${i}`,
    email: `contact${i}@example.test`,
    created_at: now,
    updated_at: now,
  }));
  const invoices = Array.from({ length: INVOICES }, (_, i) => ({
    id: `inv_mr_${i}`,
    organization_id: ORG,
    source_system: 'csv',
    source_id: `INV-${i}`,
    customer_id: `cust_mr_${i % CUSTOMERS}`,
    number: `INV-${i}`,
    amount_minor_units: 100000 + (i % 1000),
    currency: 'INR',
    tax_amount_minor_units: 18000,
    issue_date: '2026-09-01',
    due_date: '2026-10-01',
    status: i % 5 === 0 ? 'partially_paid' : 'open',
    created_at: now,
    updated_at: now,
  }));
  const payments = Array.from({ length: PAYMENTS }, (_, i) => ({
    id: `pay_mr_${i}`,
    organization_id: ORG,
    source_system: 'csv',
    source_id: `PAY-${i}`,
    customer_id: `cust_mr_${i % CUSTOMERS}`,
    amount_minor_units: 50000,
    currency: 'INR',
    date: '2026-09-15',
    created_at: now,
    updated_at: now,
  }));
  const matches = Array.from({ length: MATCHES }, (_, i) => ({
    id: `match_mr_${i}`,
    organization_id: ORG,
    payment_id: `pay_mr_${i}`,
    invoice_id: `inv_mr_${i}`,
    matched_amount_minor_units: 25000,
    created_at: now,
  }));
  const creditNotes = Array.from({ length: CREDIT_NOTES }, (_, i) => ({
    id: `cn_mr_${i}`,
    organization_id: ORG,
    source_system: 'csv',
    source_id: `CN-${i}`,
    customer_id: `cust_mr_${i % CUSTOMERS}`,
    invoice_id: `inv_mr_${i}`,
    amount_minor_units: 5000,
    currency: 'INR',
    date: '2026-09-20',
    created_at: now,
    updated_at: now,
  }));
  const creditAllocations = Array.from({ length: ALLOCATIONS }, (_, i) => ({
    id: `ca_mr_${i}`,
    organization_id: ORG,
    credit_note_id: `cn_mr_${i}`,
    invoice_id: `inv_mr_${i}`,
    allocated_amount_minor_units: 5000,
    status: 'allocated',
    created_at: now,
    updated_at: now,
  }));
  const disputes = Array.from({ length: DISPUTES }, (_, i) => ({
    id: `disp_mr_${i}`,
    organization_id: ORG,
    invoice_id: `inv_mr_${i}`,
    status: 'open',
    amount_minor_units: 10000,
    reason: 'Migration fixture',
    created_at: now,
    updated_at: now,
  }));
  const disputeEvidences = Array.from({ length: EVIDENCES }, (_, i) => ({
    id: `ev_mr_${i}`,
    organization_id: ORG,
    dispute_id: `disp_mr_${i}`,
    kind: 'document',
    reference: `DOC-${i}`,
    created_at: now,
  }));
  const exceptions = Array.from({ length: EXCEPTIONS }, (_, i) => ({
    id: `exc_mr_${i}`,
    organization_id: ORG,
    customer_id: `cust_mr_${i % CUSTOMERS}`,
    invoice_id: `inv_mr_${i}`,
    severity: 'low',
    status: 'detected',
    created_at: now,
    updated_at: now,
  }));
  const bankTransactions = Array.from({ length: BANK_TRANSACTIONS }, (_, i) => ({
    id: `bank_mr_${i}`,
    organization_id: ORG,
    amount_minor_units: 50000,
    currency: 'INR',
    date: '2026-09-16',
    status: 'unmatched',
    reference: `BANK-${i}`,
    created_at: now,
    updated_at: now,
  }));
  const idempotencyKeys = Array.from({ length: IDEMPOTENCY_KEYS }, (_, i) => ({
    organization_id: ORG,
    key: `idem-mr-${i}`,
    record_id: `inv_mr_${i}`,
  }));
  const apiIdempotencyKeys = Array.from({ length: API_KEYS }, (_, i) => ({
    organization_id: ORG,
    endpoint: 'POST /api/invoices',
    key: `api-mr-${i}`,
    record_id: `inv_mr_${i}`,
    fingerprint: `fingerprint-${i}`,
    response: { id: `inv_mr_${i}`, status: 'created' },
  }));

  return {
    customers,
    contacts,
    invoices,
    payments,
    matches,
    creditNotes,
    creditAllocations,
    disputes,
    disputeEvidences,
    exceptions,
    bankTransactions,
    idempotencyKeys,
    apiIdempotencyKeys,
  };
}

function seedLegacyDatabase() {
  cleanupDbFiles();
  const state = buildLegacyState();
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
  db.prepare('INSERT INTO repository_schema_migrations(version, applied_at) VALUES (1, ?)')
    .run('2026-09-01T00:00:00.000Z');
  db.prepare('INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)')
    .run('udm', JSON.stringify(state), '2026-09-01T00:00:00.000Z');
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  return state;
}

function runWorker(mode) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['--import', './scripts/test-only-server-modules.mjs', '--import', 'tsx', 'scripts/migration-recovery-worker.mjs'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AIOSPARK_DB_PATH: DB,
          AIOSPARK_TEST_MODE: 'false',
          WORKER_MODE: mode,
        },
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
        try {
          result = JSON.parse(line);
          break;
        } catch {
          // Ignore loader output.
        }
      }
      resolve({ code, signal, stdout, stderr, result });
    });
  });
}

function runMigrationAndKillMidBackfill() {
  return new Promise((resolve) => {
    const baseline = walSize();
    const child = spawn(
      process.execPath,
      ['--import', './scripts/test-only-server-modules.mjs', '--import', 'tsx', 'scripts/migration-recovery-worker.mjs'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          AIOSPARK_DB_PATH: DB,
          AIOSPARK_TEST_MODE: 'false',
          WORKER_MODE: 'migrate',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';
    let killed = false;
    let peakWal = baseline;
    let observedAtKill = 0;
    let timer = null;
    let closed = false;

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const finish = (code, signal) => {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      resolve({ code, signal, stdout, stderr, killed, baseline, peakWal, observedAtKill });
    };

    child.on('close', (code, signal) => finish(code, signal));

    // The backfill writes millions of bytes inside one transaction. Kill the
    // process once its WAL shows real in-flight progress, before COMMIT.
    timer = setInterval(() => {
      const size = walSize();
      peakWal = Math.max(peakWal, size);
      if (!killed && size - baseline >= 512 * 1024) {
        observedAtKill = size;
        killed = child.kill('SIGKILL');
      }
    }, 2);
  });
}

function inspectRaw() {
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA foreign_keys = ON');
  const integrity = db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check);
  const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all();
  const version = db.prepare('SELECT MAX(version) AS version FROM repository_schema_migrations').get().version;
  const snapshotRow = db.prepare("SELECT payload FROM repository_snapshots WHERE namespace = 'udm'").get();
  const existingTables = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );
  const counts = {};
  for (const table of Object.keys(EXPECTED_COUNTS)) {
    counts[table] = existingTables.has(table)
      ? db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count
      : 0;
  }
  const snapshot = snapshotRow ? JSON.parse(snapshotRow.payload) : null;
  db.close();
  return {
    integrity,
    foreignKeyViolations: foreignKeyViolations.length,
    version,
    snapshotPresent: Boolean(snapshotRow),
    snapshotCounts: snapshot
      ? {
          customers: snapshot.customers?.length || 0,
          invoices: snapshot.invoices?.length || 0,
          payments: snapshot.payments?.length || 0,
          matches: snapshot.matches?.length || 0,
          idempotencyKeys: snapshot.idempotencyKeys?.length || 0,
          apiIdempotencyKeys: snapshot.apiIdempotencyKeys?.length || 0,
        }
      : null,
    counts,
  };
}

function assertWorkerState(label, result) {
  check(result.code === 0 && result.result?.ok, `${label}: fresh process exited successfully`, result.stderr);
  const data = result.result;
  if (!data) return;
  check(data.schemaVersion === 4, `${label}: schema version is 4`, String(data.schemaVersion));
  check(data.integrity.length === 1 && data.integrity[0] === 'ok', `${label}: PRAGMA integrity_check is ok`, JSON.stringify(data.integrity));
  check(data.foreignKeyViolations === 0, `${label}: zero foreign-key violations`, String(data.foreignKeyViolations));
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    check(data.counts?.[table] === expected, `${label}: ${table} has ${expected} records`, String(data.counts?.[table]));
    check(data.distinctCounts?.[table] === expected, `${label}: ${table} has no duplicate identities`, String(data.distinctCounts?.[table]));
  }
  check(data.invoiceTotal === INVOICE_TOTAL, `${label}: invoice financial total preserved`, `${data.invoiceTotal} != ${INVOICE_TOTAL}`);
  check(data.paymentTotal === PAYMENT_TOTAL, `${label}: payment financial total preserved`, `${data.paymentTotal} != ${PAYMENT_TOTAL}`);
  check(data.matchTotal === MATCH_TOTAL, `${label}: match financial total preserved`, `${data.matchTotal} != ${MATCH_TOTAL}`);
}

console.log('\n==========================================');
console.log('HIGH-009 MIGRATION INTERRUPTION / RECOVERY');
console.log('==========================================\n');
console.log(`DB_PATH=${DB}`);
console.log(`legacy records: ${JSON.stringify(EXPECTED_COUNTS)}`);

seedLegacyDatabase();
const seeded = inspectRaw();
check(seeded.version === 1, 'Seeded database starts at schema version 1', String(seeded.version));
check(seeded.snapshotPresent, 'Legacy UDM snapshot exists before migration');
check(seeded.snapshotCounts?.invoices === INVOICES, 'Seeded legacy invoice count is complete');
check(seeded.counts.udm_invoices === 0, 'Relational tables are empty before migration');

const interrupted = await runMigrationAndKillMidBackfill();
console.log(`kill: signal=${interrupted.signal} killed=${interrupted.killed} baselineWal=${interrupted.baseline} killWal=${interrupted.observedAtKill} peakWal=${interrupted.peakWal}`);

check(interrupted.killed, 'Migration process accepted SIGKILL', interrupted.stderr || interrupted.stdout);
check(interrupted.signal === 'SIGKILL', 'Migration process was interrupted by SIGKILL', String(interrupted.signal));
check(interrupted.observedAtKill > interrupted.baseline, 'SIGKILL was sent while the backfill transaction was writing WAL');

const afterKill = inspectRaw();
check(afterKill.integrity.length === 1 && afterKill.integrity[0] === 'ok', 'Interrupted database passes integrity_check', JSON.stringify(afterKill.integrity));
check(afterKill.foreignKeyViolations === 0, 'Interrupted database has zero foreign-key violations');
check(afterKill.snapshotPresent, 'Legacy snapshot remains recoverable after interrupted backfill');
check(afterKill.snapshotCounts?.invoices === INVOICES, 'Legacy snapshot still contains every invoice', String(afterKill.snapshotCounts?.invoices));
check(afterKill.snapshotCounts?.customers === CUSTOMERS, 'Legacy snapshot still contains every customer');
check(afterKill.counts.udm_invoices === 0, 'Uncommitted relational rows were rolled back', String(afterKill.counts.udm_invoices));
check(afterKill.counts.udm_customers === 0, 'Uncommitted customer rows were rolled back', String(afterKill.counts.udm_customers));

const restarted = await runWorker('verify');
assertWorkerState('restart', restarted);
check(restarted.result?.migrated === true, 'Fresh process reran the backfill after interruption');
check(restarted.result?.snapshotPresent === false, 'Snapshot is deleted only after the complete backfill commits');
check(restarted.result?.relationalRows?.invoices === INVOICES, 'Fresh process exposes all invoices relationally');

const secondRun = await runWorker('verify');
assertWorkerState('second migration run', secondRun);
check(secondRun.result?.migrated === false, 'Rerunning migration is a no-op');
check(secondRun.result?.snapshotPresent === false, 'No legacy snapshot is recreated on rerun');

console.log(`\nMIGRATION RECOVERY SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
cleanupDbFiles();
if (failed > 0) process.exit(1);
