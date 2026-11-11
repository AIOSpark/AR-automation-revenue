// Relational UDM persistence.
//
// Relational tables are authoritative for the UDM. A legacy `udm` snapshot is
// projected once during migration and deleted in the same transaction, so a
// crash can never leave the only copy partially migrated or unrecoverable.

import { deleteSnapshot, getDatabase, readSnapshot, registerDirectSnapshotProvider, withWriteTransaction } from './durable-repository';

type Row = Record<string, any>;

export type RelationalUdmState = {
  customers: Row[];
  contacts: Row[];
  invoices: Row[];
  payments: Row[];
  matches: Row[];
  creditNotes: Row[];
  creditAllocations: Row[];
  disputes: Row[];
  disputeEvidences: Row[];
  exceptions: Row[];
  bankTransactions: Row[];
  idempotencyKeys: Array<{ organization_id: string; key: string; record_id: string }>;
  apiIdempotencyKeys: Array<{
    organization_id: string;
    endpoint: string;
    key: string;
    record_id: string | null;
    fingerprint: string;
    response: unknown;
  }>;
};

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
] as const;

function integer(value: unknown, fallback: number, label: string): number {
  const parsed = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`Relational integrity violation: ${label} must be an integer`);
  }
  return parsed;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function payload(row: Row): string {
  return JSON.stringify(row);
}

function insertCustomers(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_customers(
      id, organization_id, source_system, source_id, name,
      credit_limit_minor_units, currency, payment_terms_days, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      text(row.source_system, 'unknown'),
      text(row.source_id, String(row.id)),
      text(row.name, String(row.id)),
      integer(row.credit_limit_minor_units, 0, `customer ${row.id} credit_limit_minor_units`),
      text(row.currency, 'INR'),
      integer(row.payment_terms_days, 0, `customer ${row.id} payment_terms_days`),
      payload(row),
    );
  }
}

function insertContacts(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_contacts(id, organization_id, customer_id, email, payload)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      String(row.customer_id),
      text(row.email, ''),
      payload(row),
    );
  }
}

function insertInvoices(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_invoices(
      id, organization_id, customer_id, source_system, source_id,
      amount_minor_units, tax_amount_minor_units, status, issue_date, due_date, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      String(row.customer_id),
      text(row.source_system, 'unknown'),
      text(row.source_id, String(row.id)),
      integer(row.amount_minor_units, 0, `invoice ${row.id} amount_minor_units`),
      integer(row.tax_amount_minor_units, 0, `invoice ${row.id} tax_amount_minor_units`),
      text(row.status, 'open'),
      text(row.issue_date, String(row.created_at || new Date().toISOString())),
      text(row.due_date, String(row.issue_date || row.created_at || new Date().toISOString())),
      payload(row),
    );
  }
}

function insertPayments(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_payments(
      id, organization_id, customer_id, source_system, source_id,
      amount_minor_units, currency, date, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      String(row.customer_id),
      text(row.source_system, 'unknown'),
      text(row.source_id, String(row.id)),
      integer(row.amount_minor_units, 0, `payment ${row.id} amount_minor_units`),
      text(row.currency, 'INR'),
      text(row.date, String(row.created_at || new Date().toISOString())),
      payload(row),
    );
  }
}

function insertMatches(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_payment_matches(
      id, organization_id, payment_id, invoice_id, matched_amount_minor_units, payload
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      String(row.payment_id),
      String(row.invoice_id),
      integer(row.matched_amount_minor_units, 0, `payment match ${row.id} matched_amount_minor_units`),
      payload(row),
    );
  }
}

function insertCreditNotes(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_credit_notes(
      id, organization_id, customer_id, invoice_id, amount_minor_units, currency, date, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      String(row.customer_id),
      nullableText(row.invoice_id),
      integer(row.amount_minor_units, 0, `credit note ${row.id} amount_minor_units`),
      text(row.currency, 'INR'),
      text(row.date, String(row.created_at || new Date().toISOString())),
      payload(row),
    );
  }
}

function insertCreditAllocations(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_credit_allocations(
      id, organization_id, credit_note_id, invoice_id,
      allocated_amount_minor_units, status, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      String(row.credit_note_id),
      String(row.invoice_id),
      integer(row.allocated_amount_minor_units, 0, `credit allocation ${row.id} allocated_amount_minor_units`),
      text(row.status, 'allocated'),
      payload(row),
    );
  }
}

