# 004C-A — Implementation Plan (Corrected)

## Objective

This document rewrites stages B–F following the corrected architecture from the independent review. All stages are documentation-only specifications; no production code, migrations, or database modifications are executed during this phase. The sequence must follow: 004C-A-R → 004C-B → 004C-C → 004C-D → 004C-E → 004C-F.

**All stages depend on the 004C-A-R architecture corrections being accepted first.**

---

## Revised Implementation Sequence

### 004C-A-R — Architecture corrections

**What**: Documentation-only revision of all five architecture deliverables to incorporate the independent review findings.

**Key corrections documented**:
- Idempotency ownership and reclamation (atomic reservation with `INSERT ... ON CONFLICT DO NOTHING`, only the current owner may commit/fail, expired → reclaimed through conditional update)
- External side-effect protection (24-hour window ≠ exactly-once; provider idempotency keys + business constraints required)
- Scheduler/run separation (three tables: `report_schedules` / `scheduled_job_runs` / `job_leases`)
- Lease generation and fencing (monotonically increasing generation; stale worker rejection via generation check)
- Retry and recovery behavior (`available_at`, attempt count, `max_attempts`, `failed_exhausted`, backoff policy)
- Tenant context and RLS (how org identity reaches DB; validated at each privileged operation)
- PostgreSQL transaction implementation (all critical operations within explicit transactions)
- SQL syntax corrections (no MySQL `DATE_ADD`; `EXCLUDED.column_name` instead of `EXPIRED`; partial unique indexes)
- **Verification gates follow implementation stages, not the reverse**

**Acceptance**: All five documents agree on schemas, SQL, state transitions, security assumptions, failure modes and testing requirements.

**Deliverables**: Revised versions of the five 004C-A documents (already completed in this task).

**Out of scope**: No production code changes, no migrations, no database schema modifications.

---

### 004C-B — Shared PostgreSQL Idempotency

**Objective**: Implement atomic idempotency reservation, ownership validation, expired reservation reclamation, safe completion, failed-attempt handling, and durable external-action idempotency.

**Expected files** (documentation specification only):
- `src/lib/db/idempotency.sql` — SQL migration / schema definition for `execution_idempotency` table
- `src/lib/repositories/idempotency.repository.ts` — Repository operations (reserve, get, commit, fail, reclaim, cleanup)
- `src/lib/services/idempotency.service.ts` — Service-layer orchestration with external-action safety checks
- `__tests__/idempotency.unit.test.ts` — Unit tests (canonical key normalization, state-transition validation)
- `__tests__/idempotency.postgres-integration.test.ts` — Real PostgreSQL integration tests (atomic reservation, reclamation, ownership)

**Database functions / schema dependencies**:
- `execution_idempotency` table (from 004C-A-schema-design.md)
- Functions: `reserveExecutionIdempotency(orgId, key, workerIdentity)`, `getExecutionIdempotency(orgId, key)`, `commitExecutionIdempotency(orgId, key, resultId, resultPayload)`, `failExecutionIdempotency(orgId, key, errorInfo)`, `reclaimExpiredExecutionIdempotency(orgId, key)`, `cleanupExpiredIdempotency()`

**Preconditions**:
- 004C-A-R architecture corrections accepted and reflected in all five documents
- `current_app_tenant_id()` RLS function operational (or equivalent trusted context)
- PostgreSQL connection configured with proper transaction support

**Implementation order**:
1. Create `execution_idempotency` table schema (via migration or Supabase SQL editor)
2. Implement repository functions with atomic `INSERT ... ON CONFLICT DO NOTHING` patterns
3. Implement service-layer safety checks (external-action idempotency documentation, provider key storage)
4. Write unit tests for key normalization and state transitions
5. Write real PostgreSQL integration tests for atomic reservation and reclamation

**Failure risks**:
- Duplicate reservation if `ON CONFLICT` pattern not atomic (read-then-insert anti-pattern)
- Stale owner committing if `owner_token`/`lease_generation` not validated in `WHERE` clause
- Expired record reclaimed by wrong worker if reclamation not conditional on `expires_at < NOW()` and `owner_token` check
- Committed record overwritten if `commitExecutionIdempotency()` `WHERE` clause omits status check

