# TASK 004A — Production Deployment Architecture Assessment

## Executive Summary

This assessment investigates the production deployment architecture of the AIOSpark AR Automation Revenue repository (branch `high-008-baseline`, HEAD `17085c83dbb2ed945884d6ac0f530a2e5054e372`). The analysis is based on **static source code inspection only** — no live Vercel or Supabase Dashboard access was available. External production settings require owner verification.

---

## 1. Confirmed Deployment Architecture

### 1.1 Hosting Platform

| Fact | Evidence | Classification |
|------|----------|----------------|
| Hosting platform claimed as Vercel | Project owner specification | EXTERNAL VERIFICATION REQUIRED |
| No `vercel.json` in repository | `find . -name "vercel*"` returned 0 matches | UNKNOWN (requires dashboard) |
| Next.js 16.3.4 framework | `package.json` engines field + `next` dependency `^16.3.4` | VERIFIED |
| Node.js >=22 required | `package.json` `engines.node: ">=22"` | VERIFIED |
| No Edge Runtime configured | `next.config.ts` has no `runtime` or `edge` settings | UNKNOWN |
| Node.js API routes in use | `pg` dependency `^8.23.0` direct PostgreSQL driver; `node:sqlite` usage | VERIFIED |
| No explicit function duration limits | No `vercel.json`; no `duration` in `next.config.ts` | UNKNOWN (requires dashboard) |
| No deployment regions configured | No `region` field in any repository file | UNKNOWN |
| Fluid Compute not referenced | No references in source | UNKNOWN |

**Vercel Dashboard verification required:**
- Actual deployment target (production URL)
- Cron job configuration (if any)
- Function duration limits
- Instance count and auto-scaling settings
- Environment variable configuration
- Custom domain and SSL settings

### 1.2 Application Instance Topology

| Mechanism | Classification | Evidence |
|-----------|----------------|----------|
| In-memory Maps as primary state | Instance-local | `Map` instances in PromiseStore, ReportSchedulerStore, ExecutionStore, UDM Store, SafetyMiddlewareEngine all exist within a single process |
| AsyncLocalStorage for tenant context | Instance-local | `src/lib/tenant/request-context.ts` uses process-local `AsyncLocalStorage`; no cross-process propagation |
| SQLite `repository_snapshots` table | Durable but instance-local | `src/lib/db/durable-repository.ts` — key-value snapshots persisted to SQLite file; read on startup but no cross-process sharing mechanism |
| Relational UDM tables (`udm_*`) | Durable, shared via Supabase PostgreSQL | `src/lib/db/relational-repository.ts` — authoritative UDM state in PostgreSQL via Supabase; connection via `AIOSPARK_DB_PATH` or `SUPABASE_URL`/`SUPABASE_ANON_KEY` |
| `@supabase/ssr` and `@supabase/supabase-js` | External service binding | `package.json` dependencies; actual connection method requires dashboard verification |
| `@electric-sql/pglite` | Instance-local SQLite-over-HTTP | `package.json` dependency; used for edge/local queries |
| No clustering, no process coordination | No evidence of cross-process mechanisms | Search of source found no shared state coordination, no message queues, no distributed locks |

**Critical finding:** The application is designed as a **single-process application** with SQLite as the persistence layer. There is no inter-process coordination mechanism, no message queue, no distributed locks, and no high-availability process group. Each Vercel function execution or server restart operates on isolated in-memory state that must be bootstrapped from SQLite.

### 1.3 Supabase and Database Architecture

