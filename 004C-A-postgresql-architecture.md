# 004C-A — PostgreSQL Distributed Execution Architecture Design (Corrected)

## Objective

Design a production-safe distributed execution architecture for AIOSpark AR Automation running on Vercel with Supabase PostgreSQL. This is a **design-and-audit task only** — no production code modifications, no database migrations executed, no deployment.

The following design incorporates all corrections from the independent architecture review. Every SQL example is valid PostgreSQL syntax. State transitions, ownership patterns, and concurrency guarantees are explicitly defined.

---

## A. Shared Idempotency — Atomic Reservation and Ownership

### Design Requirements

- **Tenant-scoped idempotency keys**: Every idempotency key must include `organization_id` to prevent cross-tenant key collisions.
- **Atomic uniqueness enforcement**: Read-then-insert is **unsafe** — two workers can both read "not present" and both insert, violating idempotency. The atomic alternative uses explicit PostgreSQL operations with ownership validation.
- **Explicit states**: `pending`, `committed`, `failed`, `retryable`, `expired`.
- **Expiration and retention**: Idempotency records should not live forever. A 24-hour window (matching the SafetyMiddleware durable window) or per-organization TTL is recommended. **Critically, a 24-hour application cache expiration does NOT provide exactly-once execution guarantee** — see External Side-Effect Safety below.
- **Safe handling of concurrent requests**: The database must be the single source of truth for "has this action been executed?" — not process-local state.
- **Protection against duplicate external side effects**: If an external action (payment, API call, report generation) has already been committed, duplicate requests must be rejected before the external action executes.

### Why Read-Then-Insert Is Unsafe

```
Worker A: SELECT FROM idempotency_keys WHERE key = X → not found
Worker B: SELECT FROM idempotency_keys WHERE key = X → not found
Worker A: INSERT INTO idempotency_keys(key) VALUES (X) → success
Worker B: INSERT INTO idempotency_keys(key) VALUES (X) → success (duplicate!)
Both proceed with external action → double execution
```

### Atomic Alternative — One Explicit Protocol Only

**The document contains ONE reservation protocol only**: `INSERT ... ON CONFLICT DO NOTHING`. The competing `ON CONFLICT DO UPDATE` pattern that can transfer ownership has been removed entirely. This prevents a competing worker from seizing ownership of an active reservation.

#### 1. Initial reservation (INSERT ... ON CONFLICT DO NOTHING)

```sql
INSERT INTO execution_idempotency (organization_id, key, status, owner_token, lease_generation, created_at, updated_at, expires_at, attempt_count)
VALUES ($1, $2, 'pending', $3, 1, NOW(), NOW(), NOW() + INTERVAL '24 hours', 0)
ON CONFLICT (organization_id, key) DO NOTHING
RETURNING id, status, owner_token, lease_generation, expires_at, attempt_count;
```

- If the INSERT succeeds (`result.rowCount = 1 from pg client or GET DIAGNOSTICS`): the calling worker is the sole new owner → status = `'pending'`, worker proceeds with external action. `owner_token` and `lease_generation` identify this worker. The record is fresh and owned exclusively by this worker.
- If the INSERT conflicts (`result.rowCount = 0`): another worker already owns a non-committed record for this `(orgId, key)`. The calling worker must **not** execute. It should either (a) retry later, or (b) invoke `reclaimExpiredExecutionIdempotency()` if the existing record is expired.

**Critical**: A duplicate request does **not** replace the existing owner. The `DO NOTHING` clause preserves the current owner's token and generation. No competing worker can seize ownership mid-execution. This is the only reservation protocol in this document.

#### 2. Commit and fail (conditional UPDATE with owner validation)

```sql
-- Commit: only the current owner may commit
UPDATE execution_idempotency
SET status = 'committed',
    record_id = $3,
    result_payload = $4,
    updated_at = NOW()
WHERE organization_id = $1
  AND key = $2
  AND status = 'pending'
  AND owner_token = $5
  AND lease_generation = $6;
-- Affected rows = 1 means the caller is the current owner and commit succeeded.
-- Affected rows = 0 means the caller is not the current owner (stale or duplicate request).

-- Fail: only the current owner may record failure
UPDATE execution_idempotency
SET status = 'failed',
    attempt_count = attempt_count + 1,
    updated_at = NOW(),
    error_details = $7
WHERE organization_id = $1
  AND key = $2
  AND status IN ('pending', 'retryable')
  AND owner_token = $5
  AND lease_generation = $6;
-- Affected rows = 1 means the caller is the current owner and failure was recorded.
-- Affected rows = 0 means the caller is not the current owner.
```

**Critical**: Both `commit` and `fail` use `WHERE` clauses that explicitly validate `owner_token` AND `lease_generation`. A duplicate request that does not own the record will affect 0 rows — the external action must **not** proceed.

#### 3. Expired reservation reclamation (conditional UPDATE)

```sql
WITH reclaimed AS (
  UPDATE execution_idempotency
  SET
    status = 'pending',
    owner_token = $3,              -- new owner's token (from a recovery worker)
    lease_generation = lease_generation + 1,
    attempt_count = attempt_count + 1,
    updated_at = NOW(),
    expires_at = NOW() + INTERVAL '24 hours'
  WHERE organization_id = $1
    AND key = $2
    AND status = 'pending'
    AND expires_at < NOW()       -- explicitly expired — this is the reclamation condition
    AND owner_token != $3       -- not the requesting worker's old token (if re-reclaiming)
  RETURNING id, status, owner_token, lease_generation, attempt_count, expires_at
)
SELECT * FROM reclaimed;
```

- If the UPDATE affects 1 row: the expired `pending` record was atomically reclaimed; the new owner (`$3`) now owns it and may proceed with external action.
- If the UPDATE affects 0 rows: either the record is not in `pending` state, it's already committed, it's not expired, or the requesting worker is the current owner (no reclamation needed).
- **The key condition is `expires_at < NOW()`**: reclamation only occurs for explicitly expired records. An active non-expired reservation cannot be reclaimed by a competing worker.

### Idempotency Record Schema (corrected)

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `organization_id` | TEXT | Tenant isolation |
| `key` | TEXT | Idempotency key (agent:target:action) |
| `status` | TEXT | `pending | committed | failed | retryable | expired` |
| `owner_token` | TEXT | Identifies the worker that reserved the action (e.g., worker UUID or HMAC) |
| `lease_generation` | INTEGER | Monotonically increasing — increments on each successful claim/reclaim. Used to reject stale workers. |
| `attempt_count` | INTEGER | Number of execution attempts so far (0 initially) |
| `result_payload` | JSONB | Optional result (payment ID, report URL, etc.) |
| `created_at` | TIMESTAMPTZ | When the key was first reserved |
| `updated_at` | TIMESTAMPTZ | When the status was last changed |
| `expires_at` | TIMESTAMPTZ | **Lease expiry**: when another worker may reclaim ownership. **This is NOT the record retention period.** |

**Unique constraint**: `UNIQUE (organization_id, key)`

**Important**: `expires_at` is the lease expiry time. See Section H for the distinction between `lease_expires_at` (reclamation condition) and `retention_expires_at` (record cleanup).

### Valid State Transitions

| From → To | Trigger | Conditions | Owner Privilege |
|-----------|---------|------------|-----------------|
| `pending → committed` | Successful external action | Owner validates lease + idempotency key was `pending` → executes action → records result | Only the current `owner_token` may commit |
| `pending → failed` | External action failed (within attempt limits) | Owner validates lease + `attempt_count < max_attempts` → increments attempt_count | Only the current `owner_token` may fail |
| `pending → retryable` | External action inconclusive / retry permitted | Owner validates lease + decides to retry → status transition | Only the current `owner_token` may transition to retryable |
| `pending → expired` | Lease TTL elapsed without action | No worker action within window; record auto-expires | System-wide; any worker may reclaim |
| `expired pending → pending` | Atomic reclamation | Another worker atomically reclaims expired `pending` record | Reclaimer becomes new owner; `owner_token` and `lease_generation` rotate |
| `failed → retryable` | Explicit retry request | Owner with valid token requests retry → status transition | Only the original `owner_token` may retry |
| `committed → (never)` | Terminal | Once committed, never automatically re-executed | Terminal state |
| `failed_exhausted → (terminal)` | `attempt_count >= max_attempts` | No further auto-retries | Terminal; admin recovery required |

