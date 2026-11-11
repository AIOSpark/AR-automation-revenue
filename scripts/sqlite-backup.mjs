// AIOSpark SQLite backup / restore / verification utility.
//
// The backup is produced with SQLite's `VACUUM INTO`, which reads one committed
// transaction snapshot (including WAL content) and writes a compact standalone
// database. We never copy the live database or WAL files directly.
//
// Commands:
//   node scripts/sqlite-backup.mjs backup [dbPath] [backupPath]
//   node scripts/sqlite-backup.mjs verify <backupPath>
//   node scripts/sqlite-backup.mjs restore-verify <backupPath>
//   node scripts/sqlite-backup.mjs restore <backupPath> <dbPath> --force
//   node scripts/sqlite-backup.mjs schedule [--once]
//
// Environment:
//   AIOSPARK_DB_PATH                 live database (default .data/aiospark.sqlite)
//   AIOSPARK_BACKUP_DIR              managed backup directory (default .data/backups)
//   AIOSPARK_BACKUP_RETENTION_COUNT  daily backups to keep (default 14)
//   AIOSPARK_BACKUP_HOUR_UTC         daily schedule hour, 0-23 (default 2)
//   AIOSPARK_BACKUP_ALERT_WEBHOOK    optional generic JSON webhook for failures
//
// Logs contain paths, sizes, schema version and record COUNTS only. Customer
// names, amounts, emails, credentials and raw rows are never logged.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = '.data/aiospark.sqlite';
const DEFAULT_BACKUP_DIR = '.data/backups';
const DEFAULT_RETENTION_COUNT = 14;
const DEFAULT_HOUR_UTC = 2;
const BACKUP_PREFIX = 'aiospark-backup-';
const BACKUP_SUFFIX = '.sqlite';

function liveDbPath(override) {
  return path.resolve(override || process.env.AIOSPARK_DB_PATH || DEFAULT_DB_PATH);
}

function backupDir(override) {
  return path.resolve(override || process.env.AIOSPARK_BACKUP_DIR || DEFAULT_BACKUP_DIR);
}

function retentionCount(override) {
  const raw = override ?? process.env.AIOSPARK_BACKUP_RETENTION_COUNT ?? String(DEFAULT_RETENTION_COUNT);
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('AIOSPARK_BACKUP_RETENTION_COUNT must be a positive integer');
  }
  return count;
}

function timestampForFile(date = new Date()) {
  return date.toISOString().replace(/[-:.]/g, '');
}