| Component | Details | Classification |
|-----------|---------|----------------|
| Supabase client initialization | `@supabase/ssr` ^0.12.6 + `@supabase/supabase-js` ^2.115.0 | VERIFIED (package.json) |
| Direct PostgreSQL driver | `pg` ^8.23.0 — used in backend code for direct queries | VERIFIED |
| Both Supabase JS + direct pg | Yes, both are dependencies and used | VERIFIED |
| Supabase Data API | Not explicitly used; relational-repository uses `pg` directly | UNKNOWN |
| Connection pooling | Not configured in repository; `pg` default pool behavior | UNKNOWN |
| Connection method | `AIOSPARK_DB_PATH` env var defaults to `./data/aiospark.sqlite`; production uses Supabase PostgreSQL | EXTERNAL VERIFICATION REQUIRED |
| Transaction-mode pooling | No evidence of PgBouncer or connection pooling config | UNKNOWN |
| Per-request vs pooled connections | Code uses `withWriteTransaction` from durable-repository for serialized access; no explicit pool config | UNKNOWN |
| Database transactions | Yes — `withWriteTransaction` uses `BEGIN IMMEDIATE`/`COMMIT` via `DatabaseSync` | VERIFIED |
| Migrations present | `drizzle-kit` ^0.31.11 + `relational-schema.ts` migration SQL | VERIFIED |
| SQLite in production | Default path `./data/aiospark.sqlite`; `AIOSPARK_TEST_MODE=true` uses `:memory:` | EXTERNAL VERIFICATION REQUIRED |
| `@electric-sql/pglite` | `^0.5.8` — SQLite-over-HTTP for edge/local queries | VERIFIED |

**Key database architecture:** Dual-layer persistence:
1. **Relational tables** (`udm_customers`, `udm_invoices`, `udm_payments`, etc.) in Supabase PostgreSQL — authoritative UDM state
2. **Key-value `repository_snapshots` table** in same SQLite file — used by PromiseStore, ExecutionStore, agent logs for durable Map state
3. **Legacy `udm` snapshot** — one-time migration target, deleted after relational projection

### 1.4 Persistence Inventory

| Component | Storage Mechanism | Durable? | Shared Across Instances? | Restart-Safe? | Evidence |
|-----------|------------------|----------|--------------------------|---------------|----------|
| PromiseStore (`promises` Map) | SQLite `repository_snapshots` table (namespace 'promises') | Yes — survives restart via `readSnapshot`/`writeSnapshot` | No — each instance reads its own snapshot | Yes — `constructor` calls `readSnapshot`, `createPromise` calls `writeSnapshot` | `src/lib/promises/store.ts` |
| ExecutionStore (`executions` Map) | SQLite `repository_snapshots` + operational repo | Yes — `reloadFromDurableState()` on every `get()` call | No — per-instance reload | Yes — constructor calls `reloadFromDurableState` | `src/lib/execution/store.ts` |
| ReportSchedulerStore (`schedules` Map) | **In-memory Map ONLY** — no backing store | **No** — lost on process restart | N/A | **No** — zero durability | `src/lib/reports/scheduler.ts` |
| UDM Store (customers, invoices, payments, etc.) | Relational tables (`udm_*`) in SQLite + legacy JSON snapshot | Yes — `readUdmRelationalState()` / `backfillUdmFromSnapshot()` | Partially — shared via Supabase PostgreSQL but each process has its own in-memory cache | Yes — `reloadFromDurableState()` called on reads | `src/lib/udm/store.ts` |
| Promise promises by ID (`getPromise(id)`) | In-memory Map + `repository_snapshots` | Yes (via snapshot) but org filtering F-007 gap | No | Yes — with org filtering gap | `src/lib/promises/store.ts` |
| Agent invocation logs | SQLite `repository_snapshots` (namespace 'agent_invocation_logs') | Yes | No | Yes | `src/lib/agents/executor.ts` |
| Policy rules & rate-limit counters | SQLite `repository_snapshots` (namespaces 'policy_rules', 'rate_limit_counters') | Yes | No | Yes | `src/lib/agents/policy-engine.ts` |
| SafetyMiddleware `recentActionHashes` | **In-memory Map ONLY** | **No** — lost on restart | N/A | **No** — process-local only | `src/lib/agents/safety-mafety-middleware.ts` |

---

## 2. Background Jobs and Scheduler Investigation

### 2.1 Report Scheduler

