# AIOSPARK DATABASE DURABILITY & TRANSACTION FORENSIC AUDIT

**Task:** TASK 002 — Database Durability & Transaction Forensic Audit (investigation only)
**Status:** Complete
**Branch:** `high-008-baseline`
**Commit SHA:** `ba8ee7ed100067ececc21f4bd6a2e7e62409a598`
**Application source modified:** No
**Schema/migrations modified:** No
**Dependencies modified:** No
**Tests modified:** No
**Commits/merges:** None

---

## 1. Executive summary

A read-only forensic audit of the database and persistence architecture was performed on `high-008-baseline` (`ba8ee7ed`). The investigation traced the persistence stack from the SQLite connection layer through four repository layers (governance, operational, relational, durable), the UDM in-memory store, approval/audit/billing/execution stores, and the execution service.

**Primary finding (P0):** A deterministic audit-event ID collision in `updateApprovalRequest()` (`src/lib/db/governance-repository.ts:142`) causes `UNIQUE constraint failed: audit_events.id` (SQLite errcode 1555). The collision occurs because `updateApprovalRequest` and `insertApprovalRequest` both derive audit-event IDs solely from the business record ID (e.g. `audit_approval_request_update_${request.id}`) with no sequence or version component. When the same approval request is audited twice — which happens on every approve→execute flow (`approveRequest` calls `updateApprovalRequest`, then `markExecutionResult` calls `updateApprovalRequest` again for the same `request.id`) — the second `INSERT` hits the PRIMARY KEY constraint, rolls back the entire `withWriteTransaction`, and invalidates the financial operation.

This single defect cascades into:
- `test:master` — Section 8 O2C Core E2E crashes (1 failed section)
- `test:financial-stress` — concurrent payment matching aborts at Stress Test 3
- `test:durability` — `updateApprovalRequest` → `appendAuditEvent` aborts mid-write
- `test:financial` — API idempotency cases 10c and 10e fail (related idempotency logic regression)

**Secondary findings:**
- `test:financial` 10c/10e failures stem from crash-recovery idempotency logic (`'reserved' → 'recoverable'`) added in `high-008-baseline` that the existing test expectations do not account for (`checkAndReserveApiIdempotency` at `src/lib/udm/store.ts:278-312`).
- Most operational-repository write methods (`insertExecution`, `insertReconciliationOutcome`, `insertImportBatch`, `insertAuthUser`, `insertTenantMember`, etc.) write directly to SQLite without `withWriteTransaction` — no atomicity when invoked outside a store-level transaction wrapper.
- `audit_events`, `execution_records`, and several operational tables lack tenant guard triggers despite having `organization_id` columns.
- In `:memory:` test mode, `withWriteTransaction` skips `BEGIN IMMEDIATE`/`COMMIT` entirely — no real SQLite transaction isolation exists for the test suites that run in-memory.
- The `_transactionLock` promise chain in UDM store serializes `udmStore.transaction()` calls but does NOT cover `checkAndReserveApiIdempotency`/`runWrite` paths, creating a potential concurrency gap.

**Branch comparison:** `main` does NOT contain `src/lib/db/governance-repository.ts` (it does not exist on `main`), and `main` passes all database-related test suites. All confirmed defects are regressions introduced by `high-008-baseline`.

---

## 2. Exact branch and commit SHA

| Field | Value |
|-------|-------|
| Branch | `high-008-baseline` |
| Commit SHA | `ba8ee7ed100067ececc21f4bd6a2e7e62409a598` |
| Commit message | commit |
| Remote tracking | `origin/high-008-baseline` (up to date) |
| Working tree | Clean except for `docs/audits/AIOSPARK_CICD_FORENSIC_AUDIT.md` (Task 001 deliverable) |

---

## 3. Database architecture and source-of-truth diagram

### Connection layer (`src/lib/db/durable-repository.ts`)

A single synchronous `DatabaseSync` (Node.js `node:sqlite`) connection is opened at module load:

```
AIOSPARK_DB_PATH env → file-backed SQLite (WAL, busy_timeout=5000, foreign_keys=ON)
AIOSPARK_TEST_MODE=true → ':memory:' (no disk persistence)
```

In `:memory:` mode, `withWriteTransaction()` **does not issue** `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` — it only tracks an async-local depth counter. Real transaction isolation is absent in all test suites that set `AIOSPARK_TEST_MODE=true` (`test:master`, `test:financial`, `test:financial-stress`, `test:unit`, `test:integration`, `test:security`).

### Repository layers

| Layer | File | Authoritative for | Transaction-wrapped? |
|-------|------|-------------------|---------------------|
| Durable | `durable-repository.ts` | `repository_snapshots` (legacy JSON snapshots), `repository_schema_migrations` | Yes (`writeSnapshot`, `deleteSnapshot`, etc.) |
| Relational | `relational-repository.ts` | `udm_*` tables (customers, invoices, payments, matches, credit notes, allocations, disputes, exceptions, bank transactions, idempotency keys) | Yes (`writeUdmRelationalState/Delta/Invoices`, `backfillUdmFromSnapshot`) |
| Governance | `governance-repository.ts` | `approval_requests`, `approval_decisions`, `approval_logs`, `approval_autonomy_configs`, `billing_subscriptions`, `billing_subscription_history`, `audit_events`, `governance_migrations` | Partial (`insertApprovalRequest`, `updateApprovalRequest`, `insertBillingSubscription`, `backfillGovernanceFromSnapshots`; NOT `insertApprovalDecision`, `insertApprovalLog`, `upsertAutonomyConfig`, `appendAuditEvent` directly) |
| Operational | `operational-repository.ts` | `execution_records`, `reconciliation_outcomes`, `import_*`, `auth_*`, `tenant_*`, `billing_*_operational` | No (only `backfillOperationalFromSnapshots` uses `withWriteTransaction`; all individual inserts/updates are direct writes) |

