# 004C-A — PostgreSQL Schema Design (Canonical)

## Objective

This document is the canonical PostgreSQL DDL for the 004C-A design. It defines five tables in dependency order. The definitions are documentation only; no migration or deployment is performed by 004C-A.

The selected lease model is **one mutable lease row per `scheduled_job_runs` row**. Reclamation updates that row in place and increments `lease_generation`; it does not insert a second current lease row. `attempt_number` records execution attempts and is independent of lease renewals.

`expires_at` is used only for an active reservation or lease expiry. `retention_expires_at` is used only for idempotency-record retention and cleanup. Committed idempotency records are never removed by the generic cleanup operation.

The SQL assumes the `pgcrypto` extension and a trusted `current_app_tenant_id()` function exist in the target PostgreSQL database. Their deployment is not verified by this task.

## 1. `execution_idempotency`

```sql
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
```

## 2. `report_schedules`

```sql
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
```

## 3. `scheduled_job_runs`

```sql
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
  CONSTRAINT fk_scheduled_job_runs_schedule_tenant
    FOREIGN KEY (organization_id, schedule_id)
    REFERENCES report_schedules (organization_id, id),
  CONSTRAINT chk_scheduled_job_runs_status
    CHECK (status IN ('pending', 'claimed', 'retryable', 'completed', 'failed_exhausted', 'canceled')),
  CONSTRAINT chk_scheduled_job_runs_counts
    CHECK (attempt_count >= 0 AND max_attempts > 0)
);
```

## 4. `job_leases`

One row is created for each job run and updated in place. A reclaim is an atomic conditional update of this row with `status = 'expired'` or an expired `claimed` lease; it sets a new owner, increments `lease_generation`, and sets a new `expires_at`. Lease renewal does not create an execution attempt and does not change `attempt_number`.

```sql
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
  CONSTRAINT fk_job_leases_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id),
  CONSTRAINT chk_job_leases_status
    CHECK (status IN ('claimed', 'expired', 'released')),
  CONSTRAINT chk_job_leases_generation
    CHECK (lease_generation > 0)
);
```

The ordinary unique constraint above is the lease-model invariant: there is exactly one mutable lease row for a job run. No partial unique index is required or used.

## 5. `job_execution_attempts`

```sql
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
  CONSTRAINT fk_job_execution_attempts_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id),
  CONSTRAINT chk_job_execution_attempts_number
    CHECK (attempt_number > 0),
  CONSTRAINT chk_job_execution_attempts_outcome
    CHECK (outcome IS NULL OR outcome IN ('success', 'failed', 'external_error', 'canceled'))
);
```

## Supporting indexes

```sql
CREATE INDEX idx_execution_idempotency_org ON execution_idempotency (organization_id);
CREATE INDEX idx_execution_idempotency_status_expires
  ON execution_idempotency (status, expires_at);
CREATE INDEX idx_execution_idempotency_retention
  ON execution_idempotency (retention_expires_at);

CREATE INDEX idx_report_schedules_org_status
  ON report_schedules (organization_id, status);
CREATE INDEX idx_report_schedules_org_next
  ON report_schedules (organization_id, next_run_at);

CREATE INDEX idx_scheduled_job_runs_org_status_available
  ON scheduled_job_runs (organization_id, status, available_at);
CREATE INDEX idx_scheduled_job_runs_schedule
  ON scheduled_job_runs (organization_id, schedule_id, scheduled_for);

CREATE INDEX idx_job_leases_org_status_expires
  ON job_leases (organization_id, status, expires_at);

CREATE INDEX idx_job_execution_attempts_run
  ON job_execution_attempts (organization_id, job_run_id, attempt_number);
CREATE INDEX idx_job_execution_attempts_outcome
  ON job_execution_attempts (organization_id, outcome);
```

## Tenant isolation and RLS

Each child table carries `organization_id` and uses a composite foreign key to its organization-owned parent. This prevents a child in one organization from referencing a parent in another organization.

```sql
ALTER TABLE execution_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_execution_attempts ENABLE ROW LEVEL SECURITY;

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
```

`SET LOCAL app.tenant_id = $1` must execute inside the same database transaction and on the same connection as the protected queries. A pooled connection does not retain this setting for a later transaction. Service-role connections can bypass RLS, so trusted application code must still authenticate the caller, authorize the organization, validate ownership, and constrain every privileged operation. Deployment behavior and service-role configuration are **NOT_VERIFIED** in 004C-A.

## Reservation and lease invariants

- Initial reservation uses exactly one protocol: `INSERT ... ON CONFLICT DO NOTHING RETURNING ...`.
- `DO NOTHING RETURNING` returns a row only when the insert succeeds; it does not return the existing conflicting row. A conflict therefore requires a separate `SELECT` before deciding whether to wait or reclaim.
- Reclamation is an atomic conditional `UPDATE` requiring `status = 'pending'` and `expires_at < NOW()`. It assigns a new `owner_token`, increments `lease_generation`, and resets `expires_at`; it never changes a committed record.
- Commit and failure updates require matching `owner_token` and `lease_generation`, and require the record to remain `pending` or otherwise explicitly eligible for that transition.
- Lease reclaim updates the one mutable `job_leases` row in place and increments `lease_generation`. Lease renewal is not an execution attempt; `job_execution_attempts.attempt_number` changes only when a new execution attempt begins.
- Cleanup uses `retention_expires_at` only, excludes `status = 'committed'`, and must preserve any record still required by business-level idempotency.

## Validation status

The SQL is intended for validation as one PostgreSQL script after the required extension and tenant-context function are available. 004C-A does not claim that a live PostgreSQL parser or database has been run yet; that evidence must be recorded in the final report only after execution.
