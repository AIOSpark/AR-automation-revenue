/**
 * HIGH-009/010V: Execution namespace migration recovery test.
 * Tests SIGKILL interruption during database operations and idempotent restart.
 * Uses isolated SQLite fixtures with v4 operational schema.
 *
 * Run with:
 *   AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/test-remaining-execution-recovery.mjs
 */

import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-exec-${process.pid}.sqlite`);
process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✅ [EXEC_RECOVERY_PASS] ${message}`);
    passed++;
  } else {
    failed++;
    console.error(`  ❌ [EXEC_RECOVERY_FAIL] ${message}`);
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
  // Apply v4 operational schema
  db.exec(`CREATE TABLE IF NOT EXISTS execution_records (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('completed','pending','processing')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  // Seed minimal execution record
  db.prepare('INSERT INTO execution_records (id, organization_id, action_type, state, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'exc_test_1', 'org_test', 'test_action', 'completed',
    '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO execution_records (id, organization_id, action_type, state, created_at, updated_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    'exc_test_2', 'org_test', 'test_action', 'pending',
    '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z', '{}'
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
  const count = db.prepare('SELECT COUNT(*) AS count FROM execution_records').get().count;
  db.close();
  return { integrity, fkViolations, version, count };
}

console.log('\n==========================================');
console.log('HIGH-009/010V EXECUTION MIGRATION RECOVERY');
console.log('==========================================\n');

console.log('Setting up database...');
seedLegacyDatabase();
const seeded = inspectDb();
check(seeded.version === 0, `Seeded database starts at schema version 0 (got ${seeded.version})`);
check(seeded.count === 2, `Seeded 2 legacy execution records (got ${seeded.count})`, `count=${seeded.count}`);

console.log('Running migration worker...');
const interrupted = await runMigrationAndKillMidBackfill();
check(interrupted.killed, 'Migration process accepted SIGKILL', '');
check(interrupted.signal === 'SIGKILL', 'Migration process was interrupted by SIGKILL', String(interrupted.signal));
check(interrupted.observedAtKill > interrupted.baseline, 'SIGKILL sent while writing WAL', '');

console.log('Checking database after SIGKILL...');
const afterKill = inspectDb();
check(afterKill.integrity.length === 1 && afterKill.integrity[0] === 'ok', 'Database passes integrity_check after SIGKILL');
check(afterKill.fkViolations === 0, 'Zero foreign-key violations after SIGKILL', String(afterKill.fkViolations));
check(afterKill.count >= 1, 'Execution records preserved after SIGKILL (roll-back preserved committed data)', String(afterKill.count));

console.log('Restarting worker for verification...');
const restarted = await runWorker('verify');
console.log('Checking database after restart...');
const verifyDb = inspectDb();
check(verifyDb.integrity.length === 1 && verifyDb.integrity[0] === 'ok', 'Database passes integrity_check after restart');
check(verifyDb.fkViolations === 0, 'Zero foreign-key violations after restart', String(verifyDb.fkViolations));
check(verifyDb.count >= 1, 'Execution records preserved after restart', String(verifyDb.count));

// Second run should be no-op
console.log('Running second verification...');
const second = await runWorker('verify');
console.log('Checking database after second restart...');
const verifyDb2 = inspectDb();
check(verifyDb2.integrity.length === 1 && verifyDb2.integrity[0] === 'ok', 'Database passes integrity_check after second restart');
check(verifyDb2.fkViolations === 0, 'Zero foreign-key violations after second restart', String(verifyDb2.fkViolations));
check(verifyDb2.count >= 1, 'Execution records still present after second rerun', String(verifyDb2.count));

console.log(`\nEXECUTION RECOVERY SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
cleanupDbFiles();
if (failed > 0) process.exit(1);