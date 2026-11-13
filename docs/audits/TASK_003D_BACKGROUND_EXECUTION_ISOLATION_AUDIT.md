# TASK 003D — BACKGROUND EXECUTION, JOB LIFECYCLE & TENANT ISOLATION FORENSIC AUDIT

## 1. Executive Summary

This forensic audit examines the background execution, job scheduling, asynchronous processing, execution isolation, concurrency, failure recovery, and tenant isolation mechanisms in the AIOSpark AR Automation Revenue repository (`AIOSpark/AR-automation-revenue`, branch `high-008-baseline`, HEAD `17085c83dbb2ed945884d6ac0f530a2e5054e372`).

**Overall Assessment**: The repository implements background execution mechanisms with partial verification for tenant isolation and concurrency protections. The confirmed report-scheduler durability defect and process-local coordination gaps are reliability risks; potential direct-ID lookup risks and timeout behavior remain unverified at the caller/provider level. The audit is a source-based assessment and does not claim behavioral exploitation where no production caller or runtime test was demonstrated.

**Principal Findings**:
- HIGH reliability: ReportSchedulerStore has no durable persistence; schedule state is lost on process restart.
- HIGH reliability: ReportSchedulerStore has no atomic cross-worker claim/lease; duplicate processing is possible if multiple workers invoke it.
- MEDIUM concurrency: PromiseCheckJob payment claims and agent double-execution tracking are process-local.
- MEDIUM/NOT_VERIFIED: Agent timeout cancellation depends on signal propagation and provider behavior; the inspected provider path accepts AbortSignal, but all agent callbacks do not demonstrably propagate it.
- LOW/NOT_VERIFIED: Direct-ID store methods are unsafe primitives, but no production caller for `getPromise(id)` or `getSchedule(id)` was found in the inspected source.
- MEDIUM/NOT_VERIFIED: No repository-level dead-letter mechanism was observed; this does not prove that no external recovery mechanism exists.

**High Findings**:
- Historical evidence: prior audit documentation reports 8/8 same-process read tests passing when organization context is present; no read tests were executed during Task 003D
- Cross-tenant write enforcement not behaviorally verified
- AgentExecutor AbortController-based timeout does not guarantee cancellation of underlying work
- Promise status changes followed by Collections Agent invocation have no atomic claim mechanism
- Report schedule state not durable; `last_run_at` and `updated_at` are updated only in memory, while `next_run_at` is not recalculated and no due-time check is performed

**Verified Protections**:
- UDM `assertWriteTenant()` enforces organization ownership on writes within the same process
- UDM reads filter by organization_id from ActiveAsyncLocalStorage context
- Promise store filters promises by organization_id
- Report scheduler filters schedules by organization_id
- Idempotency keys in UDM store provide some deduplication (process-local)
- SafetyMiddlewareEngine checkDoubleExecution provides 5-second within-process deduplication

**Unverified Protections**:
- Cross-tenant isolation under process restarts or separate worker processes
- Durable job state survival across restarts
- Actual production scheduler trigger configuration
- Timeout cancellation propagating to LLM provider operations
- Recovery behavior after process crash mid-execution

---

## 2. Repository Baseline

| Property | Value |
|---|---|
| Repository | `AIOSpark/AR-automation-revenue` |
| Target branch | `high-008-baseline` |
| Confirmed HEAD | `17085c83dbb2ed945884d6ac0f530a2e5054e372` |
| Working tree state | No tracked-file modifications; this audit report is an untracked deliverable alongside pre-existing untracked audit documents |
| Audit date | 2026-11-12 |
| Audit scope | Background execution, job lifecycle, tenant isolation |
| Verification methodology | Static source code inspection; executed safe tests where available; no runtime behavior verification outside in-process event loop |

---

## 3. Background Execution Inventory

### Discovered Mechanisms

| Mechanism ID | Name | Source File | Entry Function | Trigger | Execution Mode | Tenant Identity | Persistence | Retry | Concurrency Protection | Recovery |
|---|---|---|---|---|---|---|---|---|---|---|
| BG-001 | PromiseCheckJob.runDailyCheck() | `src/lib/promises/job.ts:21` | `PromiseCheckJob.runDailyCheck(orgId, todayStr)` | Daily scheduled job (manual API call `src/app/api/promises/route.ts:POST`) | Synchronous function with async operations; iterates over promises in-process | `udmStore.setTenantContext(orgId)` at job start (line 5) | In-memory Map + SQLite snapshot via `writeSnapshot('promises')` | Absent — no retry logic on individual promise evaluation | Invocation-local `claimedPaymentIds` Set (no cross-process protection) | None — if process crashes mid-way, snapshot may be inconsistent; `runWrite()` transaction rolls back |
| BG-002 | ReportScheduler.runScheduledReportsJob() | `src/lib/reports/scheduler.ts:81` | `ReportSchedulerStore.runScheduledReportsJob(orgId, forceRunScheduleId)` | API route `src/app/api/reports/route.ts:POST action=run_schedules_job`; no cron/scheduler found in repository | Synchronous-async hybrid; iterates schedules, generates reports, sends emails | `udmStore.setTenantContext(orgId)` called by caller; not inside job | In-memory Map only — **NO durable persistence** (schedules lost on restart) | Absent — no retry logic for email delivery failures | None — multiple workers can process same schedules; no atomic claim | None — if email fails for some recipients, others still sent; no partial delivery tracking |
| BG-003 | AgentExecutor.run() | `src/lib/agents/executor.ts:121` | `AgentExecutor.run(agentName, organizationId, input, agentLogicFn)` | API route invocation; also called from `collections-agent.ts:runCollectionsAgent()` | Synchronous-async hybrid; 8-step safety pipeline with timeouts | organizationId passed as explicit parameter; AsyncLocalStorage may be active from request context | In-memory logs (durable-saved via `writeSnapshot('agent_invocation_logs')`) | Retry logic with `maxRetries || 2`; `AbortController` for timeout (5s) | `SafetyMiddlewareEngine.checkDoubleExecution()` 5-second window (process-local) | AbortController timeout may not cancel underlying LLM work; timeout track not durable |
| BG-004 | SafetyMiddlewareEngine.checkDoubleExecution() | `src/lib/agents/safety-middleware.ts:137` | `checkDoubleExecution(context)` | Called within `AgentExecutor.run()` Step 5 (double-click protection) | Synchronous; Map-based recent action tracker | organizationId from context | In-memory Map only — process-local | Absent — no persistent tracking | 5-second window: `if (lastExecuted && now - lastExecuted < 5000)` | None — Map cleared on process restart; no cross-process lease |

### Test-Only Workers (Not Production Infrastructure)

| Mechanism ID | Name | Source File | Notes |
|---|---|---|---|
| BG-005 | Various test executors | `src/lib/promises/__tests__/promises.test.ts` | Test invokes `PromiseCheckJob.runDailyCheck()` — not production infrastructure |
| BG-006 | Agent concurrency tests | `src/lib/agents/__tests__/orchestration.test.ts` | Tests AgentExecutor behavior — not production infrastructure |
| BG-007 | Report scheduler tests | `src/lib/reports/__tests__/reports.test.ts` | Tests `runScheduledReportsJob()` — not production infrastructure |

**Actual production entrypoints**: BG-001, BG-002, BG-003 (invoked via API routes, not cron scheduling within the repository)

**Trigger mechanisms**:
- BG-001: Manual API invocation via `POST /api/promises` — no cron/scheduler configuration in repository
- BG-002: Manual API invocation via `POST /api/reports` with `action=run_schedules_job` — no cron/scheduler configuration in repository
- BG-003: API route invocation via `POST /api/agents` or `POST /api/agents/[agentId]` — no cron/scheduler configuration in repository

**No production worker registration or scheduled trigger found** in repository configuration. All background mechanisms are triggered manually via API endpoints. External hosting configuration (cron, CI/CD) was not inspected and remains `NOT_VERIFIED`.

---

## 4. Tenant Context Propagation

### AsyncLocalStorage Implementation

The repository uses `node:async_hooks` AsyncLocalStorage for tenant context propagation:

- `src/lib/tenant/request-context.ts`: `setRequestTenant(orgId)` calls `getTenantStorage().enterWith(orgId)`; `getRequestTenant()` calls `getTenantStorage().getStore()`; `runWithTenant(orgId, callback)` calls `getTenantStorage().run(orgId, callback)`
- `src/lib/udm/store.ts`: `setTenantContext(orgId)` calls `setRequestTenant(orgId)`; `getRequestTenant()` calls `getRequestTenant()`

### Context Establishment

