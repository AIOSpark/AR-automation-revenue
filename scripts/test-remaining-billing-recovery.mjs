/**
 * HIGH-009/010V: Billing namespace migration recovery test.
 * Tests SIGKILL interruption during database operations and idempotent restart.
 * Uses isolated SQLite fixtures with v4 operational schema.
 *
 * Run with:
 *   AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/test-remaining-billing-recovery.mjs
 */

import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-billing-${process.pid}.sqlite`);
process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✅ [BILLING_RECOVERY_PASS] ${message}`);
    passed++;
  } else {
    failed++;
    console.error(`  ❌ [BILLING_RECOVERY_FAIL] ${message}`);
  }
}

function cleanupDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${DB}${suffix}`, { force: true }); } catch {}
  }
}

function walSize() {
  try { return fs.statSync(`${DB}-wal`).size; } catch { return 0; }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function seedLegacyDatabase() {
  cleanupDbFiles();
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  // Repository base tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS repository_snapshots (
      namespace TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS repository_schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
  db.prepare('INSERT INTO repository_schema_migrations(version, applied_at) VALUES (0, ?)').run('2026-09-01T00:00:00.000Z');
  // Simplified billing tables for testing
  db.exec(`CREATE TABLE IF NOT EXISTS billing_usage_events (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('invoice.processed','customer.tracked','ai_task.executed','integration.connected','agent_executed')),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    occurred_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS billing_payments (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
    currency TEXT NOT NULL CHECK (length(currency) = 3),
    status TEXT NOT NULL CHECK (status IN ('paid','failed','pending','reversed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS billing_webhook_events (
    provider_event_id TEXT PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    organization_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS billing_refund_events (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    provider_refund_id TEXT NOT NULL UNIQUE,
    payment_id TEXT NOT NULL,
    amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
    currency TEXT NOT NULL CHECK (length(currency) = 3),
    status TEXT NOT NULL CHECK (status IN ('PROCESSED','FAILED','PENDING')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS billing_event_log (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('success','failed')),
    created_at TEXT NOT NULL
  )`);
  // Seed legacy billing data
  db.prepare('INSERT INTO billing_usage_events (id, organization_id, event_type, quantity, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    'use_test_1', 'org_test', 'invoice.processed', 1, '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_usage_events (id, organization_id, event_type, quantity, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    'use_test_2', 'org_test', 'customer.tracked', 1, '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_usage_events (id, organization_id, event_type, quantity, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    'use_test_3', 'org_test', 'ai_task.executed', 1, '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_usage_events (id, organization_id, event_type, quantity, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    'use_test_4', 'org_test', 'integration.connected', 1, '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_usage_events (id, organization_id, event_type, quantity, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    'use_test_5', 'org_test', 'agent_executed', 1, '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_usage_events (id, organization_id, event_type, quantity, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    'use_test_6', 'org_test', 'invoice.processed', 1, '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_payments (id, organization_id, amount_minor_units, currency, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'pay_test_1', 'org_test', 50000, 'INR', 'paid', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_payments (id, organization_id, amount_minor_units, currency, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'pay_test_2', 'org_test', 35000, 'INR', 'paid', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_payments (id, organization_id, amount_minor_units, currency, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'pay_test_3', 'org_test', 75000, 'INR', 'paid', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_webhook_events (provider_event_id, id, organization_id, event_type, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'we_test_1', 'id_test_1', 'org_test', 'payment_success', 'RECEIVED', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_webhook_events (provider_event_id, id, organization_id, event_type, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'we_test_2', 'id_test_2', 'org_test', 'payment_failed', 'FAILED', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_webhook_events (provider_event_id, id, organization_id, event_type, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'we_test_3', 'id_test_3', 'org_test', 'refund_initiated', 'PROCESSED', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_refund_events (id, organization_id, provider_refund_id, payment_id, amount_minor_units, currency, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'ref_test_1', 'org_test', 'refund_test_1', 'pay_test_1', 25000, 'INR', 'PROCESSED', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_refund_events (id, organization_id, provider_refund_id, payment_id, amount_minor_units, currency, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'ref_test_2', 'org_test', 'refund_test_2', 'pay_test_2', 15000, 'INR', 'PROCESSED', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_refund_events (id, organization_id, provider_refund_id, payment_id, amount_minor_units, currency, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'ref_test_3', 'org_test', 'refund_test_3', 'pay_test_3', 35000, 'INR', 'PROCESSED', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_event_log (id, organization_id, event_type, result, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'log_test_1', 'org_test', 'payment_reconciliation_match', 'success', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO billing_event_log (id, organization_id, event_type, result, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'log_test_2', 'org_test', 'payment_reconciliation_match', 'success', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO billing_event_log (id, organization_id, event_type, result, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'log_test_3', 'org_test', 'payment_reconciliation_match', 'success', '2026-10-01T00:00:00.000Z'
  );
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
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
      }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
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
      }
    );

    let killed = false;
    let observedAtKill = 0;
    let baselineVal = baseline;
    let timer = setInterval(() => {
      const size = walSize();
      if (!killed && size - baselineVal >= 512 * 1024) {
        observedAtKill = size;
        killed = child.kill('SIGKILL');
      }
    }, 2);

    let closed = false;
    child.on('close', (code, signal) => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      resolve({ code, signal, killed, observedAtKill, baseline: baselineVal });
    });

    child.stdout.on('data', (chunk) => {});
    child.stderr.on('data', (chunk) => {});
  });
}

function inspectDb() {
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA foreign_keys = ON');
  const integrity = db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check);
  const fkViolations = db.prepare('PRAGMA foreign_key_check').all().length;
  const version = db.prepare('SELECT MAX(version) AS version FROM repository_schema_migrations').get().version;
  const countUsage = db.prepare('SELECT COUNT(*) AS count FROM billing_usage_events').get().count;
  const countPayments = db.prepare('SELECT COUNT(*) AS count FROM billing_payments').get().count;
  const countWebhooks = db.prepare('SELECT COUNT(*) AS count FROM billing_webhook_events').get().count;
  const countRefunds = db.prepare('SELECT COUNT(*) AS count FROM billing_refund_events').get().count;
  const countEventLog = db.prepare('SELECT COUNT(*) AS count FROM billing_event_log').get().count;
  db.close();
  return { integrity, fkViolations, version, countUsage, countPayments, countWebhooks, countRefunds, countEventLog };
}

console.log('\n==========================================');
console.log('HIGH-009/010V BILLING MIGRATION RECOVERY');
console.log('==========================================\n');

console.log('Setting up database...');
seedLegacyDatabase();
const seeded = inspectDb();
check(seeded.version === 0, `Seeded database starts at schema version 0 (got ${seeded.version})`);
check(seeded.countUsage >= 1, `Seeded legacy billing usage events (got ${seeded.countUsage})`, `count=${seeded.countUsage}`);

console.log('Running migration worker...');
const interrupted = await runMigrationAndKillMidBackfill();
check(interrupted.killed, 'Migration process accepted SIGKILL', '');
check(interrupted.signal === 'SIGKILL', 'Migration process was interrupted by SIGKILL', String(interrupted.signal));
check(interrupted.observedAtKill > interrupted.baseline, 'SIGKILL sent while writing WAL', '');

console.log('Checking database after SIGKILL...');
const afterKill = inspectDb();
check(afterKill.integrity.length === 1 && afterKill.integrity[0] === 'ok', 'Database passes integrity_check after SIGKILL');
check(afterKill.fkViolations === 0, 'Zero foreign-key violations after SIGKILL', String(afterKill.fkViolations));
check(afterKill.countUsage >= 1, 'Billing usage events preserved after SIGKILL', String(afterKill.countUsage));

console.log('Restarting worker for verification...');
const restarted = await runWorker('verify');
console.log('Checking database after restart...');
const verifyDb = inspectDb();
check(verifyDb.integrity.length === 1 && verifyDb.integrity[0] === 'ok', 'Database passes integrity_check after restart');
check(verifyDb.fkViolations === 0, 'Zero foreign-key violations after restart', String(verifyDb.fkViolations));
check(verifyDb.countUsage >= 1, 'Billing usage events preserved after restart', String(verifyDb.countUsage));
check(verifyDb.countPayments >= 1, 'Billing payments preserved after restart', String(verifyDb.countPayments));
check(verifyDb.countWebhooks >= 1, 'Billing webhook events preserved after restart', String(verifyDb.countWebhooks));
check(verifyDb.countRefunds >= 1, 'Billing refund events preserved after restart', String(verifyDb.countRefunds));
check(verifyDb.countEventLog >= 1, 'Billing event log preserved after restart', String(verifyDb.countEventLog));

// Second run should be no-op
console.log('Running second verification...');
const second = await runWorker('verify');
console.log('Checking database after second restart...');
const verifyDb2 = inspectDb();
check(verifyDb2.integrity.length === 1 && verifyDb2.integrity[0] === 'ok', 'Database passes integrity_check after second restart');
check(verifyDb2.fkViolations === 0, 'Zero foreign-key violations after second restart', String(verifyDb2.fkViolations));
check(verifyDb2.countUsage >= 1, 'Billing usage events still present after second rerun', String(verifyDb2.countUsage));
check(verifyDb2.countPayments >= 1, 'Billing payments still present after second rerun', String(verifyDb2.countPayments));
check(verifyDb2.countWebhooks >= 1, 'Billing webhook events still present after second rerun', String(verifyDb2.countWebhooks));
check(verifyDb2.countRefunds >= 1, 'Billing refund events still present after second rerun', String(verifyDb2.countRefunds));
check(verifyDb2.countEventLog >= 1, 'Billing event log still present after second rerun', String(verifyDb2.countEventLog));

console.log(`\nBILLING RECOVERY SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
cleanupDbFiles();
if (failed > 0) process.exit(1);