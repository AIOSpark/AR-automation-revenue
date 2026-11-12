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
import { AsyncLocalStorage } from 'node:async_hooks';
import { RELATIONAL_SCHEMA_SQL, RELATIONAL_SCHEMA_VERSION } from './relational-schema';
import { GOVERNANCE_SCHEMA_SQL, GOVERNANCE_SCHEMA_VERSION } from './governance-schema';
import { OPERATIONAL_SCHEMA_SQL, OPERATIONAL_SCHEMA_VERSION } from './operational-schema';

const databasePath =
  process.env.AIOSPARK_TEST_MODE === 'true'
    ? ':memory:'
    : process.env.AIOSPARK_DB_PATH || path.join(process.cwd(), '.data', 'aiospark.sqlite');

if (databasePath !== ':memory:') {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

const database = new DatabaseSync(databasePath);
database.exec('PRAGMA busy_timeout = 5000');
database.exec('PRAGMA foreign_keys = ON');
if (databasePath !== ':memory:') {
  // Concurrent processes may open the file at the same time; a journal-mode
  // change needs an exclusive lock, so retry briefly instead of failing boot.
  let walEnabled = false;
  for (let attempt = 0; attempt < 20 && !walEnabled; attempt++) {
    try {
      database.exec('PRAGMA journal_mode = WAL');
      walEnabled = true;
    } catch (error) {
      if ((error as { code?: string }).code !== 'SQLITE_BUSY') throw error;
      const until = Date.now() + 50;
      while (Date.now() < until) { /* brief synchronous backoff */ }
    }
  }
}
database.exec(`
  CREATE TABLE IF NOT EXISTS repository_snapshots (
    namespace TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

database.exec(`
  CREATE TABLE IF NOT EXISTS repository_schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`);
database.exec(RELATIONAL_SCHEMA_SQL);
database.prepare(
  'INSERT OR IGNORE INTO repository_schema_migrations(version, applied_at) VALUES (?, ?)',
).run(1, new Date().toISOString());
database.prepare(
  'INSERT OR IGNORE INTO repository_schema_migrations(version, applied_at) VALUES (?, ?)',
).run(RELATIONAL_SCHEMA_VERSION, new Date().toISOString());
database.exec(GOVERNANCE_SCHEMA_SQL);
database.prepare(
  'INSERT OR IGNORE INTO repository_schema_migrations(version, applied_at) VALUES (?, ?)',
).run(GOVERNANCE_SCHEMA_VERSION, new Date().toISOString());
database.exec(OPERATIONAL_SCHEMA_SQL);
database.prepare(
  'INSERT OR IGNORE INTO repository_schema_migrations(version, applied_at) VALUES (?, ?)',
).run(OPERATIONAL_SCHEMA_VERSION, new Date().toISOString());

/**
 * Async-local storage for write transaction depth. SQLite write transactions
 * are connection-scoped, so nested store calls must share the outer
 * transaction rather than issuing a second BEGIN. Each async context gets
 * its own depth counter, preventing concurrent requests from corrupting
 * each other's transactions.
 */
const txDepthStorage = new AsyncLocalStorage<Map<string, number>>();

function getTxDepth(): number {
  const store = txDepthStorage.getStore();
  return store ? (store.get('depth') ?? 0) : 0;
}

function setTxDepth(depth: number): void {
  const store = txDepthStorage.getStore();
  if (store) {
    store.set('depth', depth);
  }
}

function runWithTxDepth<T>(depth: number, callback: () => T): T {
  const store = new Map<string, number>([['depth', depth]]);
  return txDepthStorage.run(store, callback);
}

export function withWriteTransaction<T>(callback: () => T): T {
  const currentDepth = getTxDepth();

  if (currentDepth > 0) {
    // Nested call within the same async context: join the outer transaction.
    setTxDepth(currentDepth + 1);
    try {
      return callback();
    } finally {
      setTxDepth(currentDepth);
    }
  }

  if (databasePath === ':memory:') {
    return runWithTxDepth(1, () => {
      try {
        return callback();
      } finally {
        setTxDepth(0);
      }
    });
  }

  return runWithTxDepth(1, () => {
    database.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      database.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        database.exec('ROLLBACK');
      } catch {
        // The transaction may already have been rolled back by SQLite.
      }
      throw error;
    } finally {
      setTxDepth(0);
    }
  });
}

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

/**
 * Run a callback inside one durable SQLite write transaction.
 *
 * BEGIN IMMEDIATE takes the database write lock up front, so concurrent
 * application processes are serialized by SQLite rather than by a
 * process-local promise. Nested calls join the outer transaction.
 *
 * On error the transaction is rolled back, leaving no partial financial
 * state. If the process dies mid-transaction, SQLite discards the
 * uncommitted WAL frames on the next open.
 */
export function isInWriteTransaction(): boolean {
  return getTxDepth() > 0;
}

export function writeSnapshot<T>(namespace: string, value: T): void {
  if (databasePath === ':memory:') return;
  const updatedAt = new Date().toISOString();
  withWriteTransaction(() => {
    const existingPayload = (readStatement.get(namespace) as { payload?: string } | undefined)?.payload;
    let existing: unknown = null;
    if (existingPayload) {
      try { existing = JSON.parse(existingPayload); } catch { existing = null; }
    }
    const payload = JSON.stringify(mergeConcurrentSnapshots(existing, value));
    writeStatement.run(namespace, payload, updatedAt);
  });
}

/**
 * Exact snapshot replacement for callers that already hold the write lock and
 * have reloaded the latest state (e.g. the relational UDM compatibility view).
 */
export function writeSnapshotExact<T>(namespace: string, value: T): void {
  if (databasePath === ':memory:') return;
  withWriteTransaction(() => {
    writeStatement.run(namespace, JSON.stringify(value), new Date().toISOString());
  });
}

export function deleteSnapshot(namespace: string): void {
  if (databasePath === ':memory:') {
    return;
  }
  withWriteTransaction(() => {
    deleteStatement.run(namespace);
  });
}

export function getSchemaVersion(): number {
  interface Row { version: number | null }
  const row = database
    .prepare('SELECT MAX(version) AS version FROM repository_schema_migrations')
    .get() as Row | undefined;
  return row?.version ?? 0;
}

export function getDurableStatePath(): string {
  return databasePath;
}

type DirectSnapshotProvider = (namespace: string) => unknown | null;
const directSnapshotProviders: DirectSnapshotProvider[] = [];

/**
 * Allow a relational storage layer to supply the compatibility view for legacy
 * direct-snapshot readers. The provider must return null when it has no rows.
 */
export function registerDirectSnapshotProvider(provider: DirectSnapshotProvider): void {
  directSnapshotProviders.push(provider);
}

// Direct SQLite read for independent verification (bypasses in-memory state)
export function readSnapshotDirect<T>(namespace: string): T | null {
  for (const provider of directSnapshotProviders) {
    const supplied = provider(namespace);
    if (supplied !== null && supplied !== undefined) return supplied as T;
  }

  const payload = (readStatement.get(namespace) as { payload?: string } | undefined)?.payload;
  if (!payload) return null;

  try {
    return JSON.parse(payload) as T;
  } catch {
    throw new Error(`Durable state for '${namespace}' is corrupt and cannot be loaded`);
  }
}

export function getDatabase(): DatabaseSync {
  return database;
}

export function closeDatabase(): void {
  (database as any).close();
}