### Source-of-truth matrix

| Entity | Authoritative store | Cache layer | Notes |
|--------|--------------------|-------------|-------|
| Customers | `udm_customers` (relational) | UDM `customers` Map | Relational table is source of truth; snapshot is legacy compat view |
| Invoices | `udm_invoices` (relational) | UDM `invoices` Map | Same |
| Payments | `udm_payments` (relational) | UDM `payments` Map | Same |
| Payment matches | `udm_payment_matches` (relational) | UDM `matches` Map | Same |
| Credit notes/allocations | `udm_credit_notes`, `udm_credit_allocations` | UDM Maps | Same |
| Approval requests | `approval_requests` (governance) | ApprovalStore `requests` Map | Governance table is authoritative |
| Approval decisions | `approval_decisions` (governance) | — | No in-memory cache |
| Audit events | `audit_events` (governance) | AuditStore `internalLogs` array + Proxy | Append-only, triggers enforce immutability |
| Billing subscriptions | `billing_subscriptions` (governance) | — | `organization_id` is PK |
| Execution records | `execution_records` (operational) | ExecutionStore | No tenant guard trigger |
| Reconciliation outcomes | `reconciliation_outcomes` (operational) | — | No tenant guard trigger |
| Tenant members | `tenant_members` (operational) | — | `UNIQUE(user_id, organization_id)` |
| Tenant records | `tenant_records` (operational) | — | Composite PK `(table_name, id)` |

### Direct-snapshot provider compatibility

`durable-repository.ts:registerDirectSnapshotProvider` registers providers so legacy `readSnapshot('udm'|'billing'|'audit'|...)()` calls are served from relational tables. This creates a dual-read path: legacy snapshot reads and relational reads must stay in sync.

---

## 4. Repository and transaction-boundary map

### `withWriteTransaction` (`durable-repository.ts:100-140`)

```js
export function withWriteTransaction<T>(callback: () => T): T {
  const currentDepth = getTxDepth();  // AsyncLocalStorage depth counter
  if (currentDepth > 0) {
    setTxDepth(currentDepth + 1);
    try { return callback(); } finally { setTxDepth(currentDepth); }
  }
  if (databasePath === ':memory:') {
    return runWithTxDepth(1, () => { try { return callback(); } finally { setTxDepth(0); } });
  }
  return runWithTxDepth(1, () => {
    database.exec('BEGIN IMMEDIATE');
    try { const result = callback(); database.exec('COMMIT'); return result; }
    catch (error) { try { database.exec('ROLLBACK'); } catch {}; throw error; }
    finally { setTxDepth(0); }
  });
}
```

Key observations:
- **Nested calls join the outer transaction** via AsyncLocalStorage depth tracking (per async context).
- **`:memory:` mode skips `BEGIN`/`COMMIT` entirely** — no SQLite transaction isolation in test mode.
- **Single `DatabaseSync` connection** — all writes serialize on one connection within a process; cross-process serialization relies on `busy_timeout = 5000` + WAL.

### Operations inside `withWriteTransaction`

| Method | File:Line | Wrapped? | What it protects |
|--------|-----------|----------|------------------|
| `insertApprovalRequest` | governance-repository.ts:84 | Yes | approval_requests INSERT + audit_events INSERT |
| `updateApprovalRequest` | governance-repository.ts:119 | Yes | approval_requests UPDATE + audit_events INSERT |
| `insertBillingSubscription` | governance-repository.ts:247 | Yes | billing_subscriptions INSERT + audit_events INSERT |
| `updateBillingSubscription` | governance-repository.ts:286 | **No** (direct `UPDATE` + `appendAuditEvent` call) | — |
| `appendAuditEvent` | governance-repository.ts:370 | **No** (direct INSERT) | — |
| `insertApprovalDecision` | governance-repository.ts:160 | **No** (direct INSERT) | — |
| `insertApprovalLog` | governance-repository.ts:177 | **No** (direct INSERT) | — |
| `upsertAutonomyConfig` | governance-repository.ts:193 | **No** (direct upsert) | — |
| `backfillGovernanceFromSnapshots` | governance-repository.ts:600 | Yes | All three namespaces in one transaction |
| `insertExecution` | operational-repository.ts:35 | **No** (direct INSERT) | — |
| `updateExecution` | operational-repository.ts:63 | **No** (direct UPDATE) | — |
| `insertReconciliationOutcome` | operational-repository.ts:91 | **No** (direct INSERT) | — |
| `insertImportBatch/Error/Duplicate` | operational-repository.ts:120/145/157 | **No** (direct INSERT) | — |
| `insertAuthUser/Organization` | operational-repository.ts:194/222 | **No** (direct INSERT) | — |
| `insertTenantMember/Invite/Record` | operational-repository.ts:282/293/305 | **No** (direct INSERT) | — |
| `insertBilling*Event` | operational-repository.ts:341/352/366/388 | **No** (direct INSERT) | — |
| `writeUdmRelationalState` | relational-repository.ts:314 | Yes | DELETE ALL + re-insert all udm_* tables |
| `writeUdmRelationalInvoices` | relational-repository.ts:424 | Yes | Upsert invoices only |
| `writeUdmRelationalDelta` | relational-repository.ts:440 | Yes | Selective upserts, full rewrite on deletion |
| `backfillUdmFromSnapshot` | relational-repository.ts:674 | Yes | Empty-check + project + delete snapshot |
| `runWrite` (UDM store) | udm/store.ts:209 | Yes | Cache reload + mutation + persist |
| `persist` (UDM store) | udm/store.ts:373 | Yes (nested, joins outer) | Relational projection write |
| `runMutation` (ApprovalStore) | approvals/store.ts:117 | Yes | Cache reload + mutation |
| `record` (AuditStore) | audit/store.ts:126 | Yes | Audit append + durable write |

