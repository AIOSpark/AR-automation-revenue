# HIGH-009 / HIGH-010 — Persistence & Cross-Process Concurrency Verification

Date: 2026-11-11
Base commit: `702e566` (branch `high-008-baseline`)
Workspace: uncommitted changes on top of that branch

## 1. Persistence audit (HIGH-009 prerequisite)

| Question | Finding |
|---|---|
| Which engine serves the application? | SQLite via Node's built-in `node:sqlite` (`src/lib/db/durable-repository.ts`). |
| What is authoritative? | The `repository_snapshots` table (namespace → JSON payload). `udmStore`'s Maps are a per-process cache only. |
| Is PGlite used? | No. `db/connection.ts`, `db/client.ts`, and `db/schema.ts` were dead code; removed. `db/security-migrations.ts` remains because a tenant test imports its SQL directly. |
| Do snapshots contain the authoritative financial data? | Yes: `udm` holds customers, invoices, payments, matches, credit notes/allocations, disputes, exceptions, bank transactions, and idempotency keys. |
| What was missing? | Cross-process coordination, durable idempotency, transaction-scoped reload, and integrity validation. Snapshot writes were last-write-wins and stores cached state from process start. |

## 2. Changes

### Durable repository (`src/lib/db/durable-repository.ts`)

- Added `withWriteTransaction()` using `BEGIN IMMEDIATE`, with nested-scope support; `writeSnapshot`/`deleteSnapshot` join the active transaction.
- Added `repository_schema_migrations` (schema version 1) and `getSchemaVersion()`.
- WAL journal-mode setup now retries on `SQLITE_BUSY`; `busy_timeout=5000` and `foreign_keys=ON` remain.
- A crash before `COMMIT` leaves no committed WAL frames.

### UDM store (`src/lib/udm/store.ts`)

- Every financial mutation runs in a durable write scope: `BEGIN IMMEDIATE` → reload latest committed snapshot → apply mutation → validate → write → `COMMIT`.
- Reads reload the committed snapshot outside a write scope, so another process's commits are visible.
- In-process transaction queue retained as an optimization; the database lock is now the authority across processes.
- `transaction()` rollback restores both SQLite and the cache.
- Integrity validation before every write: unique IDs, non-empty tenant IDs, integer minor units, referential checks (customer/invoice/payment/match/credit/dispute/bank relations), tenant consistency across relations, and idempotency keys pointing at existing records.
- Legacy snapshots missing newer collections load as empty arrays instead of failing startup.
- API-level idempotency reservations are now persisted inside the same durable scope.

### Removed dead database code

`src/lib/db/connection.ts`, `src/lib/db/client.ts`, `src/lib/db/schema.ts` (unused PGlite/drizzle definitions). SQLite is now the only persistence engine.

### Test harness

- `scripts/test-concurrency.mjs` + `scripts/concurrency-worker.ts`: separate OS processes sharing one SQLite file.
- `npm run test:concurrency`, added to `npm run verify`.
- Financial stress fixture fixed to reference a real customer (`activeStressCustomerId`) now that referential integrity is enforced.

## 3. Verification (executed)

### Cross-process suite — 30 passed, 0 failed

```
✅ Repository opened the expected file (/tmp/aiospark-concurrency-<pid>.sqlite)
✅ Repository schema version recorded (1)
✅ A fresh process sees the seeded customer
✅ 8 processes, same idempotency key → one invoice id (1 distinct)
✅ Exactly one invoice row exists for the shared idempotency key
✅ Same key under another tenant creates a separate record
✅ Tenant B sees only its own invoice
✅ All 8 concurrent matches persisted
✅ Matched amount sum is preserved without lost updates
✅ All 8 concurrent payments persisted
✅ Worker was killed inside the uncommitted transaction
✅ No payments or matches from the crashed transaction
✅ Crashed process left no partial payment record
✅ Fresh process reopened the database after the crash
✅ Concurrent writes did not cross tenant A / tenant B boundary
✅ Legacy snapshot without newer collections loads after upgrade
✅ Legacy snapshot accepts a new financial write after migration
✅ Upgraded snapshot retained the legacy customer and added the invoice
=== CONCURRENCY SUMMARY: 30 passed, 0 failed ===
```

### Full gate

`npm run verify` → exit 0

- SECURITY SUITE: 8 + 8 + all passed
- IMPORT: 8 passed
- INTEGRATION: 7 passed
- STEP 07/08/09: 21 / 13 / 19 passed
- O2C CORE E2E: 27 passed
- MASTER: 187 passed, 0 failed
- SQLITE READER: 28 passed, 0 failed
- SQLITE DURABILITY: 27 passed, 0 failed
- CONCURRENCY: 30 passed, 0 failed
- PILOT SECURITY: 28 + 2 passed

`npm run build` (`next build --webpack`) → exit 0.
`npx tsc --noEmit` → exit 0.

## 4. Namespace boundary — residual cross-process risk (confirmed)

The UDM hardening does **not** extend to every snapshot namespace. Two
processes were started against one SQLite file with the same pending approval:

1. Process B loaded the request as `pending`, then waited.
2. Process A approved it and committed (`approved`).
3. Process B rejected it from its stale copy.

Observed result:

```
approver: {"ok":true,"mode":"approve","status":"approved"}
rejecter: {"ok":true,"mode":"reject","status":"rejected"}
final:    {"status":"rejected","reviewed_by":"user_rejector",
           "logs":["created","approved","rejected"]}
```

The committed approval was overwritten by a stale process, and the log shows an
impossible approved-then-rejected sequence. The root cause is the same stale
in-memory snapshot pattern: `approvalStore` caches requests at construction and
writes the whole snapshot without reloading under a transaction.

Billing has the same pattern: `setSubscription()` spreads `getSubscription()`
from its process-local cache and writes `updated_at` last, so a stale process
can revert a newer plan change. Audit's append-only array is mitigated by
`mergeConcurrentSnapshots` unioning records by `id`, but it is not transaction-
coordinated with the business mutation.

**Boundary:** HIGH-010 is closed only for UDM financial flows (invoices,
payments, matches, credit notes/allocations). Approvals and billing retain
confirmed stale-write risk and require the same reload-under-lock treatment
before platform-wide concurrency safety can be claimed.

## 5. Remaining gap (why HIGH-009 is not fully closed)

The authoritative financial model is still one validated JSON snapshot per
namespace, not normalized relational rows. Referential and tenant invariants
are enforced transactionally in application code before commit, not by SQL
foreign keys/CHECK constraints. Moving the UDM to normalized SQLite tables is
a larger migration and is not claimed here.

Other snapshot namespaces (billing, approvals, audit, etc.) still use the
snapshot cache pattern; HIGH-010 hardening covers the UDM financial path that
invoices, payments, matches, and credit allocations flow through.
