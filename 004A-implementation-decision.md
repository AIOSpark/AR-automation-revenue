# TASK 004A — Implementation Decision

## 1. Architecture Recommendation

**RECOMMENDED SMALLEST SAFE ARCHITECTURE: Option A — Vercel Functions + Supabase PostgreSQL with SQLite Durability Layer**

| Aspect | Recommendation | Rationale |
|---|---|---|
| **Hosting** | Vercel (existing) | Repository targets Vercel; no migration cost |
| **Primary database** | Supabase PostgreSQL | Authoritative UDM state; relational schema already defined and migrated |
| **Durability layer** | SQLite (`node:DatabaseSync`) via `AIOSPARK_DB_PATH` | Dual-layer already in place: relational UDM + `repository_snapshots` key-value. Extending snapshots covers new needs. |
| **Background jobs** | Vercel Functions + server-side scheduling | All jobs already server-side; no external worker needed. Add Vercel Cron or keep manual triggers. |
| **Queue/Redis/BullMQ** | **NOT ADDING** | No evidence of throughput/concurrency requirements justifying external queue. Current jobs are batched, idempotent, and complete within serverless limits. |
| **Process coordination** | Database-level atomic claims (SELECT FOR UPDATE / BEGIN IMMEDIATE) | Already used by `withWriteTransaction()`. Extend to job-level claims instead of process-local guards. |
| **Tenant isolation** | RBAC matrix + org filtering in all storage reads | Already partially implemented; fix gaps (F-007, F-008) rather than redesign. |

---

## 2. Why Not Option B (Vercel Functions + Dedicated Worker)?

- **No evidence** that any job requires execution beyond serverless function limits (5s timeout configurable, typical LLM calls complete in 2-10s)
- **No job** requires independently managed lifecycle (no long-running processes, no connection pooling outside SQLite, no custom retry queues)
- **All jobs** are batch-oriented, idempotent, and finish within 30s typical duration
- **Adding a dedicated worker** would introduce:
  - Operational complexity (process management, health checks, scaling)
  - Deployment complexity (new CI/CD pipeline, new environment variables)
  - Cost (another running service) with no demonstrated benefit
  - Data consistency challenges (sync between worker state and SQLite/Postgres)

**Verdict:** Premature optimization. Not justified by current evidence.

---

## 3. Why Not Option C (External Queue / Redis / BullMQ)?

- **Throughput:** No measured or observed throughput that would bottleneck without Redis. All jobs are triggered sparsely (daily promise check, on-demand report scheduling).
- **Concurrency:** SQLite `BEGIN IMMEDIATE` already serializes concurrent process access. No evidence of lost updates or race conditions that a queue would fix.
- **Latency:** All jobs complete within serverless limits. No sub-100ms latency requirement that Redis would improve.
- **Retry/failed-job:** Current lack of dead-letter is a gap, but adding Redis + BullMQ is overkill. Prefer durable SQLite + enhanced failure handling.
- **Latency:** No publish-subscribe or realtime notification requirements that would justify Redis.
- **Migration complexity:** Moving from SQLite + PostgreSQL to Redis + PostgreSQL would require:
  - Rewriting persistence layer
  - New idempotency mechanism
  - New durability guarantees
  - New monitoring/observability
  - Risk of introducing new bugs far exceeds risk of enhancing existing SQLite layer

**Verdict:** Premature optimization. "Solve the problem you have, not the one you might have."

---

## 3. Recommended Implementation Plan

Based on the assessment, here is the prioritized implementation sequence. These are **read-only assessment recommendations** — actual implementation would be Tasks 004B–004E.

### Phase 1 — Critical Fixes (004B)

| # | Fix | Effort | Impact | Classification |
|---|-----|---|---|---|
| 1 | **Add org filtering to `PromiseStore.getPromise(id)`** — ensure `organization_id` check ✅ | Low | Prevents cross-tenant promise access via direct ID | **CRITICAL** (F-007) |
| 2 | **Add org filtering to `ReportSchedulerStore.getSchedule(id)`** — add `organization_id` check ✅ | Low | Prevents cross-tenant schedule access via direct ID | **CRITICAL** (F-008) |
| 3 | **Migrate ReportSchedulerStore to SQLite durability** — use `repository_snapshots` pattern (namespace 'schedules') from PromiseStore | Medium | Eliminates F-003: zero durability; schedules survive process restart | **CRITICAL** |
| 4 | **Persist SafetyMiddleware `recentActionHashes` to SQLite** or replace with DB-level lease | Medium | Eliminates F-004: process-local double-execution only; enables cross-instance idempotency | **HIGH** |
| 5 | **Add dead-letter / failed-job tracking** for both report scheduler and promise checking jobs — create `execution` table or use `repository_snapshots` namespace | Medium | Eliminates F-010: no recovery mechanism; enables automatic retry | **HIGH** |

### Phase 2 — Concurrency and Reliability (004C)

