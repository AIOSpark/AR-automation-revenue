# TASK 004A — Job Execution Topology

## Overview

This document maps the background job execution topology across the AIOSpark AR Automation Revenue repository. Based on static source code inspection of branch `high-008-baseline`, HEAD `17085c83dbb2ed945884d6ac0f530a2e5054e372`. All job mechanisms are server-side Node.js; no external worker processes, Redis, or BullMQ are used.

**Classification key:**
- **Trigger** — What starts the job (Vercel Cron, HTTP call, manual, etc.)
- **Execution location** — Where the job runs (Vercel function, server process)
- **Persistence** — Durable state backing (SQLite, in-memory, none)
- **Retry** — Automatic retry behavior
- **Concurrency protection** — Mechanisms preventing duplicate execution

---

## 1. Report Scheduler Job

| Attribute | Details |
|---|---|
| **Job name** | `runScheduledReportsJob(orgId, forceRunScheduleId)` |
| **File** | `src/lib/reports/scheduler.ts:83` — method on `ReportSchedulerStore` class |
| **Trigger** | Repository-level **Vercel Cron NOT configured** (no `vercel.json`). External dashboard config unverified (EXTERNAL VERIFICATION REQUIRED). When triggered, calls `reportSchedulerStore.runScheduledReportsJob(orgId, forceRunScheduleId)`. |
| **Execution location** | Server-side Node.js process (Vercel function or standalone server). Runs as part of the application process. |
| **Persistence** | **ZERO durable persistence** — `ReportSchedulerStore.schedules` is an in-memory `Map` only (F-003). Reloading on restart not supported; all schedules lost. |
| **Due-time evaluation** | `next_run_at` computed as `Date.now() + 86400000` (24 hours from creation) in `createSchedule()`. No CRON expression evaluation within the job itself. |
| **Atomic claim behavior** | **None** — no claim mechanism, no lease expiry, no "lock" on a schedule before processing. Any instance can process any schedule. |
| **Concurrent invocation protection** | **None** — F-006 finding. Multiple instances can simultaneously process the same schedule, leading to duplicate report generation and duplicate email sends. |
| **Lease expiry** | **None** — no lease mechanism implemented. |
| **Email delivery tracking** | Via `TransactionalEmailProvider.sendEmail()` — success/failure tracked in returned `errors` array. No persistent tracking of which emails were sent. |
| **Failure handling** | Errors collected in array and returned; **no retry**, **no dead-letter queue**, **no automatic recovery**. |
| **Restart recovery** | **None** — all schedules lost on process restart (F-003). |
| **Rate limiting** | None at job level. Policy engine rate limits at API level (20 actions per 60s per org-agent). |
| **Tenant context** | `udmStore.setTenantContext(orgId)` called at job start to set AsyncLocalStorage context. |
| **Key vulnerabilities** | F-003: Zero durability. F-006: No concurrent execution protection. |

---

## 2. Promise Checking Job (Daily)

| Attribute | Details |
|---|---|
| **Job name** | `runDailyCheck(orgId, todayStr)` |
| **File** | `src/lib/promises/job.ts:18` — static method on `PromiseCheckJob` class |
| **Trigger** | Repository-level **Vercel Cron NOT configured** (no `vercel.json`). External dashboard config unverified (EXTERNAL VERIFICATION REQUIRED). Typically runs as a daily scheduled job. |
| **Execution location** | Server-side Node.js process. Called with `orgId` parameter; internally calls `udmStore.setTenantContext(orgId)`. |
| **Persistence** | SQLite `repository_snapshots` via `promiseStore` — `readSnapshot`/`writeSnapshot` pattern. Promises persisted after each status update. |
| **Due-time evaluation** | `deadlineMs = expDateMs + graceMs` where `graceDays = promiseStore.getGracePeriodDays()` (default 2). Evaluation: `todayMs > deadlineMs` → past deadline. |
| **Atomic claim behavior** | **None** — `claimedPaymentIds` is a **process-local `Set<string>`** only (F-002). No database-level claim, no lease, no distributed lock. Same payment could be claimed by multiple instances. |
| **Concurrent invocation protection** | **None** — process-local `claimedPaymentIds` Set only. No cross-instance coordination. F-002, F-010. |
| **Retry behavior** | None at job level. Individual promise status updates are atomic via `withWriteTransaction` in `PromiseStore.updatePromiseStatus()`. No job-level retry on failure. |
| **Failure recovery** | **None** — F-010 finding. No dead-letter queue, no failed-job tracking, no automatic recovery for stuck executions. |
| **Collections Agent invocation** | When a `broken` promise has `invoice_id`, triggers `runCollectionsAgent()` immediately via `await`. No retry or dead-letter if agent fails. |
| **Rate limiting** | Policy engine rate limits (20 per 60s per org-agent) apply to API calls that trigger the job, not the job itself. |
| **Tenant context** | `udmStore.setTenantContext(orgId)` at job start (F-015: context carryover possible via `enterWith()`). |
| **Key vulnerabilities** | F-002: Process-local claims. F-007: `getPromise(id)` bypasses org filtering. F-010: No dead-letter/recovery. |

