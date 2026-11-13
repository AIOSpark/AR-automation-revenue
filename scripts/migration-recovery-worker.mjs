/**
 * Worker process for the HIGH-009 migration-recovery test.
 *
 * Each mode opens the SQLite file in a fresh process. The migrate mode is
 * killed by the parent while the version-2 backfill transaction is active.
 */

const mode = process.env.WORKER_MODE || 'migrate';
process.env.AIOSPARK_TEST_MODE = 'false';

const {
  backfillUdmFromSnapshot,
  readUdmRelationalState,
} = await import('../src/lib/db/relational-repository.ts');
const {
  closeDatabase,
  getDatabase,
  getSchemaVersion,
  readSnapshot,
} = await import('../src/lib/db/durable-repository.ts');

const TABLES = [
  'udm_customers',
  'udm_contacts',
  'udm_invoices',
  'udm_payments',
  'udm_payment_matches',
  'udm_credit_notes',
  'udm_credit_allocations',
  'udm_disputes',
  'udm_dispute_evidence',
  'udm_exceptions',
  'udm_bank_transactions',
  'udm_idempotency_keys',
  'udm_api_idempotency_keys',
];

function inspect() {
  const db = getDatabase();
  const counts = Object.fromEntries(
    TABLES.map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]),
  );
  const distinctCounts = Object.fromEntries(
    TABLES.map((table) => {
      const column = table === 'udm_idempotency_keys' || table === 'udm_api_idempotency_keys'
        ? null
        : 'id';
      const sql = column
        ? `SELECT COUNT(DISTINCT ${column}) AS count FROM ${table}`
        : table === 'udm_idempotency_keys'
          ? 'SELECT COUNT(*) AS count FROM (SELECT DISTINCT organization_id, key FROM udm_idempotency_keys)'
          : 'SELECT COUNT(*) AS count FROM (SELECT DISTINCT organization_id, endpoint, key FROM udm_api_idempotency_keys)';
      return [table, db.prepare(sql).get().count];
    }),
  );
  const integrity = db.prepare('PRAGMA integrity_check').all();
  const foreignKeyViolations = db.prepare('PRAGMA foreign_key_check').all();
  const invoiceTotal = db.prepare('SELECT COALESCE(SUM(amount_minor_units), 0) AS total FROM udm_invoices').get().total;
  const paymentTotal = db.prepare('SELECT COALESCE(SUM(amount_minor_units), 0) AS total FROM udm_payments').get().total;
  const matchTotal = db.prepare('SELECT COALESCE(SUM(matched_amount_minor_units), 0) AS total FROM udm_payment_matches').get().total;
  return {
    schemaVersion: getSchemaVersion(),
    counts,
    distinctCounts,
    integrity: integrity.map((row) => row.integrity_check),
    foreignKeyViolations: foreignKeyViolations.length,
    invoiceTotal,
    paymentTotal,
    matchTotal,
    snapshotPresent: readSnapshot('udm') !== null,
    relational: readUdmRelationalState(),
  };
}

if (mode === 'migrate' || mode === 'verify') {
  const migrated = backfillUdmFromSnapshot();
  const result = inspect();
  console.log(JSON.stringify({
    ok: true,
    mode,
    migrated,
    schemaVersion: result.schemaVersion,
    counts: result.counts,
    distinctCounts: result.distinctCounts,
    integrity: result.integrity,
    foreignKeyViolations: result.foreignKeyViolations,
    invoiceTotal: result.invoiceTotal,
    paymentTotal: result.paymentTotal,
    matchTotal: result.matchTotal,
    snapshotPresent: result.snapshotPresent,
    relationalRows: result.relational
      ? Object.fromEntries(Object.entries(result.relational).map(([key, value]) => [key, value.length]))
      : null,
  }));
} else {
  console.error(`Unknown WORKER_MODE: ${mode}`);
  process.exitCode = 2;
}

closeDatabase();