### Reservation Protocol Guarantees

1. **Worker A attempts atomic reservation** via `INSERT ... ON CONFLICT DO NOTHING` above.
2. **PostgreSQL determines whether A successfully reserved the key** — `result.rowCount` and `RETURNING` clause tell A whether it is the new owner or not.
3. **Only the successful reservation owner may execute** — the `owner_token` and `lease_generation` in the returned record identify the owner; any other worker must not execute.
4. **Worker B encountering a valid reservation must not execute** — the record's `owner_token` identifies the reigning worker; `INSERT ... ON CONFLICT DO NOTHING` prevents B from overwriting.
5. **An expired reservation can be reclaimed only through an atomic conditional database operation** — see `reclaimExpiredExecutionIdempotency()` below.
6. **Reclaiming rotates the owner token and increments the attempt count** — the reclamation operation sets a new `owner_token` and `lease_generation = lease_generation + 1`, and may increment `attempt_count` if the prior execution attempt was recorded as failed.
7. **Only the current owner of a valid reservation may commit or fail it** — the `owner_token` must match the record's current `owner_token`; `lease_generation` must also match (stale workers are rejected).
8. **A stale owner cannot overwrite the new owner's result** — only the current `owner_token` + matching `lease_generation` may commit/fail; duplicate requests affect 0 rows.
9. **A committed record cannot be overwritten by a duplicate request** — `UPDATE ... WHERE status = 'pending' AND owner_token = ... AND lease_generation = ...` affects 0 rows if status is already `'committed'`.

### Repository Operations

#### `reserveExecutionIdempotency(orgId, key, workerIdentity)`

- Executes `INSERT INTO execution_idempotency ... ON CONFLICT DO NOTHING RETURNING ...`.
- If `result.rowCount = 1 from pg client or GET DIAGNOSTICS`: return `{ success: true, record: <record> }` — the caller is the new sole owner.
- If `result.rowCount = 0`: return `{ success: false, record: <existing record> }` — another worker already owns it. The caller must **not** execute the external action; retry later or reclaim if expired.
- Side effect: only the new owner's `owner_token` and `lease_generation = 1` are set; existing records are **never** overwritten.

#### `getExecutionIdempotency(orgId, key)`

- Simple SELECT: `SELECT * FROM execution_idempotency WHERE organization_id = $1 AND key = $2`.
- Returns the full record including `status`, `owner_token`, `lease_generation`, `attempt_count`, `expires_at`.
- Used for validation before executing external actions.

#### `commitExecutionIdempotency(orgId, key, resultId, resultPayload)`

- Executes the conditional UPDATE shown above (WHERE clause validates `owner_token` AND `lease_generation`).
- If affected rows = 1: the caller is the current owner; commit succeeded; the record is now terminal.
- If affected rows = 0: the caller is not the current owner; the duplicate request must **not** proceed with the external action.

#### `failExecutionIdempotency(orgId, key, errorInfo)`

- Executes the conditional UPDATE shown above (WHERE clause validates `owner_token` AND `lease_generation` AND `status IN ('pending','retryable')`).
- If affected rows = 1: the caller is the current owner; failure was recorded; `attempt_count` incremented.
- If affected rows = 0: the caller is not the current owner; the failure must **not** be recorded.

#### `reclaimExpiredExecutionIdempotency(orgId, key)`

- Executes the conditional reclamation SQL shown above.
- If the UPDATE affects 1 row: the expired `pending` record was atomically reclaimed; the new owner (`$3`) now owns it; can proceed with external action.
- If the UPDATE affects 0 rows: no reclamation performed (record not expired, not pending, already committed, or requesting worker is current owner).

#### `cleanupExpiredIdempotency()`

- Executes: `DELETE FROM execution_idempotency WHERE retention_expires_at < NOW() - INTERVAL '7 days'`.
- **Never** deletes records where `status = 'committed'` unless a separate, authorized administrative operation.
- Records where `expires_at > NOW()` are active leases and are never targeted by cleanup (they are distinguished from retention).
- Can be run as a Supabase Edge Function or cron job.

### External Side-Effect Safety (Critical)

**Do not claim that a 24-hour idempotency window provides exactly-once execution.**

A database transaction cannot atomically commit an arbitrary external payment-provider operation. The 24-hour window protects against duplicate *application-level* re-execution within the same process cluster, but it does not guarantee:

- The external provider (payment gateway, report service, etc.) will not process the same request twice if the application retries after a crash.
- Business-level uniqueness (e.g., no double-payment for the same invoice) is preserved without additional mechanisms.

**Required protections for irreversible external actions**:

1. **Use the provider's idempotency key** whenever the payment/report/API provider supports it. Store the provider's returned `idempotency_key` or `payment_id` as the `record_id` in the `execution_idempotency` table.
2. **Use a durable business-level uniqueness constraint** where applicable (e.g., a database UNIQUE constraint on `(invoice_id, payment_id)` preventing two payments for the same invoice).
3. **Reuse the same external idempotency identity across retries of the same business operation** — if the business operation is "send payment for invoice X", the idempotency key should be business-identifiable, not just "action-shot-timestamp".
4. **Preserve sufficient durable records** to prevent an expired application cache from causing a second irreversible operation. The `execution_idempotency` table with `status = 'committed'` and a `record_id` persists beyond any 24-hour application cache window.
5. **Document the ambiguous outcome** where an external provider completes an operation but the application crashes before recording the result:
   - If the provider's response includes a `payment_id` or equivalent, the `record_id` in `execution_idempotency` captures it.
   - On recovery: the new worker checks `execution_idempotency` → if `status = 'committed'` and `record_id` is set → skip external action, use the recorded result.
   - If the provider did NOT return an identifying `record_id` and the application crashed before recording → the outcome is ambiguous; the system may safely re-execute the action **only if** the external provider supports idempotency keys, otherwise the risk of duplicate operation remains.
   - **Mitigation**: Always design external actions with idempotency in mind; never rely solely on the 24-hour window.

**At-least-once execution, idempotent effects, and exactly-once guarantees**:

- This architecture provides **at-least-once** execution: the job will eventually execute (assuming some worker keeps retrying), but may execute multiple times if retries are not idempotent.
- **Idempotent effects**: if the external action is idempotent (e.g., using a provider idempotency key, or a database UNIQUE constraint), duplicate executions have no adverse business effect.
- **Exactly-once business effects**: not guaranteed by the database alone. Achieved only when the external action is individually idempotent AND the application correctly checks for prior completion before re-executing.
- **Critical documentation**: Any code path that executes an irreversible external action must first check `execution_idempotency` status. If `status = 'committed'`, the action is skipped and the recorded result is returned. If no record or `status = 'failed'`/`'pending'`, the action proceeds, and the result is recorded idempotently afterward.

---

## B. PostgreSQL SQL Syntax Correction

### Critical: Replace MySQL Syntax with PostgreSQL Syntax

**Incorrect** (MySQL):
```sql
DATE_ADD('hour', 24, NOW())
```

**Correct** (PostgreSQL):
```sql
NOW() + INTERVAL '24 hours'
```

**Incorrect** (MySQL):
```sql
DATE_ADD('minute', 30, NOW())
```

**Correct** (PostgreSQL):
```sql
NOW() + INTERVAL '30 minutes'
```

### `EXCLUDED.column_name` vs `EXPIRED.column_name`

In PostgreSQL `INSERT ... ON CONFLICT DO UPDATE`, always reference the proposed insert values using the `EXCLUDED` keyword. Never use `EXPIRED` as an alias.

**Correct**:
```sql
INSERT INTO table (col) VALUES (val)
ON CONFLICT (org_key) DO UPDATE SET col = EXCLUDED.val
```

**Incorrect** (pseudocode passed as SQL):
```sql
-- Do not use:
ON CONFLICT (org_key) DO UPDATE SET col = EXPIRED.val
```

### Interval Arithmetic

All timestamp arithmetic uses PostgreSQL's `INTERVAL` syntax:

- 24 hours from now: `NOW() + INTERVAL '24 hours'`
- 30 minutes from now: `NOW() + INTERVAL '30 minutes'`
- 1 day from a timestamp: `created_at + INTERVAL '1 day'`
- Subtracting: `expires_at < NOW() - INTERVAL '7 days'`