---

## 3. Collections Agent Job

| Attribute | Details |
|---|---|
| **Job name** | `runCollectionsAgent(input)` |
| **File** | `src/lib/agents/collections-agent.ts` |
| **Trigger** | Invoked from `PromiseCheckJob.runDailyCheck()` when a broken promise has `invoice_id` (line: `const agentRes = await runCollectionsAgent({...})`). Also callable directly via API routes. |
| **Execution location** | Server-side Node.js process. Uses `AgentExecutor.run()` which enforces 8-step safety pipeline. |
| **Persistence** | Agent invocation logs written to SQLite `repository_snapshots` (namespace 'agent_invocation_logs'). Verification results logged. |
| **Retry behavior** | `AgentExecutor.run()` has retry logic: `maxRetries || 2` with 50ms * (attempt+1) backoff. LLM invocation failure may trigger retry. |
| **Concurrency protection** | 8-step safety pipeline (F-004, F-005): <br>• `checkPermission()` — RBAC <br>• `checkPolicy()` — policy + rate limit <br>• `validateData()` — stale data guard <br>• `checkDoubleExecution()` — 5s process-local window ❌ <br>• `evaluateRiskAssessment()` — hard product floors <br>• Approval routing for high-risk actions <br>• Verification step |
| **Timeout** | 5000ms default (`AgentExecutor.run()`: `timeoutMs = options?.timeoutMs || 5000`). `Promise.race([execPromise, timeoutPromise])` with `AbortController`. **Does NOT cancel underlying LLM work** (F-005). |
| **Failure handling** | Returns `success: false` with `status: 'timeout'` or `'execution_failed'`; logs invocation; no automatic retry at job level beyond AgentExecutor's configured `maxRetries`. |
| **Tenant context** | `udmStore.setTenantContext(params.organizationId)` called inside the agent logic (within the LLM call handler). |
| **Key vulnerabilities** | F-005: Timeout does not cancel LLM work. F-004: Double-execution protection is 5s process-local only. |

---

## 4. Agent Execution (General)

| Attribute | Details |
|---|---|
| **Job name** | `AgentExecutor.run(agentName, organizationId, input, agentLogicFn, options)` |
| **File** | `src/lib/agents/executor.ts:121` — static method |
| **Trigger** | Invoked from collections agent, or directly via API routes. Always goes through the 8-step safety pipeline. |
| **Execution location** | Server-side Node.js process. Each call creates a new invocation with its own `AbortController` timeout. |
| **Persistence** | Invocation logs written to SQLite `repository_snapshots` (namespace 'agent_invocation_logs'). |
| **Retry behavior** | Configurable via `maxRetries` option (default 2). Each retry has 50ms * (attempt+1) backoff. Timeout uses `Promise.race` + `AbortController`. |
| **Concurrency protection** | 8-step safety pipeline (see Collections Agent). Double-execution check is 5s process-local window. |
| **Timeout** | Default 5000ms. `Promise.race([execPromise, timeoutPromise])` — aborts agent logic but does NOT cancel underlying LLM work. |
| **Concurrent execution** | No cross-instance coordination. Multiple simultaneous `AgentExecutor.run()` calls with same org/context possible. |
| **Tenant context** | Established via `udmStore.setTenantContext(organizationId)` within the agent logic. |
| **Key vulnerabilities** | F-005: Timeout does not cancel LLM under work. F-004: 5s double-execution window is process-local. |

---

## 5. Payment Reconciliation / Matching

| Attribute | Details |
|---|---|
| **Job name** | `PaymentMatch.insertMatch()` / `UDM.insertMatch()` |
| **File** | `src/lib/udm/store.ts:481` — `insertMatchInternal()` |
| **Trigger** | Typically invoked from API routes during payment processing; can also be called from batch jobs. |
| **Execution location** | Server-side Node.js process. Runs within `withWriteTransaction()` for atomic persistence. |
| **Persistence** | Written to SQLite relational table `udm_payment_matches` and `udm_payments` via `withWriteTransaction()`. Also written to `repository_snapshots` via `persist()` calls. |
| **Retry behavior** | Idempotent replay: `insertMatchInternal()` checks for existing match with same `payment_id + invoice_id`; if found with same amount, returns existing match (crash-safe). Different amount → error (conflict). |
| **Concurrency protection** | `withWriteTransaction()` uses `BEGIN IMMEDIATE` + `COMMIT` via `DatabaseSync` — SQLite serializes concurrent processes. In-process `idempotencyLocks` Map prevents concurrent requests with same key from both passing check and creating duplicates. |
| **Concurrent invocation protection** | **Yes** — database-level `BEGIN IMMEDIATE` serializes writes. In-process idempotency lock for async coordination. |
| **Tenant context** | `assertWriteTenant(data.organization_id)` enforced in `insertMatchInternal()` — validates `getRequestTenant() === organizationId`. |
| **Key vulnerabilities** | None critical — this is the best-protected path in the codebase. Idempotency handling is well-implemented. |

