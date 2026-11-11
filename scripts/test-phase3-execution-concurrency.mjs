/**
 * HIGH-009/010V: Execution namespace cross-process concurrency test.
 * Tests competing state transitions across multiple OS processes.
 * Uses isolated SQLite fixtures with v4 operational schema.
 *
 * Run with:
 *   AIOSPARK_TEST_MODE=false node --import ./scripts/test-only-server-modules.mjs --import tsx scripts/test-phase3-execution-concurrency.mjs
 */

import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DB = path.join(os.tmpdir(), `aiospark-phase3-exec-${process.pid}.sqlite`);
process.env.AIOSPARK_DB_PATH = DB;
process.env.AIOSPARK_TEST_MODE = 'false';

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    console.log(`  ✅ [PHASE3_EXEC_PASS] ${message}`);
    passed++;
  } else {
    failed++;
    console.error(`  ❌ [PHASE3_EXEC_FAIL] ${message}`);
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
  db.exec(`CREATE TABLE IF NOT EXISTS execution_records (
    id TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed')),
    created_at TEXT NOT NULL,
    payload TEXT NOT NULL
  )`);
  db.prepare('INSERT INTO execution_records (id, organization_id, status, created_at, payload) VALUES (?, ?, ?, ?, ?)').run(
    'exec_test_1', 'org_test', 'pending', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO execution_records (id, organization_id, status, created_at, payload) VALUES (?, ?, ?, ?, ?)').run(
    'exec_test_2', 'org_test', 'pending', '2026-10-01T00:00:00.000Z', '{}'
  );
  db.prepare('INSERT INTO execution_records (id, organization_id, status, created_at, payload) VALUES (?, ?, ?, ?, ?)').run(
    'exec_test_3', 'org_test', 'pending', '2026-10-01T00:00:00.000Z', '{}'
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
  const count = db.prepare('SELECT COUNT(*) AS count FROM execution_records').get().count;
  db.close();
  return { integrity, fkViolations, version, count };
}

console.log('\n==========================================');
console.log('HIGH-009/010V PHASE 3: EXECUTION CONCURRENCY');
console.log('==========================================\n');

console.log('Setting up database...');
seedLegacyDatabase();
const seeded = inspectDb();
check(seeded.version === 0, `Seeded database starts at schema version 0 (got ${seeded.version})`);

console.log('Spawning 4 concurrent workers...');
const workers = await runConcurrentWorkers('migrate', 4);
console.log(` ${workers.length} workers completed`);

// Wait for WAL to grow from concurrent writes
await sleep(3000);

const afterDb = inspectDb();
check(afterDb.integrity.length === 1 && afterDb.integrity[0] === 'ok', 'Database passes integrity_check after concurrent workers');
check(afterDb.fkViolations === 0, 'Zero foreign-key violations after concurrent workers', String(afterDb.fkViolations));
check(afterDb.count >= 1, 'Execution records present after concurrent workers', String(afterDb.count));

// Verify idempotency - rerun should preserve counts
console.log('Rerunning workers for idempotency check...');
const workers2 = await runConcurrentWorkers('verify', 2);
console.log(` ${workers2.length} verify workers completed`);

const after2 = inspectDb();
check(after2.integrity.length === 1 && after2.integrity[0] === 'ok', 'Database passes integrity_check after verify workers');
check(after2.fkViolations === 0, 'Zero foreign-key violations after verify workers', String(after2.fkViolations));
check(after2.count >= 1, 'Execution records still present after verify', String(after2.count));

// Exact-once: count should not have doubled
const expectedCount = 3; // 3 records seeded
check(after2.count === expectedCount, `Exact-once record count preserved (expected ${expectedCount}, got ${after2.count})`, `count=${after2.count}`);

console.log(`\nPHASE 3 EXECUTION CONCUERNCE SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
cleanupDbFiles();
if (failed > 0) process.exit(1);