### `NOW()` and Transaction-Time Semantics

- `NOW()` returns the start time of the current transaction (if called within a transaction) or the start of the current statement.
- For idempotency record creation and expiry, using `NOW()` at INSERT time captures the transaction boundary correctly.
- For expiry comparisons, `expires_at < NOW()` correctly evaluates whether the interval has elapsed.

### UUID Generation

- Use `gen_random_uuid()` for PostgreSQL UUID primary keys.
- Application-side UUID generation should follow RFC 4122; store as `varchar` or `uuid` type.

### JSONB Handling

- Store optional data as `JSONB`.
- Index with `jsonb_path_exists()` or operator classes if querying inside the payload is needed.
- The `result_payload` column in `execution_idempotency` and `input_payload`/`output_payload` in `report_schedules`/`scheduled_job_runs` use `JSONB`.

### RLS Policies

- All three new tables (`execution_idempotency`, `report_schedules`, `job_leases`) use the same RLS pattern:
  
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON table_name USING (organization_id = current_app_tenant_id());
```

- `current_app_tenant_id()` is a PostgreSQL function (see Section E). It must be set by the Vercel middleware or edge handler before any database query.
- If the function returns `''` (empty string) or `null`, RLS rejects all queries (no rows match `organization_id = ''` or `organization_id = null`).

---

## C. Scheduler Architecture — Separate Definitions and Executions

### Fundamental Redesign: Three Separate Concepts

The proposed design separates recurring schedule definitions from individual job occurrences and execution ownership. This prevents the confusion of marking a recurring schedule "completed" when only one occurrence completed.

### Table 1: `report_schedules`

Represents **recurring schedule definitions**. This table tracks the configuration, not individual executions.

```sql
CREATE TABLE report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'active',  -- active | paused | canceled
  next_run_at TIMESTAMPTZ NOT NULL,
  last_successful_run_at TIMESTAMPTZ,
  run_count INTEGER NOT NULL DEFAULT 0,     -- count of *successful* executions
  max_runs INTEGER,                         -- optional cap; NULL = unlimited
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**:

```sql
CREATE INDEX idx_report_schedules_org_status ON report_schedules (organization_id, status);
CREATE INDEX idx_report_schedules_org_next ON report_schedules (organization_id, next_run_at);
```

**RLS policy**:

```sql
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON report_schedules USING (organization_id = current_app_tenant_id());
```

**Key points**:

- This table represents the recurring configuration. A schedule can remain `active` independently of the status of any individual run.
- `run_count` counts **successful** executions only. It is NOT incremented when a worker claims a job.
- `max_runs` is optional; if `NULL`, the schedule is unlimited.
- `last_successful_run_at` tracks when the last execution *completed successfully*; `NULL` if never completed.
- `next_run_at` is computed from the `cron_expression` + `timezone` + `last_successful_run_at` (or `created_at` if never run).

### Table 2: `scheduled_job_runs`

Represents **one scheduled occurrence**. Each row is a unique, independent execution with its own lifecycle.

```sql
CREATE TABLE scheduled_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  schedule_id UUID NOT NULL,
  CONSTRAINT fk_scheduled_job_runs_schedule_tenant
    FOREIGN KEY (organization_id, schedule_id)
    REFERENCES report_schedules (organization_id, id),
  scheduled_for TIMESTAMPTZ NOT NULL,          -- when this occurrence was supposed to run
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | claimed | retryable | completed | failed_exhausted | canceled
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  available_at TIMESTAMPTZ,                   -- earliest time this run can be re-claimed
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Constraints and indexes**:

```sql
-- Unique constraint: prevents duplicate occurrences
ALTER TABLE scheduled_job_runs
  ADD CONSTRAINT uq_scheduled_job_runs_schedule_unique
  UNIQUE (schedule_id, scheduled_for);
```

**Indexes**:

```sql
CREATE INDEX idx_scheduled_jobs_org_schedule ON scheduled_job_runs (organization_id, schedule_id);
CREATE INDEX idx_scheduled_jobs_status ON scheduled_job_runs (status);
CREATE INDEX idx_scheduled_jobs_available ON scheduled_job_runs (available_at);
```

**RLS policy**:

```sql
ALTER TABLE scheduled_job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON scheduled_job_runs USING (organization_id = current_app_tenant_id());
```

**Key points**:

- `scheduled_for` is the target time for this occurrence (computed from the cron expression at the time of creation).
- The unique constraint `UNIQUE (schedule_id, scheduled_for)` prevents the same occurrence from being created more than once.
- `status` tracks the lifecycle of this specific run, independently of the recurring schedule.
- `attempt_count` tracks failures for this specific run; `max_attempts` determines when it becomes `failed_exhausted`.
- `available_at` is the earliest time this run can be re-claimed after a failure or expiry; `NULL` means it's immediately available.
- `status` states and transitions:

| Status | Meaning | Can be claimed? | Can be updated? |
|--------|---------|-----------------|-----------------|
| `pending` | Waiting to be claimed | Yes (by one worker) | Yes (transition to `claimed`) |
| `claimed` | Being executed by a worker | No (by another worker) | Yes (transition to `completed`/`failed_exhausted`/`retryable`) |
| `retryable` | Failed but within attempt limits; eligible for retry | Yes | Yes (transition to `claimed`) |
| `completed` | Execution succeeded | No (terminal for this run) | No |
| `failed_exhausted` | `attempt_count >= max_attempts` | No (terminal) | No |
| `canceled` | Explicitly canceled (admin or system) | No | No |

- A recurring schedule remains `active` independently. Even if 100 runs of a daily schedule are all `completed`, the schedule itself remains `active` and will generate new runs each day.

### Table 3: `job_leases`

Represents **current execution ownership and recovery** for a specific `scheduled_job_run`.

```sql
CREATE TABLE job_leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  job_run_id UUID NOT NULL,
  CONSTRAINT fk_job_leases_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id),
  owner_token TEXT NOT NULL,          -- identifies the owning worker/instance
  lease_generation INTEGER NOT NULL DEFAULT 1,  -- monotonically increasing
  status TEXT NOT NULL DEFAULT 'idle',  -- idle | claimed | expired | released
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Constraints and indexes**:

```sql
-- Unique constraint: one mutable lease row per job_run
CONSTRAINT uq_job_leases_org_run UNIQUE (organization_id, job_run_id)

**Indexes**:

```sql
CREATE INDEX idx_job_leases_org ON job_leases (organization_id);
CREATE INDEX idx_job_leases_expires ON job_leases (expires_at);
```

**RLS policy**:

```sql
ALTER TABLE job_leases ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON job_leases USING (organization_id = current_app_tenant_id());
```

**Key points**:

- One mutable lease row per `scheduled_job_runs` row, identified by `(organization_id, job_run_id)` (enforced by ordinary UNIQUE constraint).
- `owner_token` identifies the worker that owns this lease (e.g., worker UUID, instance identifier).
- `lease_generation` is monotonically incremented on each successful claim or reclamation. A stale worker's generation no longer matches the current lease → fencing rejects it.
- `expires_at` is the TTL; after this time, the lease may be reclaimed via conditional UPDATE.
- Reclamation is an atomic conditional UPDATE of this row, setting a new `owner_token`, incrementing `lease_generation`, and resetting `expires_at`; it never changes a committed record.
- The UNIQUE `(organization_id, job_run_id)` constraint ensures exactly one mutable lease row exists; rows with `status = 'released'`, `completed`, or `failed_exhausted` are outside the constraint and represent historical execution records.
- Lease renewal does not create an execution attempt and does not change `attempt_number`. Historical records in `job_execution_attempts` preserve the execution narrative across lease generations.

### Ownership and Historical Execution Records

**A single current lease row per job cannot preserve execution history.** To investigate crashes, retries, stale workers, duplicate requests, and terminal failures, a separate execution-attempt history is required.

#### `job_execution_attempts` (new table, optional but recommended)

```sql
CREATE TABLE job_execution_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  job_run_id UUID NOT NULL,
  CONSTRAINT fk_job_leases_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id),
  attempt_number INTEGER NOT NULL,
  owner_token TEXT,             -- worker identity for this attempt; NULL if system/auto-retry
  lease_generation INTEGER,         -- generation at the time of this attempt
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome TEXT,                     -- 'success', 'failed', 'external_error', 'canceled'
  error_details JSONB,              -- free-form error information
  recovery_reason TEXT,             -- e.g., 'lease_expired', 'max_attempts_exceeded', 'admin_intervention'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**:

```sql
CREATE INDEX idx_job_attempts_run ON job_execution_attempts (job_run_id, attempt_number);
CREATE INDEX idx_job_attempts_outcome ON job_execution_attempts (outcome);
CREATE INDEX idx_job_attempts_org ON job_execution_attempts (organization_id);
```

**How attempts are associated with lease generations**:

- When a worker claims a `scheduled_job_run` (status → `claimed`), the current `lease_generation` from the `job_leases` record is recorded as `attempt_number = 1` in `job_execution_attempts`.
- If the worker retries (same or different worker), a new row is inserted with `attempt_number = 2` and the updated `lease_generation` (which may have incremented if the lease was renewed via `claim_job_run()`).
- If the lease expires and another worker reclaims, `lease_generation` increments; the history rows preserve each generation's context.
- Given a `job_run_id`, tracing `attempt_number` through the history reveals the complete execution narrative: which workers attempted, at what generation, with what outcomes and error details.

**Example investigation query**:

```sql
SELECT attempt_number, owner_token, lease_generation, outcome, error_details, recovery_reason
FROM job_execution_attempts
WHERE job_run_id = 'specific-run-id'
ORDER BY attempt_number;
```

This might reveal: 3 attempts across 3 generations of lease, each with different workers and errors, ultimately exhausting attempts.

---

## D. Atomic Job Claiming and Fencing

### Claim Algorithm

A worker must **never** overwrite a currently valid lease owned by another worker. The claim operation atomically enforces all of these conditions:

1. Correct `organization_id`.
2. Correct `job_run_id` (the specific occurrence, not the recurring schedule).
3. Job is eligible for execution: `scheduled_job_runs.status = 'pending'` (or `'retryable'`).
4. Job is not terminal: `status NOT IN ('completed', 'failed_exhausted', 'canceled')`.
5. `available_at <= NOW()`: the run can be claimed now (not blocked by a backoff period).
6. Existing lease is absent or explicitly expired: `job_leases.expires_at <= NOW()` OR no lease exists for this `job_run_id`.
7. `attempt_count < max_attempts`: the run has not exhausted its attempts.
8. **Exactly one concurrent worker wins** the claim.

The claim operation must use a **genuine PostgreSQL atomic operation**, such as a database function/RPC with transactional SQL. Do not present `Supabase .upsert()` as sufficient proof of conditional lease acquisition. Do not rely on a read followed by a separate write.

### Claim SQL (PostgreSQL function — atomic, multi-table)

```sql
CREATE OR REPLACE FUNCTION claim_job_run(
  p_org_id TEXT,
  p_job_run_id UUID,
  p_worker_token TEXT,
  OUT result_status TEXT,
  OUT lease_id UUID,
  OUT owner_token TEXT,
  OUT lease_generation INTEGER,
  OUT attempt_count INTEGER,
  OUT expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_lease job_leases%ROWTYPE;
  v_new_lease job_leases%ROWTYPE;
BEGIN
  -- 1. Check for existing valid lease
  SELECT * INTO v_current_lease
  FROM job_leases
  WHERE organization_id = p_org_id
    AND job_run_id = p_job_run_id
    AND status = 'claimed'
    AND expires_at > NOW()
  FOR UPDATE;  -- lock the row for this transaction

  -- 2. If a valid lease exists and the caller is the owner, extend and return
  IF FOUND THEN
    IF v_current_lease.owner_token = p_worker_token THEN
      -- Renew the lease for the current owner
      UPDATE job_leases
      SET expires_at = NOW() + INTERVAL '30 minutes',
          lease_generation = lease_generation + 1,
          updated_at = NOW(),
          owner_token = p_worker_token
      WHERE id = v_current_lease.id
      RETURNING * INTO v_new_lease;
      
      result_status := 'renewed';
      lease_id := v_new_lease.id;
      owner_token := v_new_lease.owner_token;
      lease_generation := v_new_lease.lease_generation;
      attempt_count := v_new_lease.attempt_count;
      expires_at := v_new_lease.expires_at;
      RETURN;
    ELSE
      -- Another worker owns the lease; cannot claim
      result_status := 'owned_by_other';
      RETURN;
    END IF;
  END IF;
  
  -- 3. No valid existing lease → attempt to create a new one
  -- First, ensure the job_run is in a claimable state
  UPDATE scheduled_job_runs
  SET status = 'claimed', attempt_count = 0, started_at = NOW(), updated_at = NOW()
  WHERE id = p_job_run_id
    AND organization_id = p_org_id
    AND status = 'pending'
    AND EXISTS (
      -- Ensure no active lease exists (checked above, but double-check within transaction)
      NOT EXISTS (
        SELECT 1 FROM job_leases WHERE organization_id = p_org_id AND job_run_id = p_job_run_id AND status = 'claimed' AND expires_at > NOW()
      )
    )
    RETURNING * INTO v_new_lease;  -- This won't return if the UPDATE affected 0 rows
  
  IF NOT FOUND THEN
    -- The job_run was not in 'pending' state or already had a lease
    result_status := 'not_claimable';
    RETURN;
  END IF;
  
  -- 4. Create a new lease record
  INSERT INTO job_leases (organization_id, job_run_id, owner_token, lease_generation, status, expires_at, created_at, updated_at)
  VALUES (p_org_id, p_job_run_id, p_worker_token, 1, 'claimed', NOW() + INTERVAL '30 minutes', NOW(), NOW())
  RETURNING * INTO v_new_lease;
  
  result_status := 'claimed';
  lease_id := v_new_lease.id;
  owner_token := v_new_lease.owner_token;
  lease_generation := v_new_lease.lease_generation;
  attempt_count := v_new_lease.attempt_count;
  expires_at := v_new_lease.expires_at;
  
  RETURN;
END;
$$;
```

**Claim flow interpretation**:

- **Case A: Existing valid lease, caller is owner** → `result_status = 'renewed'`; the lease is extended (TTL reset) and returned. The caller continues execution.
- **Case B: Existing valid lease, caller is not owner** → `result_status = 'owned_by_other'`; the caller must abort; another worker has the lease.
- **Case C: No valid existing lease, job_run is pending** → `result_status = 'claimed'`; a new lease is created with `lease_generation = 1`, `attempt_count = 0`, and the job_run status transitions to `claimed`. The worker is the sole owner.
- **Case D: No valid existing lease, job_run is NOT pending** → `result_status = 'not_claimable'`; the job is already claimed, completed, failed_exhausted, or canceled.

### Fencing Generation

Every successful claim or reclaim **must increment the `lease_generation`**.

- Worker retains: `owner_token` and `lease_generation`.
- **Stale worker rejection**: Before any external action, the worker re-reads the lease from `job_leases`. If the worker's internally-held `lease_generation` no longer matches the current `lease_generation` in the database, the worker **must abort** — another worker has reclaimed the lease.

**Fencing check pattern** (immediately before external action):

```typescript
// Re-read lease from DB
const lease = await db.jobLeases.findOne({
  where: { job_run_id, organization_id: orgId },
  lock: true  // PostgreSQL SELECT FOR UPDATE
});

// Fencing check
if (lease.lease_generation !== workerInternalGeneration) {
  throw new Error(
    `Lease fencing failure: internal generation=${workerInternalGeneration}, DB generation=${lease.lease_generation}. Another worker has reclaimed this job. Abort execution.`
  );
}

// Also check expiry
if (lease.expires_at < Date.now()) {
  throw new Error('Lease expired — another worker has reclaimed it. Abort execution.');
}
```

**Limitation**: A fencing check immediately before an external HTTP request cannot stop an already-running external operation after lease expiry. If a worker started an external operation before the lease expired, the operation may complete regardless of the fencing check. External providers **must support idempotency** (provider idempotency key, or database UNIQUE constraint) as the ultimate protection against duplicate operations. The fencing pattern prevents *concurrent* execution, not *post-hoc* completion of a previously-started operation.