function managedBackupPath(dir, date = new Date()) {
  return path.join(dir, `${BACKUP_PREFIX}${timestampForFile(date)}${BACKUP_SUFFIX}`);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function fsyncFile(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function fsyncDirectory(dir) {
  try {
    const fd = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Directory fsync is unavailable on some platforms; rename remains atomic.
  }
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fsyncFile(temp);
  fs.renameSync(temp, filePath);
  fsyncDirectory(path.dirname(filePath));
}

export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/**
 * Validate a standalone SQLite database without touching the live database.
 * Returns metadata containing only counts and integrity/schema facts.
 */
export function verifyDatabaseFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Database file not found: ${filePath}`);
  }
  if (fs.statSync(filePath).size === 0) {
    throw new Error(`Database file is empty: ${filePath}`);
  }

  const db = new DatabaseSync(filePath, { readonly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    const integrityResult = integrity?.integrity_check;
    if (integrityResult !== 'ok') {
      throw new Error(`SQLite integrity_check failed: ${integrityResult}`);
    }

    const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeys.length > 0) {
      throw new Error(`SQLite foreign_key_check found ${foreignKeys.length} violation(s)`);
    }

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => row.name);

    if (!tables.includes('repository_snapshots')) {
      throw new Error('Backup is missing the repository_snapshots table');
    }
    if (!tables.includes('repository_schema_migrations')) {
      throw new Error('Backup is missing the repository_schema_migrations table');
    }

    const schemaRow = db
      .prepare('SELECT MAX(version) AS version FROM repository_schema_migrations')
      .get();
    const schemaVersion = Number(schemaRow?.version);
    if (!Number.isInteger(schemaVersion) || schemaVersion < 1) {
      throw new Error('Backup has no valid schema migration version');
    }

    const namespaces = db
      .prepare('SELECT namespace, payload FROM repository_snapshots ORDER BY namespace')
      .all();

    const financialCounts = {
      customers: 0,
      invoices: 0,
      payments: 0,
      matches: 0,
      creditNotes: 0,
      creditAllocations: 0,
    };

    for (const row of namespaces) {
      let parsed;
      try {
        parsed = JSON.parse(row.payload);
      } catch {
        throw new Error(`Snapshot '${row.namespace}' contains invalid JSON`);
      }

      if (row.namespace === 'udm' && parsed && typeof parsed === 'object') {
        const state = parsed;
        financialCounts.customers = Array.isArray(state.customers) ? state.customers.length : 0;
        financialCounts.invoices = Array.isArray(state.invoices) ? state.invoices.length : 0;
        financialCounts.payments = Array.isArray(state.payments) ? state.payments.length : 0;
        financialCounts.matches = Array.isArray(state.matches) ? state.matches.length : 0;
        financialCounts.creditNotes = Array.isArray(state.creditNotes) ? state.creditNotes.length : 0;
        financialCounts.creditAllocations = Array.isArray(state.creditAllocations)
          ? state.creditAllocations.length
          : 0;
      }
    }

    return {
      file: filePath,
      sizeBytes: fs.statSync(filePath).size,
      integrity: 'ok',
      foreignKeyViolations: 0,
      schemaVersion,
      tables,
      snapshotNamespaceCount: namespaces.length,
      financialCounts,
    };
  } finally {
    db.close();
  }
}

/**
 * Create a transactionally consistent snapshot at `destination`.
 * Existing destination is replaced only after the temporary snapshot verifies.
 */
export async function backupDatabase(options = {}) {
  const sourcePath = liveDbPath(options.dbPath);
  const destination = path.resolve(
    options.backupPath || managedBackupPath(backupDir(options.backupDir))
  );

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Live database not found: ${sourcePath}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tempPath = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const tempWal = `${tempPath}-wal`;
  const tempShm = `${tempPath}-shm`;

  const cleanupTemp = () => {
    for (const file of [tempPath, tempWal, tempShm]) {
      try {
        fs.rmSync(file, { force: true });
      } catch {
        // Best-effort cleanup; the published backup is never touched.
      }
    }
  };

  try {
    const source = new DatabaseSync(sourcePath);
    try {
      source.exec('PRAGMA busy_timeout = 5000');
      // `VACUUM INTO` uses a read transaction over a consistent committed view,
      // so uncheckpointed WAL pages are included without copying WAL files.
      source.exec(`VACUUM INTO ${sqlString(tempPath)}`);
    } finally {
      source.close();
    }

    const verified = verifyDatabaseFile(tempPath);
    fsyncFile(tempPath);

    // Atomic publish: a previous backup remains intact until this rename.
    fs.renameSync(tempPath, destination);
    fsyncDirectory(path.dirname(destination));

    const sha256 = await hashFile(destination);
    const metadata = {
      ...verified,
      file: destination,
      sha256,
      createdAt: new Date().toISOString(),
    };

    const statusDir = options.backupDir
      ? path.resolve(options.backupDir)
      : path.dirname(destination);
    atomicWriteJson(path.join(statusDir, 'backup-status.json'), {
      status: 'success',
      ...metadata,
    });
    try {
      fs.rmSync(path.join(statusDir, 'backup-failure.json'), { force: true });
    } catch {
      // Failure marker is optional metadata.
    }

    return metadata;
  } finally {
    cleanupTemp();
  }
}

/**
 * Delete old managed backups, keeping the newest `keep` files. Only names
 * produced by this utility are considered; unrelated files are untouched.
 */
export function applyRetention(dir, keep) {
  const count = retentionCount(keep);
  if (!fs.existsSync(dir)) return { removed: [], kept: [] };

  const files = fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(BACKUP_PREFIX) && name.endsWith(BACKUP_SUFFIX))
    .sort();

  const keepSet = new Set(files.slice(-count));
  const removed = [];
  for (const name of files) {
    if (keepSet.has(name)) continue;
    fs.rmSync(path.join(dir, name), { force: true });
    removed.push(name);
  }
  return { removed, kept: [...keepSet] };
}

async function notifyFailure(payload, webhook) {
  if (!webhook) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    console.error(`Backup alert delivery failed: ${error?.message || String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * One automated backup cycle: snapshot, verify, publish, rotate, report.
 * Existing backups are preserved when this throws.
 */
export async function runBackupCycle(options = {}) {
  const started = Date.now();
  const dir = backupDir(options.backupDir);
  const startedAt = new Date().toISOString();

  try {
    const metadata = await backupDatabase(options);
    const retention = applyRetention(dir, options.retentionCount);
    return { ...metadata, durationMs: Date.now() - started, retention };
  } catch (error) {
    const failure = {
      status: 'failed',
      startedAt,
      failedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      error: error?.message || String(error),
    };
    try {
      fs.mkdirSync(dir, { recursive: true });
      atomicWriteJson(path.join(dir, 'backup-failure.json'), failure);
    } catch {
      // The original error remains authoritative.
    }
    await notifyFailure(
      { event: 'aiospark.backup.failed', ...failure },
      options.alertWebhook || process.env.AIOSPARK_BACKUP_ALERT_WEBHOOK
    );
    throw error;
  }
}

/**
 * Restore a backup into a temporary isolated directory and verify it. The live
 * database is never opened, copied over, or modified.
 */
export async function restoreVerify(backupPath) {
  if (!backupPath) throw new Error('Backup path is required');
  const resolved = path.resolve(backupPath);
  if (!fs.existsSync(resolved)) throw new Error(`Backup file not found: ${resolved}`);

  const isolatedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aiospark-restore-'));
  const restoredPath = path.join(isolatedDir, 'restored.sqlite');

  try {
    fs.copyFileSync(resolved, restoredPath);
    const metadata = verifyDatabaseFile(restoredPath);
    const sha256 = await hashFile(restoredPath);
    return {
      ...metadata,
      isolatedPath: restoredPath,
      sha256,
      sourceBackup: resolved,
    };
  } finally {
    fs.rmSync(isolatedDir, { recursive: true, force: true });
  }
}

/**
 * Manually restore a verified backup. Requires --force when the target exists.
 * The live application must be stopped by the operator first.
 */
export function restoreDatabase(backupPath, destination, { force = false } = {}) {
  if (!backupPath) throw new Error('Backup path is required');
  if (!destination) throw new Error('Destination database path is required');
  const resolvedBackup = path.resolve(backupPath);
  const resolvedDestination = path.resolve(destination);

  verifyDatabaseFile(resolvedBackup);

  if (fs.existsSync(resolvedDestination) && !force) {
    throw new Error('Destination exists. Stop the application and pass --force to replace it.');
  }

  fs.mkdirSync(path.dirname(resolvedDestination), { recursive: true });
  const tempPath = `${resolvedDestination}.restore-tmp-${process.pid}`;
  try {
    fs.copyFileSync(resolvedBackup, tempPath);
    fsyncFile(tempPath);
    verifyDatabaseFile(tempPath);
    fs.renameSync(tempPath, resolvedDestination);
    fsyncDirectory(path.dirname(resolvedDestination));
  } finally {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // The verified destination is already in place on success.
    }
  }
  return verifyDatabaseFile(resolvedDestination);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force' || arg === '--once') {
      flags[arg.slice(2)] = true;
    } else if (arg === '--db' || arg === '--dir' || arg === '--out' || arg === '--retention' || arg === '--alert-webhook') {
      flags[arg.slice(2)] = argv[++i];
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function logMetadata(metadata) {
  console.log(`Backup: ${metadata.file}`);
  console.log(`  sizeBytes: ${metadata.sizeBytes}`);
  console.log(`  sha256: ${metadata.sha256}`);
  console.log(`  integrity: ${metadata.integrity}`);
  console.log(`  schemaVersion: ${metadata.schemaVersion}`);
  console.log(`  snapshots: ${metadata.snapshotNamespaceCount}`);
  console.log(
    `  financialCounts: customers=${metadata.financialCounts.customers} invoices=${metadata.financialCounts.invoices} ` +
      `payments=${metadata.financialCounts.payments} matches=${metadata.financialCounts.matches} ` +
      `creditNotes=${metadata.financialCounts.creditNotes} creditAllocations=${metadata.financialCounts.creditAllocations}`
  );
}

async function scheduleDaily() {
  const hour = Number(process.env.AIOSPARK_BACKUP_HOUR_UTC ?? DEFAULT_HOUR_UTC);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('AIOSPARK_BACKUP_HOUR_UTC must be an integer from 0 to 23');
  }

  const runOnce = async () => {
    try {
      const metadata = await runBackupCycle();
      logMetadata(metadata);
      if (metadata.retention.removed.length > 0) {
        console.log(`Retention removed ${metadata.retention.removed.length} old backup(s)`);
      }
    } catch (error) {
      console.error(`Backup cycle failed: ${error?.message || String(error)}`);
      process.exitCode = 1;
    }
  };

  if (process.argv.includes('--once')) {
    await runOnce();
    return;
  }

  const next = () => {
    const now = new Date();
    const target = new Date(now);
    target.setUTCHours(hour, 0, 0, 0);
    if (target <= now) target.setUTCDate(target.getUTCDate() + 1);
    return target.getTime() - now.getTime();
  };

  console.log(`Daily backup scheduler started (${hour.toString().padStart(2, '0')}:00 UTC)`);
  setTimeout(async () => {
    await runOnce();
    setInterval(runOnce, 24 * 60 * 60 * 1000);
  }, next());
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);

  if (command === 'backup') {
    const dbPath = positional[0] || flags.db;
    const backupPath = positional[1] || flags.out;
    const dir = flags.dir || (backupPath ? path.dirname(path.resolve(backupPath)) : undefined);
    const metadata = await runBackupCycle({
      dbPath,
      backupPath,
      backupDir: dir,
      retentionCount: flags.retention,
      alertWebhook: flags['alert-webhook'],
    });
    logMetadata(metadata);
    if (metadata.retention.removed.length > 0) {
      console.log(`Retention removed ${metadata.retention.removed.length} old backup(s)`);
    }
    return;
  }

  if (command === 'verify') {
    const metadata = verifyDatabaseFile(positional[0]);
    logMetadata({ ...metadata, sha256: await hashFile(metadata.file) });
    return;
  }

  if (command === 'restore-verify') {
    const metadata = await restoreVerify(positional[0]);
    console.log('Restore verification succeeded in an isolated database.');
    logMetadata(metadata);
    return;
  }

  if (command === 'restore') {
    const metadata = restoreDatabase(positional[0], positional[1], { force: Boolean(flags.force) });
    console.log('Restore completed and verified.');
    logMetadata({ ...metadata, sha256: await hashFile(metadata.file) });
    return;
  }

  if (command === 'schedule') {
    await scheduleDaily();
    return;
  }

  console.error(
    'Usage: node scripts/sqlite-backup.mjs <backup|verify|restore-verify|restore|schedule> [args]'
  );
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Backup operation failed: ${error?.message || String(error)}`);
    process.exitCode = 1;
  });
}
