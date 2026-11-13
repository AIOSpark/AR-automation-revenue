/**
 * HIGH-009/010V: Billing namespace cross-process concurrency test.
 * Tests webhook, payment and refund deduplication across multiple OS processes.
 * Uses isolated SQLite fixtures with v4 operational schema.
 *
 * Run with:
 *   AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/test-phase3-billing-concurrency.mjs
 */

import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-phase3-billing-${process.pid}.sqlite`);
process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✅ [PHASE3_BILLING_PASS] ${message}`);
    passed++;
  } else {
    failed++;
    console.error(`  ❌ [PHASE3_BILLING_FAIL] ${message}`);
  }
}

function cleanupDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(`${DB}${suffix}`, { force: true }); } catch {}
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function seedLegacyDatabase() {
  cleanupDbFiles();
  const db = new DatabaseSync(DB);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
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
  db.prepare('INSERT INTO billing_usage_events (id, organization_id, event_type, quantity, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    'use_test_1', 'org_test', 'invoice.processed', 1, '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_usage_events (id, organization_id, event_type, quantity, occurred_at, payload) VALUES (?, ?, ?, ?, ?, ?)').run(
    'use_test_2', 'org_test', 'invoice.processed', 1, '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_payments (id, organization_id, amount_minor_units, currency, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'pay_test_1', 'org_test', 50000, 'INR', 'paid', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_webhook_events (provider_event_id, id, organization_id, event_type, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    'we_test_1', 'id_test_1', 'org_test', 'payment_success', 'RECEIVED', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO billing_refund_events (id, organization_id, provider_refund_id, payment_id, amount_minor_units, currency, status, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'ref_test_1', 'org_test', 'refund_test_1', 'pay_test_1', 25000, 'INR', 'PROCESSED', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
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

function runConcurrentWorkers(mode, count) {
  const proms = [];
  for (let i = 0; i < count; i++) {
    proms.push(runWorker(mode));
  }
  return Promise.all(proms);
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
  db.close();
  return { integrity, fkViolations, version, countUsage, countPayments, countWebhooks, countRefunds };
}

console.log('\n==========================================');
console.log('HIGH-009/010V PHASE 3: BILLING CONCURRENCY');
console.log('==========================================\n');

console.log('Setting up database...');
seedLegacyDatabase();
const seeded = inspectDb();
check(seeded.version === 0, `Seeded database starts at schema version 0 (got ${seeded.version})`);

console.log('Spawning 4 concurrent workers...');
const workers = await runConcurrentWorkers('migrate', 4);
console.log(` ${workers.length} workers completed`);

await sleep(3000);

const afterDb = inspectDb();
check(afterDb.integrity.length === 1 && afterDb.integrity[0] === 'ok', 'Database passes integrity_check after concurrent workers');
check(afterDb.fkViolations === 0, 'Zero foreign-key violations after concurrent workers', String(afterDb.fkViolations));
check(afterDb.countUsage >= 1, 'Billing usage events present after concurrent workers', String(afterDb.countUsage));
check(afterDb.countPayments >= 1, 'Billing payments present after concurrent workers', String(afterDb.countPayments));
check(afterDb.countWebhooks >= 1, 'Billing webhook events present after concurrent workers', String(afterDb.countWebhooks));
check(afterDb.countRefunds >= 1, 'Billing refund events present after concurrent workers', String(afterDb.countRefunds));

// Idempotency check
console.log('Rerunning workers for idempotency check...');
const workers2 = await runConcurrentWorkers('verify', 2);
console.log(` ${workers2.length} verify workers completed`);

const after2 = inspectDb();
check(after2.integrity.length === 1 && after2.integrity[0] === 'ok', 'Database passes integrity_check after verify workers');
check(after2.fkViolations === 0, 'Zero foreign-key violations after verify workers', String(after2.fkViolations));
check(after2.countUsage >= 1, 'Billing usage events still present after verify', String(after2.countUsage));
check(after2.countPayments >= 1, 'Billing payments still present after verify', String(after2.countPayments));
check(after2.countWebhooks >= 1, 'Billing webhook events still present after verify', String(after2.countWebhooks));
check(after2.countRefunds >= 1, 'Billing refund events still present after verify', String(after2.countRefunds));

// Exact-once: counts should not have been duplicated
check(after2.countUsage === 2, `Exact-once usage count preserved (expected 2, got ${after2.countUsage})`, `countUsage=${after2.countUsage}`);
check(after2.countPayments === 1, `Exact-once payment count preserved (expected 1, got ${after2.countPayments})`, `countPayments=${after2.countPayments}`);
check(after2.countWebhooks === 1, `Exact-once webhook count preserved (expected 1, got ${after2.countWebhooks})`, `countWebhooks=${after2.countWebhooks}`);
check(after2.countRefunds === 1, `Exact-once refund count preserved (expected 1, got ${after2.countRefunds})`, `countRefunds=${after2.countRefunds}`);

console.log(`\nPHASE 3 BILLING CONCURRENCE SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
cleanupDbFiles();
if (failed > 0) process.exit(1);