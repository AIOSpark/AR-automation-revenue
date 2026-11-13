# 004C-A — Verification Matrix (Corrected)

## Objective

This document specifies the test verification matrix for the AIOSpark AR Automation distributed execution architecture. It distinguishes four testing levels and ensures that **no mock or SQLite test can pass a PostgreSQL concurrency, RLS, or ownership gate**.

The matrix uses a four-level model, with the **critical correction**: verification gates follow implementation stages forward, not backward from un-implemented functionality.

---

## Level 1 — Unit Tests

These tests validate pure logic without any database or external dependencies. They establish application-level correctness but **do not prove** database-level concurrency or isolation guarantees.

| Test ID | What It Proves | What It Does NOT Prove | Required Environment |
|---------|---------------|------------------------|---------------------|
| **U1** | Canonical key normalization: `normalizeKey(orgId, agent, entity, id, action)` produces identical output for identical inputs; `null`/empty handled deterministically | Database concurrency; concurrent insert behavior; RLS; cross-tenant isolation | Node.js test runtime (no DB required) |
| **U2** | State-transition validation: `pending → committed`, `pending → failed`, `pending → retryable`, `pending → expired` — each transition has correct preconditions (owner_token, lease_generation, expires_at) | Actual database state transitions under concurrent access; ownership enforcement | Node.js test runtime |
| **U3** | Backoff calculation: `available_at = NOW() + backoff_interval` produces correct TIMESTAMPTZ values after 1st, 2nd, 3rd failure; exponential vs constant interval formulas | Real PostgreSQL `available_at` storage and retrieval; interaction with `handleExecutionFailure()` | Node.js test runtime |
| **U4** | Retry eligibility: `claimed → retryable` when `attempt_count < max_attempts`; `claimed → failed_exhausted` when `attempt_count + 1 >= max_attempts` | Actual PostgreSQL status transition with `attempt_count` and `max_attempts` enforcement | Node.js test runtime |
| **U5** | Lease-generation comparison logic: stale worker rejection — if worker's internal `generation !== DB's lease_generation`, the worker must abort | Real database fencing; generation increment on claim/reclaim; stale worker bypass | Node.js test runtime |
| **U6** | Idempotency key hash/canonical form: given an input key, the normalized form is consistent across repeated calls | Key format disputes; database uniqueness enforcement | Node.js test runtime |

**Important**: Level 1 tests verify the application's logic is correct, but they **cannot** verify that PostgreSQL's `UNIQUE` constraint, `INSERT ... ON CONFLICT`, or `FOR UPDATE SKIP LOCKED` behave correctly under concurrency. Those require Level 3.

---

## Level 2 — Mocked Repository Tests

These tests use a mocked or stubbed PostgreSQL client (e.g., `supabase` client with `mockClient` from `@supabase/test-helpers`). They verify the **application's** interaction patterns with the database but **cannot** verify the database's actual concurrent behavior.

| Test ID | What It Proves | What It Does NOT Prove | Required Environment |
|---------|---------------|------------------------|---------------------|
| **M1** | Repository method `reserveExecutionIdempotency()` is called with correct parameters (`orgId`, `key`, `workerIdentity`) | Atomicity of `INSERT ... ON CONFLICT DO NOTHING` under true concurrency; `ROW_COUNT()` behavior; `RETURNING` clause result | Mocked `supabase` client |
| **M2** | Repository method `commitExecutionIdempotency()` is called with correct `owner_token` and `lease_generation` | Database `WHERE` clause filtering; affected rows = 1 vs 0 when caller is not owner; committed-record protection | Mocked `supabase` client |
| **M3** | Repository method `failExecutionIdempotency()` increments `attempt_count` and transitions status | Database `attempt_count + 1` arithmetic; `status IN ('pending','retryable')` filter; `failed_exhausted` transition condition | Mocked `supabase` client |
| **M4** | Repository method `reclaimExpiredExecutionIdempotency()` is called with `expires_at < NOW()` condition | Database conditional update; affected rows when record not expired; `owner_token != $3` check | Mocked `supabase` client |
| **M5** | Repository method `claim_job_run()` transitions job_run status to `claimed` | Multi-table atomicity (scheduled_job_runs + job_leases); lease generation fencing; owner validation within transaction | Mocked `supabase` client |
| **M6** | Error propagation from repository: `not_found`, `forbidden` (stale token), `conflict` (duplicate) | Actual database constraint violations; `UNIQUE` constraint enforcement under concurrent inserts; row-level locking behavior | Mocked `supabase` client |

**Important**: Level 2 tests verify that the application code correctly calls the repository with the right parameters. They **cannot** verify that PostgreSQL's transactional guarantees (atomicity, isolation, durability) hold under concurrent workloads. Only Level 3 tests can do that.

**Do not credit Level 2 tests with proving database concurrency or RLS guarantees.** They are useful for development confidence but are not acceptance authority for database-level behavior.

---

## Level 3 — Real PostgreSQL Integration Tests

These tests use **independent database connections** and **genuinely concurrent transactions**. They are the **mandatory acceptance authority** for database concurrency, ownership, RLS, and isolation guarantees. **SQLite cannot substitute** for any of these tests.

**The critical correction**: These gates apply **forward** with implementation stages. They are not pre-conditions that block earlier stages.

| Stage | Test IDs | What They Prove | Required Environment |
|-------|----------|-----------------|---------------------|
| **004C-B** (after implementation) | **P1–P6** | Atomic idempotency reservation, owner validation, committed record protection, expired reclamation, token/generation validation, external-side-effect documentation | Real PostgreSQL with two independent client connections; genuine concurrency via separate processes/transactions |
| **004C-C** (after implementation) | **Q1–Q6** | Schedule occurrence generation, uniqueness constraint, `run_count` increment after completion, schedule independently of individual run status, organization-scoped discovery, next_run_at recomputation | Real PostgreSQL with independent connections |
| **004C-D** (after implementation) | **R1–R8** | Claim atomicity (two concurrent claimers), lease generation fencing, renewal validation, release validation, failure handling transitions, execution history recording | Real PostgreSQL; claim_job_run() function; two concurrent connections |
| **004C-E** (after implementation) | **S1–S6** | Failure handling transitions, expired lease recovery, cleanup guard (never deletes committed), abandoned reservation reclamation, backoff policy, `handleExecutionFailure` correctness | Real PostgreSQL; all tables and functions from prior stages |
| **004C-F** (after implementation) | **T1–T8** | Cross-tenant isolation, crash recovery, stale worker rejection, concurrent recovery workers, external-action idempotency, duplicate reservation protection, committed record protection, lease release/re-claim, RLS enforcement | Real PostgreSQL; multi-worker concurrent scenarios; independent connections |

### Test Details (004C-B stage, the idempotency gate)

| Test ID | What It Proves | Required Environment | Acceptance Criteria |
|---------|---------------|----------------------|---------------------|
| **P1** | **Atomic idempotency reservation**: Two concurrent workers attempt `reserveExecutionIdempotency()` with the same `(orgId, key)`. Exactly one succeeds (`ROW_COUNT() = 1`, `status = 'pending'`, owner_token set, `lease_generation = 1`). The other worker's record is **unchanged** — verified by re-reading the row. | Real PostgreSQL with two independent client connections in the same or separate processes; `node-postgres` (pg) or `supabase` with real connections | Test passes only when concurrent execution produces exactly one new owner; the other row is not modified. SQLite does not satisfy this gate. |
| **P2** | **Stale owner rejected on commit**: A worker attempts `commitExecutionIdempotency()` with a **stale** `owner_token` (or mismatched `lease_generation`). The UPDATE affects **0 rows**. The external action must NOT proceed. | Real PostgreSQL; two separate transactions; one transaction reserves, another attempts commit with stale token | Test passes only when `commitExecutionIdempotency()` with wrong token/generation returns affected rows = 0. Mock/SQLite cannot satisfy this gate. |
| **P3** | **Committed record protection**: After `status = 'committed'`, a duplicate `commitExecutionIdempotency()` call affects **0 rows** (status not 'pending'). Duplicate request must not re-execute external action. | Real PostgreSQL; committed record stays committed across transactions | Test passes only when duplicate after commit is rejected. SQLite cannot satisfy. |
| **P4** | **Expired-reservation reclamation**: `reclaimExpiredExecutionIdempotency()` atomically reclaimed an expired `pending` record (where `expires_at < NOW()`). New `owner_token` set, `lease_generation` incremented. | Real PostgreSQL; same connection or separate connection executing reclamation | Test passes only when reclamation is atomic and affects exactly 1 row for expired records; 0 rows for non-expired. SQLite cannot satisfy. |
| **P5** | **Committed record protection (reverse)**: After `commitExecutionIdempotency()`, `failExecutionIdempotency()` also affects 0 rows (status not 'pending'). | Real PostgreSQL | Test passes only when failure after commit is rejected. SQLite cannot satisfy. |
| **P6** | **Reclamation cannot reclaim non-expired**: `reclaimExpiredExecutionIdempotency()` affects 0 rows when `expires_at >= NOW()` (record is active, not expired). | Real PostgreSQL | Test passes only when conditional WHERE clause correctly excludes non-expired records. SQLite cannot satisfy. |

### Test Details (004C-D stage, the lease/claim gate)

| Test ID | What It Proves | Required Environment | Acceptance Criteria |
|---------|---------------|----------------------|---------------------|
| **R1** | **Claim atomicity**: Two concurrent `claim_job_run()` calls on the same `job_run_id`. Exactly one returns `result_status = 'claimed'`; the other returns `result_status = 'not_claimable'` or `owned_by_other`. | Real PostgreSQL; two independent connections; true concurrency via `FOR UPDATE` or serializable transactions | Test passes only when claim algorithm correctly gates the second worker. SQLite cannot satisfy. |
| **R2** | **Owner renewal**: `claim_job_run()` with the existing owner returning `result_status = 'renewed'`; lease TTL extended, `lease_generation` incremented. | Real PostgreSQL; same connection or separate; renewal within single transaction | Test passes only when renewal correctly validates ownership and increments generation. SQLite cannot satisfy. |
| **R3** | **Non-owner rejected**: `claim_job_run()` with a non-owner returning `result_status = 'owned_by_other'`. | Real PostgreSQL | Test passes only when fencing check correctly rejects non-owner. SQLite cannot satisfy. |
| **R4** | **Renewal requires token + generation**: `renew_lease()` requires correct owner token AND valid lease generation; stale generation → operation affects 0 rows. | Real PostgreSQL | Test passes only when renewal correctly validates both token and generation. SQLite cannot satisfy. |
| **R5** | **Renewal increments generation**: `renew_lease()` increments `lease_generation` (Option 2: retain token, increment generation). | Real PostgreSQL | Test passes only when generation is incremented and token is retained. SQLite cannot satisfy. |
| **R6** | **Release by current owner**: `release_lease()` by current owner: affects 1 row, status set to 'released'. | Real PostgreSQL | Test passes only when token and generation both match current owner. SQLite cannot satisfy. |
| **R7** | **Release by non-owner**: `release_lease()` by non-current owner: affects 0 rows, lease unchanged. | Real PostgreSQL | Test passes only when conditions not met (stale token/wrong generation). SQLite cannot satisfy. |
| **R8** | **Failure handling transitions**: `handleExecutionFailure()` when `attempt_count < max_attempts` → `claimed → retryable`, `attempt_count` incremented by 1, `available_at = NOW() + backoff_interval`. When `attempt_count + 1 >= max_attempts` → `claimed → failed_exhausted`, `status = 'failed_exhausted'`, `completed_at = NOW()`. | Real PostgreSQL; actual transaction executing the UPDATE with attempt_count arithmetic | Test passes only when state transitions match the documented criteria. SQLite cannot satisfy. |

### Test Details (004C-E stage, the recovery/gate)

| Test ID | What It Proves | Required Environment | Acceptance Criteria |
|---------|---------------|----------------------|---------------------|
| **S1** | **Failure handling: within attempts**: `handleExecutionFailure()` when `attempt_count < max_attempts`: status transitions `claimed → retryable`, `attempt_count` incremented by 1, `available_at` set to `NOW() + backoff_interval`. | Real PostgreSQL | Test passes only when state, attempt_count, and available_at all match. SQLite cannot satisfy. |
| **S2** | **Failure handling: exhaustion**: `handleExecutionFailure()` when `attempt_count + 1 >= max_attempts`: status transitions `claimed → failed_exhausted`, `completed_at = NOW()`. | Real PostgreSQL | Test passes only when status and completed_at match. SQLite cannot satisfy. |
| **S3** | **Expired lease recovery**: `recoverExpiredLeases()` finds leases where `expires_at < NOW()` AND `status = 'claimed'`; updates their status to `expired` (or allows new claim). | Real PostgreSQL | Test passes only when expired leases are correctly identified and processed. SQLite cannot satisfy. |
| **S4** | **Cleanup guard**: `cleanupStaleIdempotency()` deletes only records where `expires_at < NOW() - INTERVAL '7 days'` AND `status != 'committed'`. | Real PostgreSQL | Test passes only when committed records are never deleted by operational cleanup. SQLite cannot satisfy. |
| **S5** | **Abandoned reservation reclamation**: Abandoned pending idempotency reservation (`expires_at < NOW()`, `status = 'pending'`) is reclaimed via `reclaimExpiredExecutionIdempotency()`: new `owner_token` set, `lease_generation` incremented. | Real PostgreSQL | Test passes only when reclamation is atomic and correct. SQLite cannot satisfy. |
| **S6** | **Backoff policy**: After first failure, `available_at = NOW() + INTERVAL '5 minutes'`; after second, `NOW() + INTERVAL '10 minutes'`; or constant interval as documented. | Real PostgreSQL | Test passes only when available_at matches the documented backoff formula. SQLite cannot satisfy. |

### Test Details (004C-F stage, the adversarial gate)

| Test ID | What It Proves | Required Environment | Acceptance Criteria |
|---------|---------------|----------------------|---------------------|
| **T1** | **Cross-tenant isolation**: Organization A's workers cannot access/modify organization B's idempotency records, scheduled jobs, leases, or execution attempts. Even with same key, orgB's records are invisible/insutable. | Real PostgreSQL with RLS; two separate organizations with separate `orgId` values; verified via connection switching or supabase admin | Test passes only when orgA cannot see orgB's records. SQLite cannot substitute (no RLS concept). |
| **T2** | **Stale worker rejection**: Worker A holds lease with `lease_generation = 2`. Worker B attempts external action with internal `generation = 1`. The database rejects (fencing check fails) because `1 !== 2`. | Real PostgreSQL; worker re-reads lease generation from DB immediately before external action; generation incremented on each claim/reclaim | Test passes only when fencing check using `lease_generation` correctly rejects stale workers. SQLite cannot satisfy. |
| **T3** | **Crash recovery**: Simulate worker crash mid-claim (transaction not committed) — verify lease left in clean state; new worker can re-claim. | Real PostgreSQL; transaction rollback simulation | Test passes only when mid-claim crash leaves state clean; new worker can re-claim. SQLite cannot satisfy (no transaction semantics). |
| **T4** | **Concurrent recovery workers**: Two recovery workers process the same expired lease. Exactly one wins via `lease_generation` increment; the other is rejected (stale generation or `owned_by_other`). | Real PostgreSQL; two separate connections processing same expired record; the `lease_generation` comparison correctly gates | Test passes only when reclamation correctly uses `lease_generation` to determine the winning worker. SQLite cannot satisfy. |
| **T5** | **External-action idempotency**: Provider idempotency key stored in `record_id`; duplicate external action prevented via business-level UNIQUE constraint or provider response. | Real PostgreSQL with provider mock; idempotency key round-trip | Test passes only when provider key correctly prevents duplicate external action. SQLite cannot satisfy. |
| **T6** | **Duplicate idempotency reservation**: Two workers concurrently `reserveExecutionIdempotency()` — only one succeeds; the other's record is unchanged. | Real PostgreSQL; two concurrent connections; the `INSERT ... ON CONFLICT DO NOTHING` pattern | Test passes only when exactly one worker succeeds and the other's row is unchanged. SQLite cannot satisfy. |
| **T7** | **Committed record protection**: After `commitExecutionIdempotency()`, duplicate requests (commit or fail) are rejected (affected rows = 0). | Real PostgreSQL | Test passes only when duplicate after commit is rejected. SQLite cannot satisfy. |
| **T8** | **Lease release and re-claim**: Owner releases lease (`status = 'released'`); new worker claims the same `job_run_id` via `claim_job_run()`: returns `result_status = 'claimed'` with new `lease_generation`. | Real PostgreSQL; lease release followed by new claim | Test passes only when release correctly sets status and new claim creates fresh lease with incremented generation. SQLite cannot satisfy. |

---

## Level 4 — Deployment Integration Tests

These tests verify the system in a deployed or staging-preview environment. They cover infrastructure and deployment concerns. They are **supplementary**: they do not substitute for Level 3 real PostgreSQL tests.

| Test ID | What It Proves | Required Environment |
|---------|---------------|----------------------|
| **D1** | Vercel cold start: function initializes correctly, database connection pool established, RLS policies active | Deployed Vercel preview or production environment |
| **D2** | Multiple function instances: two concurrent cold starts do not corrupt shared state; each instance independently respects RLS and `current_app_tenant_id()` | Deployed environment with at least 2 active function instances |
| **D3** | Supabase connection behavior: connection pooling, transaction retention across cold starts, `SET LOCAL` persistence or re-set requirement per request | Deployed environment; inspect connection logs and behavior |
| **D4** | Tenant context propagation: `current_app_tenant_id()` correctly set and read across function invocations for the same authenticated user | Deployed environment; test with multiple org users |
| **D5** | Service-role restrictions: service-role API calls are blocked or correctly filtered by application-layer validation (even though RLS can be bypassed) | Deployed environment; test with service-role key |
| **D6** | External provider idempotency: provider idempotency key stored in `record_id`; duplicate external action prevented via business-level UNIQUE constraint or provider response | Deployed environment with payment/report API mock; idempotency key round-trip |
| **D7** | Restart and recovery behavior: after service restart, abandoned pending reservations are reclaimed; expired leases are resolved; no duplicate executions from stale state | Deployed environment; simulate restart or cold start |
| **D8** | Logs and operational visibility: all critical operations (reservation, claim, renewal, release, reclamation, commitment, failure) produce structured logs with sufficient context for debugging and audit | Deployed environment; inspect log aggregation |

**Important**: Level 4 tests are **supplementary**. They do not substitute for Level 3 real PostgreSQL tests. A Level 4 test that passes does not guarantee that Level 3 concurrency guarantees hold; Level 4 focuses on deployment behavior, not database concurrency correctness.

---

## Final Closure Checklist

**This checklist must be completed and passed before 004C-B (or any downstream stage) is authorized.**

| # | Check | Status | Notes |
|---|-------|--------|-------|
| **C1** | All five 004C-A documents revised and internally consistent (cross-document consistency table passed) | ☐ Not started | Must verify before proceeding |
| **C2** | Real PostgreSQL integration tests for 004C-B stage (P1-P6) all exist and pass | ☐ Not started | **Mandatory**: no substitutes (SQLite, mock). Gates apply after 004C-B implementation. |
| **C3** | Cross-tenant isolation (T1) verified: orgA cannot access orgB's records | ☐ Not started | Via RLS + `current_app_tenant_id()` |
| **C4** | Stale worker rejection (T2) verified: generation mismatch correctly rejected | ☐ Not started | Via `lease_generation` fencing |
| **C5** | Crash recovery verified: mid-claim crash leaves state clean; new worker can re-claim | ☐ Not started | Simulated via transaction rollback |
| **C6** | External-action idempotency documented: provider keys or business constraints | ☐ Not started | 24-hour window ≠ exactly-once |
| **C7** | Final recommendation determined: `ACCEPTED`, `ACCEPTED WITH LIMITATIONS`, or `NOT ACCEPTED` | ☐ Not started | See Final Report Section G |
| **C8** | All `OPEN DESIGN DECISION` items documented and a consistent choice made | ☐ Not started | Token rotation vs retention, backoff formula, key normalization, tenant context |
| **C9** | No production code modified, no migrations executed, no database schema changed | ☐ Not started | Documentation-only task constraints |
| **C10** | Git diff summary confirms only the five 004C-A Markdown files were changed | ☐ Not started | Change-scope verification |

**All checklist items must be checked (passed) before 004C-B is authorized. Do not bypass any item.**

---

## Test Execution Prerequisites

Before running any Level 3 test, verify:

1. **Real PostgreSQL connection**: Use `pg` or `supabase` with actual database URL, not a mock library.
2. **True concurrency**: Tests must use at least two independent client connections/processes that run genuinely concurrently. A single-process test suite cannot satisfy the concurrency gates.
3. **Transaction boundaries**: Each test operation must be within an explicit `BEGIN; ... COMMIT;` or a `plpgsql` function that guarantees atomicity.
4. **RLS enabled**: If testing RLS gates (T1), ensure RLS is enabled on all five tables and `current_app_tenant_id()` is properly set via `SET LOCAL` at the start of each request handler.
5. **No test isolation bypass**: Do not use `supabase.auth.getSession()` or mocked contexts that implicitly set `organization_id`. Each test must explicitly set or test the absence of tenant context.
6. **Verify test results**: After running, inspect actual row counts, affected rows, returned values, and state changes. Do not rely on "no error thrown" as proof of correctness.

**Do not mark a test as passed unless all acceptance criteria above are met with real PostgreSQL execution evidence.**

---

## Revision History

| Date | Version | Change |
|------|---------|--------|
| 2026-11-13 | 1.0 | Initial matrix with four-level model |
| 2026-11-13 | 1.1 | **Critical fix**: Gates follow implementation stages forward, not backward from un-implemented functionality. Circular dependency broken. Stage-specific gates (P1-P6 for 004C-B, Q1-Q6 for 004C-C, R1-R8 for 004C-D, S1-S6 for 004C-E, T1-T8 for 004C-F). |
| 2026-11-13 | 1.2 | Added test details per stage with acceptance criteria and environment requirements. Clarified that SQLite cannot satisfy any PostgreSQL concurrency/RLS gate. |