| Workflow | Tenant Source | Context Establishment | Scoped Execution | Async Propagation | Result |
|---|---|---|---|---|---|
| API request (resolveTenantContext) | `resolveTenantContext(request)` → `context.organization.id` | ✅ Established at API boundary via middleware `src/lib/tenant/middleware.ts:37` → `tenantStore.setSessionTenantContext(organization.id)` | ✅ Active for duration of request handler | ✅ Propagated to UDM store calls within same request (`udmStore.getInvoices()`, `udmStore.getPayments()`, etc.) | **SAME PROCESS** — context is AsyncLocalStorage-bound; not propagated across processes |
| PromiseCheckJob.runDailyCheck() | `udmStore.setTenantContext(orgId)` at line 5 of `job.ts` | ✅ Explicitly set at job start | ⚠️ Scoped to job invocation only; no AsyncLocalStorage propagation into nested `runCollectionsAgent()` calls | ⚠️ `runCollectionsAgent()` calls `udmStore.setTenantContext(params.organizationId)` — re-establishes context, but is a separate establishment point | **SAFE within process** — context re-established at each entry point |
| AgentExecutor.run() | `organizationId` passed as explicit parameter | ✅ Explicit parameter + possible AsyncLocalStorage from request context | ✅ Safety pipeline steps use `pipelineCtx.organizationId` from parameter | ✅ AbortSignal propagated to `agentLogicFn` via `signal?: AbortSignal` parameter | **SAFE** — organizationId is explicit parameter, not relying on AsyncLocalStorage inheritance |
| Collections Agent runCollectionsAgent() | `input.organizationId` passed as parameter | ✅ Explicit parameter | ✅ Within AgentExecutor.run() which establishes its own pipelineCtx | ✅ AbortSignal passed through to underlying logic | **SAFE** — organizationId is explicit parameter |
| Report scheduler runScheduledReportsJob() | `orgId` passed as parameter | ✅ Explicit parameter | ✅ Within job function | ⚠️ No AsyncLocalStorage usage; context is parameter-passed only | **SAFE** — explicit parameter passing, no AsyncLocalStorage dependency |
| UDM write operations (insertInvoice, etc.) | `assertWriteTenant(data.organization_id)` | ✅ `assertWriteTenant()` checks `getRequestTenant()` matches | ✅ Only within durable write scope (`runWrite()`) | ⚠️ Fails if no ActiveAsyncLocalStorage context (`getRequestTenant()` returns null) | **CONDITIONAL** — requires ActiveAsyncLocalStorage context; fails closed when missing |

### Critical Observations on AsyncLocalStorage Propagation

1. **AsyncLocalStorage `enterWith()` vs `run()`**: The implementation uses `enterWith()` in `setRequestTenant()` which enters the context but does not return a cleanup handle. The `run()` method properly wraps the callback with entry/exit. Mixed usage could cause context leaks.

2. **Context inheritance across asynchronous operations**: AsyncLocalStorage normally propagates context to asynchronous resources created while the context is active, including `await`, promises, and timers. Request completion alone does not cause those resources to lose context. Context may be absent when a callback is created or invoked outside the context, explicitly detached, or executed in another process or worker.

3. **Context restoration after execution**: When `runWithTenant(orgId, callback)` completes, the original context is restored. However, if `setRequestTenant(orgId)` is called without `runWithTenant()`, the context persists until explicitly changed — this can lead to accidental context carryover between independent operations.

4. **Can an asynchronous callback execute with an incorrect or missing tenant context?**: YES, but not merely because the originating request completed. A callback created outside the tenant context, explicitly detached from it, or run in another process may observe `getRequestTenant()` as `null`; incorrect context can also result from `enterWith()` carryover or an explicit overwrite. The PromiseCheckJob explicitly sets context at start, and `runCollectionsAgent()` re-establishes it at its own entry point. Detached-callback behavior was not runtime-tested.

5. **Can nested operations accidentally inherit a previous tenant context?**: YES. If `setRequestTenant(orgA)` is called, then an async operation runs that inadvertently calls another function that also calls `setRequestTenant(orgA)` (or relies on inherited AsyncLocalStorage), the nested operation will see orgA even if it should see orgB. The explicit `runWithTenant()` pattern mitigates this, but `enterWith()`-only usage does not automatically restore the previous context on exit.

6. **What happens when organization ID is null, missing, invalid, or changed?**: 
   - `getRequestTenant()` returns `null` when no AsyncLocalStorage context is active
   - `udmStore.getInvoices()` returns `[]` when `!orgId` (line 74-76 of store.ts)
   - `udmStore.assertWriteTenant()` throws `'UDM write denied outside the active organization context'` when active tenant ≠ requested organization
   - UDM reads fail-closed (return empty array) when context is missing
   - UDM writes fail-closed (throw error) when context is missing or mismatched

7. **Does execution fail closed when tenant context is missing?**: 
   - UDM reads: ✅ Fail-closed (return `[]`)
   - UDM writes: ✅ Fail-closed (throw error via `assertWriteTenant()`)
   - Promise store: `getPromises(orgId)` filters by orgId — returns `[]` when orgId doesn't match any promises
   - Report scheduler: `getSchedules(orgId)` filters by orgId — returns `[]` when orgId doesn't match

8. **Are reads and writes both tenant-isolated?**: 
   - ✅ Reads: UDM `getInvoices()`, `getPayments()`, etc. all filter by `getRequestTenant()` 
   - ✅ Writes: UDM `assertWriteTenant()` enforces organization ownership before any write
   - ✅ Promise store: `getPromises(orgId)` filters by organization_id
   - ✅ Report scheduler: `getSchedules(orgId)` filters by organization_id
   - However: All of the above depend on ActiveAsyncLocalStorage context being present. If context is missing, reads return empty and writes throw — which is fail-closed behavior, but may not be the intended behavior in all contexts.

### Tenant-Context Propagation Matrix (Summary)

| Workflow | Tenant source | Context establishment | Scoped execution | Async propagation | Result |
|---|---|---|---|---|---|
| API request handler | `resolveTenantContext()` middleware | ✅ At request boundary | ✅ For request duration | ✅ Through UDM store calls | **VERIFIED** — same process only |
| PromiseCheckJob.runDailyCheck() | `udmStore.setTenantContext(orgId)` at start | ✅ Explicit at job start | ✅ Within job function | ✅ Normal async resources inherit the active context; `runCollectionsAgent()` explicitly re-establishes it at its own entry point | **PARTIALLY_VERIFIED** — explicit setting and re-establishment observed; detached callbacks and cross-process behavior were not tested |
| AgentExecutor.run() | `organizationId` explicit parameter | ✅ Passed as parameter | ✅ Within pipelineCtx | ✅ AbortSignal propagated | **VERIFIED** — explicit parameter |
| Collections Agent | `input.organizationId` parameter | ✅ Passed as parameter | ✅ Within AgentExecutor | ✅ AbortSignal propagated | **VERIFIED** — explicit parameter |
| Report scheduler job | `orgId` parameter | ✅ Passed as parameter | ✅ Within job function | ❌ No AsyncLocalStorage usage | **VERIFIED** — explicit parameter |
| UDM writes | `assertWriteTenant()` | ✅ Checks `getRequestTenant()` | ✅ Within `runWrite()` scope | ⚠️ Fails if no active context | **CONDITIONAL** — fails closed when missing |

---

## 5. Cross-Tenant Isolation

### UDM Read/Write Enforcement

| Storage Mechanism | Organization ID Present? | Reads Enforce Ownership? | Writes Enforce Ownership? | Updates Verify Ownership? | Deletes Verify Ownership? | Job Execution Verify Ownership? |
|---|---|---|---|---|---|---|
| UDM `invoices` Map | ✅ Yes, `organization_id` field on each record | ✅ `getInvoices()` filters by `getRequestTenant()` (line 74-78) | ✅ `assertWriteTenant()` checks match (line 227-232) | ✅ `updateInvoiceInternal()` checks `existing.organization_id !== tenantId` (line 231-234) | ✅ `updateExceptionInternal()` checks organization match (line 375-378) | N/A — UDM methods |
| UDM `payments` Map | ✅ Yes, `organization_id` field on each record | ✅ `getPayments()` filters by `getRequestTenant()` (line 141-145) | ✅ `assertWriteTenant()` checks match (line 227-232) | ✅ `insertPaymentInternal()` checks `assertWriteTenant(data.organization_id)` (line 111-115) | N/A | N/A |
| UDM `exceptions` Map | ✅ Yes, `organization_id` field on each record | ✅ `getExceptions()` filters by `getRequestTenant()` (line ~line 460) | ✅ `assertWriteTenant()` checks match (line ~line 480) | ✅ `updateExceptionInternal()` checks `existing.organization_id !== tenantId` | ✅ Same as update | N/A |
| Promise store | ✅ Yes, `organization_id` field on each promise | ✅ `getPromises(orgId)` filters by orgId (line 92-96) | N/A — no write in promise store without explicit org filtering | N/A | N/A | ✅ `runDailyCheck()` receives `orgId` and filters accordingly |
| Report scheduler | ✅ Yes, `organization_id` field on each schedule record | ✅ `getSchedules(orgId)` filters by orgId (line 52-54) | N/A — createSchedule sets orgId from input | N/A | N/A | ✅ `runScheduledReportsJob(orgId)` filters by orgId |

### Direct ID Lookup Behavior (Potential Risk; No Exploit Demonstrated)

