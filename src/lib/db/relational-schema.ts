// AIOSpark relational UDM schema (migration version 2).
//
// The JSON payload retains optional/extended fields, while identity, tenant,
// relationship and financial scalar columns are real SQL columns with foreign
// keys and CHECK constraints. This keeps the migration safe for the existing
// TypeScript domain model without weakening database-enforced integrity.

export const RELATIONAL_SCHEMA_VERSION = 2;

export const RELATIONAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS udm_customers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  source_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  credit_limit_minor_units INTEGER NOT NULL CHECK (credit_limit_minor_units >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  payment_terms_days INTEGER NOT NULL CHECK (payment_terms_days BETWEEN 0 AND 3650),
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_customers_source ON udm_customers(organization_id, source_system, source_id);
CREATE INDEX IF NOT EXISTS idx_udm_customers_org ON udm_customers(organization_id);

CREATE TABLE IF NOT EXISTS udm_contacts (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES udm_customers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_contacts_customer ON udm_contacts(customer_id);

CREATE TABLE IF NOT EXISTS udm_invoices (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES udm_customers(id),
  source_system TEXT NOT NULL,
  source_id TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
  tax_amount_minor_units INTEGER NOT NULL CHECK (tax_amount_minor_units >= 0),
  status TEXT NOT NULL CHECK (status IN ('open','partially_paid','paid','disputed','written_off','blocked')),
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_invoices_source ON udm_invoices(organization_id, source_system, source_id);
CREATE INDEX IF NOT EXISTS idx_udm_invoices_org_status ON udm_invoices(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_udm_invoices_customer ON udm_invoices(customer_id);

CREATE TABLE IF NOT EXISTS udm_payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES udm_customers(id),
  source_system TEXT NOT NULL,
  source_id TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  date TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_payments_source ON udm_payments(organization_id, source_system, source_id);
CREATE INDEX IF NOT EXISTS idx_udm_payments_org ON udm_payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_udm_payments_customer ON udm_payments(customer_id);

CREATE TABLE IF NOT EXISTS udm_payment_matches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  payment_id TEXT NOT NULL REFERENCES udm_payments(id),
  invoice_id TEXT NOT NULL REFERENCES udm_invoices(id),
  matched_amount_minor_units INTEGER NOT NULL CHECK (matched_amount_minor_units > 0),
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_matches_payment ON udm_payment_matches(payment_id);
CREATE INDEX IF NOT EXISTS idx_udm_matches_invoice ON udm_payment_matches(invoice_id);

CREATE TABLE IF NOT EXISTS udm_credit_notes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES udm_customers(id),
  invoice_id TEXT REFERENCES udm_invoices(id),
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  date TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_credit_notes_org ON udm_credit_notes(organization_id);
CREATE INDEX IF NOT EXISTS idx_udm_credit_notes_invoice ON udm_credit_notes(invoice_id);

CREATE TABLE IF NOT EXISTS udm_credit_allocations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  credit_note_id TEXT NOT NULL REFERENCES udm_credit_notes(id),
  invoice_id TEXT NOT NULL REFERENCES udm_invoices(id),
  allocated_amount_minor_units INTEGER NOT NULL CHECK (allocated_amount_minor_units > 0),
  status TEXT NOT NULL CHECK (status IN ('allocated','reversed')),
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_allocations_note ON udm_credit_allocations(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_udm_allocations_invoice ON udm_credit_allocations(invoice_id);

CREATE TABLE IF NOT EXISTS udm_disputes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL REFERENCES udm_invoices(id),
  status TEXT NOT NULL CHECK (status IN ('open','under_review','resolved','rejected')),
  amount_minor_units INTEGER CHECK (amount_minor_units IS NULL OR amount_minor_units >= 0),
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_disputes_invoice ON udm_disputes(invoice_id);

CREATE TABLE IF NOT EXISTS udm_dispute_evidence (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  dispute_id TEXT NOT NULL REFERENCES udm_disputes(id) ON DELETE CASCADE,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_dispute_evidence_dispute ON udm_dispute_evidence(dispute_id);

CREATE TABLE IF NOT EXISTS udm_exceptions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  customer_id TEXT REFERENCES udm_customers(id),
  invoice_id TEXT REFERENCES udm_invoices(id),
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status TEXT NOT NULL CHECK (status IN ('detected','classified','severity_determined','owner_assigned','recommended','pending_approval','approved','executed','verified','rejected','closed')),
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_exceptions_org_status ON udm_exceptions(organization_id, status);

CREATE TABLE IF NOT EXISTS udm_bank_transactions (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('unmatched','pending_approval','matched','ignored')),
  matched_payment_id TEXT REFERENCES udm_payments(id),
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_udm_bank_tx_org_status ON udm_bank_transactions(organization_id, status);

CREATE TABLE IF NOT EXISTS udm_idempotency_keys (
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  record_id TEXT NOT NULL,
  PRIMARY KEY (organization_id, key)
);

CREATE TABLE IF NOT EXISTS udm_api_idempotency_keys (
  organization_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  key TEXT NOT NULL,
  record_id TEXT,
  fingerprint TEXT NOT NULL,
  response TEXT,
  status TEXT NOT NULL DEFAULT 'reserved',

CREATE TABLE IF NOT EXISTS udm_schedules (
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT {},
  format TEXT NOT NULL,
  recipients TEXT NOT NULL,
  cadence TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT active,
  last_run_at TEXT,
  next_run_at TEXT NOT NULL,
  run_count INTEGER NOT NULL DEFAULT 0,
  max_runs INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (id, organization_id)
);
  PRIMARY KEY (organization_id, endpoint, key)
);
`;
