// AIOSpark SQLite Backup / Restore Utility (single-instance pilot)
// Copies the WAL-mode SQLite database file atomically enough for a point-in-time
// snapshot: checkpoints the WAL into the main file, then copies the main file.
// Restore copies the backup file back to the live path.
// Usage:
//   node scripts/sqlite-backup.mjs backup <dbPath> <backupPath>
//   node scripts/sqlite-backup.mjs restore <backupPath> <dbPath>
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function checkpointWal(dbPath) {
  const db = new DatabaseSync(dbPath, { readonly: true });
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {
    db.close();
  }
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
}

function cmdBackup(dbPath, backupPath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }
  // Ensure the directory for the backup exists.
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  // Flush WAL into the main file so the backup is a consistent snapshot.
  checkpointWal(dbPath);
  copyFile(dbPath, backupPath);
  const size = fs.statSync(backupPath).size;
  console.log(`✅ Backup created: ${backupPath} (${size} bytes)`);
  return backupPath;
}

function cmdRestore(backupPath, dbPath) {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  copyFile(backupPath, dbPath);
  // Verify the restored file is a valid SQLite database.
  const db = new DatabaseSync(dbPath, { readonly: true });
  try {
    const header = db.prepare("SELECT name FROM sqlite_master LIMIT 1").get();
    console.log(`✅ Restore verified: ${dbPath} (readable, sqlite_master queryable)`);
  } finally {
    db.close();
  }
  return dbPath;
}

function cmdVerify(dbPath) {
  const db = new DatabaseSync(dbPath, { readonly: true });
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get();
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    console.log(`✅ Integrity: ${integrity.integrity_check}`);
    console.log(`   Tables: ${tables.map((t) => t.name).join(', ')}`);
    return integrity.integrity_check === 'ok';
  } finally {
    db.close();
  }
}

const [command, argA, argB] = process.argv.slice(2);
try {
  if (command === 'backup') {
    cmdBackup(argA, argB);
  } else if (command === 'restore') {
    cmdRestore(argA, argB);
  } else if (command === 'verify') {
    const ok = cmdVerify(argA);
    process.exit(ok ? 0 : 1);
  } else {
    console.error('Usage: node scripts/sqlite-backup.mjs <backup|restore|verify> <pathA> [pathB]');
    process.exit(2);
  }
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