**INSPECTION RESULT**: Several methods accept an organization ID as a parameter or rely on tenant context but do NOT validate ownership of the referenced record independently.

| Method | Parameter/Context | Actual Behavior | Risk |
|---|---|---|---|
| `udmStore.getInvoices()` | orgId from `getRequestTenant()` | ✅ Filters by orgId | **Low** — standard filter |
| `udmStore.getPayments()` | orgId from `getRequestTenant()` | ✅ Filters by orgId | **Low** — standard filter |
| `udmStore.getMatches()` | orgId from `getRequestTenant()` | ✅ Filters by orgId | **Low** — standard filter |
| `udmStore.getContacts(customerId)` | orgId from `getRequestTenant()` | ✅ Filters by orgId + customerId | **Low** — standard filter |
| `udmStore.getCustomers()` | orgId from `getRequestTenant()` | ✅ Filters by orgId | **Low** — standard filter |
| `udmStore.getException(id)` | — **NOT INSPECTED** — need to check | ⚠️ Not verified — may not filter by orgId | **NOT_VERIFIED** |
| `udmStore.getDispute(id)` | — **NOT INSPECTED** — need to check | ⚠️ Not verified — may not filter by orgId | **NOT_VERIFIED** |
| `udmStore.getDisputeEvidence(id)` | — **NOT INSPECTED** — need to check | ⚠️ Not verified — may not filter by orgId | **NOT_VERIFIED** |
| `promiseStore.getPromise(id)` | orgId not parameter — uses `this.promises` Map | ⚠️ Unscoped primitive; no production caller exposing it was found | **LOW / NOT_VERIFIED** — future caller could omit ownership check |
| `reportSchedulerStore.getSchedule(id)` | — not org-filtered in method signature | ⚠️ Unscoped primitive; no caller was found in `src/` | **LOW / NOT_VERIFIED** — future caller could omit ownership check |
| `AgentExecutor.getLogs(orgId?)` | orgId optional filter | ✅ If orgId provided, filters logs by orgId | **Low** — optional filter |

### Direct-ID Caller Trace

Source tracing found no demonstrated production cross-tenant access path for these primitives:

1. **`promiseStore.getPromise(id)`** (`src/lib/promises/store.ts:92-95`): returns from the Map by ID only. The only caller found under `src/` is the promise test at `src/lib/promises/__tests__/promises.test.ts:162`; no production caller was found.

2. **`reportSchedulerStore.getSchedule(id)`** (`src/lib/reports/scheduler.ts:69-71`): returns from the Map by ID only. No caller was found under `src/`; the reports route uses organization-filtered schedule lists and passes a schedule ID only as a job selector.

3. **`udmStore.getException(id)`**: Not fully inspected — potential similar gap

4. **`udmStore.getDispute(id)`**: Not fully inspected — potential similar gap

5. **`udmStore.getDisputeEvidence(id)`**: Not fully inspected — potential similar gap

### Read/Write Isolation Summary

- ✅ **Tenant-filtered reads** (getInvoices, getPayments, getMatches, getCustomers, getPromises, getSchedules) all filter by organization_id from ActiveAsyncLocalStorage context — **VERIFIED**
- ✅ **Tenant-enforced writes** (assertWriteTenant in insert/update methods) all check organization ownership — **VERIFIED**
- ✅ **Job execution** (PromiseCheckJob.runDailyCheck, AgentExecutor.run) receive orgId as parameter and filter accordingly — **VERIFIED**
- ⚠️ **Direct ID lookups** (getPromise, getSchedule, getException, getDispute, getDisputeEvidence) may bypass tenant filtering — **NOT_VERIFIED** (requires further inspection)
- ✅ **UDM update/delete** all verify organization ownership from active context — **VERIFIED**
- ❓ **Cross-process isolation** — whether another process with different tenant context can access records — **NOT_VERIFIED** (AsyncLocalStorage is process-local; SQLite may enforce RLS but application code does not)

### Key Finding: ID-Based Lookups vs Tenant-Filtered Lists

> **Do not infer safety from a tenant-filtered list if a future direct-ID caller bypasses the same filter.**

The existence of `getPromises(orgId)` does not guarantee that `getPromise(id)` also filters. These are independent implementation decisions. In this repository, the direct-ID methods are unscoped primitives, but caller tracing did not identify a production caller that exposes an unauthorized lookup. This remains a **LOW, NOT_VERIFIED future-misuse risk**, not a demonstrated cross-tenant vulnerability.

---

## 6. Job Concurrency and Duplicate Execution

### Concurrency-Risk Table

| Workflow | Concurrent Execution Possible? | Atomic Claim | Idempotency | Cross-Process Protection | Result |
|---|---|---|---|---|---|
| PromiseCheckJob.runDailyCheck() | ✅ YES — no process coordination | ❌ No atomic claim before evaluation | ⚠️ Invocation-local `claimedPaymentIds` Set only | ❌ None — separate processes have independent Sets | **MEDIUM / NOT_VERIFIED** — concurrent evaluation and duplicate processing are possible but were not behaviorally tested |
| ReportScheduler.runScheduledReportsJob() | ✅ YES — no coordination at all | ❌ No atomic claim | ❌ None — email delivery not idempotent | ❌ None — in-memory schedules, no leases or locks | **MEDIUM / NOT_VERIFIED** — duplicate processing is possible if multiple workers invoke it; multi-worker behavior was not tested |
| AgentExecutor.run() | ✅ YES — two processes can invoke simultaneously | ⚠️ `checkDoubleExecution()` has 5s window (process-local) | ✅ Idempotency keys in UDM store (process-local, may not share) | ❌ Map-based tracker is process-local; no distributed lease | **MEDIUM RISK** — 5s window may skip between processes; double-execution possible if two requests arrive ~5s apart; deduplication only within one process |
| SafetyMiddlewareEngine.checkDoubleExecution() | ⚠️ Within-process only | ⚠️ 5-second Map window | ❌ No persistent idempotency | ❌ Map cleared on process restart | **MEDIUM RISK** — protects against double-click within same process; no cross-process protection |

### Promise-Check Job Concurrency Details

**Can two processes evaluate the same pending promise?**
✅ **YES.** The `runDailyCheck()` function iterates over `allPromises = promiseStore.getPromises(orgId)`. The promiseStore's in-memory Map is populated from the SQLite snapshot on construction, but there is no inter-process coordination. Two concurrent invocations will both read the same set of pending promises from SQLite.

**Is there an atomic claim before evaluation?**
❌ **NO.** There is no claim mechanism, lock, or marker set before evaluating a promise. The `claimedPaymentIds` Set is local to one invocation and tracks which payment IDs have been claimed within that single call — it does not prevent another invocation from processing the same promise.

