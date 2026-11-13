-- 002_create_scheduled_job_tables.sql
-- Creates the scheduled_job_runs, job_leases, and job_execution_attempts tables
-- for distributed scheduler execution on top of the report_schedules table from B3.

-- Ensure pgcrypto extension is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Table: scheduled_job_runs
-- An individual execution occurrence of a report schedule.
-- One schedule can have many job runs over time.
-- ============================================================
CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  schedule_id UUID NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_scheduled_job_runs_schedule_tenant
    FOREIGN KEY (organization_id, schedule_id)
    REFERENCES report_schedules (organization_id, id)
    ON DELETE CASCADE,

  CONSTRAINT chk_scheduled_job_runs_status
    CHECK (status IN ('pending', 'claimed', 'retryable', 'completed', 'failed_exhausted', 'canceled')),

  CONSTRAINT chk_scheduled_job_runs_counts
    CHECK (attempt_count >= 0 AND max_attempts > 0)
);

-- Indexes for eligibility and organization scoping
CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_org_status_available
  ON scheduled_job_runs (organization_id, status, available_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_schedule
  ON scheduled_job_runs (organization_id, schedule_id, scheduled_for);

-- ============================================================
-- Table: job_leases
-- One mutable lease row per scheduled_job_runs row.
-- Atomic conditional updates reclaim ownership and increment lease_generation.
-- ============================================================
CREATE TABLE IF NOT EXISTS job_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  job_run_id UUID NOT NULL,
  owner_token TEXT,
  lease_generation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'released',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_job_leases_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id)
    ON DELETE CASCADE,

  CONSTRAINT uq_job_leases_org_run UNIQUE (organization_id, job_run_id),

  CONSTRAINT chk_job_leases_status
    CHECK (status IN ('claimed', 'expired', 'released')),

  CONSTRAINT chk_job_leases_generation
    CHECK (lease_generation > 0)
);

-- Index for lease reclamation and expiry scanning
CREATE INDEX IF NOT EXISTS idx_job_leases_org_status_expires
  ON job_leases (organization_id, status, expires_at);

-- ============================================================
-- Table: job_execution_attempts
-- Durable execution history: one row per attempt.
-- Lease renewal does NOT increment attempt_number.
-- ============================================================
CREATE TABLE IF NOT EXISTS job_execution_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  job_run_id UUID NOT NULL,
  attempt_number INTEGER NOT NULL,
  owner_token TEXT,
  lease_generation INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome TEXT,
  error_details JSONB,
  recovery_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_job_execution_attempts_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id)
    ON DELETE CASCADE,

  CONSTRAINT uq_job_execution_attempts_run_number
    UNIQUE (organization_id, job_run_id, attempt_number),

  CONSTRAINT chk_job_execution_attempts_number
    CHECK (attempt_number > 0),

  CONSTRAINT chk_job_execution_attempts_outcome
    CHECK (outcome IS NULL OR outcome IN ('success', 'failed', 'external_error', 'canceled'))
);

-- Index for diagnosis and recovery
CREATE INDEX IF NOT EXISTS idx_job_execution_attempts_run
  ON job_execution_attempts (organization_id, job_run_id, attempt_number);

CREATE INDEX IF NOT EXISTS idx_job_execution_attempts_outcome
  ON job_execution_attempts (organization_id, outcome);

-- ============================================================
-- Tenant isolation RLS policies
-- ============================================================
ALTER TABLE scheduled_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_execution_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_select ON scheduled_job_runs
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_insert ON scheduled_job_runs
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_update ON scheduled_job_runs
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICy org_isolation_delete ON scheduled_job_runs
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY job_leases_select ON job_leases
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY job_leases_insert ON job_leases
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY job_leases_update ON job_leases
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY job_leases_delete ON job_leases
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY job_execution_attempts_select ON job_execution_attempts
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY job_execution_attempts_insert ON job_execution_attempts
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY job_execution_attempts_update ON job_execution_attempts
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY job_execution_attempts_delete ON job_execution_attempts
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));