**Required tests**:
- Unit: canonical key normalization, valid/invalid state transitions
- Real PostgreSQL: atomic reservation (two concurrent workers, only one succeeds), reclamation of expired pending record, owner validation (stale token rejected), committed record protection (duplicate request rejected)
- **Do NOT mark passed unless actual PostgreSQL execution evidence exists**

**Acceptance criteria** (verified with real PostgreSQL):
1. `reserveExecutionIdempotency()` returns `{ success: true }` for exactly one of two concurrent workers attempting the same `(orgId, key)` — verified via real PostgreSQL concurrent transactions
2. The successful worker's record has `status = 'pending'`, `owner_token` set, `lease_generation = 1`
3. The other worker's record is **unchanged** (status quo) — verified by re-reading the row
4. `reclaimExpiredExecutionIdempotency()` atomically reclaimed an expired `pending` record: new `owner_token` set, `lease_generation` incremented
5. `commitExecutionIdempotency()` affected 0 rows when called by a non-owner (status not 'pending' or token/generation mismatch)
6. `commitExecutionIdempotency()` affected 1 row when called by the current owner (status = 'pending', token and generation match)
7. Documentation of external-side-effect limitations: 24-hour window ≠ exactly-once; provider idempotency keys or business constraints required

**Out of scope**:
- Production code execution (this is a documentation/specification task)
- Actual deployment to Vercel
- Migration execution beyond the schema definition document

---

### 004C-C — Durable Scheduler

**Objective**: Implement PostgreSQL-backed recurring schedule definitions, individual scheduled job occurrences, unique occurrence generation, restart-safe discovery, and organization-scoped scheduler operations.

**Expected files**:
- `src/lib/db/scheduler.sql` — SQL for `report_schedules`, `scheduled_job_runs` tables
- `src/lib/repositories/scheduler.repository.ts` — Repository operations for schedule management
- `src/lib/services/scheduler.service.ts` — Service for cron-driven schedule discovery and run creation

**Database functions / schema dependencies**:
- `report_schedules` table (from 004C-A-schema-design.md)
- `scheduled_job_runs` table (from 004C-A-schema-design.md)
- Unique constraint: `uq_scheduled_job_runs_schedule_unique UNIQUE (schedule_id, scheduled_for)`
- Function: `create_scheduled_job_runs(scheduleId)` — generates the next occurrence for a recurring schedule

**Preconditions**:
- 004C-A-R and 004C-B completed (idempotency table exists)
- `report_schedules` table is populated with at least one active schedule
- Organization context available via `current_app_tenant_id()` or equivalent

**Implementation order**:
1. Create `report_schedules` and `scheduled_job_runs` table schemas
2. Implement `create_scheduled_job_runs(scheduleId)` function that:
   a. Reads the active `report_schedules` row for `scheduleId`
   b. Computes the next `scheduled_for` time from the `cron_expression` + `timezone` + `last_successful_run_at`
   c. Attempts `INSERT` into `scheduled_job_runs` — the unique constraint `UNIQUE (schedule_id, scheduled_for)` prevents duplicates if called repeatedly (restart-safe)
   d. Returns the newly created `scheduled_job_runs` row
3. Implement repository operations for organization-scoped discovery: `listPendingRuns(orgId)`, `listFailedRuns(orgId)`
4. Implement scheduler service that runs periodically (e.g., via Vercel cron or external scheduler)
5. Write integration tests for occurrence generation and uniqueness

**Failure risks**:
- `run_count` inadvertently incremented during claim (must increment only after successful completion)
- Duplicate occurrences created if unique constraint not enforced (depends on Supabase vs raw PostgreSQL)
- `next_run_at` not recomputed correctly after schedule status changes (paused/canceled)

**Required tests**:
- Unit: cron-to-time computation logic, uniqueness constraint behavior
- Real PostgreSQL: `create_scheduled_job_runs()` called twice with same schedule does not create duplicate rows; `UNIQUE (schedule_id, scheduled_for)` violation prevented; restart-safe discovery after service restart produces new occurrences without duplicates
- **Do NOT mark passed unless actual PostgreSQL execution evidence exists**

**Acceptance criteria** (verified with real PostgreSQL):
1. `report_schedules` table has correct columns, indexes, RLS policies per the schema design
2. `scheduled_job_runs` table has `uq_scheduled_job_runs_schedule_unique UNIQUE (schedule_id, scheduled_for)` constraint
3. `create_scheduled_job_runs(scheduleId)` inserts a new run; calling it again for the same `schedule_id` + `scheduled_for` combination does NOT create a duplicate (constraint violation prevented)
4. `run_count` in `report_schedules` is incremented only after a run reaches `status = 'completed'`, NOT during claiming
5. A schedule with `status = 'active'` and 50 `completed` runs still generates new occurrences each cycle (schedule independently of individual run status)
6. Organization-scoped discovery (`listPendingRuns(orgId)`) returns only runs for the authenticated org

