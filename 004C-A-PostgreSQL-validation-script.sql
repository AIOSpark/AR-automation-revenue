-- ============================================================================
-- 004C-A PostgreSQL Validation Script
-- Distributed Execution Architecture — Corrected Design
-- ============================================================================
-- This script validates the complete DDL for the 004C-A architecture.
-- It includes all five tables, constraints, indexes, RLS policies, and
-- prerequisite function definitions.
--
-- USAGE:
--   1. Ensure pgcrypto extension is available: CREATE EXTENSION IF NOT EXISTS pgcrypto;
--   2. Ensure current_app_tenant_id() function exists (see bottom of script)
--   3. Execute against a running PostgreSQL instance
--   4. Verify all objects created successfully
--
-- NOTE: This is documentation-only SQL for validation purposes. Actual execution
-- evidence (PostgreSQL version, execution output) must be recorded separately
-- by the user against their own PostgreSQL instance.
-- ============================================================================

-- Prerequisite: Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- 1. execution_idempotency
-- Dependencies: None (root table)
-- ============================================================================

CREATE TABLE execution_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  owner_token TEXT,
  lease_generation INTEGER NOT NULL DEFAULT 1,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  record_id TEXT,
  result_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  retention_expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  CONSTRAINT uq_execution_idempotency_org_key UNIQUE (organization_id, key),
  CONSTRAINT chk_execution_idempotency_status
    CHECK (status IN ('pending', 'committed', 'failed', 'retryable', 'expired')),
  CONSTRAINT chk_execution_idempotency_counts
    CHECK (lease_generation > 0 AND attempt_count >= 0)
);

-- Supporting indexes
CREATE INDEX idx_execution_idempotency_org ON execution_idempotency (organization_id);
CREATE INDEX idx_execution_idempotency_status_expires
  ON execution_idempotency (status, expires_at);
CREATE INDEX idx_execution_idempotency_retention
  ON execution_idempotency (retention_expires_at);

-- Enable RLS
ALTER TABLE execution_idempotency ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY execution_idempotency_select ON execution_idempotency
  FOR SELECT USING (organization_id = current_app_tenant_id());
CREATE POLICY execution_idempotency_insert ON execution_idempotency
  FOR INSERT WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY execution_idempotency_update ON execution_idempotency
  FOR UPDATE
  USING (organization_id = current_app_tenant_id())
  WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY execution_idempotency_delete ON execution_idempotency
  FOR DELETE USING (organization_id = current_app_tenant_id());

-- ============================================================================
-- 2. report_schedules
-- Dependencies: None (root table)
-- ============================================================================

CREATE TABLE report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'active',
  next_run_at TIMESTAMPTZ NOT NULL,
  last_successful_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,
  max_runs INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_report_schedules_org_id UNIQUE (organization_id, id),
  CONSTRAINT chk_report_schedules_status
    CHECK (status IN ('active', 'paused', 'disabled')),
  CONSTRAINT chk_report_schedules_counts
    CHECK (run_count >= 0 AND (max_runs IS NULL OR max_runs > 0))
);

-- Supporting indexes
CREATE INDEX idx_report_schedules_org_status
  ON report_schedules (organization_id, status);
CREATE INDEX idx_report_schedules_org_next
  ON report_schedules (organization_id, next_run_at);

-- Enable RLS
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY report_schedules_select ON report_schedules
  FOR SELECT USING (organization_id = current_app_tenant_id());
CREATE POLICY report_schedules_insert ON report_schedules
  FOR INSERT WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY report_schedules_update ON report_schedules
  FOR UPDATE
  USING (organization_id = current_app_tenant_id())
  WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY report_schedules_delete ON report_schedules
  FOR DELETE USING (organization_id = current_app_tenant_id());

-- ============================================================================
-- 3. scheduled_job_runs
-- Dependencies: report_schedules (via composite FK)
-- ============================================================================

