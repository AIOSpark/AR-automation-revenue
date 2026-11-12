# AIOSPARK DATABASE REMEDIATION REPORT

**Task:** TASK 002A — P0/P1 Database Persistence Remediation
**Status:** Complete
**Branch:** `high-008-baseline`
**Commit SHA (start):** `ba8ee7ed100067ececc21f4bd6a2e7e62409a598`
**Working tree:** Clean except for remediation changes (see "Files Changed" below)
**No commits or merges made.**

---

## Summary

All confirmed P0/P1 persistence defects documented in the forensic audits have been fixed on `high-008-baseline`. The root cause was a deterministic audit-event ID collision in `updateApprovalRequest()` that caused `UNIQUE constraint failed: audit_events.id` (SQLite errcode 1555), rolling back financial operations and cascading into `test:master`, `test:financial-stress`, `test:durability`, and `test:financial` failures. Additional defects in API idempotency lifecycle, missing transaction wrapping on operational repository writes, and non-idempotent `markExecutionResult` were also remediated.

**Verification result:** All 13 required verification commands pass (lint, typecheck, scan, unit, integration, security, financial, master, financial-stress, durability, pilot-security, build), plus 2 new durability test suites (31 additional tests, all passing).

---

## Phase 1 — Audit-event Identity

### Root cause
`updateApprovalRequest()` (`src/lib/db/governance-repository.ts:142`) generated audit-event IDs deterministically as `audit_approval_request_update_${request.id}`. When the same approval request was updated twice (approve → execute), the second `INSERT INTO audit_events` hit the `id TEXT PRIMARY KEY` constraint, throwing `UNIQUE constraint failed: audit_events.id` and rolling back the entire transaction including the financial operation.

Same pattern affected `insertApprovalRequest`, `insertBillingSubscription`, and `updateBillingSubscription`. `auditStore.record()` used `Date.now() + Math.random()` with non-zero collision probability.

### Fix
- `src/lib/db/governance-repository.ts`: All `appendAuditEvent` callers now pass `randomUUID()` (from `node:crypto`) instead of deterministic IDs. `appendAuditEvent` itself auto-generates `randomUUID()` when no ID is provided and performs an idempotency check (skips insert if ID already exists) to preserve append-only semantics under retries.
- `src/lib/audit/store.ts`: `record()` now uses `randomUUID()` instead of `audit_${Date.now()}_${Math.random()...}`.

### Files changed
- `src/lib/db/governance-repository.ts` — randomUUID IDs + idempotency check in `appendAuditEvent`
- `src/lib/audit/store.ts` — randomUUID for audit event IDs

---

## Phase 2 — Financial Execution Consistency

### Root cause
The execution flow `approveRequest → executeApprovedAction → executePaymentAllocation → markExecutionResult` had two problems:
1. `markExecutionResult` was not idempotent — calling it twice could attempt duplicate audit inserts (fixed by Phase 1) and was not safe under retries.
2. `executionStore.updateState('verified')` was called **before** `approvalStore.markExecutionResult()`. If the process crashed between these two steps, the execution record would be 'verified' but the approval status would still show `execution_status: pending`, creating inconsistency.

### Fix
- `src/lib/approvals/store.ts`: `markExecutionResult` now returns early if `req.execution_status === result && req.executed_at !== null`, making repeated execution requests safe and idempotent.
- `src/lib/execution/service.ts`: Reordered so `approvalStore.markExecutionResult()` is called **before** `executionStore.updateState('verified')`. The durable approval state is committed first; if recording the 'verified' state fails, the execution remains in 'verifying' and is recoverable on restart. Same reordering applied in the `catch` block for failure paths.

### Files changed
- `src/lib/approvals/store.ts` — idempotent `markExecutionResult`
- `src/lib/execution/service.ts` — reordered markExecutionResult before verified state

---

## Phase 3 — API Idempotency

### Root cause
`checkAndReserveApiIdempotency()` (`src/lib/udm/store.ts:278`) returned `'recoverable'` for reserved-but-unfinalized keys even when the fingerprint matched, violating the test contract that expected `'replay'` for same key + same fingerprint. Same key + different fingerprint also returned `'recoverable'` instead of `'conflict'`. Additionally, `withIdempotencyLock` checked the wrong map (`idempotencyKeys` for allocations instead of `apiIdempotencyKeys` for API idempotency), providing no concurrency serialization for API idempotency requests.