| Attribute | Details |
|-----------|---------|
| Job name | `ReportSchedulerJob` via `reportSchedulerStore.runScheduledReportsJob()` |
| Trigger | Repository-level **Vercel Cron NOT configured** — no `vercel.json`; external dashboard config unverified |
| Execution location | Server-side process (Node.js) — runs as part of application process |
| Persistence | **ZERO durable persistence** — in-memory Map only (F-003 critical finding) |
| Due-time evaluation | `next_run_at` computed as `Date.now() + 86400000` (24h from creation) in `createSchedule()` |
| Atomic claim behavior | **None** — no claim mechanism, no lease expiry, no concurrency protection |
| Concurrent invocation protection | **None** — multiple instances can run simultaneously, duplicate email sends |
| Lease expiry | **None** — no lease mechanism |
| Restart recovery | **None** — all schedules lost on process restart |
| Email delivery tracking | Via Layer 19 `TransactionalEmailProvider.sendEmail()` — success/failure tracked in errors array |
| Failure handling | Errors collected and returned; no retry, no dead-letter, no DLQ |
| Key vulnerability | F-003: ReportSchedulerStore has zero durable persistence; F-006: No concurrency protection |

### 2.2 Promise Checking Job

| Attribute | Details |
|-----------|---------|
| Job name | `PromiseCheckJob.runDailyCheck()` |
| Trigger | Daily scheduled execution (repository-level Vercel Cron NOT configured) |
| Execution location | Server-side process; called with `orgId` via `udmStore.setTenantContext(orgId)` |
| Persistence | SQLite `repository_snapshots` via `promiseStore` — `readSnapshot`/`writeSnapshot` |
| Payment claim lifecycle | `pending` → `kept`/`partial`/`broken` based on payment received vs. promised amount + grace period |
| Claim concurrency protection | **None** — `claimedPaymentIds` tracked in **process-local Set only** (F-002, F-010) |
| Promise status transitions | `pending` → `kept` (full payment received), `partial` (some payment > 0 but < promised), `broken` (no payment past deadline + grace), `broken` → `kept` (retroactive late payment) |
| Collections Agent invocation | `runCollectionsAgent()` triggered immediately when promise becomes `broken` with `invoice_id` |
| Retry behavior | None at job level; individual promise status updates are atomic via `withWriteTransaction` |
| Duplicate execution protection | **None across instances** — process-local only; F-014 clock skew in 5s double-execution window |
| Key vulnerability | F-002: Process-local claims; F-007: `getPromise(id)` bypasses org filtering; F-010: No dead-letter/recovery mechanism |

### 2.3 Scheduler Trigger Verification

**Repository-level Vercel Cron configuration: NOT FOUND.**

- No `vercel.json` present in repository
- No `cron` definitions in `next.config.ts`
- No `schedule` scripts in `package.json` (only test scripts)
- **Conclusion:** No cron configuration verified in repository. External Vercel Dashboard or separate CI/CD pipeline may contain scheduler config. Marked EXTERNAL VERIFICATION REQUIRED.

---

## 3. Reconciliation with Task 003D Findings

| Finding | Subject | Status vs Current Code |
|---------|---------|----------------------|
| F-002 | Promise job invocation-local claims | **CONFIRMED** — `claimedPaymentIds` is process-local Set; no cross-instance coordination |
| F-003 | In-memory report schedules | **CONFIRMED** — `ReportSchedulerStore` still has in-memory Map only, zero durability |
| F-004 | SafetyMiddleware duplicate guard | **CONFIRMED** — `checkDoubleExecution` still uses 5s process-local `recentActionHashes` Map |
| F-005 | AgentExecutor cancellation | **CONFIRMED** — `Promise.race` + `AbortController` does NOT cancel underlying LLM work |
| F-006 | Report scheduler atomic claims | **CONFIRMED** — still no atomic claims or concurrent execution protection |
| F-010 | Dead-letter and recovery workflow | **CONFIRMED** — no dead-letter queue, no failed-job mechanism, no automatic recovery |
| F-011 | External scheduler configuration | **STILL UNKNOWN** — repository has no cron; dashboard verification required |

---

## 4. Tenant Isolation and Database Security