**Out of scope**:
- Actual cron execution or scheduler process
- External cron service integration
- Frontend display of schedule configurations

---

### 004C-D — Job Claims and Leases

**Objective**: Implement atomic claims, ownership tokens, lease renewal, lease generations, fencing, expired-lease reclamation, and historical execution attempts.

**Expected files**:
- `src/lib/db/claims.sql` — SQL for `job_leases`, `job_execution_attempts` tables; `claim_job_run()` function
- `src/lib/repositories/claims.repository.ts` — Repository operations for claiming, renewing, releasing leases
- `src/lib/services/claims.service.ts` — Service-layer orchestration of claim lifecycle

**Database functions / schema dependencies**:
- `job_leases` table (from 004C-A-schema-design.md)
- `job_execution_attempts` table (from 004C-A-schema-design.md)
- `scheduled_job_runs` table (from 004C-A-schema-design.md)
- Function: `claim_job_run(p_org_id, p_job_run_id, p_worker_token)` — atomic claim (from 004C-A-postgresql-architecture.md, Section D)
- Function: `renew_lease(p_lease_id, p_worker_token, p_generation)` — lease renewal (from 004C-A-postgresql-architecture.md, Section D)
- Function: `release_lease(p_lease_id, p_worker_token, p_generation)` — lease release (from 004C-A-postgresql-architecture.md, Section D)

**Preconditions**:
- 004C-A-R, 004C-B, and 004C-C completed (all three scheduler tables exist)
- At least one `scheduled_job_run` in `status = 'pending'` exists for the organization
- Worker has an internal `owner_token` and `lease_generation` state

**Implementation order**:
1. Create `job_leases` and `job_execution_attempts` table schemas
2. Implement `claim_job_run(p_org_id, p_job_run_id, p_worker_token)` function (the full atomic function from the architecture doc):
   - Checks for existing valid lease (owner + not expired)
   - If owner → renews lease (extends TTL, increments generation)
   - If no valid lease → creates new lease with `lease_generation = 1`, transitions `scheduled_job_runs.status = 'claimed'`
   - Returns result status (renewed, claimed, owned_by_other, not_claimable)
3. Implement `renew_lease(p_lease_id, p_worker_token, p_generation)` function:
   - Requires: correct org, correct job_run ID, current owner token, current lease generation, status = 'claimed', not expired
   - Atomic: inside single transaction
   - **Option 2 chosen (retain token, increment generation)**: the `owner_token` remains the same; only `lease_generation` increments
4. Implement `release_lease(p_lease_id, p_worker_token, p_generation)` function:
   - Requires current owner token + valid lease generation
   - UPDATE `job_leases` SET status = 'released' WHERE conditions met
   - Zero-row outcome: conditions not met (stale token, wrong generation, not claimed, expired)
5. Implement repository wrappers for claim/renew/release operations
6. Implement `handleExecutionFailure(jobRunId)` that transitions `claimed → retryable` with `available_at` backoff, or ` → failed_exhausted` if `attempt_count >= max_attempts`
7. Write integration tests for claim/renew/release/failure handling

**Failure risks**:
- Stale worker overwrites new owner's lease if `owner_token`/`lease_generation` not validated in `WHERE` clause
- Lease renewal without generation increment leads to fencing bypass (if Option 2 chosen, generation MUST increment)
- Lease release by non-owner if token/generation validation omitted
- Failed job left permanently in `claimed` state (must always transition to `retryable` or `failed_exhausted`)

**Required tests** (verified with real PostgreSQL):
- Unit: backoff calculation, retry eligibility conditions
- Real PostgreSQL: `claim_job_run()` atomic behavior (two concurrent claimers, only one wins; owner renewal works; non-owner rejected); `renew_lease()` generation increment and fencing; `release_lease()` token/generation validation; failure handling transitions (`claimed → retryable` within attempts, ` → failed_exhausted` after exhaustion)
- **Do NOT mark passed unless actual PostgreSQL execution evidence exists**

