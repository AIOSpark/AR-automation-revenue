// AIOSpark governance relational schema (migration version 3).
//
// Approval decisions, subscription versions and audit events are financial
// control records. Their core identity and state columns are database-enforced;
// JSON payload columns preserve the existing TypeScript shapes.

export const GOVERNANCE_SCHEMA_VERSION = 3;

export const GOVERNANCE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  evidence TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  proposed_by TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected')),
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  modification TEXT,
  rejection_reason TEXT,
  execution_status TEXT NOT NULL CHECK (execution_status IN ('not_applicable','pending','succeeded','failed')),
  execution_error TEXT,
  executed_at TEXT,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  CHECK (status = 'pending' OR reviewed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_approval_requests_org_status ON approval_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_subject ON approval_requests(organization_id, subject_type, subject_id);

CREATE TABLE IF NOT EXISTS approval_decisions (
  approval_request_id TEXT PRIMARY KEY REFERENCES approval_requests(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  reviewer_user_id TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  reason TEXT,
  modification TEXT
);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_org ON approval_decisions(organization_id);

CREATE TRIGGER IF NOT EXISTS approval_decisions_tenant_guard
BEFORE INSERT ON approval_decisions
WHEN NEW.organization_id != (
  SELECT organization_id FROM approval_requests WHERE id = NEW.approval_request_id
)
BEGIN
  SELECT RAISE(ABORT, 'approval decision tenant does not match request');
END;

CREATE TRIGGER IF NOT EXISTS approval_decisions_status_guard
BEFORE INSERT ON approval_decisions
WHEN NEW.decision != (
  SELECT status FROM approval_requests WHERE id = NEW.approval_request_id
)
BEGIN
  SELECT RAISE(ABORT, 'approval decision does not match request status');
END;

CREATE TRIGGER IF NOT EXISTS approval_decisions_immutable
BEFORE UPDATE ON approval_decisions
BEGIN
  SELECT RAISE(ABORT, 'approval decisions are immutable');
END;

CREATE TABLE IF NOT EXISTS approval_logs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  approval_request_id TEXT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','approved','rejected','modified','executed')),
  actor_user_id TEXT,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approval_logs_request ON approval_logs(approval_request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_logs_org ON approval_logs(organization_id);

CREATE TRIGGER IF NOT EXISTS approval_logs_tenant_guard
BEFORE INSERT ON approval_logs
WHEN NEW.organization_id != (
  SELECT organization_id FROM approval_requests WHERE id = NEW.approval_request_id
)
BEGIN
  SELECT RAISE(ABORT, 'approval log tenant does not match request');
END;

CREATE TABLE IF NOT EXISTS approval_autonomy_configs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  auto_approve_enabled INTEGER NOT NULL CHECK (auto_approve_enabled IN (0, 1)),
  min_confidence_threshold REAL NOT NULL CHECK (min_confidence_threshold >= 0 AND min_confidence_threshold <= 1),
  UNIQUE (organization_id, action_type)
);

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  organization_id TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('starter','growth','enterprise')),
  status TEXT NOT NULL CHECK (status IN ('active','past_due','canceled','trialing')),
  billing_interval TEXT CHECK (billing_interval IS NULL OR billing_interval IN ('monthly','annual')),
  current_period_start TEXT NOT NULL,
  current_period_end TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 0),
  updated_at TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS billing_subscription_history (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES billing_subscriptions(organization_id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 0),
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  UNIQUE (organization_id, version)
);
CREATE INDEX IF NOT EXISTS idx_billing_history_org_version ON billing_subscription_history(organization_id, version);

CREATE TRIGGER IF NOT EXISTS billing_history_tenant_guard
BEFORE INSERT ON billing_subscription_history
WHEN NOT EXISTS (
  SELECT 1 FROM billing_subscriptions
  WHERE organization_id = NEW.organization_id AND version <= NEW.version
)
BEGIN
  SELECT RAISE(ABORT, 'subscription history organization does not match a subscription');
END;

CREATE TRIGGER IF NOT EXISTS billing_subscriptions_version_guard
BEFORE UPDATE ON billing_subscriptions
WHEN NEW.organization_id != OLD.organization_id
  OR NEW.version != OLD.version + 1
BEGIN
  SELECT RAISE(ABORT, 'subscription version must increase by exactly one');
END;

CREATE TRIGGER IF NOT EXISTS billing_history_immutable
BEFORE UPDATE ON billing_subscription_history
BEGIN
  SELECT RAISE(ABORT, 'subscription history is append-only');
END;

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  actor_user_id TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','agent','system')),
  action_type TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  before_state TEXT,
  after_state TEXT,
  ai_context TEXT,
  approval_context TEXT,
  result TEXT NOT NULL CHECK (result IN ('success','failure','reverted')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_events_org_created ON audit_events(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_org_subject ON audit_events(organization_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_org_actor ON audit_events(organization_id, actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_org_action ON audit_events(organization_id, action_type);

CREATE TRIGGER IF NOT EXISTS audit_events_immutable_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_events_immutable_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events is append-only');
END;

CREATE TABLE IF NOT EXISTS governance_migrations (
  namespace TEXT PRIMARY KEY,
  migrated_at TEXT NOT NULL
);
`;
