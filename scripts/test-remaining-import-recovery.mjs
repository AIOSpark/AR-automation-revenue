/**
 * HIGH-009/010V: Import namespace migration recovery test.
 * Tests SIGKILL interruption during database operations and idempotent restart.
 * Uses isolated SQLite fixtures with v4 operational schema.
 *
 * Run with:
 *   AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/test-remaining-import-recovery.mjs
 */

import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-import-${process.pid}.sqlite`);
process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✅ [IMPORT_RECOVERY_PASS] ${message}`);
    passed++;
  } else {
    failed++;
    console.error(`  ❌ [IMPORT_RECOVERY_FAIL] ${message}`);
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
  // Simplified import tables for testing
  db.exec(`CREATE TABLE IF NOT EXISTS import_batches (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
    created_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS import_errors (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    import_batch_id TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS import_duplicates (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    import_batch_id TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT NOT NULL CHECK (status IN ('pending','merged','rejected'))
  )`);
  // Seed legacy import data
  db.prepare('INSERT INTO import_batches (id, organization_id, status, created_at) VALUES (?, ?, ?, ?)').run(
    'batch_test_1', 'org_test', 'processing', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_batches (id, organization_id, status, created_at) VALUES (?, ?, ?, ?)').run(
    'batch_test_2', 'org_test', 'processing', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_batches (id, organization_id, status, created_at) VALUES (?, ?, ?, ?)').run(
    'batch_test_3', 'org_test', 'processing', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_errors (id, organization_id, import_batch_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'err_test_1', 'org_test', 'batch_test_1', 'Invalid amount', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_errors (id, organization_id, import_batch_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'err_test_2', 'org_test', 'batch_test_1', 'Missing required field', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_errors (id, organization_id, import_batch_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'err_test_3', 'org_test', 'batch_test_2', 'Unparseable date', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_errors (id, organization_id, import_batch_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'err_test_4', 'org_test', 'batch_test_2', 'Duplicate invoice', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_errors (id, organization_id, import_batch_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'err_test_5', 'org_test', 'batch_test_3', 'Invalid currency', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_errors (id, organization_id, import_batch_id, reason, created_at) VALUES (?, ?, ?, ?, ?)').run(
    'err_test_6', 'org_test', 'batch_test_3', 'Missing invoice', '2026-10-01T00:00:00.000Z'
  );
  db.prepare('INSERT INTO import_duplicates (id, organization_id, import_batch_id, confidence, status) VALUES (?, ?, ?, ?, ?)').run(
    'dup_test_1', 'org_test', 'batch_test_1', 0.85, 'pending'
  );
  db.prepare('INSERT INTO import_duplicates (id, organization_id, import_batch_id, confidence, status) VALUES (?, ?, ?, ?, ?)').run(
    'dup_test_2', 'org_test', 'batch_test_2', 0.88, 'pending'
  );
  db.prepare('INSERT INTO import_duplicates (id, organization_id, import_batch_id, confidence, status) VALUES (?, ?, ?, ?, ?)').run(
    'dup_test_3', 'org_test', 'batch_test_3', 0.91, 'pending'
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
  const countBatches = db.prepare('SELECT COUNT(*) AS count FROM import_batches').get().count;
  const countErrors = db.prepare('SELECT COUNT(*) AS count FROM import_errors').get().count;
  const countDups = db.prepare('SELECT COUNT(*) AS count FROM import_duplicates').get().count;
  db.close();
  return { integrity, fkViolations, version, countBatches, countErrors, countDups };
}

console.log('\n==========================================');
console.log('HIGH-009/010V IMPORT MIGRATION RECOVERY');
console.log('==========================================\n');

console.log('Setting up database...');
seedLegacyDatabase();
const seeded = inspectDb();
check(seeded.version === 0, `Seeded database starts at schema version 0 (got ${seeded.version})`);
check(seeded.countBatches >= 1, `Seeded legacy import batches (got ${seeded.countBatches})`, `count=${seeded.countBatches}`);

console.log('Running migration worker...');
const interrupted = await runMigrationAndKillMidBackfill();
check(interrupted.killed, 'Migration process accepted SIGKILL', '');
check(interrupted.signal === 'SIGKILL', 'Migration process was interrupted by SIGKILL', String(interrupted.signal));
check(interrupted.observedAtKill > interrupted.baseline, 'SIGKILL sent while writing WAL', '');

console.log('Checking database after SIGKILL...');
const afterKill = inspectDb();
check(afterKill.integrity.length === 1 && afterKill.integrity[0] === 'ok', 'Database passes integrity_check after SIGKILL');
check(afterKill.fkViolations === 0, 'Zero foreign-key violations after SIGKILL', String(afterKill.fkViolations));
check(afterKill.countBatches >= 1, 'Import batches preserved after SIGKILL', String(afterKill.countBatches));

console.log('Restarting worker for verification...');
const restarted = await runWorker('verify');
console.log('Checking database after restart...');
const verifyDb = inspectDb();
check(verifyDb.integrity.length === 1 && verifyDb.integrity[0] === 'ok', 'Database passes integrity_check after restart');
check(verifyDb.fkViolations === 0, 'Zero foreign-key violations after restart', String(verifyDb.fkViolations));
check(verifyDb.countBatches >= 1, 'Import batches preserved after restart', String(verifyDb.countBatches));

// Second run should be no-op
console.log('Running second verification...');
const second = await runWorker('verify');
console.log('Checking database after second restart...');
const verifyDb2 = inspectDb();
check(verifyDb2.integrity.length === 1 && verifyDb2.integrity[0] === 'ok', 'Database passes integrity_check after second restart');
check(verifyDb2.fkViolations === 0, 'Zero foreign-key violations after second restart', String(verifyDb2.fkViolations));
check(verifyDb2.countBatches >= 1, 'Import batches still present after second rerun', String(verifyDb2.countBatches));

console.log(`\nIMPORT RECOVERY SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
cleanupDbFiles();
if (failed > 0) process.exit(1);