### Operations OUTSIDE any transaction boundary (direct writes)

The vast majority of operational-repository methods write directly via `getDatabase().prepare(...).run(...)` with no `BEGIN`/`COMMIT`. When called from an API route (not through `runMutation`/`runWrite`), these writes are **not atomic** and can leave partial state on failure. Examples: `insertExecution`, `updateExecution`, `insertReconciliationOutcome`, `insertImportBatch`, `insertAuthUser`, `insertTenantMember`, `insertBillingPayment`, `insertBillingWebhookEvent`.

---

## 5. Audit-event ID collision: exact root cause and call sequence

### Root cause (P0 — Confirmed defect)

**File:** `src/lib/db/governance-repository.ts`
**Schema:** `src/lib/db/governance-schema.ts:149-150` — `audit_events.id TEXT PRIMARY KEY`

**Audit-event ID generation by caller:**

| Caller | File:Line | Audit-event ID | Deterministic? | Collision risk |
|--------|-----------|----------------|----------------|----------------|
| `insertApprovalRequest` | governance-repository.ts:95 | `audit_approval_request_create_${request.id}` | Yes | **High** — re-inserting same request id collides |
| `updateApprovalRequest` | governance-repository.ts:142 | `audit_approval_request_update_${request.id}` | Yes | **High** — updating same request twice collides |
| `insertBillingSubscription` | governance-repository.ts:268 | `audit_billing_subscription_create_${subscription.id}` | Yes | **High** — re-inserting same subscription id collides |
| `updateBillingSubscription` | governance-repository.ts:315 | `audit_billing_subscription_update_${id ?? 'temp'}_${Math.random().slice(2,9)}` | No (random) | Low but non-zero |
| `auditStore.record` | audit/store.ts:112 | `audit_${Date.now()}_${Math.random().slice(2,7)}` | No | Extremely low (same-millisecond collision possible) |

**The precise collision:** `updateApprovalRequest` generates `audit_approval_request_update_${request.id}` — derived solely from the approval request ID. Every call to `updateApprovalRequest` for the same `request.id` produces the **identical** audit-event ID. The second `INSERT INTO audit_events` violates `id TEXT PRIMARY KEY` and throws `SQLITE_CONSTRAINT_PRIMARYKEY` (errcode 1555).

### Exact execution sequence that produces the collision

Every approval execution flow in `high-008-baseline` follows this sequence:

```
1. approvalStore.createRequest(data)           [approvals/store.ts:129]
   → runMutation → withWriteTransaction
   → insertApprovalRequest(req)                [governance-repository.ts:83]
   → appendAuditEvent({id: 'audit_approval_request_create_' + id})   ✓ first insert OK

2. approvalStore.approveRequest(id, reviewer)  [approvals/store.ts:198]
   → runMutation → withWriteTransaction
   → updateApprovalRequest(req)                [governance-repository.ts:113]
   → appendAuditEvent({id: 'audit_approval_request_update_' + id})   ✓ first update OK

3. executionService.executeApprovedAction(id)  [execution/service.ts:160]
   → ... (payment allocation, verification) ...
   → approvalStore.markExecutionResult(id, 'succeeded')  [approvals/store.ts:364]
   → runMutation → withWriteTransaction
   → updateApprovalRequest(req)                [governance-repository.ts:113]
   → appendAuditEvent({id: 'audit_approval_request_update_' + id})   ✗ COLLISION!
   → UNIQUE constraint failed: audit_events.id
   → withWriteTransaction ROLLBACK
   → approval update (execution_status, executed_at, etc.) LOST
```

### Evidence from test execution

**`test:master` (Section 8 — O2C Core E2E):**
```
❌ Section 8 — End-to-End User Journeys: 1 failed
   - O2C Core E2E crashed: UNIQUE constraint failed: audit_events.id
```
Stack:
```
at appendAuditEvent (governance-repository.ts:377:6)
at <anonymous> (governance-repository.ts:141:5)   -- updateApprovalRequest calls appendAuditEvent
at withWriteTransaction (durable-repository.ts:107:14)
at updateApprovalRequest (governance-repository.ts:119:3)
at <anonymous> (approvals/store.ts:383:5)         -- markExecutionResult calls updateApprovalRequest
at <anonymous> (approvals/store.ts:121:16)        -- runMutation wrapper
```

