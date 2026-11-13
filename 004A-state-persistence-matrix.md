# TASK 004A — State Persistence Matrix

## Overview

This document maps every important application state mechanism to its storage mechanism, durability, sharing characteristics, and restart safety. Based on static source code inspection of branch `high-008-baseline`, HEAD `17085c83dbb2ed945884d6ac0f530a2e5054e372`.

**Classification key:**
- **Durable** — survives process restart / redeployment
- **Instance-local** — exists only within current process
- **Shared** — accessible across instances
- **Not durable** — lost on restart
- **Cross-tenant** — enforces org boundary

---

## 1. Promise Store

| Field | Value |
|---|---|
| **Component** | `src/lib/promises/store.ts` — `promiseStore` singleton |
| **Storage mechanism** | In-memory `Map<string, PaymentPromise>` + SQLite `repository_snapshots` table (namespace 'promises') |
| **Durable?** | **YES** — `constructor()` calls `readSnapshot('promises')`; `createPromise()` / `updatePromiseStatus()` call `writeSnapshot('promises', ...)` |
| **Shared across instances?** | **NO** — each instance has its own Map and its own SQLite snapshot. No inter-process sync. |
| **Restart-safe?** | **YES** — on restart, `readSnapshot` reloads from SQLite; `writeSnapshot` persists after each mutation. |
| **Cross-tenant enforcement** | `getPromises(orgId, customerId)` **filters by `organization_id`** ✅; `getPromise(id)` does NOT filter by org ❌ (F-007) |
| **Evidence** | `src/lib/promises/store.ts:98` — `this.promises = new Map((state?.promises || []).map((promise) => [promise.id, promise]));` <br> `src/lib/promises/store.ts:45` — `writeSnapshot('promises', ...)` <br> `src/lib/promises/store.ts:72` — `getPromises(orgId, customerId)` filters by `p.organization_id === orgId` |

---

## 2. Execution Store

| Field | Value |
|---|---|
| **Component** | `src/lib/execution/store.ts` — `executionStore` singleton |
| **Storage mechanism** | In-memory `Map<string, ExecutionRecord>` + SQLite `repository_snapshots` + operational repository (`readExecutions`/`insertExecution`/`updateExecution`) |
| **Durable?** | **YES** — constructor calls `reloadFromDurableState()` → `readExecutions()` from operational DB; `updateState()` uses `withWriteTransaction` which `COMMIT`s to SQLite |
| **Shared across instances?** | **NO** — each instance reloads its own Map from its own SQLite operational repository. |
| **Restart-safe?** | **YES** — `reloadFromDurableState()` re-reads from SQLite on startup; `withWriteTransaction` ensures atomic persistence. |
| **Cross-tenant enforcement** | `getAll(orgId)` **filters by `organization_id`** ✅; `getByIdempotencyKey(orgId, key)` also filters ✅ |
| **Evidence** | `src/lib/execution/store.ts:22` — `backfillOperationalFromSnapshots()` + `this.reloadFromDurableState()` <br> `src/lib/execution/store.ts:57` — `this.getByIdempotencyKey()` checks `exec.organization_id === orgId` <br> `src/lib/execution/store.ts:87` — `getAll(orgId)` filters `exec.organization_id === orgId` |

---

## 3. Report Scheduler Store

| Field | Value |
|---|---|
| **Component** | `src/lib/reports/scheduler.ts` — `reportSchedulerStore` singleton |
| **Storage mechanism** | **In-memory `Map<string, ReportScheduleRecord>` ONLY** — **NO durable backing store** |
| **Durable?** | **NO** — Zero durability. `clearAll()` only clears the in-memory Map. No `readSnapshot`/`writeSnapshot`. On process restart, ALL schedules are lost. |
| **Shared across instances?** | **N/A** — since it is not durable, there is no shared state. Each instance has its own Map. |
| **Restart-safe?** | **NO** — critical finding (F-003). All scheduled reports lost on process restart; no recovery mechanism. |
| **Cross-tenant enforcement** | `getSchedules(orgId)` **filters by `organization_id`** ✅; `getSchedule(id)` does NOT filter by org ❌ (F-008) |
| **Evidence** | `src/lib/reports/scheduler.ts:11` — `private schedules: Map<string, ReportScheduleRecord> = new Map();` <br> `src/lib/reports/scheduler.ts:77` — `getSchedule(id)` returns `this.schedules.get(id)` — **no org filter** <br> `src/lib/reports/scheduler.ts:65` — `getSchedules(orgId)` filters `s.organization_id === orgId` |

**Critical recommendation:** Migrate ReportSchedulerStore to use SQLite `repository_snapshots` pattern (same as PromiseStore) for durable persistence.