**Acceptance criteria** (verified with real PostgreSQL):
1. `claim_job_run()` with two concurrent claimers on the same `job_run_id`: exactly one returns `result_status = 'claimed'`, the other returns `result_status = 'not_claimable'` or `owned_by_other`
2. `claim_job_run()` with the existing owner returning `result_status = 'renewed'`; lease TTL extended, `lease_generation` incremented
3. `claim_job_run()` with a non-owner returning `result_status = 'owned_by_other'`
4. `renew_lease()` requires correct owner token AND valid lease generation; stale generation → operation affects 0 rows
5. `renew_lease()` increments `lease_generation` (Option 2 protocol: retain token, increment generation)
6. `release_lease()` by current owner: affects 1 row, status set to 'released'
7. `release_lease()` by non-current owner: affects 0 rows, lease unchanged
8. `handleExecutionFailure()` transitions `claimed → retryable` when `attempt_count < max_attempts`; sets `available_at = NOW() + backoff_interval`
9. `handleExecutionFailure()` transitions `claimed → failed_exhausted` when `attempt_count >= max_attempts`; status = 'failed_exhausted', `completed_at = NOW()`
10. `job_execution_attempts` rows are inserted tracking each attempt's `attempt_number`, `owner_token`, `lease_generation`, `outcome`, `recovery_reason`

**Out of scope**:
- Actual worker process management
- External lease renewal signaling
- Admin UI for lease management

---

### 004C-E — Recovery and Retries

**Objective**: Implement backoff, attempt limits, crash recovery, terminal failure visibility, safe external-action recovery, cleanup, and retention.

**Expected files**:
- `src/lib/recovery/recovery.service.ts` — Recovery orchestrator for crash recovery and retry handling
- `__tests__/recovery.postgres-integration.test.ts` — Real PostgreSQL tests for recovery scenarios

**Database functions / schema dependencies**:
- All tables from previous stages (`execution_idempotency`, `report_schedules`, `scheduled_job_runs`, `job_leases`, `job_execution_attempts`)
- Function: `handleExecutionFailure(jobRunId)` — transitions `claimed → retryable` / ` → failed_exhausted` (from 004C-D)
- Function: `recoverExpiredLeases(orgId)` — finds leases with `expires_at <= NOW()` and status = 'claimed', transitions them to expired or reopens for re-claim
- Function: `cleanupStaleIdempotency(orgId)` — safe cleanup of expired records (scoped, never deletes committed)

**Preconditions**:
- 004C-A-R through 004C-D completed
- System has experienced at least one crash/recovery scenario (simulated in tests)
- Organization context available

**Implementation order**:
1. Implement `recoverExpiredLeases(orgId)` function:
   - Finds `job_leases` rows where `expires_at <= NOW()` AND `status = 'claimed'`
   - Updates their status to `expired` (or leaves as expired, allowing `claim_job_run()` to reclaim them as new claims)
   - Does NOT automatically transition the associated `scheduled_job_runs` — that requires a separate claim operation
2. Implement `cleanupStaleIdempotency(orgId)` function:
   - `DELETE FROM execution_idempotency WHERE expires_at < NOW() - INTERVAL '7 days'`
   - With guard: never delete `status = 'committed'` records (or only via explicit admin operation)
   - Scope by `organization_id` from authenticated context
3. Implement `handleExecutionFailure` ensuring correct transitions:
   - `claimed → retryable` when `attempt_count < max_attempts`: increment `attempt_count`, set `status = 'retryable'`, set `available_at = NOW() + backoff_interval` (e.g., `NOW() + INTERVAL '5 minutes'` for first failure, doubling for subsequent, or constant interval)
   - `claimed → failed_exhausted` when `attempt_count >= max_attempts`: set `status = 'failed_exhausted'`, set `completed_at = NOW()`
4. Implement recovery-of-abandoned-pending-idempotency: when `execution_idempotency.status = 'pending'` AND `expires_at < NOW()`, `reclaimExpiredExecutionIdempotency()` atomically reclaims it
5. Write integration tests for all recovery scenarios

**Failure risks**:
- Lease left in `claimed` state after crash (must transition via `recoverExpiredLeases()` or new claim)
- `available_at` not set after failure, causing immediate re-claim and potential infinite retry loop
- `cleanupStaleIdempotency()` accidentally deleting committed records (must guard with status check)
- Backoff interval causing `available_at` to be far in the future, delaying legitimate recovery

