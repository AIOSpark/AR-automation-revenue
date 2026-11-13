// HIGH-012 backup and restore verification.
// Uses real SQLite WAL databases and real CLI processes. No cloud provider.

import assert from 'node:assert';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  applyRetention,
  backupDatabase,
  hashFile,
  restoreVerify,
  runBackupCycle,
  verifyDatabaseFile,
} from './sqlite-backup.mjs';

const SECRET_CUSTOMER = 'Secret Customer Name';
let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ [BACKUP_PASS] ${name}`);
  } catch (error) {
    failed++;
    console.error(`  ❌ [BACKUP_FAIL] ${name}: ${error?.message || String(error)}`);
  }
}

function createSuiteDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aiospark-backup-suite-'));
}

function seedLiveDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA wal_autocheckpoint = 0');
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
  db.prepare('INSERT INTO repository_schema_migrations(version, applied_at) VALUES (?, ?)').run(
    1,
    new Date().toISOString()
  );
  const udm = {
    customers: [{ id: 'cust_backup', name: SECRET_CUSTOMER, organization_id: 'org_backup' }],
    invoices: [
      {
        id: 'inv_backup',
        organization_id: 'org_backup',
        customer_id: 'cust_backup',
        amount_minor_units: 1234500,
        status: 'open',
      },
    ],
    payments: [
      {
        id: 'pay_backup',
        organization_id: 'org_backup',
        invoice_id: 'inv_backup',
        amount_minor_units: 500000,
      },
    ],
    matches: [{ id: 'match_backup', invoice_id: 'inv_backup', payment_id: 'pay_backup' }],
    creditNotes: [{ id: 'cn_backup', invoice_id: 'inv_backup', amount_minor_units: 25000 }],
    creditAllocations: [{ id: 'ca_backup', credit_note_id: 'cn_backup', invoice_id: 'inv_backup' }],
  };
  db.prepare(
    'INSERT INTO repository_snapshots(namespace, payload, updated_at) VALUES (?, ?, ?)'
  ).run('udm', JSON.stringify(udm), new Date().toISOString());
  // Keep the writer open so committed rows remain in WAL while backup runs.
  return db;
}

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['scripts/sqlite-backup.mjs', ...args], {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function main() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK HIGH-012 BACKUP/RESTORE SUITE');
  console.log('==========================================\n');

  const suiteDir = createSuiteDir();
  const liveDb = path.join(suiteDir, 'live.sqlite');
  const backupDir = path.join(suiteDir, 'backups');
  const writer = seedLiveDatabase(liveDb);
  const liveHash = await hashFile(liveDb);

  // Old backups used for retention checks.
  fs.mkdirSync(backupDir, { recursive: true });
  for (const name of [
    'aiospark-backup-20200101T000000000Z.sqlite',
    'aiospark-backup-20200102T000000000Z.sqlite',
    'unrelated-file.txt',
  ]) {
    fs.writeFileSync(path.join(backupDir, name), 'old');
  }

  let firstBackup;
  await check('WAL-safe backup publishes a verified snapshot with financial counts', async () => {
    firstBackup = await runBackupCycle({ dbPath: liveDb, backupDir, retentionCount: 1 });
    assert.equal(firstBackup.integrity, 'ok');
    assert.equal(firstBackup.schemaVersion, 1);
    assert.equal(firstBackup.financialCounts.invoices, 1);
    assert.equal(firstBackup.financialCounts.payments, 1);
    assert.equal(firstBackup.financialCounts.creditNotes, 1);
    assert.equal(firstBackup.financialCounts.creditAllocations, 1);
    assert(fs.existsSync(firstBackup.file));
    assert.match(firstBackup.sha256, /^[a-f0-9]{64}$/);
  });

  await check('WAL-only committed data survives backup', async () => {
    const backup = new DatabaseSync(firstBackup.file, { readonly: true });
    try {
      const row = backup
        .prepare("SELECT payload FROM repository_snapshots WHERE namespace = 'udm'")
        .get();
      const state = JSON.parse(row.payload);
      assert.equal(state.invoices[0].id, 'inv_backup');
      assert.equal(state.payments[0].amount_minor_units, 500000);
    } finally {
      backup.close();
    }
  });

  await check('Retention keeps the newest backups and leaves unrelated files alone', async () => {
    const files = fs.readdirSync(backupDir).filter((name) => name.startsWith('aiospark-backup-'));
    assert.equal(files.length, 1);
    assert(files.includes(path.basename(firstBackup.file)));
    assert(fs.existsSync(path.join(backupDir, 'unrelated-file.txt')));
    assert(!files.some((name) => name.includes('20200101')));
    assert(!files.some((name) => name.includes('20200102')));
  });

  await check('Failed backup preserves the published backup and cleans temp files', async () => {
    const before = await hashFile(firstBackup.file);
    await assert.rejects(
      () => runBackupCycle({ dbPath: path.join(suiteDir, 'missing.sqlite'), backupDir }),
      /Live database not found/
    );
    assert.equal(await hashFile(firstBackup.file), before);
    assert(fs.existsSync(path.join(backupDir, 'backup-failure.json')));
    const leftovers = fs.readdirSync(backupDir).filter((name) => name.includes('.tmp-'));
    assert.deepEqual(leftovers, []);
  });

  await check('Failure webhook receives an alert without customer data', async () => {
    const alerts = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        alerts.push(body);
        res.writeHead(204).end();
      });
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    try {
      await assert.rejects(() =>
        runBackupCycle({
          dbPath: path.join(suiteDir, 'missing-2.sqlite'),
          backupDir,
          alertWebhook: `http://127.0.0.1:${port}/alert`,
        })
      );
      assert.equal(alerts.length, 1);
      const alert = JSON.parse(alerts[0]);
      assert.equal(alert.event, 'aiospark.backup.failed');
      assert(!alerts[0].includes(SECRET_CUSTOMER));
      assert(!alerts[0].includes('inv_backup'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await check('Restore verification uses an isolated database and leaves live data untouched', async () => {
    const liveBefore = await hashFile(liveDb);
    const restored = await restoreVerify(firstBackup.file);
    assert.equal(restored.integrity, 'ok');
    assert.equal(restored.schemaVersion, 1);
    assert.equal(restored.financialCounts.invoices, 1);
    assert.equal(restored.financialCounts.payments, 1);
    assert.equal(restored.sha256, await hashFile(firstBackup.file));
    assert(!fs.existsSync(restored.isolatedPath));
    assert.equal(await hashFile(liveDb), liveBefore);
  });

  await check('Corrupt backups are rejected by integrity verification', async () => {
    const corrupt = path.join(suiteDir, 'corrupt.sqlite');
    fs.writeFileSync(corrupt, 'not a sqlite database');
    assert.throws(() => verifyDatabaseFile(corrupt), /integrity_check|file is not a database|not a database/i);
    await assert.rejects(() => restoreVerify(corrupt));
  });

  await check('CLI verify detects schema and reports counts without customer data', async () => {
    const result = await runCli(['verify', firstBackup.file]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /schemaVersion: 1/);
    assert.match(result.stdout, /invoices=1/);
    assert(!result.stdout.includes(SECRET_CUSTOMER));
  });

  await check('Automated daily schedule --once produces a verified backup', async () => {
    const dailyDir = path.join(suiteDir, 'daily');
    const result = await runCli(['schedule', '--once'], {
      AIOSPARK_DB_PATH: liveDb,
      AIOSPARK_BACKUP_DIR: dailyDir,
      AIOSPARK_BACKUP_RETENTION_COUNT: '2',
    });
    assert.equal(result.code, 0, result.stderr);
    const files = fs.readdirSync(dailyDir).filter((name) => name.startsWith('aiospark-backup-'));
    assert.equal(files.length, 1);
    const metadata = verifyDatabaseFile(path.join(dailyDir, files[0]));
    assert.equal(metadata.integrity, 'ok');
    assert.equal(metadata.financialCounts.invoices, 1);
    assert(!result.stdout.includes(SECRET_CUSTOMER));
  });

  await check('Explicit backup path works and retention count validates', async () => {
    const explicit = path.join(suiteDir, 'explicit.sqlite');
    const metadata = await backupDatabase({ dbPath: liveDb, backupPath: explicit });
    assert.equal(metadata.file, explicit);
    assert.equal(verifyDatabaseFile(explicit).schemaVersion, 1);
    assert.throws(() => applyRetention(backupDir, 0), /positive integer/);
  });

  await check('Live database was never overwritten by any verification path', async () => {
    assert.equal(await hashFile(liveDb), liveHash);
    const live = verifyDatabaseFile(liveDb);
    assert.equal(live.financialCounts.invoices, 1);
  });

  writer.close();
  fs.rmSync(suiteDir, { recursive: true, force: true });

  console.log(`\nBACKUP/RESTORE SUMMARY: ${passed} PASSED, ${failed} FAILED\n`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error('🚨 Backup suite execution error:', error);
  process.exit(1);
});