---

## 4. UDM (Universal Data Store)

| Field | Value |
|---|---|
| **Component** | `src/lib/udm/store.ts` — `UniversalDataStore` class |
| **Storage mechanism** | **Dual-layer:** <br>1. In-memory `Map` collections (customers, invoices, payments, etc.) <br>2. SQLite relational tables (`udm_*` via `src/lib/db/relational-repository.ts`) <br>3. Legacy JSON snapshot (`repository_snapshots` namespace 'udm') |
| **Durable?** | **YES** (relational tables) — `readUdmRelationalState()` reads from PostgreSQL-synchronized SQLite; `persist()` writes relational delta. <br>**PARTIAL** (legacy snapshot) — one-time migration; deleted after successful migration. |
| **Shared across instances?** | **PARTIALLY** — Relational state in Supabase PostgreSQL is shared, but each process has its own in-memory cache. `reloadFromDurableState()` reloads from SQLite relational tables before answering reads. |
| **Restart-safe?** | **YES** — constructor calls `reloadFromDurableState(true)` which reads from SQLite. Writes go through `withWriteTransaction()` → `COMMIT` to SQLite. |
| **Cross-tenant enforcement** | **YES** — Almost all read methods filter by `getRequestTenant()` (AsyncLocalStorage org context). Write methods call `assertWriteTenant(organizationId)` which validates `getRequestTenant() === organizationId`. |
| **Evidence** | `src/lib/udm/store.ts:107` — `private reloadFromDurableState(force = false)` <br> `src/lib/udm/store.ts:281` — `runWrite()` calls `reloadFromDurableState(true)` then mutation then `persist()` <br> `src/lib/udm/store.ts:657` — `assertWriteTenant()` checks `getRequestTenant() !== organizationId` throws <br> `src/lib/udm/store.ts:791` — `getInvoices()`: `const orgId = getRequestTenant(); ... filter((i) => i.organization_id === orgId)` |

---

## 5. Agent Invocation Logs

| Field | Value |
|---|---|
| **Component** | `src/lib/agents/executor.ts` — `AgentExecutorRegistry.logInvocation()` |
| **Storage mechanism** | SQLite `repository_snapshots` table (namespace 'agent_invocation_logs') |
| **Durable?** | **YES** — `logInvocation()` calls `writeSnapshot('agent_invocation_logs', this.logs)`; constructor reads via `readSnapshot<AgentInvocationLog[]>('agent_invocation_logs')` |
| **Shared across instances?** | **NO** — each instance has its own Map and its own SQLite snapshot. Bounded history (slices at 10000 entries). |
| **Restart-safe?** | **YES** — `readSnapshot` on startup restores from SQLite; writes persist after each addition. |
| **Cross-tenant enforcement** | `getLogs(orgId)` **filters by `organizationId`** ✅ |
| **Evidence** | `src/lib/agents/executor.ts:24` — `this.logs.push(log)` + `writeSnapshot('agent_invocation_logs', this.logs)` <br> `src/lib/agents/executor.ts:31` — `getLogs(orgId)` filters `l.organizationId === orgId` <br> `src/lib/agents/executor.ts:28-30` — constructor: `readSnapshot<AgentInvocationLog[]>('agent_invocation_logs')` |

---

## 6. Policy Rules & Rate-Limit Counters

| Field | Value |
|---|---|
| **Component** | `src/lib/agents/policy-engine.ts` — `PolicyEngine` class |
| **Storage mechanism** | SQLite `repository_snapshots` table (namespaces 'policy_rules' and 'rate_limit_counters') |
| **Durable?** | **YES** — `constructor()` reads persisted `PolicyRule[]` and `Map<string, {count, windowStart}>`, persisting after mutations. |
| **Shared across instances?** | **NO** — per-instance Maps and snapshots; no cross-process sync. |
| **Restart-safe?** | **YES** — rules and counters reloaded from SQLite on startup. |
| **Cross-tenant enforcement** | Rules have `organizationId` field (`'*'` = global); rate-limit counters keyed by `${orgId}:${agentName}` |
| **Evidence** | `src/lib/agents/policy-engine.ts:55` — `persistedRules = readSnapshot<PolicyRule[]>('policy_rules')` <br> `src/lib/agents/policy-engine.ts:42-48` — `loadRateLimitCounters()` / `persistRateLimitCounters()` <br> `src/lib/agents/policy-engine.ts:85` — `setPolicyRule()` calls `persistRules()` → `writeSnapshot('policy_rules', ...)` |

---

## 7. SafetyMiddleware Recent Action Hashes