**Can both processes update the same promise?**
✅ **YES.** Both processes can call `promiseStore.updatePromiseStatus(promise.id, status, matchNote)` for the same promise ID. The `persist()` method writes to SQLite, and the last write wins (SQLite `BEGIN IMMEDIATE` handles concurrent writes, but the second writer may overwrite the first's changes if not in the same transaction).

**Can both trigger Collections Agent?**
✅ **YES.** Both processes can successfully invoke `runCollectionsAgent({organizationId, invoiceId})` which calls `AgentExecutor.run('Collections Agent', ...)`. There is no guard preventing multiple Collections Agent triggers for the same broken promise.

**Can payment matching be processed twice?**
✅ **YES.** The `claimedPaymentIds` Set is invocation-local. Two concurrent invocations, including invocations in separate processes, may both find the same matching payment and add its ID to their independent Sets — the SQLite persistence will accept both writes (SQLite serializes writes via `BEGIN IMMEDIATE`, but both transactions can complete if they use different connections). The idempotency key check may or may not prevent this depending on timing.

**Can status updates race?**
✅ **YES.** Two processes updating the same promise's status concurrently may race. The `updatePromiseStatus()` method modifies `p.status` and `p.updated_at` in memory, then calls `this.persist()`. SQLite's `BEGIN IMMEDIATE` serializes writes, so one transaction will commit first and the other will block/abort — but the aborted transaction's in-memory changes are lost, and the retry logic is not implemented in the job code.

**Does the invocation-local `claimedPaymentIds` set protect anything outside one invocation?**
❌ **NO.** The Set is local to one `runDailyCheck()` call. It does not persist to SQLite, is not shared across processes, and has no effect on subsequent invocations.

**Is recovery safe after a process crashes midway?**
⚠️ **PARTIALLY.** SQLite's WAL mode ensures durability — committed transactions survive crashes. However, if a process crashes between evaluating a promise and updating its status, the promise may remain in an inconsistent state. The next `runDailyCheck()` will re-evaluate it, but there's no guarantee of idempotent recovery — the same promise could be evaluated and trigger Collections Agent again if the status wasn't properly updated before the crash.

### Report Scheduler Concurrency Details

**Can multiple workers process the same schedule?**
✅ **YES.** `ReportSchedulerStore.schedules` is an in-memory Map. There is no atomic claim, lease, or lock mechanism. Any worker can call `runScheduledReportsJob(orgId)` and process all schedules.

**Can two schedules have the same ID?**
❌ **No.** Schedule IDs are generated as `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}` — collisions are extremely unlikely but possible.

**Can concurrent calls send duplicate emails?**
✅ **YES.** No mechanism prevents the same schedule from being processed by multiple workers, and each processing sends emails to all recipients. If two workers process the same schedule, each recipient receives two emails.

**Is schedule state durable?**
❌ **NO.** The `ReportSchedulerStore` uses an in-memory Map only (`private schedules: Map<string, ReportScheduleRecord> = new Map()`). There is no persistence to SQLite or any external store. All schedules are lost on process restart.

**Is due-time checking calculated correctly?**
⚠️ **NOT VERIFIED.** The scheduler does not appear to check `next_run_at` against current time before processing — it processes all schedules unconditionally. After processing, only `last_run_at` and `updated_at` are assigned; `next_run_at` is not recalculated, and the assignments are not persisted.

**Are schedule timestamps updated?**
✅ **PARTIALLY.** After processing each schedule, `sched.last_run_at` and `sched.updated_at` are set to `new Date().toISOString()`. `next_run_at` is not recalculated, and none of these changes are persisted. The report does not claim that `next_run_at` is updated.

**Can retries cause duplicate delivery?**
⚠️ **NOT VERIFIED.** There is no retry mechanism in `runScheduledReportsJob()` — if it fails midway, the caller must retry manually, which could cause duplicate delivery.

**Can partial email delivery be tracked correctly?**
❌ **NO.** The code counts `emailsSentCount` but does not track which recipients received emails and which did not within a single run. If the job fails midway through recipient list, some recipients got emails and some did not — no partial tracking.

### Agent Execution Concurrency Details

**Is deduplication process-local or shared?**
⚠️ **Process-local.** `SafetyMiddlewareEngine.checkDoubleExecution()` uses a `recentActionHashes: Map<string, number>` that tracks `organizationId:agentName:targetEntity:targetId:actionType` with timestamps. The 5-second window only protects within the same process. Two different processes can both pass the double-execution check.

**Can two processes bypass deduplication?**
✅ **YES.** If two processes invoke `AgentExecutor.run()` simultaneously with the same organizationId, agentName, targetEntity, targetId, and actionType, both will pass `checkDoubleExecution()` (each has its own Map instance, timestamps are independent).

**Is the five-second window sufficient for the actual workflow?**
❌ **NO.** The 5-second window is likely insufficient if:
- The underlying LLM call takes variable time
- Network latency causes requests to arrive at different times
- Other processes have different system loads
- The actual agent workflow may take seconds to minutes (the AgentExecutor has its own timeout of 5s + retries with 50ms backoff)

**Can retries duplicate side effects?**
⚠️ **CONDITIONAL for non-timeout failures only.** The AgentExecutor may retry eligible non-timeout errors (maxRetries || 2), and each retry creates a new `AbortController` and LLM call. A timeout is rethrown immediately by `runWithTimeout()` and does not enter that retry loop. If an aborted callback does not stop promptly, incomplete cancellation could still leave work in flight, but timeout-triggered retries and duplicate side effects were not established.

**Can an aborted operation continue executing?**
⚠️ **PARTIALLY.** The `AbortController` is passed to `agentLogicFn(input, controller.signal)`. If the signal is aborted (timeout), the `agentLogicFn` should ideally check the signal and stop. However:
- The AbortController is created per-attempt in the retry loop
- The underlying LLM call may or may not honor the AbortSignal
- If the LLM does not honor cancellation, the timeout only stops waiting (`Promise.race`), not the underlying work
- A timeout does not start a retry; if the callback ignores abort, the original underlying work may continue while the caller has already received the timeout error

**Whether an execution can be repeated after restart?**
✅ **YES.** Agent execution logs are durably stored in `agent_invocation_logs` snapshot. After restart, the `AgentExecutorRegistry.getLogs(orgId)` can retrieve them. However, the actual business state (invoices, payments, etc.) may or may not be idempotent depending on the specific agent logic.

### Financial Execution Concurrency

No explicit financial execution background job was found in the repository that sends external side effects (ERP writes, bank transactions, etc.) without going through the SafetyMiddlewareEngine's 8-step pipeline. The `billingStore.recordEvent()` calls are within `runWrite()` transactions. However, the `collections-agent.ts` proposes `SEND_CUSTOMER_COMMUNICATION` actions which route through the approval center — the actual communication send is not inspected in this audit.

---

## 7. Failure Recovery and Retry

### Agent Execution Failure Behavior

The `AgentExecutor.run()` method has the following failure and retry behavior:

**Process crashes mid-execution**:
- The 8-step safety pipeline is not transactional across all steps
- If the process crashes after Step 4 (AI Decision) but before Step 8 (Verification), the invocation log is still recorded (via `agentExecutorRegistry.logInvocation()` which writes to durable snapshot)
- If the process crashes during Step 4's `runWithTimeout()`, the `AbortController` may or may not have fired yet
- **Result**: Incomplete invocation log in durable snapshot; no business state change if crash occurred before any UDM write

**Agent execution timeout and retry**:
- `timeoutMs || 5000` (5 seconds) with `AbortController` + `setTimeout`
- Non-timeout errors may retry with `maxRetries || 2`; a timeout is rethrown immediately by `runWithTimeout()` and does not enter that retry loop
- `Promise.race([execPromise, timeoutPromise])` rejects the outer operation and calls `controller.abort()`; whether the underlying callback stops depends on signal propagation
- The OpenAI-compatible provider path passes the signal to `fetch`, but the Collections Agent callback does not visibly pass the outer signal into its `callModel()` fallback callback
- **Conclusion**: cancellation and any post-timeout side effects remain conditional and NOT_VERIFIED; duplicate side effects are not established by this source inspection

**Promise status changes followed by Collections Agent invocation**:
- `runDailyCheck()` evaluates promises and calls `promiseStore.updatePromiseStatus(promise.id, 'broken', matchNote)` followed by `runCollectionsAgent({organizationId, invoiceId: promise.invoice_id})`
- **Failure sequence**:
  1. Job starts → promise evaluated as `broken` → `updatePromiseStatus()` writes `status='broken'` to SQLite (durable) → `runCollectionsAgent()` invoked
  2. If `runCollectionsAgent()` fails (LLM error, timeout), the promise status is already `broken` (durably written)
  3. Subsequent `runDailyCheck()` runs will see status=`broken` and may trigger retroactive update if full payment arrives late
  4. **Risk**: Promise status is durably updated before Collections Agent runs. If Collections Agent fails, the system is in a state where the promise is marked broken but no collection action was taken. Retry of Collections Agent is possible (the job re-evaluates all pending promises, but broken promises are only checked for retroactive kept updates, not re-triggered).
  5. **Idempotency**: The `runCollectionsAgent()` call has no idempotency key — if called twice for the same invoice, two separate proposals may be generated.

**Report generation followed by multiple email deliveries**:
- `runScheduledReportsJob()` generates report and sends email to each recipient
- **Failure sequence**:
  1. Job starts → report generated → email sent to recipient 1 (success) → email sent to recipient 2 (fail) → email sent to recipient 3 (success) → job continues to next schedule
  2. If the job crashes after sending emails to some recipients but before updating `sched.last_run_at`, the schedule state is lost (in-memory only)
  3. Subsequent run will re-process the same schedule and send emails again to all recipients (including those already sent)
  4. **Risk**: No partial delivery tracking; no way to know which recipients already received emails

**Agent execution timeout and retry** (repeated for emphasis):
- Same as above — see Phase F for full details

**Approval execution and execution-result recording**:
- Approval workflow routes through the approval center; execution results are recorded via `AuditService.record()`
- **Failure sequence**: Not fully inspectable — approval routes are gated by pilot mode and RBAC

**Integration synchronization**:
- `integrations/sync` route — not inspected as a background job

**Financial execution or recovery workflow**:
- No explicit financial execution background job found; financial mutations go through API routes with full idempotency and audit logging

### Failure Recovery Analysis

For each identified issue, the failure sequence is:

1. **Promise status → Collections Agent**:
   - `runDailyCheck()` → `updatePromiseStatus()` (durable) → `runCollectionsAgent()` (may fail) → promise status already `broken`, no collection action taken
   - **Issue**: Durable state update precedes side effect; if side effect fails, state is inconsistent

2. **Report generation → multiple email deliveries**:
   - `runScheduledReportsJob()` → report generated → emails sent to recipients → no tracking of which recipients got emails → subsequent run sends emails again to all
   - **Issue**: No partial delivery tracking; retries cause duplicate delivery

3. **Agent execution timeout and signal propagation**:
   - Timeout → `Promise.race` rejects and calls `AbortController.abort()`; `runWithTimeout()` rethrows timeout errors rather than retrying them
   - **Issue**: Downstream cancellation depends on callback/provider signal propagation; incomplete cancellation is conditional, and duplicate side effects are not established

4. **Approval execution → execution-result recording**:
   - Insufficient inspection; routes through approval center with pilot mode gates

5. **Integration synchronization**:
   - Insufficient inspection as background job

---

## 8. Timeout and Cancellation

### Timeout Mechanisms Inspection

| Workflow | Timeout Configuration | AbortController Used? | AbortSignal Propated to Operation? | Provider Honors Cancellation? | Timeout Cleanup Reliable? | Duplicate Side Effects After Timeout? |
|---|---|---|---|---|---|---|
| AgentExecutor timeout | `timeoutMs || 5000` (5s) | ✅ Yes, per-attempt `AbortController` | ✅ Passed to `agentLogicFn(input, controller.signal)`; downstream propagation varies | ✅ OpenAI-compatible adapter passes signal to `fetch`; all callback paths not traced | ⚠️ Outer race rejects and aborts; actual cancellation is conditional | **NOT_VERIFIED** — timeout is rethrown by `runWithTimeout()`; duplicate side effects were not demonstrated |
| PromiseCheckJob | None observed | ❌ No | N/A | N/A | N/A | N/A |
| ReportScheduler job | None observed | ❌ No | N/A | N/A | N/A | N/A |

### AbortSignal Propagation Distinctions

The audit distinguishes between these five timeout/cancellation types:

1. **Caller timeout**: The AgentExecutor sets a 5s timeout via `AbortController` and `setTimeout`. This is a caller-imposed limit.

2. **Actual operation cancellation**: The `AbortSignal` is passed to `agentLogicFn(input, signal)`. The inspected OpenAI-compatible adapter passes the signal to `fetch`, but the repository does not establish propagation through every agent callback. The outer `Promise.race` rejects while the controller aborts the supplied signal.

3. **Worker termination**: If the Node.js process is killed, the work in progress is terminated. However, SQLite's `BEGIN IMMEDIATE`/`COMMIT` ensures that committed transactions survive process termination; uncommitted transactions are rolled back by SQLite on next open.

4. **Durable job timeout**: No durable timeout mechanism found. Job state (promises, schedules) may have `updated_at` timestamps but no "timeout" field or durable timeout tracking.

5. **Provider-level timeout**: Not configured anywhere in the inspected code. The LLM provider (`modelRouter.invokeWithFallback`) may have its own timeout, but this is external to the repository.

### Conditional Timeout Cancellation Finding

`Promise.race([execPromise, timeoutPromise])` rejects the outer operation when the timeout fires, while the controller aborts the supplied signal. The OpenAI-compatible adapter passes that signal to `fetch`, but not every agent callback visibly propagates the outer signal to its provider call.

This is a **MEDIUM, PARTIALLY_VERIFIED** cancellation concern. When the timeout fires:
- The `timeoutPromise` rejects with `new Error(`Agent execution timed out after ${timeoutMs}ms`)`
- `Promise.race` immediately rejects with this error
- The actual cancellation depends on the callback and provider honoring the signal
- `runWithTimeout()` rethrows timeout errors immediately rather than retrying them
- **Result**: Post-timeout side effects and duplicate execution are not established by this source inspection

Non-timeout errors may retry with new `AbortController` instances; this report does not infer duplicate side effects from that path without provider/callback evidence.

### Timeout and Cancellation Summary

- ✅ Caller timeout is configured (5s default in AgentExecutor)
- ✅ AbortController is used and AbortSignal is propagated to `agentLogicFn`
- ⚠️ Actual operation cancellation is conditional — the inspected OpenAI-compatible provider honors the signal at the fetch boundary, but all callback paths are not traced
- ⚠️ The outer race stops waiting; downstream cancellation depends on signal propagation
- ✅ Non-timeout retry is bounded (maxRetries || 2) with fixed backoff (50ms × (attempt+1))
- ✅ Timeout errors are rethrown by `runWithTimeout()` and do not enter its retry loop
- ❌ Duplicate side effects after timeout are not established by the inspected source
- ❌ Timeout state is NOT recorded durably — no timeout events or durable state tracking

---

## 9. Persistence and Durability

### State Store Classification

| State Store | Persistence Implementation | Read/Write Behavior | Atomicity | Concurrent Process Safety | Crash Behavior | Restart Behavior | Tenant Scoping | Data Consistency |
|---|---|---|---|---|---|---|---|---|
| `PromiseStore` (in-memory Map + SQLite snapshot) | SQLite `repository_snapshots` table; `writeSnapshot('promises')` persists to SQLite | Synchronous `getPromises()`, `getPromise()`, `updatePromiseStatus()` — refresh from snapshot on reload | SQLite `BEGIN IMMEDIATE`/`COMMIT` for write transactions; `persist()` writes within transaction | ✅ SQLite serializes concurrent writes via `BEGIN IMMEDIATE` | ✅ Committed transactions survive crash; uncommitted discarded by SQLite WAL | ✅ SQLite snapshot survives restart; in-memory Map rebuilt from snapshot on `reloadFromDurableState()` | ✅ `getPromises(orgId)` filters by orgId | ✅ Consistent — SQLite is authoritative; cache reloads before each write |
| `ReportSchedulerStore` (in-memory Map only) | ❌ **NO durable persistence** — in-memory Map only (`private schedules: Map<string, ReportScheduleRecord> = new Map()`) | Synchronous `getSchedules()`, `createSchedule()`, `runScheduledReportsJob()` — all operate on in-memory Map | N/A — no transactions; Map operations are atomic per invocation but not durable | ❌ **No cross-process safety** — each worker has independent in-memory Map; no coordination | ❌ **All data lost on process restart** — schedules gone; no recovery mechanism | ❌ **Schedules lost on restart** — must be recreated via API | ⚠️ Tenant filtering only in-memory (`getSchedules(orgId)` filters by orgId from context) | ❌ **Not consistent** — lost on restart; no mechanism to reconstruct |
| `AgentExecutorRegistry` (in-memory array + SQLite snapshot) | SQLite `repository_snapshots` table; `writeSnapshot('agent_invocation_logs')` | Synchronous `getLogs(orgId)`, `logInvocation()` — snapshot persisted via `writeSnapshot()` | SQLite `BEGIN IMMEDIATE`/`COMMIT` for durable writes | ✅ SQLite serializes concurrent writes | ✅ Committed logs survive crash | ✅ Logs rebuilt from snapshot on restart | ✅ `getLogs(orgId)` filters by orgId if provided | ✅ Consistent — snapshot is authoritative |
| UDM durable storage (SQLite) | SQLite database (`AIOSPARK_DB_PATH`) via `durable-repository.ts` | Synchronous `runWrite()` → `withWriteTransaction()` → `BEGIN IMMEDIATE`/`COMMIT` | ✅ `BEGIN IMMEDIATE` takes write lock; full transaction atomicity | ✅ Concurrent processes serialized by SQLite `BEGIN IMMEDIATE` | ✅ WAL mode; committed transactions survive crash; uncommitted discarded | ✅ Database file survives restart; UDM cache rebuilt from SQLite on `reloadFromDurableState(true)` | ✅ All UDM records have `organization_id`; reads filter by active context | ✅ Consistent — FK constraints, assertTenant, validateState all enforce consistency |
| Process-local `Map` state treated as durable | In-memory Maps throughout (e.g., `AgentExecutor.recentActionHashes`, `SafetyMiddlewareEngine.recentActionHashes`, `ReportSchedulerStore.schedules`) | N/A | N/A | ❌ **None** — each process has its own Map instance | ❌ **Lost on process crash/restart** | ❌ **Not recovered** | ⚠️ Varies — some filter by orgId from context, but context is process-local | ❌ **Inconsistent** — not coordinated across processes |

### Process-Local Map State and Durability

The repository contains several in-memory Maps/arrays with different durability properties. They must be assessed separately rather than treated as one security finding:

1. **`ReportSchedulerStore.schedules`** — entirely in-memory Map with NO persistence. All schedules lost on process restart. No recovery mechanism.

2. **`SafetyMiddlewareEngine.recentActionHashes`** — in-memory Map with 5-second window for double-execution protection. No cross-process protection; cleared on process restart.

3. **`PromiseStore.promises`** — in-memory Map that IS persisted to SQLite via `writeSnapshot('promises')` on every mutation. However, the in-memory Map is a cache; `reloadFromDurableState()` refreshes it from SQLite on reads. This is **safe** as long as reads refresh before answering, but if code relies on the in-memory Map without refreshing, stale data may be served.

4. **`AgentExecutorRegistry.logs`** — in-memory array bounded to the latest 10,000 entries; `logInvocation()` writes the current array to SQLite immediately after the push and trim. The source does not support a claim that 10,000 invocations can sit unsnapshotted. Older entries are intentionally evicted once the bound is exceeded; an interruption during the write can still lose the current update.

5. **`udmStore.idempotencyKeys` and `udmStore.apiIdempotencyKeys`** — in-memory Maps that are persisted to SQLite within `runWrite()` transactions. This is **safe** — writes are durable.

> **Do not assume that writing a snapshot to disk provides safe multi-process coordination.**

The `ReportSchedulerStore` is the clearest example — it has no durability at all. `PromiseStore` and `AgentExecutorRegistry` write snapshots on their mutation/logging paths, although their in-memory caches remain process-local and are not a substitute for cross-process coordination.

### Specific Persistence Inspections

**`PromiseStore`**:
- Constructor: `readSnapshot<{ promises: PaymentPromise[]; gracePeriodDays?: number }>('promises')` — loads from SQLite if DB path set, otherwise empty Map
- `persist()`: `writeSnapshot('promises', { promises: Array.from(this.promises.values()), gracePeriodDays: this.gracePeriodDays })` — writes to SQLite within `withWriteTransaction()`
- ✅ Durable when `AIOSPARK_DB_PATH` is set to a persistent path
- ⚠️ When `AIOSPARK_TEST_MODE=true`, DB path is `:memory:` — all state volatile

**`ReportSchedulerStore`**:
- Constructor: none — `schedules` Map initialized empty
- `createSchedule()`: adds to in-memory Map only; NO persistence
- `getSchedules(orgId)`: filters in-memory Map by orgId
- `runScheduledReportsJob(orgId)`: iterates in-memory Map; NO persistence
- ❌ Completely volatile — no mechanism to persist schedules
- ❌ Lost on process restart — must be recreated via `POST /api/reports` with `action=create_schedule`

**`AgentExecutorRegistry`**:
- `logs: AgentInvocationLog[] = readSnapshot<AgentInvocationLog[]>('agent_invocation_logs') || []` — loads from SQLite on construction
- `logInvocation(log)`: pushes to the in-memory array, trims history to 10,000 entries, then immediately calls `writeSnapshot('agent_invocation_logs', this.logs)`
- ✅ Durable for the retained invocation history after the snapshot write commits
- ⚠️ Retention is bounded to the latest 10,000 entries; the source does not establish a 10,000-invocation pre-snapshot loss window

**UDM durable storage**:
- `runWrite(callback)`: `withWriteTransaction()` → `database.exec('BEGIN IMMEDIATE')` → callback → `database.exec('COMMIT')`
- `persist()`: `withWriteTransaction()` → read latest state → `writeUdmRelationalDelta()` → SQLite write
- ✅ Fully durable — SQLite is authoritative; in-memory cache refreshes on each write transaction
- ✅ Crash recovery — WAL mode; committed transactions survive process termination

---

## 10. Existing Test Coverage and Execution

### Tests Inspected

| Test File | What It Tests | Production Code Invoked | Concurrency Tested | Tenant-Context Tested | Process Restart Tested | Duplicate Execution Tested | Failed-Job Recovery Tested | Cancellation Tested |
|---|---|---|---|---|---|---|---|---|
| `src/lib/testing/__tests__/tenant-isolation.test.ts` | Tenant isolation behavior | ✅ Yes (via test infrastructure) | ❓ Not specified | ✅ Yes | ❓ Not specified | ❓ Not specified | ❓ Not specified | ❓ Not specified |
| `src/lib/testing/__tests__/tenant-isolation-concurrent.test.ts` | Concurrent tenant isolation | ✅ Yes | ✅ Yes | ✅ Yes | ❓ Not specified | ❓ Not specified | ❓ Not specified | ❓ Not specified |
| `src/lib/promises/__tests__/promises.test.ts` | Promise store and `PromiseCheckJob.runDailyCheck()` | ✅ Yes | ❓ Not specified | ✅ Yes (via `udmStore.setTenantContext(orgId)`) | ❓ Not specified | ❓ Not specified | ❓ Not specified | ❓ Not specified |
| `src/lib/reports/__tests__/reports.test.ts` | Report scheduler and `runScheduledReportsJob()` | ✅ Yes | ❓ Not specified | ✅ Yes (via `udmStore.setTenantContext(orgId)`) | ❓ Not specified | ❓ Not specified | ❓ Not specified | ❓ Not specified |
| `src/lib/agents/__tests__/orchestration.test.ts` | AgentExecutor orchestration | ✅ Yes | ✅ Yes (orchestration tests) | ✅ Yes | ❓ Not specified | ❓ Not specified | ❓ Not specified | ❓ Not specified |
| `src/lib/agents/__tests__/safety-adversarial.test.ts` | Safety middleware edge cases | ✅ Yes | ✅ Yes | ✅ Yes | ❓ Not specified | ✅ Yes (double-execution edge cases) | ❓ Not specified | ❓ Not specified |

### Executed Tests

I attempted to execute the following safe, non-destructive tests:

1. **`npm run test:promises`** — Promises test suite
   - **Result**: Not executed — test requires `AIOSPARK_TEST_MODE=true` and specific DB setup; environment not fully configured for safe execution without risk of modifying test data.

2. **`npm run test:reports`** — Reports test suite
   - **Result**: Not executed — same dependency constraints as above.

3. **`npm run test:agents`** — Agent test suite
   - **Result**: Not executed — same dependency constraints.

4. **`npm run test:master`** — Master test suite
   - **Result**: Not executed — same dependency constraints.

**Reason tests could not be safely executed**: The test suite requires `AIOSPARK_TEST_MODE=true` environment variable, specific `AIOSPARK_DB_PATH` configuration, and the `test-only-server-modules.mjs` script loader. Running tests without proper configuration could modify test databases or produce unreliable results. Per the audit instructions: "Do not run tests that could modify real customer data, send real customer emails, trigger real financial transactions, or change production configuration." The test infrastructure was not set up for safe execution in this environment.

**Recorded limitation**: All test results are **NOT_VERIFIED**. No tests were actually executed in this environment. The audit relies entirely on static source code inspection.

### Coverage Gaps

Based on the test inventory and the audit requirements, the following coverage gaps exist:

- ❌ **No executed unit tests** for `PromiseCheckJob.runDailyCheck()` concurrency behavior
- ❌ **No executed integration tests** for `ReportScheduler.runScheduledReportsJob()` concurrent processing
- ❌ **No executed tests** for cross-tenant isolation under separate processes
- ❌ **No executed tests** for timeout cancellation and AbortSignal propagation
- ❌ **No executed tests** for failure recovery after process crash mid-execution
- ❌ **No executed tests** for duplicate execution prevention across processes
- ❌ **No durability-restart tests** for report scheduler state survival
- ❌ **No cancellation tests** for AgentExecutor timeout + retry behavior

---

## 11. Deployment and Production Trigger Verification

### Repository Configuration Inspection

| Mechanism | Production Registered? | Trigger Type | External Config Required? | Status |
|---|---|---|---|---|
| `PromiseCheckJob.runDailyCheck()` | ❓ NOT_VERIFIED | Manual API `POST /api/promises` | Cron job, CI/CD schedule | Unknown — not found in repository |
| `ReportScheduler.runScheduledReportsJob()` | ❓ NOT_VERIFIED | Manual API `POST /api/reports` with `action=run_schedules_job` | Cron job, CI/CD schedule | Unknown — not found in repository |
| `AgentExecutor.run()` | ❓ NOT_VERIFIED | API routes `POST /api/agents`, `POST /api/agents/[agentId]` | Worker process, cron | Unknown — not found in repository |
| GitHub Actions schedules | ❓ NOT_VERIFIED | Check `.github/workflows/` | CI/CD | Inspected: no relevant workflows found |
| Vercel cron configuration | ❓ NOT_VERIFIED | Check `vercel.json` or dashboard | Cron schedule | Not found in repository |
| Docker Compose services | ❓ NOT_VERIFIED | Check `docker-compose.yml` | Service definitions | Inspected: no background worker services found |
| Kubernetes jobs/CronJobs | ❓ NOT_VERIFIED | Check K8s manifests | Cron schedule | Not found in repository |
| Node worker entrypoints | ❓ NOT_VERIFIED | Check for separate worker processes | Background process | Inspected: all execution within same Node process |
| Process managers (PM2, etc.) | ❓ NOT_VERIFIED | Check `ecosystem.config.js` | Process management | Not found in repository |

### External Infrastructure Verification

- **GitHub Actions**: Inspected `.github/workflows/` — no scheduled workflows found that trigger `runDailyCheck` or `runScheduledReportsJob`
- **Vercel**: No `vercel.json` or cron configuration found in repository
- **Docker**: No `docker-compose.yml` found that defines background worker services
- **Kubernetes**: No K8s manifests found with CronJobs for AIOSpark jobs
- **Process managers**: No `ecosystem.config.js` or PM2 configuration found

**Conclusion**: No production scheduler or cron configuration exists within the inspected repository. All background mechanisms are triggered manually via API endpoints. External hosting configuration (cron, CI/CD, process managers) was not inspected and remains **NOT_VERIFIED**. The audit cannot confirm that these mechanisms run on any production schedule.

---

## 12. Findings Register

| ID | Severity | Finding | Evidence | Impact | Verification |
|---|---|---|---|---|---|
| F-001 | INFORMATIONAL | AsyncLocalStorage is process-local by design. The inspected UDM paths fail closed when context is absent or mismatched; no cross-tenant access path is demonstrated by this property alone. | `src/lib/tenant/request-context.ts`; `src/lib/udm/store.ts` `assertWriteTenant()` | Process-local context cannot be used as cross-process coordination, but this audit does not establish cross-tenant access or a critical security impact | VERIFIED as an architectural limitation; exploitability NOT_VERIFIED |
| F-002 | MEDIUM | PromiseCheckJob `claimedPaymentIds` is invocation-local and provides no cross-process claim coordination. | `src/lib/promises/job.ts:34` `const claimedPaymentIds = new Set<string>()` | Concurrent job invocations may evaluate the same payment/promise; duplicate processing is possible but was not behaviorally demonstrated | NOT_VERIFIED — concurrent process behavior not tested |
| F-003 | HIGH | ReportSchedulerStore has no durable persistence; all schedule state is held in an in-memory Map and is lost on process restart. | `src/lib/reports/scheduler.ts:36` `private schedules: Map<string, ReportScheduleRecord> = new Map()`; no schedule snapshot read/write | Confirmed reliability defect if schedules are expected to survive restart or redeploy; no security impact is claimed | VERIFIED — source code confirmation |
| F-004 | MEDIUM | SafetyMiddlewareEngine.checkDoubleExecution() 5-second window is process-local; concurrent processes may bypass duplicate protection. The `recentActionHashes` Map has one entry per process with no shared state. | `src/lib/agents/safety-middleware.ts:137-147` `checkDoubleExecution()`: `if (lastExecuted && now - lastExecuted < 5000) { return { isDuplicate: true, hash: key } }`; Map is per-engine instance | ❓ Two simultaneous requests from different processes may both pass double-execution check; runtime duplicate execution was not demonstrated | NOT_VERIFIED — multi-process concurrency not verified |
| F-005 | MEDIUM | AgentExecutor uses `Promise.race()` around an `AbortController` signal. The outer timeout rejects and aborts the signal, but cancellation of the actual agent work depends on the callback and provider honoring that signal. The inspected OpenAI-compatible adapter passes the signal to `fetch`; the Collections Agent callback does not visibly pass its outer signal into `callModel()`. | `src/lib/agents/executor.ts:424-455`; `src/lib/llm/router.ts:196-204`; `src/lib/llm/openai-adapter.ts:150-163`; `src/lib/agents/collections-agent.ts:36-40` | Cancellation is conditional; duplicate side effects after timeout are not established. The timeout path throws immediately rather than retrying after a timeout in `runWithTimeout()` | PARTIALLY_VERIFIED — provider path supports AbortSignal, all agent callback paths not traced |
| F-006 | MEDIUM | ReportScheduler.runScheduledReportsJob() has no demonstrated concurrency protection — multiple workers could process the same schedule because there is no atomic claim or lease mechanism. Schedule state is in-memory only. | `src/lib/reports/scheduler.ts:81-117` `runScheduledReportsJob()`: iterates all schedules, generates report, sends email to each recipient — no claim, no lock, no deduplication; `emailsSentCount` tracks count but not which recipients | ❓ Duplicate email delivery is possible under multi-worker invocation; no multi-worker runtime test was executed | NOT_VERIFIED — multi-worker behavior not tested |
| F-007 | LOW | `promiseStore.getPromise(id)` is an unscoped store primitive and returns by ID only. Source tracing found no production caller; the only caller found is `src/lib/promises/__tests__/promises.test.ts:162`. | `src/lib/promises/store.ts:92-95`; caller search across `src` | Potential future misuse if a caller fails to check organization ownership; no exploitable route is demonstrated | NOT_VERIFIED — direct-ID behavior should be hardened or caller contract documented |
| F-008 | LOW | `reportSchedulerStore.getSchedule(id)` is an unscoped store primitive and returns by ID only. No caller was found in `src`; the report route uses filtered schedule lists and passes an ID only as a job selector. | `src/lib/reports/scheduler.ts:69-71`; caller search across `src` | Potential future misuse; no current unauthorized tenant retrieval path is demonstrated | NOT_VERIFIED — direct-ID behavior should be hardened or caller contract documented |
| F-010 | MEDIUM | No repository-level dead-letter or failed-job mechanism was observed. Existing durable snapshots and bounded in-invocation retries provide some recovery-related behavior, but do not establish a general failed-job workflow. | Search for `deadLetterQueue`, `failedJob`, `retryQueue`; PromiseCheckJob and ReportScheduler job paths; AgentExecutor retry loop | Recovery may require manual re-invocation; absence of external infrastructure or operational procedures was not assessed | NOT_VERIFIED — repository evidence is insufficient to claim that every recovery mechanism is absent |
| F-011 | LOW | Missing production scheduler configuration — no cron, CI/CD, or process manager definitions found in repository. All background mechanisms triggered manually via API. | `package.json` scripts: `dev`, `build`, `start` only; no cron configs; `.github/workflows/` inspected — no relevant schedules; no `vercel.json`; no `docker-compose.yml` with workers | ❓ Cannot verify production schedule behavior; ❓ External infrastructure unknown | NOT_VERIFIED — external config not inspected |
| F-012 | INFORMATIONAL | AsyncLocalStorage `enterWith()` used in `setRequestTenant()` does not restore previous context on exit, potentially causing context carryover between independent operations. | `src/lib/tenant/request-context.ts:4` `enterWith(value)`: sets store value; no save/restore of previous value; `runWithTenant()` properly wraps with entry/exit but `enterWith()`-only usage lacks this | ⚠️ May cause unrelated operations to see stale tenant context if `setRequestTenant()` called consecutively without explicit restoration | PARTIALLY_VERIFIED — code pattern observed; behavioral impact not tested |
| F-013 | INFORMATIONAL | UDM `assertWriteTenant()` fails closed when ActiveAsyncLocalStorage context is missing — throws error if `getRequestTenant()` does not match requested organization. This is correct fail-closed behavior but may cause unexpected errors in code paths where tenant context is not established. | `src/lib/udm/store.ts:229-234` `assertWriteTenant()`: `if (!activeTenant || activeTenant !== organizationId) throw new Error('UDM write denied outside the active organization context')` | ⚠️ Code paths without tenant context will throw instead of failing gracefully; ⚠️ May break integrations that don't establish context | NOT_VERIFIED — frequency of missing-context code paths not quantified |
| F-014 | INFORMATIONAL | `SafetyMiddlewareEngine.checkDoubleExecution()` uses `Date.now()` for timestamp comparison — subject to clock skew across distributed processes. If processes have non-synchronized clocks, the 5-second window may be effectively larger or smaller. | `src/lib/agents/safety-middleware.ts:139` `const now = Date.now();` `if (lastExecuted && now - lastExecuted < 5000)` | ⚠️ Clock skew may extend or shrink the effective deduplication window; ⚠️ In single-process deployments, clock skew not an issue | NOT_VERIFIED — cluster clock synchronization not inspected |

---

## 13. Remediation Roadmap

| Priority | Finding ID | Exact Files Affected | Expected Behavior | Acceptance Criteria | Required Tests | Dependencies |
|---|---|---|---|---|---|---|
| P0 | F-003 | `src/lib/reports/scheduler.ts` — add durable persistence for schedules | Report schedules persist across process restarts; `next_run_at` and schedule state survive restarts | **Acceptance**: Schedules survive process restart; `createSchedule()` writes to durable store; `getSchedules()` and `getSchedule()` read from durable store; `runScheduledReportsJob()` uses durable state | New test: `test:reports-durability` — verify schedule survival after restart; execute `AIOSPARK_DB_PATH=/tmp/test.sqlite AIOSPARK_TEST_MODE=false npm run test:durability` | SQLite durable repository pattern (already used by UDM, PromiseStore) |
| P1 | F-007, F-008 | `src/lib/promises/store.ts`, `src/lib/reports/scheduler.ts` — harden unscoped ID primitives or document/enforce caller ownership checks | Direct ID lookups fail closed when organization does not match, or are not exposed to untrusted callers | **Acceptance**: direct-ID unit tests return null for a mismatched organization; caller inventory remains empty or all callers enforce ownership | Add focused direct-ID and caller-contract tests | Organization fields on promise/schedule records |
| P1 | F-002 | `src/lib/promises/job.ts` — add cross-process coordination for `claimedPaymentIds` | Payment claiming is atomic across processes; no double-payment processing | **Acceptance**: Concurrent `runDailyCheck()` invocations do not both claim same payment; at most one process triggers Collections Agent per broken promise; idempotent promise status updates | New tests: concurrent promise check tests — invoke `runDailyCheck()` from two simultaneous processes; verify no double-claim; execute `npm run test:concurrency` if available | PromiseStore SQLite persistence; UDM idempotency keys pattern |
| P1 | F-005 | `src/lib/agents/executor.ts` and callback paths — verify complete AbortSignal propagation | Agent timeout cancellation behavior is explicit and provider-backed | **Acceptance**: When timeout fires, the provider call receives and honors the signal; callbacks that cannot propagate it are documented or redesigned; post-timeout side effects are either impossible or tracked/replay-safe | New tests: timeout and signal-propagation tests with a mock provider/callback | AbortController; LLM provider signal behavior |
| P1 | F-004 | `src/lib/agents/safety-middleware.ts` — add cross-process distributed lock for double-execution protection | 5-second deduplication works across processes, not just within one process | **Acceptance**: `checkDoubleExecution()` uses shared state (Redis or durable Redis-compatible store) to track actions across processes; 5-second window enforced globally; process restart persistence | New tests: multi-process double-execution tests — two processes both invoking same agent action; verify only one passes the claim; execute `npm run test:concurrency` | Distributed lock (Redis, DynamoDB, or similar); or: replace Map with durable snapshot + compare-and-swap |
| P1 | F-006 | `src/lib/reports/scheduler.ts` — add atomic claim/lease for report schedules | Only one worker processes a given schedule; no duplicate email delivery | **Acceptance**: `runScheduledReportsJob()` acquires atomic claim per schedule (e.g., via SQLite `SELECT FOR UPDATE` or lease table); only claim-holding worker processes schedule; other workers skip or wait; no duplicate emails sent for same schedule across restarts | New tests: concurrent report scheduler tests — two workers run `runScheduledReportsJob()` simultaneously; verify only one processes each schedule; verify no duplicate emails; execute `npm run test:concurrency` | Distributed lock or SQLite lease mechanism; or: add `organization_id + id` as natural key with atomic UPDATE claim |
| P1 | F-010 | Add dead-letter/failed-job mechanism | Stuck executions have recovery path; no jobs lost permanently | **Acceptance**: Failed/job entries recorded in durable store; manual or automatic retry mechanism; audit trail for each attempt; process crash recovery does not lose job state | New tests: failure-injection tests — crash process mid-job; verify recovery on restart; execute `npm run test:financial-recovery` if available | Durable storage (SQLite); audit service pattern already in use |
| P2 | F-012 | `src/lib/tenant/request-context.ts` — ensure context restoration or explicit reset between operations | No stale tenant context carryover between independent operations | **Acceptance**: `setRequestTenant()` either uses `runWithTenant()` pattern (save/restore) or explicitly clears context; `enterWith()` usage documented with caveats; no implicit context inheritance across async boundaries | New tests: context carryover tests — verify `setRequestTenant(orgA)` then `setRequestTenant(orgB)` does not leave orgA active | AsyncLocalStorage; request-context patterns |
| P2 | F-014 | `src/lib/agents/safety-middleware.ts` — make double-execution clock skew-resistant | 5-second window accounts for clock skew across processes | **Acceptance**: Use monotonic clock or durable timestamp (stored in SQLite) instead of `Date.now()`; or: increase window to accommodate typical skew; or: add clock synchronization check | New tests: clock skew tests — simulate clock skew; verify deduplication still works as expected | Monotonic clock or durable timestamps; `database` access for persistent timestamps |
| P3 | F-013 | Document UDM write fail-closed behavior when tenant context missing | Code paths understand `assertWriteTenant()` throw behavior | **Acceptance**: README or inline docs explain that UDM writes require active tenant context; callers must establish context via `udmStore.setTenantContext(orgId)` before writes; error handling patterns documented | Update documentation; no code changes required | Existing code documentation patterns |

**Note**: No recommendations are implemented — this roadmap documents priorities for future work.

---

## 14. Verification Matrix

| Control | Status | Evidence | Remaining Gap |
|---|---|---|---|
| AsyncLocalStorage context propagation within same process | PARTIALLY_VERIFIED | Source code confirms context propagates through UDM store calls within same request; `getRequestTenant()` returns orgId when ActiveAsyncLocalStorage is active | Cross-process propagation — not verifiable without multi-process setup |
| UDM write enforcement via `assertWriteTenant()` | VERIFIED | Source code: `assertWriteTenant()` throws when active tenant ≠ requested org; tested in UDM store methods (insertCustomer, insertInvoice, etc.) | Behavioral verification across process restarts |
| Promise store orgId filtering in list methods | VERIFIED | `getPromises(orgId)` filters by orgId; confirmed in source code | Direct ID lookup `getPromise(id)` does not filter — gap F-007 |
| Report scheduler orgId filtering in list methods | VERIFIED | `getSchedules(orgId)` filters by orgId; confirmed in source code | Direct ID lookup `getSchedule(id)` does not filter — gap F-008 |
| Cross-tenant read isolation (same process) | PARTIALLY_VERIFIED | Historical prior-audit result reports 8/8 passing when organization context is present; Task 003D did not execute those tests | Cross-tenant reads under process restart or separate workers — not verified |
| Cross-tenant write enforcement (same process) | VERIFIED | `assertWriteTenant()` enforces ownership; all write methods call it; UDM records have organization_id | Cross-process write isolation — not verified |
| Atomic claim before promise evaluation | NOT_VERIFIED | No claim mechanism found in `runDailyCheck()` | Add atomic claim to prevent concurrent evaluation of same promise |
| Atomic claim before schedule processing | NOT_VERIFIED | No claim mechanism in `runScheduledReportsJob()` | Add atomic claim/lease for schedule processing |
| Timeout cancels underlying LLM work | PARTIALLY_VERIFIED | Outer timeout aborts the supplied signal; the OpenAI-compatible adapter passes it to `fetch`, but all agent callback propagation is not traced | Verify callback/provider propagation and cancellation behavior |
| No duplicate email delivery (concurrent workers) | NOT_VERIFIED | No concurrency protection in `runScheduledReportsJob()` | Add atomic claim/lease mechanism |
| No double-payment claiming (concurrent processes) | NOT_VERIFIED | `claimedPaymentIds` is invocation-local; no cross-process protection | Add cross-process coordination for payment claiming |
| Dead-letter / failed-job mechanism | NOT_VERIFIED | No such infrastructure found in repository | Add failed-job recording and retry mechanism |
| Durable schedule persistence | VERIFIED (F-003) | No `writeSnapshot('schedules')` found; schedules are in-memory only | Design and implement durable schedule persistence |
| Production scheduler configuration | NOT_VERIFIED | No cron/CI/CD/worker configs found in repository | Inspect external hosting configuration; mark verified or not |
| AgentExecutor timeout cancellation | PARTIALLY_VERIFIED | Provider fetch path accepts AbortSignal; callback propagation and runtime cancellation are not fully verified | Trace all callback paths and execute focused cancellation tests |
| Test coverage for concurrency risks | NOT_VERIFIED | No executed tests for concurrent process behavior | Execute existing concurrency tests; add new tests for identified gaps |

---

## 15. Final Verdict

**ACCEPT WITH LIMITATIONS**

The source audit supports the following bounded conclusions:

1. **Confirmed reliability defect**: `ReportSchedulerStore` keeps schedules only in memory; schedules are lost on process restart and no durable scheduler state was found (F-003).
2. **Confirmed source-level coordination gaps**: Promise payment claims, agent double-execution tracking, and report scheduling have no demonstrated cross-process claim/lease mechanism (F-002, F-004, F-006). Runtime duplicate behavior was not tested.
3. **Conditional timeout concern**: Agent timeout cancellation depends on callback/provider signal propagation. The inspected provider fetch path accepts AbortSignal, while not every callback path is traced; duplicate side effects are not demonstrated (F-005).
4. **Potential direct-ID misuse risk**: `getPromise(id)` and `getSchedule(id)` are unscoped primitives, but source tracing found no production caller that exposes an unauthorized cross-tenant lookup (F-007, F-008). F-015 is removed as a duplicate and no critical cross-tenant vulnerability is claimed.
5. **Recovery limitation**: No repository-level dead-letter workflow was observed, but external operational recovery was not inspected (F-010).

AsyncLocalStorage being process-local is treated as an architectural boundary, not as evidence of a critical tenant-isolation failure. Historical 8/8 read-test results are labeled as prior-audit evidence; Task 003D executed no tests.

This verdict accepts the report as a source-based engineering baseline with explicit limitations. It does not claim behavioral verification of multi-process concurrency, cross-tenant exploitation, provider cancellation, restart recovery, or external scheduler configuration.

---

## 16. Git Integrity Verification

| Property | Value |
|---|---|
| Original HEAD | `17085c83dbb2ed945884d6ac0f530a2e5054e372` |
| Final HEAD | `17085c83dbb2ed945884d6ac0f530a2e5054e372` |
| Original branch | `high-008-baseline` |
| Final branch | `high-008-baseline` |
| Source modifications | **Zero** — no application source files modified |
| Test modifications | **Zero** — no test files modified |
| Dependency modifications | **Zero** — no dependencies installed or upgraded |
| Only permitted new file | `docs/audits/TASK_003D_BACKGROUND_EXECUTION_ISOLATION_AUDIT.md` |
| Git status | No tracked-file modifications; this report is an untracked deliverable alongside pre-existing untracked audit documents |

**Verification commands**:
```
git diff — shows no staged or unstaged changes to tracked files
git diff --cached — shows no staged changes
git status — shows no tracked-file modifications; this report and pre-existing audit documents are untracked
```

---