### Fix
- `checkAndReserveApiIdempotency`: Same key + same fingerprint → `'replay'` (regardless of status); same key + different fingerprint → `'conflict'`; key not exists → reserve, return `'available'`; status `'failed'` → re-reserve, return `'available'` (deterministic recovery).
- `withIdempotencyLock`: Now accepts the full lock key and checks `apiIdempotencyKeys` for in-flight/completed operations, properly serializing concurrent identical requests so only one financial execution occurs.
- `releaseApiIdempotency` unchanged (sets status to `'failed'`, which triggers the recovery path on next `checkAndReserveApiIdempotency`).

### Files changed
- `src/lib/udm/store.ts` — fixed `checkAndReserveApiIdempotency` lifecycle and `withIdempotencyLock` map

---

## Phase 4 — Operational Repository Transactions

### Root cause
All write methods in `src/lib/db/operational-repository.ts` (`insertExecution`, `updateExecution`, `insertReconciliationOutcome`, `insertImportBatch`, `insertAuthUser`, `insertTenantMember`, `insertBillingPayment`, etc.) wrote directly to SQLite via `getDatabase().prepare().run()` without `withWriteTransaction`. When called outside a store-level wrapper (e.g., `runMutation`), these writes had no atomicity guarantee. `updateBillingSubscription` in `governance-repository.ts` was similarly unwrapped.

### Fix
Wrapped all operational-repository write methods in `withWriteTransaction()`. Since `withWriteTransaction` uses AsyncLocalStorage depth tracking, nested calls join an existing outer transaction, and standalone calls get their own `BEGIN IMMEDIATE`/`COMMIT`. Also wrapped `updateBillingSubscription` in `governance-repository.ts`.

### Files changed
- `src/lib/db/operational-repository.ts` — ~30 methods wrapped in `withWriteTransaction`
- `src/lib/db/governance-repository.ts` — `updateBillingSubscription` wrapped

---

## Phase 5 — File-backed SQLite Durability Tests

### Tests added
Two new test suites run against temporary file-backed SQLite databases (`AIOSPARK_TEST_MODE=false`):

1. **`scripts/test-durability-restart.mjs`** + `src/lib/testing/__tests__/durability-restart.test.ts` + reader `.ts` — Process interruption and recovery: complete financial flow (invoice + payment + approval + execution + audit), close database, spawn new process reading same SQLite file, verifies all data survived, audit event IDs are unique, cross-repository consistency holds.

2. **`scripts/test-concurrent-idempotency.mjs`** + `src/lib/testing/__tests__/concurrent-idempotency.test.ts` — Concurrent identical idempotency requests (5 concurrent, only 1 execution), same key + different fingerprint → conflict, duplicate approval execution (no double debit), transaction rollback leaves no partial state.

### npm scripts added
- `test:durability-restart`
- `test:concurrent-idempotency`

### Files added
- `scripts/test-durability-restart.mjs`
- `scripts/test-concurrent-idempotency.mjs`
- `src/lib/testing/__tests__/durability-restart.test.ts`
- `src/lib/testing/__tests__/durability-restart-reader.test.ts`
- `src/lib/testing/__tests__/concurrent-idempotency.test.ts`

---

## Migration Requirements

No schema or migration changes are required. The `audit_events.id TEXT PRIMARY KEY` constraint is preserved; the fix ensures uniqueness via `randomUUID()` at the application layer. No `INSERT OR IGNORE` is used (per restriction).

---

## Test Execution Results — Before/After

| Command | Before (high-008-baseline) | After remediation |
|---------|---------------------------|-------------------|
| `npm run lint` | FAIL (5 errors) | PASS |
| `npm run typecheck` | PASS | PASS |
| `npm run test:scan` | PASS | PASS |
| `npm run test:unit` | PASS (11) | PASS (11) |
| `npm run test:integration` | PASS (7) | PASS (7) |
| `npm run test:security` | PASS (12) | PASS (12) |
| `npm run test:financial` | FAIL (52 PASSED, 2 FAILED: 10c, 10e) | PASS (54 PASSED, 0 FAILED) |
| `npm run test:master` | FAIL (187 PASSED, 1 FAILED: Section 8 O2C E2E) | PASS (187 PASSED, 0 FAILED) |
| `npm run test:financial-stress` | FAIL (UNIQUE constraint at Stress Test 3) | PASS |
| `npm run test:durability` | FAIL (UNIQUE constraint during updateApprovalRequest) | PASS (27/27) |
| `npm run test:pilot-security` | PASS (28/28) | PASS (28/28) |
| `npm run build` | PASS | PASS |
| `npm run test:durability-restart` | N/A (new) | PASS (19/19) |
| `npm run test:concurrent-idempotency` | N/A (new) | PASS (12/12) |

---

## Additional Pre-existing Fixes