| Field | Value |
|---|---|
| **Component** | `src/lib/agents/safety-middleware.ts` — `SafetyMiddlewareEngine.recentActionHashes` |
| **Storage mechanism** | **In-memory `Map<string, number>` ONLY** — **NO durable backing store** |
| **Durable?** | **NO** — pure in-memory process-local state. Lost on process restart. |
| **Shared across instances?** | **NO** — each instance has its own Map. |
| **Restart-safe?** | **NO** — cleared on process restart; no recovery. |
| **Cross-tenant enforcement** | Key format: `${organizationId}:${agentName}:${targetEntity}:${targetId}:${actionType}` — org included but not enforced across instances. |
| **Evidence** | `src/lib/agents/safety-middleware.ts:117` — `private recentActionHashes: Map<string, number> = new Map();` <br> `src/lib/agents/safety-middleware.ts:137` — `checkDoubleExecution()`: key = `${context.organizationId}:...` <br> `src/lib/agents/safety-middleware.ts:144-150` — 5-second window: `now - lastExecuted < 5000` |

**Critical recommendation:** Either (a) persist this to SQLite for cross-instance idempotency, or (b) replace with database-level lease/claim mechanism.

---

## 8. Credit Note Allocations (In-Memory Tracking)

| Field | Value |
|---|---|
| **Component** | `src/lib/udm/store.ts` — `creditAllocations` Map within `UniversalDataStore` |
| **Storage mechanism** | In-memory `Map<string, CreditNoteAllocation>` — part of UDM state that is snapshot/relational-backed |
| **Durable?** | **YES** (indirectly) — `creditAllocations` are included in `captureState()` → `persist()` → `writeUdmRelationalDelta()` → writes to `udm_credit_allocations` SQL table. Reads via `reloadFromDurableState()` restore from SQLite. |
| **Shared across instances?** | **PARTIALLY** — shared via Supabase PostgreSQL relational tables; each process has in-memory cache that reloads on read. |
| **Restart-safe?** | **YES** — relational tables are authoritative; in-memory cache refreshes on startup. |
| **Cross-tenant enforcement** | `getCreditAllocations()` filters by `getRequestTenant()` and `organization_id` ✅ |
| **Evidence** | `src/lib/udm/store.ts:972` — `getCreditAllocations()`: `filter((a) => a.organization_id === orgId)` <br> `src/lib/udm/store.ts:682` — `insertCreditAllocationInternal()`: `this.assertWriteTenant(data.organization_id)` |

---

## 9. API Idempotency Keys

| Field | Value |
|---|---|
| **Component** | `src/lib/udm/store.ts` — `apiIdempotencyKeys` Map + `udm_api_idempotency_keys` SQL table |
| **Storage mechanism** | **Dual:** In-memory `Map` + SQLite `udm_api_idempotency_keys` relational table |
| **Durable?** | **YES** — `persist()` writes to `udm_api_idempotency_keys`; `checkAndReserveApiIdempotency()` / `finalizeApiIdempotency()` / `releaseApiIdempotency()` all go through `runWrite()` → `persist()`. |
| **Shared across instances?** | **PARTIALLY** — shared via SQL table; in-memory cache per-instance with `reloadFromDurableState()` refresh. |
| **Restart-safe?** | **YES** — SQL table is authoritative; map rebuilds on startup. |
| **Cross-tenant enforcement** | Keys keyed by `${orgId}:${endpoint}:${key}`; access controlled by `assertWriteTenant()` in write paths. |
| **Evidence** | `src/lib/udm/store.ts:124` — `checkAndReserveApiIdempotency()` uses `withWriteTransaction()` → `persist()` <br> `src/lib/udm/store.ts:168` — `finalizeApiIdempotency()` same pattern <br> SQL table `udm_api_idempotency_keys` with `PRIMARY KEY (organization_id, endpoint, key)` |

---

## 10. Exceptions

| Field | Value |
|---|---|
| **Component** | `src/lib/udm/store.ts` — `exceptions` Map within `UniversalDataStore` |
| **Storage mechanism** | **Dual:** In-memory `Map` + SQLite `udm_exceptions` relational table |
| **Durable?** | **YES** — same dual-layer as all UDM; `persist()` → `writeUdmRelationalDelta()` → `udm_exceptions` table. |
| **Shared across instances?** | **PARTIALLY** — via SQL relational tables; in-memory cache per-instance. |
| **Restart-safe?** | **YES** — relational tables are authoritative. |
| **Cross-tenant enforcement** | `getExceptions()` filters by `getRequestTenant()` and `organization_id` ✅ |
| **Evidence** | `src/lib/udm/store.ts:1127` — `getExceptions()` filter pattern <br> `src/lib/udm/store.ts:248` — Schema has `organization_id TEXT NOT NULL` with index `idx_udm_exceptions_org_status` |