### Lease Renewal

Renewal must require all of these conditions:

1. Correct `organization_id`.
2. Correct `job_run_id`.
3. **Current owner token**: `job_leases.owner_token = p_renewing_worker_token`.
4. **Current lease generation**: `job_leases.lease_generation = p_renewing_worker_generation`.
5. `status = 'claimed'`.
6. Existing lease not expired: `job_leases.expires_at > NOW()`.

Renewal must be **atomic** — executed inside a PostgreSQL transaction, ideally via the `claim_job_run()` function or a dedicated `renew_lease()` function.

**Renewal protocol** (within the `claim_job_run()` function or equivalent):

```sql
-- Inside a transaction, after verifying ownership (Case A above):
UPDATE job_leases
SET expires_at = NOW() + INTERVAL '30 minutes',
    lease_generation = lease_generation + 1,   -- increment generation
    owner_token = p_worker_token,              -- retain or rotate (choose one protocol)
    updated_at = NOW()
WHERE id = v_current_lease.id;
```

**Token rotation protocol** (choose one; apply consistently):

- **Option 1: Rotate token on renewal** — the renewal operation generates a new `owner_token` (e.g., `crypto.randomUUID()`) and returns it to the worker. The worker must use this new token for all subsequent fencing checks and lease operations. Old tokens become invalid.
  
- **Option 2: Retain token, increment generation only** — the `owner_token` remains the same; only `lease_generation` increments. The worker continues using the same `owner_token` for fencing checks; the generation change is the primary fencing mechanism.

**The design must explicitly choose one protocol** and apply it consistently across all renewal, claim, and fencing operations. The review recommends **Option 2 (retain token, increment generation)** as simpler for worker implementation, with the generation serving as the primary fencing mechanism. However, if the system requires worker identity rotation (e.g., workers restart with new UUIDs), Option 1 may be preferred.

### Lease Release

Release must require the current owner token and valid lease generation.

```sql
UPDATE job_leases
SET status = 'released',
    updated_at = NOW()
WHERE organization_id = $1
  AND job_run_id = $2
  AND owner_token = $3  -- current owner token validation
  AND lease_generation = $4  -- valid generation validation
  AND status = 'claimed'
  AND expires_at > NOW();
```

**Outcomes**:
- **Success**: UPDATE affected 1 row → the current owner has released the lease. The `scheduled_job_run` status can be transitioned (e.g., back to `pending` or `canceled`), and another worker may claim it.
- **Failure (0 rows affected)**: One of the conditions was not met:
  - The caller is not the current owner token.
  - The lease generation no longer matches (stale worker attempting release).
  - The lease is not in `claimed` state (already completed/expired/released).
  - The lease has expired (`expires_at <= NOW()`).
- In the failure case, the lease remains active; the caller should not proceed with execution.

### Expired Lease Reclamation

Expired lease reclamation must explicitly check `expires_at <= NOW()`.

```sql
-- Find leases eligible for reclamation
SELECT id, owner_token, lease_generation, expires_at
FROM job_leases
WHERE organization_id = $1
  AND job_run_id = $2
  AND status = 'claimed'
  AND expires_at <= NOW()
ORDER BY lease_generation ASC  -- lowest generation first (oldest active lease)
LIMIT 1;
```

**Reclaim operation** (within `claim_job_run()` or dedicated function):

If no valid lease exists (`expires_at <= NOW()`) and the job_run is in a claimable state (`pending` or `retryable`), the reclamation proceeds as a new claim:

- The `job_leases` row is effectively deleted (or its status set to `expired`/`released`).
- A new lease is created with `lease_generation = COALESCE((SELECT MAX(lease_generation) FROM job_leases WHERE organization_id = $1 AND job_run_id = $2), 0) + 1`.
- The `scheduled_job_run` status transitions to `claimed`.
- The new worker (whoever executes the reclamation/claim) becomes the owner.

**Critical**: The reclamation must be atomic with the claim. The `claim_job_run()` function handles this: if it finds no valid lease (Case C or D from the claim algorithm), it creates a new claim.

---

## E. RLS and Trusted Tenant Context

### How Tenant Context Reaches PostgreSQL

**Do not assume** that setting a PostgreSQL session variable in Vercel middleware creates a persistent setting on the database connection. The behavior depends on the Supabase/PostgreSQL connection model.

Based on the actual repository, the recommended design is one of the following (choose based on actual implementation):

#### Option 1: Authenticated JWT Claims + RLS

- The Vercel middleware extracts the organization ID from the authenticated user's JWT claims.
- The organization ID is passed to the Supabase backend via the API request (e.g., in the request body, or as a header `X-Organization-Id`).
- The Supabase API route handler sets the `app.tenant_id` session variable **within the same request handler**, before any database query runs.
- RLS policies on all tables use `current_app_tenant_id()` which reads this session variable.

**Setup**:
```sql
-- In the Vercel API route handler (before database operations):
client.query(`SET LOCAL app.tenant_id = '${orgId}'`);
-- Or via Supabase: await supabase.auth.getSession().then(...)
```

**Important**: `SET LOCAL` sets the variable for the duration of the current transaction only. If using Supabase's auto-managed transactions, ensure the session variable is set at the start of each request handler invocation.

#### Option 2: Trusted Server-Side Database Function Parameter

- Database functions that require tenant context accept the `organization_id` as a mandatory parameter.
- The calling code (Vercel API route, service) passes the org ID from the authenticated context.
- RLS is either not used for these operations (trusted server-side code bypasses RLS with validation), or RLS is supplementary.

**Example function**:
```sql
CREATE OR REPLACE FUNCTION claim_job_run(
  p_org_id TEXT,        -- passed from application context
  p_job_run_id UUID,
  p_worker_token TEXT,
  ...
)
LANGUAGE plpgsql
AS $$
-- No RLS needed; p_org_id is validated by the caller
...
$$ LANGUAGE plpgsil;
```

**Validation**: The caller must validate `p_org_id` against the authenticated user's organization before calling the function. This is defense-in-depth: even if RLS is bypassed (service-role), the application still enforces organization boundary.

#### Option 3: Transaction-Local Tenant Context

- Within a PostgreSQL transaction, the tenant context is set once and persists for all operations in that transaction.
- The application sets `app.tenant_id = orgId` at the start of the transaction, and all subsequent queries within that transaction automatically inherit the context.
- This is viable if the application uses explicit transaction management (e.g., `BEGIN; ... COMMIT;`) rather than Supabase's auto-transaction model.

#### Option 4: Privileged Repository Operation

- All database operations go through a small set of privileged repository functions/operations.
- Each repository function accepts `organization_id` as a parameter and validates it against the authenticated context before executing.
- RLS may be enabled as an additional layer, but the primary enforcement is in the repository functions.

### Final Design Recommendation

The design must explain:

1. **Where the organization identity originates** — from the authenticated user's JWT, passed via the Vercel API request.
2. **How it is authenticated** — the Vercel middleware verifies the JWT and extracts `orgId`; the API route handler validates it.
3. **How it reaches the database operation** — the API route handler sets `app.tenant_id = orgId` via `SET LOCAL` (Option 1) or passes it as a function parameter (Option 2).
4. **How the operation verifies it is trusted** — each privileged function/operation begins with a validation check: `IF current_app_tenant_id() != orgId FROM_AUTH_CONTEXT THEN RAISE EXCEPTION 'Unauthorized organization context';`.
5. **How RLS evaluates it** — RLS policies on all tables use `USING (organization_id = current_app_tenant_id())`. If the session variable is not set (e.g., unauthenticated access), the function returns `''` and RLS rejects all queries.
6. **What happens if it is missing or invalid** — the operation either (a) defaults to a safe error/abort, or (b) falls back to application-layer organization filtering (if the orgId was explicitly passed in the request and validated), but never trusts an arbitrary `organization_id` from an untrusted request body.

**Service-role operations**:

- **Acknowledge**: Service-role access can bypass RLS.
- **Require**: Server-side authorization and organization validation. Even with service-role, the application must validate the requested `organization_id` against the authenticated or service-trusted context.
- **Validate**: `organization_id` from the request body (for admin APIs) or from the service's trusted configuration must be checked.
- **Organization filtering**: Keep organization filtering in privileged repository operations as the primary boundary; RLS is supplementary.
- **Document**: Service-role use as a privileged boundary, not a substitute for authorization.