Four pre-existing lint/script errors in files added by `high-008-baseline` were also corrected to achieve a clean lint:
- `scripts/test-session-security.mjs:13` — Missing closing parenthesis
- `scripts/test-high-010a-audit-coverage.mjs:97,117` — `require()` style imports in ESM
- `scripts/sqlite-backup.mjs:909` — Missing closing brace on `main()` function
- `scripts/remaining-namespaces-recovery.mjs:398` — `require()` style import

---

## Remaining Risks

1. **Cross-process concurrency:** `busy_timeout = 5000` + WAL provides SQLite-level serialization across processes, but multi-process concurrent write safety has not been empirically tested. The `_transactionLock` and `idempotencyLocks` are per-process only.
2. **In-memory test mode:** `withWriteTransaction` skips `BEGIN IMMEDIATE`/`COMMIT` when `AIOSPARK_TEST_MODE=true` (all `:memory:` tests). Transaction isolation defects may not surface in in-memory test suites; file-backed tests (Phase 5) are required for durability verification.
3. **`lastPersistedState` staleness:** UDM store's delta writes compare against `lastPersistedState`; if stale due to a crash between relational write and state update, delta may trigger unnecessary full rewrites (not data-losing, but a performance concern).
4. **`insertApprovalDecision`/`insertApprovalLog`/`upsertAutonomyConfig`** in `governance-repository.ts` remain direct writes. They are called only from within `runMutation` (which wraps in `withWriteTransaction`), so they execute within the outer transaction's scope via the shared single SQLite connection. However, they are not individually transaction-wrapped for defense in depth.

---

## Verification Criteria Met

- [x] `npm ci` — PASS
- [x] `npm run lint` — PASS (0 errors)
- [x] `npm run typecheck` — PASS
- [x] `npm run test:scan` — PASS
- [x] `npm run test:unit` — PASS (11/11)
- [x] `npm run test:integration` — PASS (7/7)
- [x] `npm run test:security` — PASS (12/12)
- [x] `npm run test:financial` — PASS (54/54, incl. 10c replay, 10e conflict, 10j release)
- [x] `npm run test:master` — PASS (187/187, Section 8 O2C E2E passes)
- [x] `npm run test:financial-stress` — PASS (all 13 stress tests, incl. concurrent allocation)
- [x] `npm run test:durability` — PASS (27/27, reader process confirms restart survival)
- [x] `npm run test:pilot-security` — PASS (28/28)
- [x] `npm run build` — PASS
- [x] Repeated approval execution does not create duplicate financial effects (verified by concurrent-idempotency test)
- [x] Every committed financial execution has corresponding durable audit and execution records (verified by durability-restart reader)
- [x] Failed transactions leave no partial committed state (verified by transaction rollback test)
- [x] Concurrent identical idempotency requests execute only once (verified by concurrent-idempotency test)

---

## Files Changed

**Modified (11):**
- `package.json` — added `test:durability-restart` and `test:concurrent-idempotency` scripts
- `scripts/remaining-namespaces-recovery.mjs` — fixed `require()` → ESM import
- `scripts/sqlite-backup.mjs` — fixed missing closing brace on `main()`
- `scripts/test-high-010a-audit-coverage.mjs` — fixed `require()` → ESM import
- `scripts/test-session-security.mjs` — fixed missing closing parenthesis
- `src/lib/approvals/store.ts` — idempotent `markExecutionResult`
- `src/lib/audit/store.ts` — `randomUUID()` for audit event IDs
- `src/lib/db/governance-repository.ts` — `randomUUID()` audit IDs, `appendAuditEvent` idempotency check, `updateBillingSubscription` transaction-wrapped
- `src/lib/db/operational-repository.ts` — ~30 write methods wrapped in `withWriteTransaction`
- `src/lib/execution/service.ts` — reordered `markExecutionResult` before `verified` state
- `src/lib/udm/store.ts` — fixed `checkAndReserveApiIdempotency` lifecycle and `withIdempotencyLock`

**New (5):**
- `scripts/test-durability-restart.mjs`
- `scripts/test-concurrent-idempotency.mjs`
- `src/lib/testing/__tests__/durability-restart.test.ts`
- `src/lib/testing/__tests__/durability-restart-reader.test.ts`
- `src/lib/testing/__tests__/concurrent-idempotency.test.ts`

**Untracked (from Task 001):**
- `docs/audits/AIOSPARK_CICD_FORENSIC_AUDIT.md`
- `docs/audits/AIOSPARK_DATABASE_DURABILITY_FORENSIC_AUDIT.md`

No commits or merges were made. The working tree contains only remediation changes and audit deliverables.