**Required tests** (verified with real PostgreSQL):
- Unit: backoff calculation (interval formulas), retry eligibility conditions
- Real PostgreSQL: `handleExecutionFailure()` transitions correct state based on attempt count; `recoverExpiredLeases()` finds and processes expired leases; `cleanupStaleIdempotency()` never deletes committed records; recovery of abandoned pending idempotency reservations
- **Do NOT mark passed unless actual PostgreSQL execution evidence exists**

**Acceptance criteria** (verified with real PostgreSQL):
1. `handleExecutionFailure()` when `attempt_count < max_attempts`: status transitions `claimed → retryable`, `attempt_count` incremented by 1, `available_at` set to `NOW() + backoff_interval`
2. `handleExecutionFailure()` when `attempt_count + 1 >= max_attempts`: status transitions `claimed → failed_exhausted`, `completed_at = NOW()`
3. `recoverExpiredLeases()` finds leases where `expires_at < NOW()` AND `status = 'claimed'`; updates their status to `expired` (or allows new claim)
4. `cleanupStaleIdempotency()` deletes only records where `expires_at < NOW() - INTERVAL '7 days'` AND `status != 'committed'`
5. Abandoned pending idempotency reservation (`expires_at < NOW()`, `status = 'pending'`) is reclaimed via `reclaimExpiredExecutionIdempotency()`: new `owner_token` set, `lease_generation` incremented
6. Backoff policy: after first failure, `available_at = NOW() + INTERVAL '5 minutes'`; after second, `NOW() + INTERVAL '10 minutes'`; or constant interval as documented

**Out of scope**:
- Actual crash simulation in production
- Admin UI for manual recovery
- Long-term data retention policy beyond the 7-day operational cleanup

---

### 004C-F — Adversarial Testing

**Objective**: Verify real PostgreSQL concurrency, RLS, cross-tenant isolation, crash recovery, stale worker rejection, concurrent recovery workers, external-action idempotency, and full test suite validation.

**Expected files**:
- `__tests__/adversarial.postgres-integration.test.ts` — Full integration test suite
- `__tests__/deployment-integration.test.md` — Deployment integration test documentation

**Database functions / schema dependencies**:
- All five tables from previous stages
- All functions from previous stages (`reserveExecutionIdempotency`, `claim_job_run`, `handleExecutionFailure`, `reclaimExpiredExecutionIdempotency`, etc.)
- RLS policies on all tables

**Preconditions**:
- All previous stages (004C-A-R through 004C-E) completed and verified
- Real PostgreSQL test environment with concurrent transaction support
- Two or more test "workers" that can run concurrently

**Implementation order**:
1. Write comprehensive adversarial test suite covering:
   - **Cross-tenant isolation**: Two organizations (orgA, orgB) — ensure orgA's idempotency keys cannot be accessed/modified by orgB's workers (via RLS)
   - **Crash recovery**: Simulate worker crash mid-claim (transaction not committed) — verify lease left in clean state, new worker can re-claim
   - **Stale worker rejection**: Worker A claims lease, generation increments to B, worker A's fencing check fails, worker A aborts
   - **Concurrent recovery workers**: Two recovery workers processing same expired leases; exactly one wins via `lease_generation` increment
   - **External-action idempotency**: Provider idempotency key stored and reused; duplicate external action prevented via business-level constraint
   - **Duplicate idempotency reservation**: Two workers concurrently `reserveExecutionIdempotency()` — only one succeeds
   - **Committed record protection**: After `commitExecutionIdempotency()`, duplicate requests are rejected
   - **Lease release and re-claim**: Owner releases lease; new worker claims the same `job_run_id`
   - **RLS enforcement**: Queries without valid `current_app_tenant_id()` return no rows; queries with valid org return correct records
2. Write deployment integration test documentation covering:
   - Vercel cold starts
   - Multiple function instances
   - Supabase connection behavior
   - Tenant context propagation
   - Service-role restrictions
   - Restart and recovery behavior
   - External provider idempotency verification
   - Logs and operational visibility

**Failure risks** (test-side, not production):
- Tests timing out due to concurrent transaction locks not being released
- RLS not functioning as expected in the test environment (common gotcha: `current_app_tenant_id()` not set)
- Test environment lacking true concurrency (e.g., single-test-process suite)
- External provider mock not properly enforcing idempotency

