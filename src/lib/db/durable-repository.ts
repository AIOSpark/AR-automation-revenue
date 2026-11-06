/**
 * Synchronous SQLite repository used by the server-side domain stores.
 *
 * The domain APIs are synchronous today, so this repository uses Node's
 * synchronous SQLite driver instead of keeping authoritative state in maps or
 * serializing it to an application-local JSON file. Production must provide a
 * writable AIOSPARK_DB_PATH on durable storage; tests opt into :memory:.
 */
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const databasePath =
  process.env.AIOSPARK_TEST_MODE === 'true'
    ? ':memory:'
    : process.env.AIOSPARK_DB_PATH || path.join(process.cwd(), '.data', 'aiospark.sqlite');

if (databasePath !== ':memory:') {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

const database = new DatabaseSync(databasePath);
database.exec('PRAGMA busy_timeout = 5000');
database.exec('PRAGMA journal_mode = WAL');
database.exec(`
  CREATE TABLE IF NOT EXISTS repository_snapshots (
    namespace TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const readStatement = database.prepare(
  'SELECT payload FROM repository_snapshots WHERE namespace = ?',
);
const writeStatement = database.prepare(`
  INSERT INTO repository_snapshots(namespace, payload, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(namespace) DO UPDATE SET
    payload = excluded.payload,
    updated_at = excluded.updated_at
`);
const deleteStatement = database.prepare(
  'DELETE FROM repository_snapshots WHERE namespace = ?',
);

function mergeConcurrentSnapshots(current: unknown, incoming: unknown): unknown {
  if (!current || !incoming || typeof current !== 'object' || typeof incoming !== 'object' || Array.isArray(current) || Array.isArray(incoming)) {
    return incoming;
  }
  const currentRecord = current as Record<string, unknown>;
  const incomingRecord = incoming as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...currentRecord, ...incomingRecord };
  for (const [key, incomingValue] of Object.entries(incomingRecord)) {
    const currentValue = currentRecord[key];
    if (!Array.isArray(currentValue) || !Array.isArray(incomingValue)) continue;
    const byId = new Map<string, unknown>();
    for (const item of [...currentValue, ...incomingValue]) {
      if (!item || typeof item !== 'object' || !('id' in item)) continue;
      const id = String((item as { id: unknown }).id);
      const previous = byId.get(id) as { updated_at?: string; created_at?: string } | undefined;
      const candidate = item as { updated_at?: string; created_at?: string };
      if (!previous || String(candidate.updated_at || candidate.created_at || '') >= String(previous.updated_at || previous.created_at || '')) {
        byId.set(id, item);
      }
    }
    merged[key] = byId.size ? Array.from(byId.values()) : incomingValue;
  }
  return merged;
}

export function readSnapshot<T>(namespace: string): T | null {
  if (databasePath === ':memory:') return null;
  const payload = (readStatement.get(namespace) as { payload?: string } | undefined)?.payload;
  if (!payload) return null;

  try {
    return JSON.parse(payload) as T;
  } catch {
    throw new Error(`Durable state for '${namespace}' is corrupt and cannot be loaded`);
  }
}

export function writeSnapshot<T>(namespace: string, value: T): void {
  if (databasePath === ':memory:') return;
  const updatedAt = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    const existingPayload = (readStatement.get(namespace) as { payload?: string } | undefined)?.payload;
    let existing: unknown = null;
    if (existingPayload) {
      try { existing = JSON.parse(existingPayload); } catch { existing = null; }
    }
    const payload = JSON.stringify(mergeConcurrentSnapshots(existing, value));
    writeStatement.run(namespace, payload, updatedAt);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function deleteSnapshot(namespace: string): void {
  if (databasePath === ':memory:') {
    return;
  }
  deleteStatement.run(namespace);
}

export function getDurableStatePath(): string {
  return databasePath;
}

// Direct SQLite read for independent verification (bypasses in-memory state)
export function readSnapshotDirect<T>(namespace: string): T | null {
  const payload = (readStatement.get(namespace) as { payload?: string } | undefined)?.payload;
  if (!payload) return null;

  try {
    return JSON.parse(payload) as T;
  } catch {
    throw new Error(`Durable state for '${namespace}' is corrupt and cannot be loaded`);
  }
}

export function getDatabase() {
  return database;
}
