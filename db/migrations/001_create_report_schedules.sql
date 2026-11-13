-- 001_create_report_schedules.sql
-- Creates the report_schedules table for durable PostgreSQL persistence.
-- This table stores recurring report schedule definitions with full tenant isolation.

-- Ensure pgcrypto extension is available (used for UUID generation)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS report_schedules (
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

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_report_schedules_org_status
  ON report_schedules (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_report_schedules_org_next
  ON report_schedules (organization_id, next_run_at);

-- Tenant isolation RLS policies
-- These policies ensure that every query scoped to organization_id respects tenant boundaries.
-- The app must set app.current_tenant_id (or app.current_org_id) before running queries.
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_isolation_select ON report_schedules
  FOR SELECT USING (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_insert ON report_schedules
  FOR INSERT WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_update ON report_schedules
  FOR UPDATE USING (organization_id = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id = current_setting('app.current_org_id', true));

CREATE POLICY org_isolation_delete ON report_schedules
  FOR DELETE USING (organization_id = current_setting('app.current_org_id', true));