**Never trust an arbitrary `organization_id` supplied by an untrusted request body as the sole tenant authorization mechanism.**

---

## F. PostgreSQL Transaction and Locking Requirements

### Genuine PostgreSQL Transaction Semantics

The architecture must use genuine PostgreSQL transaction semantics. Do not suggest that a normal Supabase query-builder call provides a multi-statement transaction or row lock merely because it supports `.select()` or `.upsert()`.

### Operations Requiring Transactional Guarantees

| Operation | Required Transaction Boundary | Implementation |
|-----------|------------------------------|----------------|
| **Atomic idempotency reservation** | Single transaction encompassing the `INSERT ... ON CONFLICT DO NOTHING` and `RETURNING` | Execute as a PostgreSQL function or via `BEGIN; ... COMMIT;` with the SQL statement |
| **Atomic expired-reservation reclamation** | Single transaction encompassing the `UPDATE execution_idempotency ... WHERE expires_at < NOW()` and `RETURNING` | Same as above; ensure the `WHERE` clause explicitly checks `expires_at < NOW()` |
| **Atomic job-run claiming** | Single transaction across `scheduled_job_runs` UPDATE and `job_leases` INSERT (see `claim_job_run()` function) | The `claim_job_run()` function above embodies this; all SQL inside is one `plpgsql` function = one transaction |
| **Atomic lease reclamation** | Single transaction checking `expires_at <= NOW()` and creating new lease | Implemented within `claim_job_run()` or a dedicated `reclaim_lease()` function |
| **Lease renewal** | Single transaction verifying ownership + extending TTL + incrementing generation | Within `claim_job_run()` or `renew_lease()` function; `WHERE` clause enforces ownership |
| **Lease release** | Single transaction verifying owner token + generation + state, then updating status | Within repository function; `WHERE` clause enforces all conditions |
| **Attempt-count increment** | Single transaction incrementing `attempt_count` and checking against `max_attempts` | Within `handleExecutionFailure()` or similar; `UPDATE ... SET attempt_count = attempt_count + 1` |
| **Terminal-state transitions** | Single transaction setting status to `completed`/`failed_exhausted` and updating related records | Within `markScheduleCompleted()`/`markScheduleFailedExhausted()` functions |

### `SELECT ... FOR UPDATE SKIP LOCKED`

This clause is useful for worker selection patterns but **must be implemented inside a real PostgreSQL transaction/function**.

**Example use case**: Selecting the next available job run for a worker to claim:

```sql
SELECT id, organization_id, status, available_at
FROM scheduled_job_runs
WHERE organization_id = $1
  AND status = 'pending'
  AND available_at <= NOW()
ORDER BY available_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

- `FOR UPDATE SKIP LOCKED` locks the selected row(s), preventing other workers from selecting the same row until the transaction commits.
- **Must** be inside a `BEGIN; ... COMMIT;` block or a `plpgsql` function.
- **Not** a replacement for the full claim algorithm (which also checks leases, ownership, etc.), but a complementary pattern for bulk worker selection.

**Important**: Supabase's `.select().for('update')` may map to `FOR UPDATE`, but its transactional behavior depends on Supabase's connection management. For guaranteed transactional semantics, use direct PostgreSQL function calls or explicit `BEGIN; ... COMMIT;`.

---

## G. Retry Handling and Recovery

### Explicit Retry Behavior

Define the following explicitly:

| Concept | Definition |
|---------|------------|
| `available_at` or `next_attempt_at` | The earliest `TIMESTAMPTZ` when this job run can be re-claimed after a failure. `NULL` means immediately available. |
| Attempt count | Number of failed execution attempts recorded in `scheduled_job_runs.attempt_count`. |
| Maximum attempts | Configurable per-organization or global default (e.g., `3`). Stored in `scheduled_job_runs.max_attempts`. |
| Retryable state | `scheduled_job_runs.status = 'retryable'` — the run is eligible for re-claim but has not yet exceeded `max_attempts`. |
| Terminal `failed_exhausted` state | `scheduled_job_runs.status = 'failed_exhausted'` — no further automatic retries; visible in admin UI for manual recovery. |
| Backoff policy | After each failure, `available_at` is set to `NOW() + backoff_interval` (e.g., `NOW() + INTERVAL '5 minutes'` for first failure, `NOW() + INTERVAL '10 minutes'` for second, etc., or a constant interval). |
| Recovery of expired leases | When `job_leases.expires_at <= NOW()` and `status = 'claimed'`, the lease is expired; another worker may claim the job run (via `claim_job_run()`). |
| Recovery of abandoned pending idempotency reservations | When `execution_idempotency.status = 'pending'` and `expires_at < NOW()`, the record is expired; `reclaimExpiredExecutionIdempotency()` atomically reclaims it as a new `pending` record for another worker. |
| Manual/admin recovery | Admins can directly update `scheduled_job_runs.status` to `canceled`, reset `attempt_count`, or update `available_at`. Admins can also delete or update `execution_idempotency` records via the Supabase dashboard or API. |

### State Transition Diagram (simplified)

```
pending  ──────────────→ claimed  ──────────────→ completed
   ↑                                   ↑
   │                                   │
   │ failed (attempt < max)           │ failure (attempt >= max)
   │                                   ↓
   └────────────── retryable ──────────────→ failed_exhausted
