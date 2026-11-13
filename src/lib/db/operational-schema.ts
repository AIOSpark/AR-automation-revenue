// AIOSpark operational schema (migration version 4).
//
// Remaining namespaces get real columns for identity, tenant ownership, state
// and relationships. JSON payload columns preserve existing TypeScript shapes.

export const OPERATIONAL_SCHEMA_VERSION = 4;

export const OPERATIONAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS execution_records (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  requesting_user_id TEXT,
  approving_user_id TEXT,
  action_type TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_ids TEXT NOT NULL,
  action_payload TEXT NOT NULL,
  action_payload_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  approval_request_id TEXT,
  execution_attempt_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'draft','pending_approval','approved','executing','committed','verifying','verified',
    'execution_failed','verification_failed','under_review','rejected','cancelled'
  )),
  before_state_snapshot TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  commit_reference TEXT,
  executed_at TEXT,
  committed_at TEXT,
  verified_at TEXT,
  verification_result TEXT,
  failure_reason TEXT,
  failure_classification TEXT,
  recovery_attempts INTEGER NOT NULL CHECK (recovery_attempts >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_execution_org_state ON execution_records(organization_id, state);
CREATE INDEX IF NOT EXISTS idx_execution_approval ON execution_records(approval_request_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_approval_unique
  ON execution_records(approval_request_id) WHERE approval_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reconciliation_outcomes (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  bank_transaction_id TEXT NOT NULL,
  original_confidence REAL NOT NULL CHECK (original_confidence >= 0 AND original_confidence <= 1),
  original_match_method TEXT NOT NULL CHECK (original_match_method IN ('deterministic','fuzzy')),
  action_type TEXT NOT NULL CHECK (action_type = 'payment_reconciliation_match'),
  outcome TEXT NOT NULL CHECK (outcome IN ('approved','rejected','modified')),
  final_invoice_ids TEXT NOT NULL,
  reviewed_by_user_id TEXT,
  rejection_reason TEXT,
  reviewed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reconciliation_outcomes_org ON reconciliation_outcomes(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reconciliation_outcomes_tx ON reconciliation_outcomes(bank_transaction_id);

CREATE TABLE IF NOT EXISTS import_batches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  source_system TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing','completed','failed')),
  date_format_convention TEXT NOT NULL CHECK (date_format_convention IN ('DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD')),
  total_rows INTEGER NOT NULL CHECK (total_rows >= 0),
  success_count INTEGER NOT NULL CHECK (success_count >= 0 AND success_count <= total_rows),
  skipped_count INTEGER NOT NULL CHECK (skipped_count >= 0 AND skipped_count <= total_rows),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_import_batches_org_status ON import_batches(organization_id, status);

CREATE TABLE IF NOT EXISTS import_errors (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  raw_row_reference TEXT NOT NULL,
  reason TEXT NOT NULL,
  field TEXT,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_import_errors_batch ON import_errors(import_batch_id);

CREATE TABLE IF NOT EXISTS import_duplicates (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  import_batch_id TEXT NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  incoming_record_json TEXT NOT NULL,
  existing_record_id TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status TEXT NOT NULL CHECK (status IN ('pending','merged','rejected')),
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_import_duplicates_org_status ON import_duplicates(organization_id, status);

CREATE TABLE IF NOT EXISTS auth_users (
  id TEXT PRIMARY KEY,
  auth_provider_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  role_title TEXT,
  email_verified INTEGER NOT NULL CHECK (email_verified IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_users_provider ON auth_users(auth_provider_id);

CREATE TABLE IF NOT EXISTS auth_organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  size TEXT NOT NULL,
  industry TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  pilot_mode INTEGER NOT NULL CHECK (pilot_mode IN (0,1)),
  currency TEXT CHECK (currency IS NULL OR length(currency) = 3),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_session_revocations (
  jti TEXT PRIMARY KEY,
  exp INTEGER NOT NULL CHECK (exp >= 0)
);

CREATE TABLE IF NOT EXISTS tenant_members (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Owner','Admin','Finance Manager','Finance Executive','Viewer')),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, organization_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_members_org ON tenant_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON tenant_members(user_id);

CREATE TABLE IF NOT EXISTS tenant_invites (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Owner','Admin','Finance Manager','Finance Executive','Viewer')),
  invited_by_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','expired')),
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tenant_invites_org_status ON tenant_invites(organization_id, status);

CREATE TABLE IF NOT EXISTS tenant_records (
  table_name TEXT NOT NULL CHECK (table_name IN ('customers','invoices','payments','exceptions','integrations')),
  id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (table_name, id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_records_org_table ON tenant_records(organization_id, table_name);

CREATE TABLE IF NOT EXISTS billing_usage_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'invoice.processed','customer.tracked','ai_task.executed','integration.connected','agent_execution'
  )),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  metadata TEXT,
  occurred_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_usage_org_period ON billing_usage_events(organization_id, occurred_at);

CREATE TABLE IF NOT EXISTS billing_payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  status TEXT NOT NULL CHECK (status IN ('paid','failed','pending','reversed')),
  refunded_amount_minor_units INTEGER NOT NULL CHECK (refunded_amount_minor_units >= 0),
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_payments_org ON billing_payments(organization_id);

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  provider_event_id TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  organization_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('RECEIVED','PROCESSING','PROCESSED','FAILED')),
  retry_count INTEGER NOT NULL CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL CHECK (max_retries >= 0),
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_webhooks_status ON billing_webhook_events(status, updated_at);

CREATE TABLE IF NOT EXISTS billing_refund_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  provider_refund_id TEXT NOT NULL UNIQUE,
  payment_id TEXT NOT NULL,
  amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units >= 0),
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  status TEXT NOT NULL CHECK (status IN ('PROCESSED','FAILED','PENDING')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_event_log (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  razorpay_event_id TEXT,
  event_type TEXT NOT NULL,
  razorpay_subscription_id TEXT,
  razorpay_payment_id TEXT,
  payload TEXT NOT NULL,
  signature_verified INTEGER NOT NULL CHECK (signature_verified IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_billing_event_log_org ON billing_event_log(organization_id, created_at);

CREATE TABLE IF NOT EXISTS operational_migrations (
  namespace TEXT PRIMARY KEY,
  migrated_at TEXT NOT NULL
);
`;