CREATE TABLE scheduled_job_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
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
  CONSTRAINT pk_scheduled_job_runs PRIMARY KEY (id),
  CONSTRAINT uq_scheduled_job_runs_org_id UNIQUE (organization_id, id),
  CONSTRAINT uq_scheduled_job_runs_schedule_occurrence
    UNIQUE (schedule_id, scheduled_for),
  -- Composite FK: references report_schedules(organization_id, id)
  CONSTRAINT fk_scheduled_job_runs_schedule_tenant
    FOREIGN KEY (organization_id, schedule_id)
    REFERENCES report_schedules (organization_id, id),
  CONSTRAINT chk_scheduled_job_runs_status
    CHECK (status IN ('pending', 'claimed', 'retryable', 'completed', 'failed_exhausted', 'canceled')),
  CONSTRAINT chk_scheduled_job_runs_counts
    CHECK (attempt_count >= 0 AND max_attempts > 0)
);

-- Supporting indexes
CREATE INDEX idx_scheduled_job_runs_org_status_available
  ON scheduled_job_runs (organization_id, status, available_at);
CREATE INDEX idx_scheduled_job_runs_schedule
  ON scheduled_job_runs (organization_id, schedule_id, scheduled_for);

-- Enable RLS
ALTER TABLE scheduled_job_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY scheduled_job_runs_select ON scheduled_job_runs
  FOR SELECT USING (organization_id = current_app_tenant_id());
CREATE POLICY scheduled_job_runs_insert ON scheduled_job_runs
  FOR INSERT WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY scheduled_job_runs_update ON scheduled_job_runs
  FOR UPDATE
  USING (organization_id = current_app_tenant_id())
  WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY scheduled_job_runs_delete ON scheduled_job_runs
  FOR DELETE USING (organization_id = current_app_tenant_id());

-- ============================================================================
-- 4. job_leases
-- Dependencies: scheduled_job_runs (via composite FK)
-- Model: one mutable lease row per scheduled_job_runs row
-- ============================================================================

CREATE TABLE job_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  job_run_id UUID NOT NULL,
  owner_token TEXT,
  lease_generation INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'released',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_job_leases_org_run UNIQUE (organization_id, job_run_id),
  -- Composite FK: references scheduled_job_runs(organization_id, id)
  CONSTRAINT fk_job_leases_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id),
  CONSTRAINT chk_job_leases_status
    CHECK (status IN ('claimed', 'expired', 'released')),
  CONSTRAINT chk_job_leases_generation
    CHECK (lease_generation > 0)
);

-- Supporting indexes
CREATE INDEX idx_job_leases_org_status_expires
  ON job_leases (organization_id, status, expires_at);

-- Enable RLS
ALTER TABLE job_leases ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY job_leases_select ON job_leases
  FOR SELECT USING (organization_id = current_app_tenant_id());
CREATE POLICY job_leases_insert ON job_leases
  FOR INSERT WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY job_leases_update ON job_leases
  FOR UPDATE
  USING (organization_id = current_app_tenant_id())
  WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY job_leases_delete ON job_leases
  FOR DELETE USING (organization_id = current_app_tenant_id());

-- ============================================================================
-- 5. job_execution_attempts
-- Dependencies: scheduled_job_runs (via composite FK)
-- ============================================================================

CREATE TABLE job_execution_attempts (
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
  CONSTRAINT uq_job_execution_attempts_run_number
    UNIQUE (organization_id, job_run_id, attempt_number),
  -- Composite FK: references scheduled_job_runs(organization_id, id)
  CONSTRAINT fk_job_execution_attempts_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id),
  CONSTRAINT chk_job_execution_attempts_number
    CHECK (attempt_number > 0),
  CONSTRAINT chk_job_execution_attempts_outcome
    CHECK (outcome IS NULL OR outcome IN ('success', 'failed', 'external_error', 'canceled'))
);

-- Supporting indexes
CREATE INDEX idx_job_execution_attempts_run
  ON job_execution_attempts (organization_id, job_run_id, attempt_number);
CREATE INDEX idx_job_execution_attempts_outcome
  ON job_execution_attempts (organization_id, outcome);