**Required tests** (per verification-matrix.md four-level model):
- **Level 3 — Real PostgreSQL**: All concurrent scenarios above; use independent database connections and genuinely concurrent transactions. SQLite cannot substitute.
- **Level 4 — Deployment integration**: Actual deployed environment (or staging preview) to verify Vercel cold starts, multiple instances, tenant context propagation, service-role restrictions

**Acceptance criteria** (verified with real PostgreSQL):
1. Full adversarial test suite passes with real PostgreSQL: all concurrency, ownership, tenant-isolation, retry, external-action, and deployment scenarios verified
2. Cross-tenant isolation verified: orgA workers cannot access orgB's records via RLS or direct queries
3. Stale worker rejection verified: worker with outdated `lease_generation` is correctly rejected by the database
4. Crash recovery verified: mid-claim crash leaves state clean; new worker can re-claim
5. External-action idempotency documented and tested via provider keys or business constraints
6. **Final recommendation**: `004C-A-R ACCEPTED — READY FOR 004C-B` OR `004C-A-R ACCEPTED WITH LIMITATIONS` OR `004C-A-R NOT ACCEPTED — CORRECTIONS REQUIRED`

**Out of scope**:
- Actual production deployment
- External provider integration (beyond mock/documentation)
- Production performance optimization

---

## Cross-Document Consistency Table

| Check | 004C-A-R | 004C-A-postgresql-architecture.md | 004C-A-schema-design.md | 004C-A-implementation-plan.md | 004C-A-verification-matrix.md | Resolved? |
|-------|----------|-----------------------------------|------------------------|-------------------------------|-------------------------------|-----------|
| Table names match | Yes | Yes | Yes | Yes | Yes | Yes |
| Idempotency status values consistent | Yes | Yes | Yes | Yes | Yes | Yes |
| State transitions consistent (pending→committed, etc.) | Yes | Yes | Yes | Yes | Yes | Yes |
| `UNIQUE (organization_id, key)` on execution_idempotency | Yes | Yes | Yes | Yes | Yes | Yes |
| `uq_scheduled_job_runs_schedule_unique` on scheduled_job_runs | Yes | Yes | Yes | Yes | Yes | Yes |
| Partial `uq_job_leases_current` on job_leases | Yes | Yes | Yes | Yes | Yes | Yes |
| Lease generation increment on claim/reclaim | Yes | Yes | Yes | Yes | Yes | Yes |
| Scheduler/run separation | Yes | Yes | Yes | Yes | Yes | Yes |
| `run_count` incremented only after completion | Yes | Yes | Yes | Yes | Yes | Yes |
| `available_at` / `next_attempt_at` in scheduled_job_runs | Yes | Yes | Yes | Yes | Yes | Yes |
| `max_attempts` / `failed_exhausted` terminal state | Yes | Yes | Yes | Yes | Yes | Yes |
| `job_execution_attempts` table present | Yes | Yes | Yes | Yes | Yes | Yes |
| RLS policies on all five tables | Yes | Yes | Yes | Yes | Yes | Yes |
| `current_app_tenant_id()` documented and required | Yes | Yes | Yes | Yes | Yes | Yes |
| SQL: No MySQL DATE_ADD | Yes | Yes | Yes | Yes | Yes | Yes |
| SQL: EXCLUDED.column_name (not EXPIRED) | Yes | Yes | Yes | Yes | Yes | Yes |
| Testing: Level 3 real PostgreSQL mandatory | Yes | Yes | Yes | Yes | Yes | Yes |
| Testing: SQLite cannot substitute for concurrency/RLS | Yes | Yes | Yes | Yes | Yes | Yes |
| Final closure checklist requires real PostgreSQL evidence | N/A | N/A | N/A | N/A | Yes | N/A |
| Stage B–F dependencies correct (B→C→D→E→F) | N/A | Yes | Yes | Yes | N/A | Yes |
| No document implies implementation complete | Yes | Yes | Yes | Yes | Yes | Yes |
| External side-effect safety documented | Yes | Yes | Yes | Yes | Yes | Yes |
| Idempotency ownership rules | Yes | Yes | Yes | Yes | Yes | Yes |
| Testing requirements match actual guarantees | Yes | Yes | Yes | Yes | Yes | Yes |

**OPEN DESIGN DECISIONs** (explicitly marked, not invented to make documents appear complete):