function insertDisputes(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_disputes(id, organization_id, invoice_id, status, amount_minor_units, payload)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      String(row.invoice_id),
      text(row.status, 'open'),
      row.amount_minor_units === undefined || row.amount_minor_units === null
        ? null
        : integer(row.amount_minor_units, 0, `dispute ${row.id} amount_minor_units`),
      payload(row),
    );
  }
}

function insertDisputeEvidence(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_dispute_evidence(id, organization_id, dispute_id, payload)
    VALUES (?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(String(row.id), String(row.organization_id), String(row.dispute_id), payload(row));
  }
}

function insertExceptions(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_exceptions(
      id, organization_id, customer_id, invoice_id, severity, status, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      nullableText(row.customer_id),
      nullableText(row.invoice_id),
      text(row.severity, 'low'),
      text(row.status, 'detected'),
      payload(row),
    );
  }
}

function insertBankTransactions(db: ReturnType<typeof getDatabase>, rows: Row[]): void {
  const statement = db.prepare(`
    INSERT INTO udm_bank_transactions(
      id, organization_id, amount_minor_units, currency, date, status,
      matched_payment_id, payload
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    statement.run(
      String(row.id),
      String(row.organization_id),
      integer(row.amount_minor_units, 0, `bank transaction ${row.id} amount_minor_units`),
      text(row.currency, 'INR'),
      text(row.date, String(row.created_at || new Date().toISOString())),
      text(row.status, 'unmatched'),
      nullableText(row.matched_payment_id),
      payload(row),
    );
  }
}

function insertIdempotency(
  db: ReturnType<typeof getDatabase>,
  state: RelationalUdmState,
): void {
  const keyStatement = db.prepare(`
    INSERT INTO udm_idempotency_keys(organization_id, key, record_id) VALUES (?, ?, ?)
  `);
  for (const entry of state.idempotencyKeys || []) {
    keyStatement.run(entry.organization_id, entry.key, entry.record_id);
  }

  const apiStatement = db.prepare(`
    INSERT INTO udm_api_idempotency_keys(
      organization_id, endpoint, key, record_id, fingerprint, response
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const entry of state.apiIdempotencyKeys || []) {
    apiStatement.run(
      entry.organization_id,
      entry.endpoint,
      entry.key,
      entry.record_id,
      entry.fingerprint,
      JSON.stringify(entry.response ?? null),
    );
  }
}

/**
 * Replace the relational projection with an exact UDM state. Runs inside the
 * caller's durable transaction if one is active, so deletes and inserts commit
 * atomically with the business mutation.
 */
export function writeUdmRelationalState(state: RelationalUdmState): void {
  withWriteTransaction(() => {
    const db = getDatabase();
    for (const table of [
      'udm_api_idempotency_keys',
      'udm_idempotency_keys',
      'udm_bank_transactions',
      'udm_exceptions',
      'udm_dispute_evidence',
      'udm_disputes',
      'udm_credit_allocations',
      'udm_credit_notes',
      'udm_payment_matches',
      'udm_payments',
      'udm_invoices',
      'udm_contacts',
      'udm_customers',
    ]) {
      db.exec(`DELETE FROM ${table}`);
    }

    insertCustomers(db, state.customers || []);
    insertContacts(db, state.contacts || []);
    insertInvoices(db, state.invoices || []);
    insertPayments(db, state.payments || []);
    insertMatches(db, state.matches || []);
    insertCreditNotes(db, state.creditNotes || []);
    insertCreditAllocations(db, state.creditAllocations || []);
    insertDisputes(db, state.disputes || []);
    insertDisputeEvidence(db, state.disputeEvidences || []);
    insertExceptions(db, state.exceptions || []);
    insertBankTransactions(db, state.bankTransactions || []);
    insertIdempotency(db, state);
  });
}

function upsertRows(
  db: ReturnType<typeof getDatabase>,
  table: string,
  columns: string[],
  rows: Row[],
  values: (row: Row) => unknown[],
): void {
  if (rows.length === 0) return;
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = excluded.${column}`)
    .join(', ');
  const statement = db.prepare(`
    INSERT INTO ${table}(${columns.join(', ')})
    VALUES (${columns.map(() => '?').join(', ')})
    ON CONFLICT(id) DO UPDATE SET ${updates}
  `);
  for (const row of rows) statement.run(...values(row));
}

function customerValues(row: Row): unknown[] {
  return [
    String(row.id),
    String(row.organization_id),
    text(row.source_system, 'unknown'),
    text(row.source_id, String(row.id)),
    text(row.name, String(row.id)),
    integer(row.credit_limit_minor_units, 0, `customer ${row.id} credit_limit_minor_units`),
    text(row.currency, 'INR'),
    integer(row.payment_terms_days, 0, `customer ${row.id} payment_terms_days`),
    payload(row),
  ];
}

function invoiceValues(row: Row): unknown[] {
  return [
    String(row.id),
    String(row.organization_id),
    String(row.customer_id),
    text(row.source_system, 'unknown'),
    text(row.source_id, String(row.id)),
    integer(row.amount_minor_units, 0, `invoice ${row.id} amount_minor_units`),
    integer(row.tax_amount_minor_units, 0, `invoice ${row.id} tax_amount_minor_units`),
    text(row.status, 'open'),
    text(row.issue_date, String(row.created_at || new Date().toISOString())),
    text(row.due_date, String(row.issue_date || row.created_at || new Date().toISOString())),
    payload(row),
  ];
}

function paymentValues(row: Row): unknown[] {
  return [
    String(row.id),
    String(row.organization_id),
    String(row.customer_id),
    text(row.source_system, 'unknown'),
    text(row.source_id, String(row.id)),
    integer(row.amount_minor_units, 0, `payment ${row.id} amount_minor_units`),
    text(row.currency, 'INR'),
    text(row.date, String(row.created_at || new Date().toISOString())),
    payload(row),
  ];
}

function changedRows(current: Row[], previous: Row[]): Row[] {
  const old = new Map(previous.map((row) => [String(row.id), JSON.stringify(row)]));
  return current.filter((row) => old.get(String(row.id)) !== JSON.stringify(row));
}

/**
 * Apply only inserts/updates. Any deletion falls back to an exact full
 * projection so foreign-key ordering and dependent rows stay correct.
 */
/** Fast path for invoice-heavy imports: upsert only the named invoice rows. */
export function writeUdmRelationalInvoices(rows: Row[]): void {
  if (rows.length === 0) return;
  withWriteTransaction(() => {
    upsertRows(
      getDatabase(),
      'udm_invoices',
      [
        'id', 'organization_id', 'customer_id', 'source_system', 'source_id',
        'amount_minor_units', 'tax_amount_minor_units', 'status', 'issue_date', 'due_date', 'payload',
      ],
      rows,
      invoiceValues,
    );
  });
}

export function writeUdmRelationalDelta(
  state: RelationalUdmState,
  previous: RelationalUdmState | null,
): void {
  if (!previous) {
    writeUdmRelationalState(state);
    return;
  }

  const collections: Array<[Row[], Row[]]> = [
    [state.customers || [], previous.customers || []],
    [state.contacts || [], previous.contacts || []],
    [state.invoices || [], previous.invoices || []],
    [state.payments || [], previous.payments || []],
    [state.matches || [], previous.matches || []],
    [state.creditNotes || [], previous.creditNotes || []],
    [state.creditAllocations || [], previous.creditAllocations || []],
    [state.disputes || [], previous.disputes || []],
    [state.disputeEvidences || [], previous.disputeEvidences || []],
    [state.exceptions || [], previous.exceptions || []],
    [state.bankTransactions || [], previous.bankTransactions || []],
  ];

  const hasDeletion = collections.some(([current, old]) => {
    const ids = new Set(current.map((row) => String(row.id)));
    return old.some((row) => !ids.has(String(row.id)));
  });
  const oldKeys = new Set((previous.idempotencyKeys || []).map((entry) => `${entry.organization_id}:${entry.key}`));
  const newKeys = new Set((state.idempotencyKeys || []).map((entry) => `${entry.organization_id}:${entry.key}`));
  const oldApiKeys = new Set((previous.apiIdempotencyKeys || []).map((entry) => `${entry.organization_id}:${entry.endpoint}:${entry.key}`));
  const newApiKeys = new Set((state.apiIdempotencyKeys || []).map((entry) => `${entry.organization_id}:${entry.endpoint}:${entry.key}`));
  const hasKeyDeletion =
    [...oldKeys].some((key) => !newKeys.has(key)) ||
    [...oldApiKeys].some((key) => !newApiKeys.has(key));

  if (hasDeletion || hasKeyDeletion) {
    writeUdmRelationalState(state);
    return;
  }

  withWriteTransaction(() => {
    const db = getDatabase();
    upsertRows(db, 'udm_customers', [
      'id', 'organization_id', 'source_system', 'source_id', 'name',
      'credit_limit_minor_units', 'currency', 'payment_terms_days', 'payload',
    ], changedRows(state.customers || [], previous.customers || []), customerValues);

    upsertRows(db, 'udm_contacts', [
      'id', 'organization_id', 'customer_id', 'email', 'payload',
    ], changedRows(state.contacts || [], previous.contacts || []), (row) => [
      String(row.id), String(row.organization_id), String(row.customer_id), text(row.email, ''), payload(row),
    ]);

    upsertRows(db, 'udm_invoices', [
      'id', 'organization_id', 'customer_id', 'source_system', 'source_id',
      'amount_minor_units', 'tax_amount_minor_units', 'status', 'issue_date', 'due_date', 'payload',
    ], changedRows(state.invoices || [], previous.invoices || []), invoiceValues);

    upsertRows(db, 'udm_payments', [
      'id', 'organization_id', 'customer_id', 'source_system', 'source_id',
      'amount_minor_units', 'currency', 'date', 'payload',
    ], changedRows(state.payments || [], previous.payments || []), paymentValues);

    upsertRows(db, 'udm_payment_matches', [
      'id', 'organization_id', 'payment_id', 'invoice_id', 'matched_amount_minor_units', 'payload',
    ], changedRows(state.matches || [], previous.matches || []), (row) => [
      String(row.id), String(row.organization_id), String(row.payment_id), String(row.invoice_id),
      integer(row.matched_amount_minor_units, 0, `payment match ${row.id} matched_amount_minor_units`), payload(row),
    ]);

    upsertRows(db, 'udm_credit_notes', [
      'id', 'organization_id', 'customer_id', 'invoice_id', 'amount_minor_units', 'currency', 'date', 'payload',
    ], changedRows(state.creditNotes || [], previous.creditNotes || []), (row) => [
      String(row.id), String(row.organization_id), String(row.customer_id), nullableText(row.invoice_id),
      integer(row.amount_minor_units, 0, `credit note ${row.id} amount_minor_units`), text(row.currency, 'INR'),
      text(row.date, String(row.created_at || new Date().toISOString())), payload(row),
    ]);

    upsertRows(db, 'udm_credit_allocations', [
      'id', 'organization_id', 'credit_note_id', 'invoice_id', 'allocated_amount_minor_units', 'status', 'payload',
    ], changedRows(state.creditAllocations || [], previous.creditAllocations || []), (row) => [
      String(row.id), String(row.organization_id), String(row.credit_note_id), String(row.invoice_id),
      integer(row.allocated_amount_minor_units, 0, `credit allocation ${row.id} allocated_amount_minor_units`),
      text(row.status, 'allocated'), payload(row),
    ]);

    upsertRows(db, 'udm_disputes', [
      'id', 'organization_id', 'invoice_id', 'status', 'amount_minor_units', 'payload',
    ], changedRows(state.disputes || [], previous.disputes || []), (row) => [
      String(row.id), String(row.organization_id), String(row.invoice_id), text(row.status, 'open'),
      row.amount_minor_units === undefined || row.amount_minor_units === null
        ? null
        : integer(row.amount_minor_units, 0, `dispute ${row.id} amount_minor_units`),
      payload(row),
    ]);

    upsertRows(db, 'udm_dispute_evidence', [
      'id', 'organization_id', 'dispute_id', 'payload',
    ], changedRows(state.disputeEvidences || [], previous.disputeEvidences || []), (row) => [
      String(row.id), String(row.organization_id), String(row.dispute_id), payload(row),
    ]);

    upsertRows(db, 'udm_exceptions', [
      'id', 'organization_id', 'customer_id', 'invoice_id', 'severity', 'status', 'payload',
    ], changedRows(state.exceptions || [], previous.exceptions || []), (row) => [
      String(row.id), String(row.organization_id), nullableText(row.customer_id), nullableText(row.invoice_id),
      text(row.severity, 'low'), text(row.status, 'detected'), payload(row),
    ]);

    upsertRows(db, 'udm_bank_transactions', [
      'id', 'organization_id', 'amount_minor_units', 'currency', 'date', 'status', 'matched_payment_id', 'payload',
    ], changedRows(state.bankTransactions || [], previous.bankTransactions || []), (row) => [
      String(row.id), String(row.organization_id),
      integer(row.amount_minor_units, 0, `bank transaction ${row.id} amount_minor_units`),
      text(row.currency, 'INR'), text(row.date, String(row.created_at || new Date().toISOString())),
      text(row.status, 'unmatched'), nullableText(row.matched_payment_id), payload(row),
    ]);

    const keyStatement = db.prepare(`
      INSERT INTO udm_idempotency_keys(organization_id, key, record_id) VALUES (?, ?, ?)
      ON CONFLICT(organization_id, key) DO UPDATE SET record_id = excluded.record_id
    `);
    for (const entry of state.idempotencyKeys || []) {
      keyStatement.run(entry.organization_id, entry.key, entry.record_id);
    }

    const apiStatement = db.prepare(`
      INSERT INTO udm_api_idempotency_keys(
        organization_id, endpoint, key, record_id, fingerprint, response
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, endpoint, key) DO UPDATE SET
        record_id = excluded.record_id,
        fingerprint = excluded.fingerprint,
        response = excluded.response
    `);
    for (const entry of state.apiIdempotencyKeys || []) {
      apiStatement.run(
        entry.organization_id,
        entry.endpoint,
        entry.key,
        entry.record_id,
        entry.fingerprint,
        JSON.stringify(entry.response ?? null),
      );
    }
  });
}

function readPayloads(db: ReturnType<typeof getDatabase>, table: string): Row[] {
  return (db.prepare(`SELECT payload FROM ${table}`).all() as Array<{ payload: string }>).map(
    (row) => JSON.parse(row.payload) as Row,
  );
}

function hasRows(db: ReturnType<typeof getDatabase>): boolean {
  for (const table of TABLES) {
    const row = db.prepare(`SELECT 1 AS present FROM ${table} LIMIT 1`).get();
    if (row) return true;
  }
  const key = db.prepare('SELECT 1 AS present FROM udm_idempotency_keys LIMIT 1').get();
  if (key) return true;
  const apiKey = db.prepare('SELECT 1 AS present FROM udm_api_idempotency_keys LIMIT 1').get();
  return Boolean(apiKey);
}

/**
 * Read authoritative relational UDM state. Returns null when no relational
 * rows exist, allowing the one-time legacy snapshot backfill.
 */
export function readUdmRelationalState(): RelationalUdmState | null {
  const db = getDatabase();
  if (!hasRows(db)) return null;

  const idempotencyKeys = (
    db.prepare('SELECT organization_id, key, record_id FROM udm_idempotency_keys').all() as Array<{
      organization_id: string;
      key: string;
      record_id: string;
    }>
  ).map((row) => ({ ...row }));

  const apiIdempotencyKeys = (
    db
      .prepare(
        'SELECT organization_id, endpoint, key, record_id, fingerprint, response FROM udm_api_idempotency_keys',
      )
      .all() as Array<{
      organization_id: string;
      endpoint: string;
      key: string;
      record_id: string | null;
      fingerprint: string;
      response: string | null;
    }>
  ).map((row) => ({
    organization_id: row.organization_id,
    endpoint: row.endpoint,
    key: row.key,
    record_id: row.record_id,
    fingerprint: row.fingerprint,
    response: row.response ? JSON.parse(row.response) : null,
  }));

  return {
    customers: readPayloads(db, 'udm_customers'),
    contacts: readPayloads(db, 'udm_contacts'),
    invoices: readPayloads(db, 'udm_invoices'),
    payments: readPayloads(db, 'udm_payments'),
    matches: readPayloads(db, 'udm_payment_matches'),
    creditNotes: readPayloads(db, 'udm_credit_notes'),
    creditAllocations: readPayloads(db, 'udm_credit_allocations'),
    disputes: readPayloads(db, 'udm_disputes'),
    disputeEvidences: readPayloads(db, 'udm_dispute_evidence'),
    exceptions: readPayloads(db, 'udm_exceptions'),
    bankTransactions: readPayloads(db, 'udm_bank_transactions'),
    idempotencyKeys,
    apiIdempotencyKeys,
  };
}

/**
 * One-time migration: if relational tables are empty but a legacy `udm`
 * snapshot exists, project it into relational tables before serving reads.
 *
 * The emptiness check, projection and snapshot deletion share one transaction.
 * A crash at any point leaves either the complete legacy snapshot with no
 * relational rows, or the complete relational projection with no snapshot;
 * it never leaves a partially migrated state. A restarted process can safely
 * rerun the migration.
 */
export function backfillUdmFromSnapshot(): boolean {
  let migrated = false;
  withWriteTransaction(() => {
    if (readUdmRelationalState()) return;
    const snapshot = readSnapshot<RelationalUdmState>('udm');
    if (!snapshot) return;
    writeUdmRelationalState(snapshot);
    // The legacy snapshot has been migrated; removing it prevents stale data
    // from reappearing after a clear if relational tables are later emptied.
    deleteSnapshot('udm');
    migrated = true;
  });
  return migrated;
}

registerDirectSnapshotProvider((namespace) =>
  namespace === 'udm' ? readUdmRelationalState() : null,
);