---

## 6. Safety Middleware Double-Execution Interception

| Attribute | Details |
|---|---|
| **Job/mechanism** | `SafetyMiddlewareEngine.checkDoubleExecution(context)` |
| **File** | `src/lib/agents/safety-middleware.ts:137` |
| **Trigger** | Invoked within `AgentExecutor.run()` Step 4 (after AI decision, before approval), for every proposed action. |
| **Execution location** | Server-side Node.js process — single process, no cross-instance coordination. |
| **Persistence** | Process-local `recentActionHashes: Map<string, number>` only — **NOT durable**, **NOT shared** (F-004). |
| **Deduplication window** | 5 seconds: `now - lastExecuted < 5000` ❌ |
| **Key idempotency key** | `${organizationId}:${agentName}:${targetEntity}:${targetId}:${actionType}` |
| **Action on duplicate** | Returns `{ isDuplicate: true, hash: key }` — execution is intercepted and fails with `log.status = 'execution_failed'` and error `Double-Execution Intercepted`. |
| **After 5s window** | The action is allowed to proceed (hash updated to current time). No cross-instance coordination — a different instance can execute the same action after the 5s window even if the first instance is still running. |
| **Restart safety** | Lost on restart — map cleared. No durable tracking. |
| **Tenant context** | Org included in key but not enforced across instances. |
| **Key vulnerabilities** | F-004: 5s window is process-local only; F-014: Clock skew — if server clocks differ, window effectiveness varies. |

---

## 7. Tenant Context Propagation Topology

| Mechanism | Description | Cross-Process? |
|---|---|---|
| `udmStore.setTenantContext(orgId)` | Sets AsyncLocalStorage `getRequestTenant()` via `setRequestTenant(orgId)` | ❌ Process-local only |
| `getRequestTenant()` | Reads AsyncLocalStorage current store value | ❌ Process-local only |
| `runWithTenant(orgId, callback)` | Runs callback within new AsyncLocalStorage scope | ❌ Process-local only |
| `setRequestTenant(orgId)` | Directly enters orgId into AsyncLocalStorage | ❌ Process-local only |

**Critical finding:** All tenant context mechanisms are **process-local**. When a background job (e.g., promise check, report scheduler) is triggered by Vercel Cron or HTTP, it must re-establish the org context from the `orgId` parameter. The context is NOT propagated across process boundaries or function invocations.

**Topology diagram:**

```
[Vercel Cron or HTTP Trigger]
         |
         v
[Node.js Function Instance #1]          [Node.js Function Instance #2]
  │                                           │
  │   udmStore.setTenantContext(orgId)        │   udmStore.setTenantContext(orgId)
  ▼                                           ▼
[AsyncLocalStorage: orgId=X]                [AsyncLocalStorage: orgId=X]
  │                                           │
  │   All reads filtered by orgId=X             │   All reads filtered by orgId=X
  ▼                                           ▼
[In-memory Maps]                            [In-memory Maps]
  │                                           │
  │                                           │
   \_______________ No cross-process propagation __________/
```

---

## 8. Topology Summary

| Job Type | Trigger | Persistence | Concurrency | Restart Recovery | Key Gaps |
|---|---|---|---|---|---|
| **Report Scheduler** | Vercel Cron (unverified) | **None** (in-memory Map) | **None** | **None** (all schedules lost) | F-003, F-006 |
| **Promise Check (daily)** | Vercel Cron (unverified) | SQLite (via promiseStore) | **None** (local Set) | Partial (snapshot reload) | F-002, F-007, F-010 |
| **Collections Agent** | Invoked by promise check or API | SQLite (logs) | Partial (8-step pipeline + DB locks) | Partial (log persistence) | F-005, F-004 |
| **Agent Execution** | API route or agent logic | SQLite (invocation logs) | Partial (8-step pipeline) | Partial (log persistence) | F-005 |
| **Payment Match** | API route / batch job | Relational SQL (udm_*) | **Yes** (DB BEGIN IMMEDIATE) | **Yes** (relational) | None critical |
| **Idempotency check** | API route | Relational SQL + snapshot | **Yes** (DB + in-process lock) | **Yes** | None critical |

**Overall topology:** The application uses a **single-process-in-memory-with-SQLite-snapshot** topology. All background jobs run within the same process space, with state persisted to SQLite for durability (except ReportSchedulerStore and SafetyMiddleware recentActionHashes). No external workers, message queues, or distributed coordination exists. Concurrency protection relies on SQLite's `BEGIN IMMEDIATE` for write serialization and process-local guards for read/in-memory state.

**Only new repository file**: `004A-job-execution-topology.md`