---

## 11. Bank Transactions

| Field | Value |
|---|---|
| **Component** | `src/lib/udm/store.ts` — `bankTransactions` Map within `UniversalDataStore` |
| **Storage mechanism** | **Dual:** In-memory `Map` + SQLite `udm_bank_transactions` relational table |
| **Durable?** | **YES** — same dual-layer persistence. |
| **Shared across instances?** | **PARTIALLY** — via SQL; in-memory cache per-instance. |
| **Restart-safe?** | **YES** — relational authoritative. |
| **Cross-tenant enforcement** | `getBankTransactions()` filters by `getRequestTenant()` and `organization_id` ✅ |
| **Evidence** | `src/lib/udm/store.ts:1169` — `getBankTransactions()` org filter |

---

## 12. idempotencyKeys (Relational)

| Field | Value |
|---|---|
| **Component** | `src/lib/udm/store.ts` — `idempotencyKeys` Map + `udm_idempotency_keys` SQL table |
| **Storage mechanism** | **Dual:** In-memory `Map<string, string>` (keyed by `orgId:key`) + `udm_idempotency_keys` table |
| **Durable?** | **YES** — same dual-layer; `persist()` → `writeUdmRelationalDelta()` or `writeUdmRelationalState()`. |
| **Shared across instances?** | **PARTIALLY** — via SQL; in-memory per-instance refresh. |
| **Restart-safe?** | **YES** — SQL authoritative. |
| **Cross-tenant enforcement** | Keys stored with `organization_id`; FK constraints ensure referential integrity. |
| **Evidence** | `src/lib/udm/store.ts:55` — `uniqueIds` validation in `validateState()` checks `knownIds` includes idempotency record_ids <br> SQL schema: `PRIMARY KEY (organization_id, key)` |

---

## 13. Summary Matrix

| Component | Durable? | Shared? | Restart-Safe? | Cross-Tenant |
|-----------|----------|---------|---------------|--------------|
| PromiseStore | ✅ Yes | ❌ No | ✅ Yes | ⚠️ `getPromises(orgId)` ✅; `getPromise(id)` ❌ |
| ExecutionStore | ✅ Yes | ❌ No | ✅ Yes | ✅ Org-filtered |
| ReportSchedulerStore | ❌ **No** | N/A | ❌ **No** | ✅ `getSchedules(orgId)` ✅; `getSchedule(id)` ❌ |
| UDM Store | ✅ Yes (relational) | ⚠️ Partial | ✅ Yes | ✅ Mostly filtered |
| Agent Invocation Logs | ✅ Yes | ❌ No | ✅ Yes | ✅ `getLogs(orgId)` ✅ |
| Policy Rules & Counters | ✅ Yes | ❌ No | ✅ Yes | ✅ `organizationId` field |
| SafetyMiddleware `recentActionHashes` | ❌ **No** | ❌ No | ❌ **No** | ⚠️ Org in key but process-local |
| Credit Allocations | ✅ Yes | ⚠️ Partial | ✅ Yes | ✅ Filtered |
| API Idempotency Keys | ✅ Yes | ⚠️ Partial | ✅ Yes | ✅ `organization_id` bound |
| Exceptions | ✅ Yes | ⚠️ Partial | ✅ Yes | ✅ Filtered |
| Bank Transactions | ✅ Yes | ⚠️ Partial | ✅ Yes | ✅ Filtered |
| idempotencyKeys (relational) | ✅ Yes | ⚠️ Partial | ✅ Yes | ✅ `organization_id` bound |

**Key takeaways:**
- **ReportSchedulerStore** and **SafetyMiddleware `recentActionHashes`** are the only major state stores without durable backup
- Most UDM state, policy rules, and relational idempotency are durable via SQLite + relational tables
- Cross-tenant enforcement varies: most reads/writes filter by org, but `getPromise(id)` and `getSchedule(id)` do NOT
- Instance-local state (Maps) is never shared across Vercel function executions without explicit re-loading from SQLite

---

## 14. Required Actions for Durability

1. **Migrate ReportSchedulerStore** to SQLite-backed persistence (use `repository_snapshots` pattern from PromiseStore)
2. **Persist SafetyMiddleware `recentActionHashes`** to SQLite for cross-instance idempotency, OR replace with DB-level lease mechanism
3. **Fix `getPromise(id)` org filtering** gap (F-007) — add `organization_id` check
4. **Fix `getSchedule(id)` org filtering** gap (F-008) — add `organization_id` check

**Only new repository file**: `004A-state-persistence-matrix.md`