```

**Transition conditions**:

- `pending → claimed`: `claim_job_run()` succeeds; job_run status transitions; a new `job_lease` is created.
- `claimed → completed`: execution finishes successfully; `markScheduleCompleted()` updates `status = 'completed'`, `completed_at = NOW()`, `run_count` on the parent `report_schedules` is incremented.
- `claimed → retryable`: execution failed, `attempt_count < max_attempts`; `status = 'retryable'`, `available_at = NOW() + backoff_interval`.
- `retryable → claimed`: worker re-claims the run (same or different worker).
- `claimed → failed_exhausted`: `attempt_count >= max_attempts`; `status = 'failed_exhausted'`, `completed_at` set, no further auto-retries.
- `claimed → failed_exhausted` (via `handleExecutionFailure()`): same as above.
- Any status → `canceled`: explicit admin or system cancellation.

### Do NOTs

- **Do NOT** leave a failed job permanently in `claimed`. Always transition to `retryable` (if within attempts) or `failed_exhausted` (if attempts exhausted).
- **Do NOT** automatically retry an irreversible external action without a safe idempotency mechanism. The idempotency check before the action (`SELECT FROM execution_idempotency WHERE status = 'committed'`) must occur first.
- **Do NOT** rely on `available_at` alone for lease fencing; always validate `lease_generation` and `owner_token` as well (see Section D).

---

## H. Cleanup and Key Normalization

### Idempotency Cleanup

**Cleanup must target only records that are safe to remove**.

**Requirements**:

1. **Never delete active, non-expired reservations**. Records where `expires_at > NOW()` AND `status IN ('pending', 'retryable')` must be preserved.
2. **Never delete committed business-operation records** while they remain necessary for duplicate prevention. Records where `status = 'committed'` must be retained for the duration necessary to prevent duplicate execution — this may extend beyond the 24-hour window if business policy requires.
3. **Distinguish operational TTL cleanup from durable business-level idempotency retention**. The `cleanupExpiredIdempotency()` function should have a narrower scope than the durable retention requirement.
   - *Operational cleanup*: `DELETE FROM execution_idempotency WHERE retention_expires_at < NOW() - INTERVAL '7 days'` — removes old records to prevent table bloat, retaining committed records per the `status != 'committed'` guard.
   - *Durable retention*: Keep `status = 'committed'` records for as long as business policy requires (e.g., 30 days, 90 days, or indefinitely for audit purposes). Do not automate deletion of committed records via the operational cleanup function.
4. **Restrict broad `clearDeduplicationCache()` behavior** to tests or explicitly authorized administrative operations. In production, `clearDeduplicationCache()` should:
   - Either be restricted to a debug/administrative endpoint with proper authorization.
   - Or be removed entirely; the durable PostgreSQL-backed idempotency makes the in-memory cache cleanup redundant.
5. **Scope cleanup by organization or a tightly controlled maintenance operation**. Example:
   ```sql
   -- Delete expired records older than 7 days, scoped by organization
   DELETE FROM execution_idempotency
   WHERE expires_at < NOW() - INTERVAL '7 days'
     AND organization_id = $1;  -- orgId from authenticated session
   ```

### Idempotency Key Normalization

The colon-separated key format `{organizationId}:{agentName}:{targetEntity}:{targetId}:{actionType}` can be ambiguous if any component contains a colon (e.g., an agent name formatted as `auth:google` or a target ID that includes a colon).

**Use canonical serialization or deterministic hashing**.

**Documented normalization rules**:

1. **Canonical field ordering** — always the same order: `orgId:agent:entity:id:action`. No variation.
2. **String normalization** — trim leading/trailing whitespace from each component; collapse internal whitespace to a single space (if applicable).
3. **Null/empty value treatment** — if any component is `null` or empty string, use a deterministic placeholder (e.g., `___EMPTY___` or `___NULL___`) so the key format remains consistent. Document which placeholder is used.
4. **Case sensitivity** — decide whether the key is case-sensitive or case-normalized (e.g., lowercase all components). Apply consistently.
5. **Hash algorithm, if hashing is used** — if the key is hashed (e.g., SHA-256 hex), document:
   - The hash algorithm.
   - That the stored key in the database is the hash, not the plain string.
   - How lookup works: hash the input → compare with stored hash.
   - **Alternative**: Store the plain string and apply normalization at comparison time; hashing is optional and should not be the default unless there's a specific performance or security reason.
6. **Versioning strategy for future key-format changes** — include a key version prefix (e.g., `v2:` before the colon-separated format) so that future format changes don't break existing lookups. Example: `v2:orgId:agent:entity:id:action`. Old `v1:` keys can be mapped or deprecated gradually.

**The key must consistently represent**: `organization + agent + target entity + target ID + action type`.

**Do not silently change an existing key format without documenting compatibility implications**.

---

## I. Historical Job Execution Records

### Why a Single Lease Row Is Insufficient

A single current lease row per job `(organization_id, job_run_id)` cannot preserve execution history. To investigate crashes, retries, stale workers, duplicate requests, and terminal failures, sufficient durable history must be retained.

### `job_execution_attempts` Table (recommended)

```sql
CREATE TABLE job_execution_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id TEXT NOT NULL,
  job_run_id UUID NOT NULL,
  CONSTRAINT fk_job_leases_run_tenant
    FOREIGN KEY (organization_id, job_run_id)
    REFERENCES scheduled_job_runs (organization_id, id),
  attempt_number INTEGER NOT NULL,
  owner_token TEXT,             -- worker identity for this attempt; NULL if system/auto-retry
  lease_generation INTEGER,     -- generation at the time of this attempt
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  outcome TEXT,                 -- 'success', 'failed', 'external_error', 'canceled'
  error_details JSONB,          -- free-form error information
  recovery_reason TEXT,         -- e.g., 'lease_expired', 'max_attempts_exceeded', 'admin_intervention'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**:

```sql
CREATE INDEX idx_job_attempts_run ON job_execution_attempts (job_run_id, attempt_number);
CREATE INDEX idx_job_attempts_outcome ON job_execution_attempts (outcome);
CREATE INDEX idx_job_attempts_org ON job_execution_attempts (organization_id);
```

**How attempts are associated with lease generations**:

- When a worker claims a `scheduled_job_run` (status → `claimed`), the current `lease_generation` from the `job_leases` record is recorded as `attempt_number = 1` in `job_execution_attempts`.
- If the worker retries (same or different worker), a new row is inserted with `attempt_number = 2` and the updated `lease_generation` (which may have incremented if the lease was renewed via `claim_job_run()`).
- If the lease expires and another worker reclaims, `lease_generation` increments; the history rows preserve each generation's context.
- Given a `job_run_id`, tracing `attempt_number` through the history reveals the complete execution narrative: which workers attempted, at what generation, with what outcomes and error details.

**Example investigation query**:

```sql
SELECT attempt_number, owner_token, lease_generation, outcome, error_details, recovery_reason
FROM job_execution_attempts
WHERE job_run_id = 'specific-run-id'
ORDER BY attempt_number;
```

This might reveal: 3 attempts across 3 lease generations, each with different workers and errors, ultimately exhausting attempts.

---

## J. Cross-Document Consistency (Final Audit Requirement)

After revising all five documents, perform a consistency review. Verify:

| Check | What to Verify |
|-------|---------------|
| **Table names** | Every table has the same name and fields across all documents. |
| **Status values** | Every status value (`pending`, `claimed`, `completed`, `failed_exhausted`, `canceled`, `retryable`, `expired`, `committed`) is consistent. |
| **State transitions** | Every state transition is consistent across documents (idempotency, leases, scheduler runs). |
| **Idempotency ownership rules** | Match the SQL upsert patterns and `owner_token`/`lease_generation` logic. |
| **Lease-generation rules** | Match the SQL and TypeScript interface proposals (increment on claim/reclaim, reject stale). |
| **Scheduler definitions and executions are separated** | Separated everywhere: `report_schedules` (definition) vs. `scheduled_job_runs` (occurrence) vs. `job_leases` (ownership). |
| **Retry behavior** | Consistent: `available_at`, attempt count, max attempts, `failed_exhausted` terminal state. |
| **Tenant-context assumptions** | Consistent: how `current_app_tenant_id()` is set, verified, and what happens if missing/invalid. |
| **SQL syntax** | Valid PostgreSQL in all examples; no MySQL `DATE_ADD`, no `EXPIRED.column_name`. |
| **Testing requirements** | Match the actual guarantees being claimed (SQLite for logic, PostgreSQL for concurrency/RLS). |
| **Stage B–F dependencies** | Correct: B (idempotency) enables E (retry), C (scheduler) enables D (leases), etc. |
| **No document implies implementation is complete** | Any unresolved design decision explicitly marked `OPEN DESIGN DECISION`. |

**If a design decision remains unresolved**, explicitly mark it `OPEN DESIGN DECISION`. Do not invent a decision merely to make the documents appear complete.

**Create a short cross-document consistency table** inside the implementation-plan document.

---

## 5. Revised Implementation Sequence (All Five Documents Must Consistently Use This)

### 004C-A-R — Architecture corrections

Documentation-only revision of all five architecture deliverables.

**Acceptance**: All five documents agree on schemas, SQL, state transitions, security assumptions, failure modes and testing requirements.

### 004C-B — Shared PostgreSQL idempotency

**Implement**:
- Atomic reservation with `INSERT ... ON CONFLICT DO NOTHING`, owner validation via `WHERE` clause
- Owner validation before execute/commit/fail
- Expired reservation reclamation (`reclaimExpiredExecutionIdempotency`) with `expires_at < NOW()` condition
- Safe completion (`commitExecutionIdempotency`) with `owner_token` + `lease_generation` validation
- Failed-attempt handling (`failExecutionIdempotency`) with `attempt_count` and `failed_exhausted`
- Durable external-action idempotency (provider keys, business constraints)
- **Do not claim 24-hour window = exactly-once** — document external side-effect limitations

### 004C-C — Durable scheduler

**Implement**:
- PostgreSQL-backed `report_schedules` (recurring definitions)
- `scheduled_job_runs` (individual occurrences with independent statuses)
- `job_leases` (execution ownership with `lease_generation` fencing)
- Do NOT increment `run_count` when claiming; increment only after successful completion
- Organization-scoped scheduler operations with RLS

### 004C-D — Job claims and leases

**Implement**:
- Atomic claims via `claim_job_run()` function (or equivalent transactional SQL)
- Ownership tokens + `lease_generation` fencing
- Lease renewal (chosen protocol: retain token + increment generation, or rotate token)
- Lease release requiring current owner token + generation
- Expired-lease reclamation with `expires_at <= NOW()` explicit check
- Historical execution attempts via `job_execution_attempts`

### 004C-E — Recovery and retries

**Implement**:
- Backoff (`available_at`), attempt limits, `failed_exhausted` terminal state
- Crash recovery (expired lease reclamation, abandoned reservation reclamation)
- Safe external-action recovery (idempotency check before action)
- Cleanup and retention rules (distinguish operational TTL from durable retention)

### 004C-F — Adversarial testing

