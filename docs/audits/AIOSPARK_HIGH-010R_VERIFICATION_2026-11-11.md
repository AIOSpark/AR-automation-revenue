# AIOSpark HIGH-010R — Cross-Namespace Concurrency and Audit Integrity

Date: 2026-11-11
Scope: Approvals, billing subscriptions, and transactional audit coupling.

## 1. Approval concurrency

`src/lib/approvals/store.ts` now:

- Runs every mutation inside `withWriteTransaction` (`BEGIN IMMEDIATE`).
- Reloads the latest committed approval snapshot after acquiring the lock.
- Validates the request is still `pending` before a terminal decision.
- Persists the request, approval log and audit event in one transaction.
- Throws `ApprovalConflictError` (`code: APPROVAL_DECISION_CONFLICT`) when another process already decided.
- Reloads from disk after any failed transaction, so a rolled-back decision is not visible in-process.
- Refreshes reads from committed state outside a transaction.

`POST /api/approvals/[id]` translates the conflict to **HTTP 409**. A losing process cannot append a second decision or audit event.

## 2. Billing concurrency

`src/lib/billing/store.ts` now:

- Reloads the latest billing snapshot inside the write lock for mutations.
- Auto-creates the default subscription under the write lock and re-checks, preventing duplicate defaults.
- Adds `version` to subscriptions and increments it on every update.
- Supports `expectedVersion`; a stale caller receives `BillingConflictError` (`code: BILLING_SUBSCRIPTION_CONFLICT`).
- Applies updates to the latest committed row rather than a process-local copy.
- Writes a `subscription.updated` audit event in the same transaction as the subscription change.

`PaymentProcessorService.changePlan()` and the billing checkout-intent path pass the version they read, so concurrent plan changes cannot silently overwrite a newer committed subscription.

## 3. Audit atomicity

`src/lib/audit/store.ts` now:

- Reloads committed audit history after acquiring the write lock.
- Joins the caller's transaction when one exists, so business mutation and audit event commit or roll back together.
- Restores the in-memory cache if the durable audit write fails.
- Refreshes queries from committed state outside transactions.

Approval decisions and subscription updates now fail if their required audit event cannot be persisted.

## 4. Verification

New suite: `npm run test:cross-namespace` — **5/5 passed**. It uses real OS processes against one SQLite file.

| Test | Result |
|---|---|
| Two processes decide the same pending approval | One HTTP 200, one HTTP 409 |
| Approval logs and audit history | Exactly one terminal decision |
| Concurrent versioned billing plan changes | One success, one `BILLING_SUBSCRIPTION_CONFLICT`; final version advanced |
| Injected audit failure during subscription update | Update rolled back; version/plan unchanged |
| Injected audit failure during approval | Request remains pending; no decision log/audit event; later approval succeeds |

Regression:

| Check | Result |
|---|---|
| `npm run test:approvals` | 5/5 |
| `npm run test:billing` | Passed |
| `npm run test:audit` | Passed |
| `npm run test:master` | 187/187 |
| `npm run verify` | Exit 0 |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | Success |

## 5. Remaining boundary

- HIGH-009 remains partially resolved: financial state is still stored as validated JSON snapshots, not normalized tables with SQL foreign keys/CHECK constraints.
- This milestone covers approvals and subscription updates. Other domain audit call sites may still record outside a wrapping business transaction and need the same treatment during relational normalization.
- HIGH-012 operational gaps remain: off-host encrypted replication, backup-age monitoring, and a measured RTO.
- The previously confirmed stale-write defects in approvals and billing are fixed for the tested paths; the application should not be described as fully relational or platform-wide normalized yet.