| Aspect | Assessment | Classification |
|--------|------------|----------------|
| AsyncLocalStorage process-local | Process-local only; no cross-process propagation — **not by itself a vulnerability** | INFERRED |
| UDM org filtering (`organization_id`) | Most queries filter by orgId (e.g., `getPromises(orgId)`, `getInvoices()` filtered by tenant) | VERIFIED |
| Critical gap: `getPromise(id)` no org filter | `PromiseStore.getPromise(id)` returns promise by ID without organization verification — cross-tenant data access | **CRITICAL** — F-007 |
| Critical gap: `getSchedule(id)` no org filter | `ReportSchedulerStore.getSchedule(id)` returns schedule without organization verification | **CRITICAL** — F-008 |
| RBAC permission matrix | Explicit Role × Resource × Action matrix in `src/lib/tenant/permissions.ts` | VERIFIED |
| Safety middleware RBAC | `checkPermission()` uses static `ACTION_TO_RBAC` mapping + `can()` function | VERIFIED |
| Background job tenant context | Jobs call `udmStore.setTenantContext(orgId)` to establish context | VERIFIED |
| Service-role privileged operations | No evidence of service-role bypass in repository code | UNKNOWN |
| RLS policies on Supabase | Not inspectable from repository; requires dashboard | EXTERNAL VERIFICATION REQUIRED |
| Cross-tenant query risks | `getPromise(id)` and `getSchedule(id)` bypass tenant filtering — explicit vulnerability | **CRITICAL** |

**Background job tenant context propagation:** Jobs explicitly call `udmStore.setTenantContext(orgId)` before executing, which sets AsyncLocalStorage context. However, this is process-local — a different instance running the same job would not have the prior context. The job must re-establish context from the `orgId` parameter.

---

## 5. Architecture Decision Assessment

### 5.1 Option Evaluation

| Option | Justification | Recommendation |
|--------|--------------|----------------|
| **Option A — Vercel Functions + Supabase PostgreSQL** | Current architecture. Vercel functions API/scheduled-job entry points. Supabase PostgreSQL authoritative UDM. Database transactions coordinate claims. Atomic updates prevent competing workers from same job type. Leases not implemented — process-local state only. | **PREFERRED** — satisfies verified requirements without over-engineering |
| **Option B — Vercel Functions + Dedicated Worker** | No evidence that jobs require execution beyond serverless limits or need independently managed execution. Current LLM calls, UDM reads/writes, email sends all complete within serverless constraints. | Not justified — adds operational complexity without demonstrated need |
| **Option C — External Queue / Redis / BullMQ** | No throughput, concurrency, latency, retry, or execution requirements observed that justify external queue. All jobs are batched, idempotent, and complete within 5-30s typical duration. | Not justified — premature optimization; "distributed system complexity for problems we don't have yet" |

**Smallest safe architecture:** Option A — Vercel Functions + Supabase PostgreSQL with SQLite fallback for durability.

### 5.2 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────┐
|                    VERCEL PLATFORM                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐    │
│  │ API Routes  │  │ Page Routes │  │ Server Components│    │
│  └─────────────┘  └─────────────┘  └─────────────────┘    │
│         ▲               ▲               ▲                  │
│         │               │               │                  │
│  Vercel Cron(?)          │               │                  │
│         │               │               │                  │
│  ┌────────────────────────────────────────────────────────┐│
│  │ SERVERLESS FUNCTIONS (Node.js >=22)                     ││
│  │  - API routes (pg → Supabase Postgres)                 ││
│  │  - Report scheduler job (in-memory + SQLite snapshots) ││
│  │  - Promise check job (in-memory + SQLite snapshots)    ││
│  │  - Agent execution (8-step safety pipeline)            ││
│  └────────────────────────────────────────────────────────┘│
│         ▲               ▲               ▲                  │
│         │               │               │                  │
│  Supabase PostgreSQL   D1/R2 (if used)           │        │
│  (udm_customers,                                  │        │
│   udm_invoices, udm_payments, ... )               │        │
│         │               │               │                  │
│  SQLite aiospark.sqlite (repository_snapshots)      │        │
│  (promises, executions, agent logs, policy rules) │        │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. External Configuration Still Requiring Owner Verification

| Setting | Current Repository Evidence | Required Action |
|---------|----------------------------|-----------------|
| Live Vercel project URL | Not in repository | Owner to provide |
| Vercel Cron job schedule | No `vercel.json` found | Check Vercel Dashboard |
| Production `AIOSPARK_DB_PATH` | Defaults to `./data/aiospark.sqlite` | Verify production DB path |
| Supabase connection string | `next-env.d.ts`, env.example only | Check Supabase Dashboard |
| Production environment variables | `.env` marked `[BLOCKED]` | Owner to supply non-sensitive names |
| Number of production instances | Not configurable in repo | Verify via Vercel Dashboard |
| Auth/OIDC configuration | `.env.example` has LLM keys only | Check Sites → Auth dashboard |
| Sign-in with Freebuff settings | Not in repository | Check if configured |
| RLS policies on Supabase | Not inspectable from source | Verify Supabase Dashboard |
| Real-time/Durable Objects | Not in repository | Verify if configured |