**Verify**:
- Real PostgreSQL concurrency
- RLS and tenant isolation
- Cross-tenant isolation (orgA vs orgB)
- Crash recovery and stale worker rejection
- Concurrent recovery workers
- External-action idempotency (provider keys + business constraints)
- Full test suite passes with documented limitations

No stage should be considered complete merely because TypeScript compiles.

---

## 6. Document-by-Document Revision Requirements

### Document 1 — `004C-A-repository-audit.md`

Preserve the original audit findings.

Add a clearly labeled **Architecture Corrections** section containing:
- The identified design flaws (listed in this document's Sections A–I)
- The revised architecture (summarized above)
- The distinction between current implementation and proposed implementation
- Unverified assumptions
- Risks requiring implementation-stage verification

**Do not rewrite historical findings** as though the corrected design already exists in production.

### Document 2 — `004C-A-postgresql-architecture.md`

**Make this the authoritative architecture description**.

It must contain:
- Idempotency reservation protocol (full details from Section A)
- State transition diagrams (from Section G)
- Scheduler definition/run separation (from Section C)
- Lease ownership protocol (from Section D)
- Fencing protocol (from Section D, fencing generation + token rotation)
- Crash-recovery scenarios (from Section G + Section I)
- Retry behavior (from Section G)
- External side-effect guarantees and limitations (from Section A, "External Side-Effect Safety")
- Tenant context and RLS model (from Section E)
- Transaction boundaries (from Section F)
- Cleanup and retention rules (from Section H)

**Ensure every example is consistent with the schema document** (Section III).

### Document 3 — `004C-A-schema-design.md`

**Redesign the proposed PostgreSQL schema**.

Include complete definitions and relationships for:

1. `execution_idempotency` — with `owner_token`, `lease_generation`, `attempt_count`, full column types, nullability, defaults, unique constraints `UNIQUE (organization_id, key)`, check constraints, indexes, status values, tenant isolation, RLS policies, and transaction requirements for all critical operations.

2. `report_schedules` — recurring schedule definitions (from Section C, Table 1).

3. `scheduled_job_runs` — individual job occurrences (from Section C, Table 2).

4. `job_leases` — current execution ownership (from Section C, Table 3).

5. `job_execution_attempts` — historical execution records (from Section I).

**Specify**:
- Column types (`UUID`, `TEXT`, `TIMESTAMPTZ`, `INTEGER`, `BOOLEAN`, `JSONB`).
- Nullability (`NOT NULL`, `NULL`).
- Defaults (`DEFAULT gen_random_uuid()`, `DEFAULT NOW()`, etc.).
- Primary keys.
- Foreign keys (e.g., `scheduled_job_runs.schedule_id REFERENCES report_schedules(id)`).
- Unique constraints (`UNIQUE (organization_id, key)`, `uq_scheduled_job_runs_schedule_unique`, `uq_job_leases_org_run`).
- Check constraints (e.g., `status IN ('pending','claimed','completed','failed_exhausted','canceled','retryable','expired')`).
- Indexes (all from the individual table sections).
- Status values (all documented).
- Tenant isolation (RLS policies on all tables).
- Transaction requirements for all critical operations (from Section F).

**Provide valid PostgreSQL SQL**.

**Do not execute the SQL**.

### Document 4 — `004C-A-implementation-plan.md`

**Rewrite the implementation stages B–F** so they follow the corrected architecture.

For every stage specify:
- Objective
- Exact expected files
- Database functions or schema dependencies
- Preconditions
- Implementation order
- Failure risks
- Required tests
- Acceptance criteria
- Explicit out-of-scope items

**Stage transition** must follow: 004C-A-R → 004C-B → 004C-C → 004C-D → 004C-E → 004C-F.

**Acceptance criteria** for each stage must be phrased in terms of verifiable behavior, not merely "TypeScript compiles".

### Document 5 — `004C-A-verification-matrix.md`

**Rewrite the matrix** around the four testing levels.

Include all important concurrency, ownership, tenant-isolation, recovery, retry, external-action and deployment scenarios.

Distinguish:
- **Level 1 — Unit tests**: canonical key normalization, state-transition validation, backoff calculation, retry eligibility, pure business logic, lease-generation comparison logic. These do NOT establish database concurrency guarantees.
- **Level 2 — Mocked repository tests**: repository interface behavior, error propagation, expected calls, application-level orchestration, handling missing records and failed queries. A mocked PostgreSQL client is not evidence that PostgreSQL concurrency works.
- **Level 3 — Real PostgreSQL integration tests**: mandatory for unique-constraint behavior, atomic idempotency reservation, conditional expired-reservation reclamation, transaction boundaries, row locking, `SKIP LOCKED`, concurrent job claims, lease renewal and release, fencing, RLS enforcement, tenant isolation, concurrent recovery workers. Use independent database connections and genuinely concurrent transactions. SQLite cannot substitute.
- **Level 4 — Deployment integration tests**: actual deployed environment to verify Vercel cold starts, multiple function instances, Supabase connection behavior, tenant context propagation, service-role restrictions, restart and recovery behavior, external provider idempotency, logs and operational visibility. Do not mark a deployment guarantee verified by local tests.

For every test, explicitly state:
- What it proves
- What it does not prove
- Required environment
- Acceptance criteria
- Whether it has actually been executed

**Do not invent test results**.

**Include a final closure checklist** that requires real PostgreSQL evidence for database concurrency and RLS guarantees.

---

## 6. Cross-Document Consistency Audit

After revising all five documents, perform a consistency review.

Verify all items in the table from Section J.

**Create a short cross-document consistency table** inside the implementation-plan document.

If a design decision remains unresolved, explicitly mark it `OPEN DESIGN DECISION`. Do not invent a decision merely to make the documents appear complete.

---

## 7. Strict Execution Restrictions

**This task is documentation-only.**

**You MUST NOT**:
- Modify production source code.
- Modify tests.
- Add migrations.
- Run migrations.
- Change database schemas.
- Deploy to Vercel.
- Change Supabase settings.
- Change environment variables.
- Add dependencies.
- Start 004C-B implementation.
- Claim that PostgreSQL behavior has been verified without executing appropriate PostgreSQL tests.

**You MAY**:
- Inspect existing source files.
- Inspect existing SQL schemas and migrations.
- Inspect repository interfaces and database connection code.
- Revise the five Markdown documents.
- Validate SQL syntax through static review.
- Report design questions that require later verification.

---

## 8. Required Final Report

When finished, provide:

### A. Deliverable status

| Document | Revised | Key corrections |
|----------|---------|-----------------|
| Repository audit | | |
| PostgreSQL architecture | | |
| Schema design | | |
| Implementation plan | | |
| Verification matrix | | |

### B. Critical design decisions

Summarize:
- Idempotency ownership and reclamation
- External side-effect protection
- Scheduler/run separation
- Lease generation and fencing
- Retry and recovery behavior
- Tenant context and RLS
- PostgreSQL transaction implementation

### C. SQL correctness review

List all corrected SQL patterns and confirm whether they are valid PostgreSQL syntax. Do not claim runtime verification unless actually performed.

### D. Cross-document consistency

Report every inconsistency found and whether it was resolved.

### E. Change-scope verification

Provide:
- Git diff summary
- Exact modified filenames
- Confirmation that no production files changed
- Confirmation that no migrations were executed
- Confirmation that no database schema was modified
- Git status

### F. Remaining open decisions

List any unresolved architecture questions.

### G. Final recommendation

Choose exactly one:

- `004C-A-R ACCEPTED — READY FOR 004C-B`
- `004C-A-R ACCEPTED WITH LIMITATIONS`
- `004C-A-R NOT ACCEPTED — CORRECTIONS REQUIRED`

Do not begin 004C-B automatically.

Wait for explicit authorization after the documentation review.

---

## 9. Final quality standard

The goal is not to produce impressive-looking architecture documents.

The goal is to produce an implementable specification that prevents:
- Duplicate irreversible actions
- Active lease theft
- Stale worker writes
- Cross-tenant access
- Lost scheduled occurrences
- Unrecoverable failed jobs
- False claims of exactly-once execution

Correctness, explicit ownership and verifiable database guarantees take priority over implementation speed.

Begin with repository inspection, then revise the five documents, then perform the cross-document consistency audit.