-- Enable RLS
ALTER TABLE job_execution_attempts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY job_execution_attempts_select ON job_execution_attempts
  FOR SELECT USING (organization_id = current_app_tenant_id());
CREATE POLICY job_execution_attempts_insert ON job_execution_attempts
  FOR INSERT WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY job_execution_attempts_update ON job_execution_attempts
  FOR UPDATE
  USING (organization_id = current_app_tenant_id())
  WITH CHECK (organization_id = current_app_tenant_id());
CREATE POLICY job_execution_attempts_delete ON job_execution_attempts
  FOR DELETE USING (organization_id = current_app_tenant_id());

-- ============================================================================
-- Prerequisite Function: current_app_tenant_id()
-- ============================================================================
--
-- This function is assumed to exist in the target PostgreSQL database.
-- It returns the current organization's tenant ID as TEXT.
-- The deployment of this function is NOT verified by 004C-A.
--
-- Example implementation (replace with actual implementation):
--
-- CREATE OR REPLACE FUNCTION current_app_tenant_id()
-- RETURNS TEXT
-- STABLE
-- LANGUAGE sql
-- AS $$
--   SELECT current_setting('app.tenant_id', true);
-- $$;
--
-- To enable per-transaction tenant context:
--   SET LOCAL app.tenant_id = 'org-12345';
--   SELECT current_app_tenant_id();  -- returns 'org-12345'
--
-- ============================================================================

-- ============================================================================
-- Validation Query
-- ============================================================================
-- Run this query after executing the script above to verify all objects
-- ============================================================================

SELECT '=== 004C-A PostgreSQL Validation Summary ===' AS validation_header;

SELECT 'Tables created:' AS check_type, count(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('execution_idempotency', 'report_schedules', 'scheduled_job_runs', 'job_leases', 'job_execution_attempts') GROUP BY table_schema;

SELECT 'RLS enabled:' AS check_type, 
  count(*) FILTER (WHERE relrowsecurity) AS enabled,
  count(*) AS total 
FROM pg_class WHERE relname IN ('execution_idempotency', 'report_schedules', 'scheduled_job_runs', 'job_leases', 'job_execution_attempts') AND relkind = 'r';

SELECT 'Composite FKs verified:' AS check_type, 
  tc.table_name, 
  tc.constraint_name, 
  kcu.column_name, 
  ccu.table_name AS referenced_table, 
  ccu.column_name AS referenced_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_catalog = kcu.constraint_catalog
 AND tc.constraint_schema = kcu.constraint_schema
 AND tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_catalog = ccu.constraint_catalog
 AND tc.constraint_schema = ccu.constraint_schema
 AND tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    'scheduled_job_runs',
    'job_leases',
    'job_execution_attempts'
  );

SELECT 'UNIQUE constraints verified:' AS check_type, count(*) AS count FROM information_schema.table_constraints WHERE constraint_type = 'UNIQUE' AND table_schema = 'public' AND table_name IN ('execution_idempotency', 'report_schedules', 'scheduled_job_runs', 'job_leases', 'job_execution_attempts');

SELECT '=== Validation Complete ===' AS validation_footer;

-- ============================================================================
-- Notes for the User
-- ============================================================================
-- 1. This script must be executed against a REAL PostgreSQL instance.
--    Static review alone does not satisfy the R3 validation requirement.
-- 2. The `current_app_tenant_id()` function must exist in the target database.
--    Provide the actual function definition or ensure it's available via
--    your deployment pipeline (e.g., Supabase migrations, custom extension).
-- 3. The pgcrypto extension must be available (CREATE EXTENSION IF NOT EXISTS pgcrypto).
-- 4. After execution, record:
--    - PostgreSQL version (SELECT version())
--    - Execution output (psql output or pgAdmin/DBEAVER export)
--    - Any errors or warnings
-- 5. This script does NOT insert data, modify production tables, or deploy
--    to any environment. It is purely for DDL validation.
-- ============================================================================