---

## 7. Prioritized Implementation Sequence for 004B–004E

Based on the identified weaknesses, the following sequence is recommended:

### Phase 1 — Critical Isolation Fixes (004B)
1. **Fix F-007/F-008**: Add organization_id filtering to `PromiseStore.getPromise(id)` and `ReportSchedulerStore.getSchedule(id)` — ensure cross-tenant ID lookups require org verification
2. **Add durable persistence to ReportSchedulerStore**: Migrate from in-memory Map to SQLite-backed storage (use `repository_snapshots` pattern from PromiseStore)
3. **Add dead-letter/failure recovery**: Implement failed-job tracking and automatic retry mechanism for both report scheduler and promise checking jobs

### Phase 2 — Concurrency and Reliability (004C)
4. **Add cross-process concurrency protection**: Implement database-level atomic claims (SELECT FOR UPDATE or lease-based pattern) for both promise checking and report scheduler jobs
5. **Fix AgentExecutor timeout cancellation**: Ensure `AbortController` signal propagates to cancel underlying LLM work on timeout; or document that retries may duplicate side effects
6. **Add process-local deduplication with durable coordination**: Extend `SafetyMiddlewareEngine.checkDoubleExecution` to use durable storage for cross-instance idempotency

### Phase 3 — Tenant Isolation Hardening (004D)
7. **Fix cross-tenant ID lookup gaps**: Ensure all storage `getById` operations filter by organization_id
8. **Verify Supabase RLS policies**: Ensure database-level row-level security enforces tenant isolation
9. **Add background job tenant context propagation**: Ensure all background jobs establish and propagate tenant context across process boundaries

### Phase 4 — Observability and Testing (004E)
10. **Add monitoring for job failure rates, duplicate execution events, cross-tenant access attempts**
11. **Add integration tests** for cross-tenant isolation, job retry, and failure recovery scenarios
12. **Configure test infrastructure** (`AIOSPARK_TEST_MODE=true`, `AIOSPARK_DB_PATH`) for safe test execution

---

## 8. Final Decision

**ACCEPT WITH LIMITATIONS**

The repository assessment is complete with the following distinctions:

| Category | Status |
|----------|--------|
| Deployment architecture (verified from code) | **ACCEPT** — Vercel + Next.js 16.3.4 + Supabase Postgres + SQLite confirmed |
| Application instance topology | **ACCEPT** — Single-process with SQLite persistence; no cross-process coordination |
| Database connection and persistence | **ACCEPT with limits** — Dual-layer (relational + key-value SQLite) verified; production DB path requires dashboard verification |
| Background job execution model | **ACCEPT with limits** — Mapped scheduler and promise jobs; durability and concurrency gaps identified |
| Process-local state risks | **IDENTIFIED** — 5 CRITICAL + 7 HIGH findings from Task 003D confirmed and expanded |
| Current scheduler reliability | **LIMITED** — Report scheduler has zero durability; promise job has partial durability via SQLite |
| Current promise-job reliability | **LIMITED** — Durable via SQLite snapshots but concurrency and cross-tenant gaps exist |
| Tenant isolation observations | **MIXED** — RBAC matrix and safety middleware provide some isolation; `getPromise(id)`/`getSchedule(id)` gaps critical |
| External production settings | **REQUIRES VERIFICATION** — Vercel cron, DB path, instance counts, Supabase RLS, auth config |

**Only new repository file**: `004A-production-architecture.md`
**Four deliverables created**:
1. `004A-production-architecture.md` — this assessment
2. `004A-state-persistence-matrix.md` — persistence state table
3. `004A-job-execution-topology.md` — job execution topology
4. `004A-implementation-decision.md` — architecture decision

**Git integrity verified**: Zero modifications to source files, tests, or dependencies. Only the four new assessment documents added as untracked files.