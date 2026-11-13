/**
 * Fresh-process worker for HIGH-009R governance migration recovery.
 */

const mode = process.env.WORKER_MODE || 'migrate';
process.env.AIOSPARK_TEST_MODE = 'false';

const { backfillGovernanceFromSnapshots } = await import('../src/lib/db/governance-repository.ts');
const {
  closeDatabase,
  getDatabase,
  getSchemaVersion,
  readSnapshot,
  readSnapshotDirect,
} = await import('../src/lib/db/durable-repository.ts');

const TABLES = [
  'approval_requests',
  'approval_decisions',
  'approval_logs',
  'approval_autonomy_configs',
  'billing_subscriptions',
  'billing_subscription_history',
  'audit_events',
];

function inspect() {
  const db = getDatabase();
  const existing = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name),
  );
  const counts = Object.fromEntries(
    TABLES.map((table) => [
      table,
      existing.has(table) ? db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count : 0,
    ]),
  );
  const distinct = Object.fromEntries(
    TABLES.map((table) => {
      const sql = table === 'billing_subscription_history'
        ? 'SELECT COUNT(*) AS count FROM (SELECT DISTINCT organization_id, version FROM billing_subscription_history)'
        : table === 'approval_decisions'
          ? 'SELECT COUNT(DISTINCT approval_request_id) AS count FROM approval_decisions'
          : `SELECT COUNT(DISTINCT id) AS count FROM ${table}`;
      return [table, existing.has(table) ? db.prepare(sql).get().count : 0];
    }),
  );
  return {
    schemaVersion: getSchemaVersion(),
    counts,
    distinct,
    integrity: db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check),
    foreignKeyViolations: db.prepare('PRAGMA foreign_key_check').all().length,
    snapshots: {
      approvals: readSnapshot('approvals') !== null,
      billing: readSnapshot('billing') !== null,
      audit: readSnapshot('audit') !== null,
    },
    directBilling: readSnapshotDirect('billing'),
    directAudit: readSnapshotDirect('audit'),
    migrations: existing.has('governance_migrations')
      ? db.prepare('SELECT COUNT(*) AS count FROM governance_migrations').get().count
      : 0,
  };
}

const migrated = backfillGovernanceFromSnapshots();
const data = inspect();

console.log(JSON.stringify({
  ok: true,
  mode,
  migrated,
  schemaVersion: data.schemaVersion,
  counts: data.counts,
  distinct: data.distinct,
  integrity: data.integrity,
  foreignKeyViolations: data.foreignKeyViolations,
  snapshots: data.snapshots,
  directBillingSubscriptionCount: data.directBilling?.subscriptions?.length ?? 0,
  directAuditCount: Array.isArray(data.directAudit) ? data.directAudit.length : 0,
  migrations: data.migrations,
}));

closeDatabase();