| # | Fix | Effort | Impact | Classification |
|---|-----|---|---|---|
| 6 | **Add database-level atomic claims for job execution** — use `SELECT FOR UPDATE` or lease pattern (idempotency key + expiry) instead of process-local Sets/Maps | Medium | Eliminates F-002, F-006: process-local claims/concurrency; prevents duplicate job processing across instances | **HIGH** |
| 7 | **Fix AgentExecutor timeout to cancel underlying LLM work** — propagate `AbortSignal` to `modelRouter.invokeWithFallback()` or document that retries may duplicate side effects | Medium | Eliminates F-005: `Promise.race` stops waiting but does NOT cancel LLM; retries may duplicate side effects | **HIGH** |
| 8 | **Extend org filtering to all `getById` / lookup operations** across all stores (UDM, promises, executions, allocations) — ensure every `getXxx(id)` method checks `organization_id` | Low | Prevents cross-tenant data access patterns | **MEDIUM** |
| 9 | **Add clock-skew-tolerant deduplication** — extend double-execution window or use durable storage with timestamps instead of pure wall-clock 5s window | Low | Mitigates F-014: clock skew in deduplication; makes 5s window more robust | **LOW** |

### Phase 3 — Tenant Isolation Hardening (004D)

| # | Fix | Effort | Impact | Classification |
|---|-----|---|---|---|
| 10 | **Verify Supabase RLS policies** enforce tenant isolation at database level | High (external) | Ensures database-layer cannot be bypassed by raw queries | **EXTERNAL VERIFICATION** |
| 11 | **Add background job tenant context propagation** — ensure all jobs call `udmStore.setTenantContext(orgId)` at start, and that this is documented as required pattern | Low | Ensures consistent tenant context for all background work | **MEDIUM** |
| 12 | **Audit all storage `getXxx(id)` methods** for org filtering gap — systematic review and fix | Medium | Prevents recurring cross-tenant ID lookup vulnerabilities | **MEDIUM** |

### Phase 4 — Observability and Testing (004E)

| # | Fix | Effort | Impact | Classification |
|---|-----|---|---|---|
| 13 | **Add monitoring for job failure rates, duplicate execution events, cross-tenant access attempts** — CloudWatch/Datadog or simple logging metrics | Low | Enables detection of the identified weaknesses in production | **LOW** |
| 14 | **Add integration tests** for cross-tenant isolation, job retry, and failure recovery scenarios | High (test infra) | Validates fixes; prevents regression | **HIGH** (requires `AIOSPARK_TEST_MODE=true` setup) |
| 15 | **Configure test infrastructure** — `AIOSPARK_TEST_MODE=true`, `AIOSPARK_DB_PATH` pointing to test SQLite | Medium | Enables safe test execution without risking customer data | **MEDIUM** |

---

## 4. Migration Path Summary

| Current State | Target State | Migration Approach |
|---|---|---|
| `ReportSchedulerStore.schedules: in-memory Map` | `ReportSchedulerStore.schedules: SQLite repository_snapshots Map` | Add `createSchedule`/`getSchedules`/`getSchedule`/`clearAll` using `writeSnapshot`/`readSnapshot` pattern (same as PromiseStore). Add namespace 'schedules'. |
| `SafetyMiddlewareEngine.recentActionHashes: in-memory Map` | `SafetyMiddlewareEngine.recentActionHashes: SQLite repository_snapshots Map` (or remove in favor of DB lease) | Add `writeSnapshot('recent_action_hashes', ...)` / `readSnapshot('recent_action_hashes')`. Or replace `checkDoubleExecution` with lease-based pattern in operational repository. |
| `PromiseStore.promises: in-memory Map + repository_snapshots` | **Keep as-is** (already durable) | No change needed. Fix org filtering only. |
| `ExecutionStore.executions: in-memory Map + operational repo` | **Keep as-is** (already durable) | No change needed. |
| `UDM Store: in-memory Maps + relational SQL` | **Keep as-is** (already durable with partial refresh) | No change needed. Fix org filtering gaps systematically. |

---

## 5. Final Decision Matrix

| Criterion | Option A (Recommended) | Option B | Option C |
|---|---|---|---|
| **Meets verified requirements** | ✅ Yes | ✅ Yes | ✅ Yes |
| **Adds operational complexity** | ⬇️ Low (existing patterns extended) | ⬆️ Medium (new worker process) | ⬆️ High (Redis + BullMQ setup) |
| **Justified by current evidence** | ✅ Yes | ❌ No — no job requires it | ❌ No — no throughput/concurrency need |
| **Migration risk** | ⬇️ Low (extend existing SQLite layer) | ⬆️ Medium (new process mgmt) | ⬆️ High (rewrite persistence) |
| **Cost implications** | ⬇️ Existing Vercel + Supabase costs | ⬆️ Additional worker hosting cost | ⬆️ Redis hosting + ops cost |
| **Scalability** | ✅ Sufficient for current load | ✅ Sufficient | ✅ Over-scaled for current needs |
| **Risk of introducing new bugs** | ⬇️ Low (extend tested patterns) | ⬆️ Medium (new process mgmt code) | ⬆️ High (new persistence layer) |

**Final recommendation: Option A — Vercel Functions + Supabase PostgreSQL with SQLite Durability Layer.**

Extend existing patterns (SQLite `repository_snapshots`, `withWriteTransaction`, org filtering) to fix identified gaps rather than introducing new infrastructure.

---

## 6. Git Integrity Verification

- **Branch**: `high-008-baseline` (unchanged)
- **HEAD**: `17085c83dbb2ed945884d6ac0f530a2e5054e372` (unchanged)
- **Source modifications**: **Zero** — no application source files, tests, or dependencies modified
- **Only new repository files**:
  1. `004A-production-architecture.md`
  2. `004A-state-persistence-matrix.md`
  3. `004A-job-execution-topology.md`
  4. `004A-implementation-decision.md`

**All four deliverables complete. No code modifications. Task 004A complete.**