**`test:financial-stress` (Stress Test 3 — Concurrent payment matching):**
```
🚨 Financial Stress Test Suite error: Error: UNIQUE constraint failed: audit_events.id
    at appendAuditEvent (governance-repository.ts:377:6)
    at updateApprovalRequest (governance-repository.ts:119:3)
    at <anonymous> (approvals/store.ts:383:5)
```
20 concurrent `allocatePayment()` calls each run create → approve → execute. The first approval to reach step 3 collides with its own step-2 audit insert, crashing the suite.

**`test:durability`:**
```
🚨 SQLite Durability Test execution error: Error: UNIQUE constraint failed: audit_events.id
    at appendAuditEvent (governance-repository.ts:377:6)
    at updateApprovalRequest (governance-repository.ts:119:3)
```
The durability test creates an approval, approves it (audit update #1), executes it via `executionService` (audit update #2 → collision), then closes and restarts. The write never commits because the transaction rolls back.

**`test:financial` (API idempotency 10c/10e):** Related regression in `checkAndReserveApiIdempotency` (see section 11 below).

### Can one failed audit write invalidate a financial operation?

**Yes.** Because `appendAuditEvent` is called **inside** `withWriteTransaction` alongside the business write, a PRIMARY KEY violation on the audit roll back the entire transaction — including the approval status change, execution result, and any related financial mutations. The audit write is not independent; it is a single point of failure for the entire operation.

### Is audit-event insertion idempotent?

**No.** `appendAuditEvent` performs a plain `INSERT` with no `ON CONFLICT` clause, no existence check, and no idempotency key. The schema enforces append-only via triggers (no UPDATE/DELETE), but there is no protection against duplicate INSERTs with the same ID.

---

## 6. Concurrency and locking findings

### Locking mechanisms

1. **`AsyncLocalStorage` tx depth** (`durable-repository.ts:81-98`): Per-async-context depth counter. Prevents nested `withWriteTransaction` from issuing duplicate `BEGIN`. Only prevents nesting within the same async context — does NOT serialize across different async contexts (different requests).

2. **`BEGIN IMMEDIATE`** (`durable-repository.ts:124`): Acquires SQLite write lock up front. In file-backed mode, this serializes writers at the SQLite level. Cross-process: `busy_timeout = 5000` (5-second wait). WAL mode enabled with retry loop.

3. **`_transactionLock`** (`udm/store.ts:75, 344-371`): Promise chain that serializes `udmStore.transaction()` calls. **Does NOT cover** `runWrite`/`checkAndReserveApiIdempotency`/`finalizeApiIdempotency` paths, which call `withWriteTransaction` directly.

4. **`idempotencyLocks`** (`udm/store.ts:71, 244-267`): Per-key `Promise` map for `withIdempotencyLock`. Serializes same-key operations within a process. Note: `withIdempotencyLock` checks `this.idempotencyKeys` (allocation-key map) but API idempotency writes to `this.apiIdempotencyKeys` — different maps, so the in-flight check never matches for API idempotency (only the lock promise provides serialization).

5. **SQLite triggers**: `approval_decisions_tenant_guard`, `approval_logs_tenant_guard`, `billing_history_tenant_guard` enforce tenant consistency at insert time. **No trigger on `audit_events` or `execution_records`.**

### Concurrency test results

| Scenario | Result |
|----------|--------|
| 20 concurrent payment allocations (Stress Test 3) | **FAIL** — first `updateApprovalRequest` re-call collides on audit ID |
| 2 concurrent allocations same payment+invoice (Stress Test 4) | Not reached (suite crashes at Test 3) |
| Same idempotency key, identical payload | `withIdempotencyLock` serializes; second call returns 'recoverable' (not 'replay' — see 10c) |
| Same idempotency key, conflicting payload | Returns 'recoverable' (not 'conflict' — see 10e) |
| Concurrent writes same invoice | Not tested in isolation; UDM `validateState` checks tenant + ref integrity at persist time |

### Cross-process safety

**Unverified.** `busy_timeout = 5000` + WAL provides SQLite-level serialization across processes, but:
- The `databasePath === ':memory:'` code path disables all transactions — cross-process safety is meaningless for in-memory databases.
- No evidence was gathered of multi-process concurrent writes (durability test uses a single writer process + a separate reader process after close).
- The `_transactionLock` and `idempotencyLocks` are per-process only; they provide no cross-process guarantee.

---

## 7. Crash-recovery and migration findings

### Migration restart-safety

**Governance migrations** (`backfillGovernanceFromSnapshots`, governance-repository.ts:600-614):
- Three namespaces (`approvals`, `billing`, `audit`) backfilled in ONE `withWriteTransaction`.
- Each namespace guarded by `migrationExists()` check + `markMigration()` marker row.
- Snapshot deletion and row insertion share the transaction.
- **Crash-safe:** A SIGKILL before COMMIT leaves no marker, no rows, and original snapshots intact. Restart is safe.
- **Confirmed restart-safe design.**

**Operational migrations** (`backfillOperationalFromSnapshots`, operational-repository.ts:588-609):
- Eight namespaces backfilled in ONE `withWriteTransaction`.
- Each namespace guarded by `markerExists()` + `mark()`.
- Individual inserts use try/catch swallowing `UNIQUE` errors (e.g. `backfillExecutions` line 467-469).
- **Crash-safe design with idempotent backfills.**

**UDM migration** (`backfillUdmFromSnapshot`, relational-repository.ts:674-687):
- Emptiness check + projection + snapshot deletion in ONE transaction.
- **Crash-safe design.**

### Crash during write

- **File-backed mode:** `BEGIN IMMEDIATE` + `COMMIT`/`ROLLBACK` in `withWriteTransaction`. If the process dies mid-transaction, SQLite discards uncommitted WAL frames on next open. No partial financial state.
- **`:memory:` mode:** No transaction at all (`withWriteTransaction` skips `BEGIN`/`COMMIT`). A crash during `runWrite` leaves in-memory state potentially inconsistent with the (also in-memory) SQLite projection. Data is lost entirely on process exit anyway (no persistence).

### Crash between snapshot persistence and relational projection

The UDM store's `persist()` (`udm/store.ts:373-392`) writes to relational tables inside `withWriteTransaction`, then updates `lastPersistedState`. If the process crashes between the relational write and the `lastPersistedState` update, the next `writeUdmRelationalDelta` call computes a delta against a stale `lastPersistedState` — potentially missing changes or performing unnecessary full rewrites. Not data-losing, but can cause redundant work.

### Migration re-execution

All migration markers use `INSERT OR IGNORE` and `migrationExists()`/`markerExists()` guard checks. Re-running the same migration is safe. **Confirmed.**

### WAL/checkpoint behavior

WAL mode is enabled at boot with a 20-attempt retry loop for `SQLITE_BUSY`. No explicit `PRAGMA wal_checkpoint()` is called — SQLite auto-checkpoints. Default WAL auto-checkpoint threshold (1000 pages) applies. No evidence of checkpoint-related issues.

---

## 8. Cross-repository consistency findings

### Source-of-truth divergence risks

| Risk | File | Impact |
|------|------|--------|
| Dual read path: `readSnapshot()` vs relational reads | `durable-repository.ts:181` / `relational-repository.ts:611` | Legacy snapshot reads and relational reads may diverge if `registerDirectSnapshotProvider` providers return stale data |
| `lastPersistedState` staleness | `udm/store.ts:77, 391` | Delta writes use `lastPersistedState` to compute changes; if stale, delta may miss updates or trigger unnecessary full rewrites |
| `writeUdmRelationalState` DELETE ALL + re-insert | `relational-repository.ts:332-333` | Atomic but destructive; any failure mid-insert leaves empty tables (rolled back by transaction) |
| Governance/operational writes bypass UDM store | `operational-repository.ts` (30+ direct write methods) | No cross-repository atomicity between UDM state and execution/audit/tenant state |

### Non-atomic multi-repository operations

**`approveRequest`** (`approvals/store.ts:198-246`):
1. `updateApprovalRequest(req)` — writes `approval_requests` + `audit_events` (governance, transaction-wrapped) ✓
2. `insertApprovalDecision(req)` — writes `approval_decisions` (governance, **direct write, NOT transaction-wrapped**) ✗
3. `insertApprovalLog(decisionLog, ...)` — writes `approval_logs` (governance, **direct write, NOT transaction-wrapped**) ✗
4. `AuditService.record(...)` — writes `audit_events` via `withWriteTransaction` (audit/store.ts:126) — SEPARATE transaction ✗

Steps 2-4 run outside the `withWriteTransaction` that wraps step 1 (they are called inside the `runMutation` callback, but `insertApprovalDecision`/`insertApprovalLog` do not use `withWriteTransaction` themselves — they rely on being nested inside the outer transaction via the same database connection. However, since `DatabaseSync` is synchronous and single-connection, they DO execute within the outer transaction's scope in practice. But this is implicit, not explicit — a future refactor could break it.)

**Step 4 (`AuditService.record`) opens its own `withWriteTransaction`** — if called inside `approveRequest`'s `runMutation` (which already holds a `withWriteTransaction`), it nests via AsyncLocalStorage depth. But `auditStore.record` also calls `this.reloadFromDurableState()` and manipulates the in-memory `internalLogs` array, which is not transaction-protected.

### Partial-commit risk

If `appendAuditEvent` throws (P0 collision), `withWriteTransaction` rolls back — including the approval UPDATE. But `insertApprovalDecision` and `insertApprovalLog` called after `updateApprovalRequest` in `approveRequest` would NOT execute (the throw propagates). So the approval status change is rolled back, and the decision/log are never written. **Atomic in practice for this specific flow, but relies on the exception propagating correctly.**

---

## 9. Financial integrity findings

### Persistence lifecycle trace

**Invoice creation → payment match → allocation:**

1. `udmStore.insertInvoice(...)` → writes to UDM `invoices` Map; calls `persist()` → `writeUdmRelationalDelta` → `udm_invoices` upsert (transaction-wrapped)
2. `approvalStore.createRequest(...)` → `insertApprovalRequest` → `approval_requests` + `audit_events` (transaction-wrapped) ✓
3. `approvalStore.approveRequest(...)` → `updateApprovalRequest` → `approval_requests` UPDATE + `audit_events` INSERT (transaction-wrapped) ✓ — **but second call collides (P0)**
4. `executionService.executeApprovedAction(...)` → `executePaymentAllocation` → `udmStore.insertMatch(...)` → `udm_payment_matches` upsert → `udmStore.updateInvoice(...)` → invoice status update → `persist()`
5. `approvalStore.markExecutionResult(...)` → `updateApprovalRequest` → **COLLISION on audit_events.id** (P0) → transaction rolls back → `execution_status` never updated

**Financial state vs. audit/idempotency atomicity:**

- **Invoice + match + allocation:** All written to relational tables in `persist()` inside `withWriteTransaction` — atomic ✓
- **Approval + audit:** `updateApprovalRequest` writes both in one transaction — atomic, BUT collides on re-call (P0) ✗
- **Execution record + approval result:** `insertExecution` (operational, direct write) and `markExecutionResult` → `updateApprovalRequest` (governance, transaction-wrapped) — NOT atomic with each other ✗
- **Idempotency key + financial mutation:** `checkAndReserveApiIdempotency` → `runWrite` → `persist()` — key reservation and state mutation in same `runWrite` transaction. But `finalizeApiIdempotency` is a SEPARATE `runWrite` call — not atomic with the mutation ✗

### Untested failure scenarios

1. **Audit-event ID reuse on retry** — If a client retries an approval execution, `markExecutionResult` → `updateApprovalRequest` collides on the same audit ID. No retry-safe path exists.
2. **Concurrent approval updates** — Two concurrent requests updating the same approval (e.g. approve + reject) would serialize on the single SQLite connection, but the second `updateApprovalRequest` collides on the deterministic audit ID.
3. **`insertApprovalDecision`/`insertApprovalLog` outside `approveRequest`** — These direct writes have no transaction protection if invoked outside the store wrapper.
4. **`finalizeApiIdempotency` crash between mutation and finalize** — The idempotency key remains 'reserved' (not 'committed'); a retry sees 'recoverable' and may re-execute the financial operation.
5. **Cross-repository atomicity** — No transaction spans UDM relational writes + governance approval writes + operational execution writes.

---

## 10. Tenant-isolation findings (persistence layer)

### Tenant guard triggers (database-enforced)

| Table | Trigger | File:Line |
|-------|---------|-----------|
| `approval_decisions` | `approval_decisions_tenant_guard` | governance-schema.ts:46-53 |
| `approval_logs` | `approval_logs_tenant_guard` | governance-schema.ts:82-89 |
| `billing_subscription_history` | `billing_history_tenant_guard` | governance-schema.ts:125-133 |

### Tables WITHOUT tenant guard triggers

| Table | File:Line | Risk |
|-------|-----------|------|
| `audit_events` | governance-schema.ts:149 | Any organization_id can be inserted; no cross-tenant prevention at DB level |
| `execution_records` | operational-schema.ts:9 | No tenant guard |
| `reconciliation_outcomes` | operational-schema.ts:46 | No tenant guard |
| `import_batches` | operational-schema.ts:64 | No tenant guard |
| `auth_users` / `auth_organizations` | operational-schema.ts:104/120 | No tenant guard (auth is global by design) |
| `tenant_records` | operational-schema.ts:162 | Composite PK `(table_name, id)` — no organization_id uniqueness enforcement |

### Application-level tenant enforcement

- `udmStore.validateState()` (`udm/store.ts:399-479`): Asserts `target.organization_id !== organizationId` throws "crosses tenant boundary" — enforced at persist time for invoices, payments, matches, credit notes, allocations, disputes, contacts, exceptions.
- `tenantStore.setSessionTenantContext()` / `getSessionTenantContext()` — request-scoped tenant context via `src/lib/tenant/request-context.ts`.
- `auditStore.query()` — enforces `log.organization_id !== filter.organizationId` → filtered out (application-level RLS).
- `udmStore.getInvoices()` / `getCustomers()` etc. — filter by current tenant context.

### Potential bypasses

1. **`audit_events` has no tenant guard trigger** — a direct SQL insert could place an audit event with any `organization_id`. Application code sets `organization_id` correctly, but there is no database-level enforcement.
2. **`insertTenantRecord(tableName, ...)`** (`operational-repository.ts:305`) — accepts arbitrary `tableName` and `record.id` with no validation that the caller owns the tenant or that the record belongs to the organization in context.
3. **Background operations** — No evidence of background jobs that might lose tenant context (`AsyncLocalStorage` tenant context is request-scoped).
4. **`tenant_records` PK is `(table_name, id)`** — two different organizations could insert records with the same `(table_name, id)` but different `organization_id`, since `organization_id` is not part of the primary key.

---

## 11. Test execution results and reproduction evidence

### Environment

- Node: `v26.7.0`, npm: `11.19.0`
- Isolated `/tmp/*.sqlite` databases for file-backed tests; `:memory:` for `AIOSPARK_TEST_MODE=true` tests
- No existing user data modified; no source/schema/dependency/test changes

### Full results on `high-008-baseline` (`ba8ee7ed`)

| Command | Exit | Result | Classification |
|---------|------|--------|----------------|
| `npm ci` | 0 | PASS | — |
| `npm run lint` | 1 | FAIL | Lint (5 errors in new scripts) |
| `npm run typecheck` | 0 | PASS | — (`next typegen && tsc --noEmit`) |
| `npm run test:scan` | 0 | PASS | — |
| `npm run test:unit` | 0 | PASS | 11/11 |
| `npm run test:integration` | 0 | PASS | 7/7 |
| `npm run test:security` | 0 | PASS | 12/12 |
| `npm run test:financial` | 1 | FAIL | Financial correctness (2 failures: 10c, 10e) |
| `npm run test:master` | 1 | FAIL | Database durability / Financial correctness (1 failure: O2C E2E audit collision) |
| `npm run test:financial-stress` | 1 | FAIL | Database durability / Financial correctness (audit collision at Stress Test 3) |
| `npm run test:durability` | 1 | FAIL | Database durability (audit collision during updateApprovalRequest) |
| `npm run test:pilot-security` | 0 | PASS | 28/28 |
| `npm run build` | 0 | PASS | — |

### Logs captured

All command outputs saved to `/tmp/*_high.log`:
- `/tmp/lint_high.log` — 5 lint errors
- `/tmp/tc_high.log` — typecheck clean
- `/tmp/scan_high.log` — scan clean
- `/tmp/master_high.log` — master: 160 PASSED, 1 FAILED (Section 8, audit_events.id UNIQUE)
- `/tmp/finstress_high.log` — financial-stress: UNIQUE constraint failed at appendAuditEvent
- `/tmp/durability_high.log` — durability: UNIQUE constraint failed at updateApprovalRequest → appendAuditEvent
- `/tmp/fin_high.log` — financial: 52 PASSED, 2 FAILED (10c replay, 10e conflict)
- `/tmp/pilot_high.log` — pilot-security: 28/28 PASS
- `/tmp/build_high.log` — build: PASS
- `/tmp/unit_high.log`, `/tmp/int_high.log`, `/tmp/sec_high.log` — all PASS

### `main` branch comparison (same commands, Task 001)

| Command | main | high-008-baseline |
|---------|------|-------------------|
| `npm run lint` | PASS | FAIL (5 errors) |
| `npm run typecheck` | FAIL (local `.next/` noise) | PASS |
| `npm run test:financial` | PASS (54/54) | FAIL (2: 10c, 10e) |
| `npm run test:master` | PASS (187/0) | FAIL (1: O2C E2E) |
| `npm run test:financial-stress` | PASS | FAIL |
| `npm run test:durability` | PASS (27/0) | FAIL |
| `npm run test:pilot-security` | PASS (28/0) | PASS (28/0) |
| `npm run build` | PASS | PASS |

All failures on `high-008-baseline` are regressions; `main` has no confirmed database defects.

---

## 12. Findings classified by severity

### P0 — Critical data loss/corruption (Confirmed defect)

| ID | Finding | File:Line | Evidence | Impact |
|----|---------|-----------|----------|--------|
| P0-1 | Deterministic audit-event ID collision in `updateApprovalRequest` / `insertApprovalRequest` / `insertBillingSubscription` | `governance-repository.ts:95,142,268`; `governance-schema.ts:150` | `UNIQUE constraint failed: audit_events.id` (errcode 1555) in master, financial-stress, durability | Approval execution, billing subscription updates, and any re-audit of the same record fail; transaction rolls back the financial operation |
| P0-2 | Audit write inside transaction invalidates financial operation on collision | `governance-repository.ts:84-109, 113-157` | Same stack trace as P0-1 | Financial operation (approval status, execution result) is rolled back when audit insert fails |

### P1 — Financial correctness / transaction integrity (Confirmed defect)

| ID | Finding | File:Line | Evidence | Impact |
|----|---------|-----------|----------|--------|
| P1-1 | `checkAndReserveApiIdempotency` returns 'recoverable' instead of 'replay'/'conflict' for reserved-but-uncommitted keys | `udm/store.ts:278-312` | `test:financial` 10c expects 'replay' gets 'recoverable'; 10e expects 'conflict' gets 'recoverable' | Idempotency contract violated; callers cannot distinguish replay from crash-recovery |
| P1-2 | `finalizeApiIdempotency` is a separate transaction from the mutation it finalizes | `udm/store.ts:318-331` | `finalizeApiIdempotency` → `runWrite` (separate `withWriteTransaction`) | Crash between mutation and finalize leaves key 'reserved'; retry may re-execute financial operation |
| P1-3 | Most operational-repository writes lack transaction wrapping | `operational-repository.ts:36-442` (30+ methods) | `insertExecution`, `updateExecution`, `insertImportBatch`, `insertAuthUser`, `insertTenantMember`, etc. all use direct `getDatabase().prepare().run()` without `withWriteTransaction` | Partial writes possible on failure; no atomicity for multi-step financial operations outside store wrappers |

### P2 — Recovery, reliability, operational weaknesses

| ID | Finding | File:Line | Evidence | Impact |
|----|---------|-----------|----------|--------|
| P2-1 | `withWriteTransaction` skips `BEGIN`/`COMMIT` in `:memory:` mode | `durable-repository.ts:113-121` | Code path: `if (databasePath === ':memory:') return runWithTxDepth(1, ...)` | Test suites (`test:master`, `test:financial`, `test:financial-stress`) run with no real SQLite transaction isolation; transaction-related defects may not surface in tests |
| P2-2 | `_transactionLock` does not cover `runWrite`/`checkAndReserveApiIdempotency` paths | `udm/store.ts:344-371` vs `udm/store.ts:209` | `transaction()` uses promise chain; `checkAndReserveApiIdempotency` calls `runWrite`→`withWriteTransaction` directly | Potential concurrency gap between `udmStore.transaction()` and API idempotency paths |
| P2-3 | `lastPersistedState` staleness can cause redundant full rewrites | `udm/store.ts:77, 391` | `writeUdmRelationalDelta` compares against `lastPersistedState` | Performance degradation; not data-losing |
| P2-4 | No explicit WAL checkpoint; relies on auto-checkpoint | `durable-repository.ts:27-43` | `PRAGMA journal_mode = WAL` only; no `wal_checkpoint()` | Unverified under sustained write load |

### P3 — Maintainability and observability

| ID | Finding | File:Line | Evidence | Impact |
|----|---------|-----------|----------|--------|
| P3-1 | `audit_events`, `execution_records`, and most operational tables lack tenant guard triggers | `governance-schema.ts:149`, `operational-schema.ts:9` | Only `approval_decisions`, `approval_logs`, `billing_subscription_history` have tenant guards | No database-level cross-tenant prevention for audit/execution/import tables |
| P3-2 | `insertBillingSubscription` uses `ON CONFLICT(organization_id) DO NOTHING` — silent no-op on conflict | `governance-repository.ts:253` | `INSERT ... ON CONFLICT(organization_id) DO NOTHING` | Duplicate subscription creation silently ignored; caller cannot distinguish success from no-op |
| P3-3 | `updateBillingSubscription` audit ID uses `Math.random()` — non-zero collision probability | `governance-repository.ts:315` | `${subscription.id ?? 'temp'}_${Math.random().toString(36).substring(2, 9)}` | Theoretical audit ID collision under high concurrency |
| P3-4 | `withIdempotencyLock` checks `idempotencyKeys` map but API idempotency writes to `apiIdempotencyKeys` map | `udm/store.ts:244-267` vs `udm/store.ts:284-311` | Different maps for allocation vs API idempotency | In-flight check never matches for API idempotency; only lock promise serializes |

---

## 13. Recommended remediation order

1. **P0-1/P0-2 — Fix audit-event ID collision (critical):** Make audit-event IDs unique per (subject, action, sequence). Options: append an incrementing sequence per subject_id, or use `crypto.randomUUID()`, or include a timestamp with nanosecond precision + counter. Do NOT use `INSERT OR IGNORE` as a blanket fix (audit events must not be silently dropped). Ensure a failed audit write does not roll back the financial operation — consider making audit insertion best-effort or using a separate transaction with error isolation.

2. **P1-1 — Fix idempotency status mismatch:** Align `checkAndReserveApiIdempotency` return values with the test contract ('replay' for same key+same fingerprint when committed; 'conflict' for same key+different fingerprint). The 'recoverable' status for crash recovery should only apply when the key was reserved but the operation's completion state is unknown.

3. **P1-3 — Add transaction wrapping to operational-repository writes:** Wrap `insertExecution`, `updateExecution`, `insertReconciliationOutcome`, `insertImportBatch`, `insertAuthUser`, `insertTenantMember`, etc. in `withWriteTransaction` where they represent single logical operations.

4. **P2-1 — Enable real transactions in test mode:** Consider making `withWriteTransaction` issue `BEGIN`/`COMMIT` even for `:memory:` databases so transaction defects surface in tests.

5. **P3-1 — Add tenant guard triggers:** Add `BEFORE INSERT` tenant guards to `audit_events`, `execution_records`, `reconciliation_outcomes`, `import_batches`, and other tenant-owned tables.

---

## 14. Explicit verification criteria for each confirmed defect

### P0-1 — Audit-event ID collision

**Verification:**
1. On `high-008-baseline`, run `npm run test:master` → Section 8 O2C Core E2E must complete with 0 failures.
2. Run `npm run test:financial-stress` → all 13 stress tests must pass, including Stress Test 3 (20 concurrent allocations).
3. Run `npm run test:durability` → all 27 durability checks must pass, including reader-process restart verification.
4. Manually: call `approvalStore.createRequest` → `approveRequest` → `markExecutionResult` twice for the same approval ID; the second `markExecutionResult` must NOT throw `UNIQUE constraint failed: audit_events.id`.

**Success:** All tests pass with exit 0; no `UNIQUE constraint failed: audit_events.id` errors in any output.

### P1-1 — Idempotency status mismatch

**Verification:**
1. Run `npm run test:financial` → all 54 tests must pass, including 10c (replay) and 10e (conflict).
2. `checkAndReserveApiIdempotency(org, ep, key, fp)` called twice with same key+same fingerprint (committed) must return 'replay'.
3. Same key + different fingerprint must return 'conflict'.

**Success:** `test:financial` exit 0; 52+2=54 PASSED, 0 FAILED.

### P1-3 — Transaction wrapping for operational writes

**Verification:**
1. `insertExecution`, `updateExecution`, `insertReconciliationOutcome`, `insertImportBatch`, `insertAuthUser`, `insertTenantMember` must each be wrapped in `withWriteTransaction` or called only from within an existing transaction context.
2. Simulate a mid-operation failure in a multi-step financial flow; verify no partial records remain.

---

## Completion statement

The database durability forensic audit is complete. All investigation areas were covered on `high-008-baseline` at commit `ba8ee7ed100067ececc21f4bd6a2e7e62409a598`. No application source code, schemas, migrations, dependencies, tests, or workflow files were modified. The persistence architecture cannot yet safely support real financial transactions due to the P0 audit-event ID collision (P0-1/P0-2) and P1 transaction-integrity defects (P1-1 through P1-3) documented above.

**Deliverable:** `docs/audits/AIOSPARK_DATABASE_DURABILITY_FORENSIC_AUDIT.md`
**Working tree:** Clean except for the two audit markdown deliverables (Task 001 + Task 002)
**Changed files:** None (investigation only)
**Commands executed:** `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:scan`, `npm run test:unit`, `npm run test:integration`, `npm run test:security`, `npm run test:financial`, `npm run test:master`, `npm run test:financial-stress`, `npm run test:durability`, `npm run test:pilot-security`, `npm run build` — all on `high-008-baseline` with isolated temp SQLite databases