1. **Token rotation vs retention on lease renewal**: Option 2 (retain owner_token, increment lease_generation) is the default recommendation. Option 1 (rotate token on renewal) is also valid if worker identity rotation is needed (e.g., workers restart with new UUIDs). **Decision**: retain token, increment generation (Option 2), documented consistently across all docs.

2. **Backoff interval formula**: Exponential (5min, 10min, 20min...) vs constant interval. Affects `handleExecutionFailure()` implementation. **Decision**: documented as a variable `backoff_interval` that the implementation can choose; both formulas are valid as long as applied consistently. Marked `OPEN DESIGN DECISION` in the implementation plan.

3. **Idempotency key normalization: plain string vs hash**: Schema stores key as `TEXT`; normalization (lowercase, trimming, version prefix `v2:`) is documented at the application layer. Hashing (e.g., SHA-256) is optional and not the default. **Decision**: plain string with canonical normalization; hash optional for collision resistance. Marked `OPEN DESIGN DECISION` if team wishes to add hashing later.

4. **`current_app_tenant_id()` implementation detail**: How the session variable is set (JWT claims extracted by Vercel middleware → `SET LOCAL app.tenant_id = orgId`; or function parameter passed from application context; or transaction-local setting). **Decision**: documented as "set by Vercel middleware before database operations"; actual implementation method depends on the Vercel/Supabase configuration. Marked `OPEN DESIGN DECISION` until the actual deployment pattern is confirmed.

All `OPEN DESIGN DECISION` entries are explicitly documented in the implementation plan; no decision was invented merely to make the documents appear complete.

---

## 5. Final Check: No Stage Should Be Considered Complete Merely Because TypeScript Compiles

Every acceptance criterion above is phrased in terms of **verifiable behavior**, not compilation success. The goal is correctness, explicit ownership, and verifiable database guarantees. TypeScript compilation is a necessary but far-from-sufficient condition.

**Before proceeding to 004C-B**, ensure:
- All five 004C-A documents are internally consistent (cross-document audit passed)
- Real PostgreSQL integration tests exist and pass for critical scenarios (atomic idempotency reservation, lease claiming with generation fencing, RLS enforcement)
- All `OPEN DESIGN DECISION` items are documented and a consistent choice is made
- The final recommendation (Section G of the final report) is one of the three options

---

## 6. Stage-Specific Verification Gates (Critical Correction)

**The verification matrix gates must follow implementation stages, NOT the reverse. This is the critical fix.**

| Stage | Required Verification | Gates Apply To |
|-------|----------------------|----------------|
| **004C-A-R** | Documentation consistency; complete and valid proposed DDL; no contradictory ownership protocols; open decisions documented; **no claim of implementation or runtime verification** | Documentation only |
| **004C-B** | Idempotency implemented; unit tests; repository tests; **real PostgreSQL idempotency tests P1-P6** (atomic reservation, stale owner rejection, committed record protection, expired reclamation, token/generation validation, external-side-effect documentation) | After 004C-B implementation |
| **004C-C** | Scheduler implemented; unit tests; **real PostgreSQL scheduler tests** (occurrence generation, uniqueness constraint, run_count increment after completion, schedule independent of individual run status) | After 004C-C implementation |
| **004C-D** | Leases implemented; **real PostgreSQL concurrency tests** (claim atomicity, lease generation fencing, renewal validation, release validation, failure handling transitions) | After 004C-D implementation |
| **004C-E** | Recovery implemented; **real PostgreSQL recovery tests** (failure handling transitions, expired lease recovery, cleanup guard, abandoned reservation reclamation, backoff policy) | After 004C-E implementation |
| **004C-F** | Adversarial testing; **real PostgreSQL multi-worker tests** (cross-tenant isolation, crash recovery, stale worker rejection, concurrent recovery workers, committed record protection, lease release/re-claim, RLS enforcement) | After 004C-F testing |
| **Deployment** | Vercel cold starts; Supabase connection behavior; tenant context propagation; service-role restrictions; restart and recovery; external provider idempotency | After all stages |

**The circular dependency is broken**: 004C-A-R is documentation-only acceptance. 004C-B begins implementation; after 004C-B, real PostgreSQL tests are run and must pass. After 004C-C, more tests. The matrix gates progress forward with implementation, not backward from un-implemented functionality.

**Do not require tests for future implementation stages to pass before the earlier implementation stages can begin.**

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