# AIOSPARK — PRIORITIZED REMEDIATION BACKLOG

**Generated:** Wednesday, 11 November 2026  
**Source:** `docs/audits/AIOSPARK_REALTIME_PRODUCT_ASSESSMENT_2026-11-11.md` (current-state assessment)  
**Status:** Awaiting implementation authorization — NO source code modified yet

This register contains issues discovered during the independent current-state assessment. Each issue has a unique ID, priority, category, evidence, root cause, and acceptance criteria. Priorities: HIGH (must fix before customer financial data), MEDIUM (fix before broader commercial release), LOW (refinements).

---

## HIGH-PRIORITY ISSUE REGISTER

### HIGH-001 — Production build fails; TypeScript compilation broken (161 errors)

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | DevOps / API |
| Affected Module | Platform-wide (build pipeline) |
| Current Condition | `tsc --noEmit` produces 161 errors; `next build --webpack` fails at `scripts/test-billing-durability.ts:66` (`billing_interval` unknown on `OrganizationSubscription`). Production build cannot succeed. |
| Evidence | `npm run typecheck` → 161 `error TS` (SOURCE VERIFIED + TEST EXECUTED — FAILED); `npm run build` → Next.js type check failed on billing script (TEST EXECUTED — FAILED) |
| Root Cause | Feature code and tests reference methods/types never implemented on stores: `billing_interval`, `getPlan`, `grace_period_end` on billing store/subscription; `WebhookEvent` not exported; credit-note allocation methods missing on `udmStore`. |
| Business Impact | Application cannot be built or deployed. Blocks every release stage. |
| Risk | No deployable artifact; continuous integration blocked; customers cannot onboard. |
| Recommended Fix | Implement missing store methods/types (`billing_interval`, `getPlan`, `grace_period_end`, `WebhookEvent`, webhook-recovery store methods) or remove/fix the broken references; ensure `tsc --noEmit` and `next build` pass clean. |
| Dependencies | `src/lib/billing/store.ts`, `src/lib/billing/entitlements.ts`, `src/lib/billing/webhook-recovery.ts`, `src/lib/db/schema.ts`/`connection.ts` |
| Acceptance Criteria | `npm run typecheck` exits 0; `npm run build` exits 0 with no type errors. |
| Verification | Re-run `npm run typecheck` and `npm run build`. |
| Status | Confirmed |

---

### HIGH-002 — Authentication bypass: any password works when Supabase unconfigured

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Security |
| Affected Module | Authentication (Login) |
| Current Condition | `src/lib/auth/supabase.ts` `executeLogin` (lines 141-144): when `isAuthProviderConfigured()` is false (current state — Supabase URL/key are placeholders), login accepts ANY password for an existing user, rejecting only passwords containing "wrong" or equal to "WrongPassword999!". No password hash verification. |
| Evidence | Source-verified (`supabase.ts:126-200`, lines 141-144). Auth tests run in dev mode and pass because dev auth masks the issue. `isAuthProviderConfigured()` returns false because values contain "placeholder" (`dev-mode.ts:12-20`). |
| Root Cause | Development fallback password check is not gated behind a strict dev-only flag and allows arbitrary passwords. |
| Business Impact | Any attacker who knows a user's email can log in as that user (if the user exists). Full account takeover. |
| Risk | Critical authentication bypass; unauthorized access to financial data and mutation capabilities. |
| Recommended Fix | Remove the "any password accepted" fallback. Require a configured auth provider for login; in dev-only mode require a strong explicit dev credential, not an accept-any-password bypass. Never treat missing provider as "allow all". |
| Dependencies | `src/lib/auth/supabase.ts`, `src/lib/auth/dev-mode.ts`, `src/lib/auth/session.ts` |
| Acceptance Criteria | Login fails (401) for incorrect password when no provider is configured; no accept-any-password code path exists. |
| Verification | `npm run test:auth`; targeted negative-login test asserting wrong password is rejected even without Supabase. |
| Status | Confirmed |

---

### HIGH-003 — Hardcoded development session signing secret

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Security |
| Affected Module | Authentication (Session) |
| Current Condition | `src/lib/auth/dev-mode.ts:1` — `DEVELOPMENT_SIGNING_SECRET = "local-development-session-secret"` is returned by `getAuthSigningSecret()` whenever dev auth is enabled (non-production + `AIOSPARK_TEST_MODE=true` or `AIOSPARK_DEV_AUTH=true`). Session tokens (`v1.payload.hmac-sha256`) are signed with this known secret in dev/default mode. |
| Evidence | Source-verified (`dev-mode.ts`, `session.ts:62-73`). |
| Root Cause | Hardcoded secret used outside a strictly-guarded development gate; no production `AIOSPARK_SESSION_SECRET` enforced for cookie signing. |
| Business Impact | Session tokens can be forged by anyone who knows the hardcoded secret; session fixation/forgery possible in default/dev deployments. |
| Risk | Session forgery, privilege escalation, unauthorized financial mutations. |
| Recommended Fix | Require `AIOSPARK_SESSION_SECRET` in all non-test deployments; remove or strictly scope the hardcoded dev secret so it cannot be used unless an explicit dev flag is set and the app is not reachable externally. |
| Dependencies | `src/lib/auth/dev-mode.ts`, `src/lib/auth/session.ts` |
| Acceptance Criteria | `getAuthSigningSecret()` never returns a hardcoded secret unless explicitly opt-in dev mode; production fails closed without `AIOSPARK_SESSION_SECRET`. |
| Verification | Unit test asserting hardcoded secret is not returned outside explicit dev flag. |
| Status | Confirmed |

---

### HIGH-004 — Financial invariant broken: outstanding ignores credit notes

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Financial |
| Affected Module | Receivables / Dashboard / Credit Notes |
| Current Condition | `src/lib/dashboard/engine.ts:20-29` `getInvoiceOutstandingBalance` = `amount - matchedPayments` only. `src/lib/receivables/engine.ts:171` identical. Credit-note allocations are never subtracted. Required invariant `Outstanding = Gross - Matched Payments - Active Credit Allocations` is violated. |
| Evidence | Source-verified (`dashboard/engine.ts`, `receivables/engine.ts`). `udm` snapshot contains 3 credit notes but none affect outstanding. TEST EXECUTED: financial suite passes because it does not test credit-note offsetting; gap is in implementation, not test. |
| Root Cause | Credit-note allocation feature was never implemented (no `insertCreditAllocation`/`reverseCreditAllocation`/`getCreditNoteBalance` on `udmStore`), and outstanding calculation was never wired to credit allocations. |
| Business Impact | Receivables, CFO, dashboard, and cash-unblock figures overstate outstanding when credit notes exist. Customers see wrong balances; credit notes are effectively invisible to financial math. |
| Risk | Incorrect financial statements, wrong collections actions, customer disputes over misstated balances. |
| Recommended Fix | Implement credit-note allocation ledger (`CreditNoteAllocation` type + store methods), enforce allocation ≤ available credit balance and ≤ invoice open balance, subtract active credit allocations from outstanding in `getInvoiceOutstandingBalance` and receivables engine, and audit every allocation/reversal. |
| Dependencies | `src/lib/udm/store.ts`, `src/lib/udm/types.ts`, `src/lib/dashboard/engine.ts`, `src/lib/receivables/engine.ts`, `src/lib/audit/service.ts` |
| Acceptance Criteria | Outstanding = Gross - Matched Payments - Active Credit Allocations for all invoices; credit-note allocation creates audit record; reversal restores balance. |
| Verification | Financial tests exercising credit-note creation → allocation → outstanding recalculation → reversal. |
| Status | Confirmed |

---

### HIGH-005 — Credit notes creatable but not allocatable (feature referenced by missing tests)

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Financial |
| Affected Module | Credit Notes & Allocations |
| Current Condition | `CreditNote` type and `insertCreditNote`/`getCreditNotes` exist (3 credit notes in `udm` snapshot), but `insertCreditAllocation`, `reverseCreditAllocation`, `getCreditNoteBalance` do NOT exist anywhere (`grep` exit 1 across `src/lib/udm/store.ts` and `types.ts`). `financial-regression.test.ts` and `financial-correctness-sprint22.test.ts` reference these missing methods and do not compile. |
| Evidence | Source-verified (no matches for allocation methods); TypeScript errors in test files (TEST EXECUTED — typecheck FAILED). |
| Root Cause | Credit-note allocation feature partially spec'd in tests but never implemented in the store. |
| Business Impact | Credit notes cannot be applied to invoices; credit-note module is non-functional for its core purpose. |
| Risk | Financial records cannot reflect credit adjustments; over-collection risk; credit notes in DB (3) are dead data. |
| Recommended Fix | Implement `CreditNoteAllocation` type, `insertCreditAllocation`, `reverseCreditAllocation`, `getCreditNoteBalance` on `udmStore`; enforce balance limits; add audit records; fix the failing test files to compile and pass. |
| Dependencies | `src/lib/udm/store.ts`, `src/lib/udm/types.ts`, `src/lib/audit/service.ts`, `src/lib/testing/__tests__/financial-regression.test.ts`, `src/lib/testing/__tests__/financial-correctness-sprint22.test.ts` |
| Acceptance Criteria | `udmStore` exposes allocation/reverse/balance methods; TypeScript compiles; credit-note allocation reduces outstanding; reversal restores it. |
| Verification | `npm run typecheck` passes; credit-note financial tests pass. |
| Status | Confirmed |

---

### HIGH-006 — No cross-entity transaction atomicity for financial mutations

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Database / Financial |
| Affected Module | Payments / Reconciliation / UDM Store |
| Current Condition | Each UDM mutation persists a separate JSON snapshot via `writeSnapshot` (`durable-repository.ts:84-101`) with its own `BEGIN`/`COMMIT`. `reconciliation/engine.ts` `executeApprovedMatch` performs payment insert + multiple matches + invoice updates + bank-transaction update as separate calls with no rollback if one fails mid-operation. |
| Evidence | Source-verified (`durable-repository.ts`, `reconciliation/engine.ts:367-422`). Durability test passes within one process, but multi-step atomicity is not implemented. |
| Root Cause | Snapshot-per-mutation design lacks a unit-of-work/transaction spanning multiple entity changes. |
| Business Impact | Partial financial state after failure (e.g., payment created but match not recorded; invoice marked paid but bank tx not updated). |
| Risk | Data inconsistency, corrupted financial ledger, unreconciled cash. |
| Recommended Fix | Wrap multi-entity financial mutations (reconciliation execution, payment+allocation, credit allocation) in a single atomic transaction or compensating rollback; ensure all-or-nothing. |
| Dependencies | `src/lib/db/durable-repository.ts`, `src/lib/udm/store.ts`, `src/lib/reconciliation/engine.ts` |
| Acceptance Criteria | Any failure mid-way through a financial mutation leaves prior state intact; no partial payment/match/invoice updates. |
| Verification | Failure-injection test on reconciliation execution asserting rollback. |
| Status | Confirmed |

---

### HIGH-007 — No idempotency on financial record creation (duplicate payment/invoice risk)

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Financial / API |
| Affected Module | Payments / Invoices |
| Current Condition | `insertPayment`, `insertInvoice`, `insertCreditNote` generate new IDs and create records with no idempotency key. `insertMatch` only prevents duplicate payment→invoice pairs. Retrying a payment creation duplicates the record. |
| Evidence | Source-verified (`udm/store.ts:168-189`, `269-281`). No idempotency-key header handling on financial mutation API routes (`api/payments`, `api/receivables` are GET/save-filter only; no mutation route with idempotency). |
| Root Cause | Financial mutation APIs lack idempotency-key support. |
| Business Impact | Retry (network, client double-click) creates duplicate payments/invoices, overstating cash received and receivables. |
| Risk | Duplicate financial records, incorrect balances, customer over/under-charging. |
| Recommended Fix | Add idempotency-key header support and server-side dedup (by key + org) for payment/invoice/credit-note creation; reject duplicates with 409. |
| Dependencies | API route handlers for financial mutations, `udmStore` |
| Acceptance Criteria | Same idempotency key + org returns existing record without creating a duplicate; 409 on conflicting duplicate. |
| Verification | API test sending same idempotency key twice. |
| Status | Confirmed |

---

### HIGH-008 — Test infrastructure blocked: `server-only` import prevents master & security suites

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | DevOps / QA |
| Affected Module | Test suite / LLM Router |
| Current Condition | `src/lib/llm/router.ts:5`, `provider.ts:4`, `openai-adapter.ts:5` import `server-only`. Under `tsx`/`node --import tsx` (plain Node), this throws "This module cannot be imported from a Client Component module". `test:master` and `test:security` cannot execute. |
| Evidence | TEST EXECUTED — FAILED to run (runtime error captured). `test-master.mjs` and `test-security.mjs` both crash at import. |
| Root Cause | `server-only` (Next.js server marker) imported into modules loaded by a non-server test runner; test runner is not the Next.js server runtime. |
| Business Impact | Master and security CI suites cannot run; regressions in AI/security code go undetected by CI. |
| Risk | Undetected security/AI defects; cannot verify release quality. |
| Recommended Fix | Either run tests under the Next.js server runtime, or isolate `server-only` imports behind an adapter loaded only in server context; make test suites executable in CI. |
| Dependencies | `src/lib/llm/*`, `scripts/test-master.mjs`, `scripts/test-security.mjs` |
| Acceptance Criteria | `npm run test:master` and `npm run test:security` execute to completion without `server-only` errors. |
| Verification | Re-run master and security suites; report pass/fail counts. |
| Status | **CLOSED — 2026-11-11** |

**Closure evidence**

- Restored `import 'server-only';` in `src/lib/llm/provider.ts`, `openai-adapter.ts`, and `router.ts`; deleted the empty `src/lib/llm/server-only.ts` shim.
- Added a test-only Node resolution hook (`scripts/test-only-server-modules.mjs` + `scripts/test-server-only-stub.mjs`) loaded via `node --import` by the test scripts. Production code and `next build` still resolve the real marker package, preserving Next.js build-time enforcement.
- Extended `scripts/security-scan.mjs` (runs in `test:scan` / `verify`) with a client import-graph check that fails if any `"use client"` entry point reaches a server-only module or a local server-only shim. Negative test: an injected client import of `@/lib/llm/router` was detected and failed the scan (exit 1); the probe was then removed.
- Changed `typecheck` to `next typegen && tsc --noEmit` to eliminate dependence on stale `.next/types` artifacts.
- Verification: clean typecheck (after removing `.next` and `tsconfig.tsbuildinfo`) pass; production build pass; `npm run verify` pass; master 187/187, security 12/12, financial 54/54, auth 39/39, tenant 8/8, financial stress pass, durability 27+28 reader pass, pilot security 28+2 reader pass, lint pass. Full logs: `docs/audits/AIOSPARK_HIGH-008_VERIFICATION_2026-11-11.md`.

---

### HIGH-009 — Dual/dead database architecture; no relational integrity for financial data

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Database |
| Affected Module | Data layer |
| Current Condition | `src/lib/db/client.ts` (PGlite relational client, `new PGlite()` in-memory, no persistence) is **not imported anywhere** — dead code. Authoritative store is `src/lib/db/durable-repository.ts`: a single SQLite table `repository_snapshots` storing JSON blobs for `udm`, `auth`, `audit`, `billing`, etc. No foreign keys, no column constraints, no referential integrity on financial records. |
| Evidence | Source-verified (`client.ts`, `durable-repository.ts`); grep confirmed `dbService` not imported; direct SQLite read showed only `repository_snapshots` table. |
| Root Cause | Unfinished migration: relational schema defined but unused; application code persists JSON snapshots instead of relational rows. |
| Business Impact | Financial data lacks database-enforced integrity; concurrency-safe writes not guaranteed at DB level; schema evolution is unmanaged. |
| Risk | Data corruption, lost updates under concurrency, inability to enforce financial constraints (unique invoice numbers per org, referential integrity) at the database layer. |
| Recommended Fix | Decide on one authoritative storage (relational PostgreSQL/SQLite with real schema) and implement it with migrations, foreign keys, and constraints; remove dead PGlite code or wire it in properly. |
| Dependencies | `src/lib/db/*`, all stores (`udmStore`, `authStore`, `billingStore`, `audit`) |
| Acceptance Criteria | Single authoritative database; relational constraints enforced; migrations present; dead code removed or activated. |
| Verification | Database integrity check; concurrency test showing no lost updates. |
| Status | **PARTIALLY RESOLVED — 2026-11-11 (UDM v2 + governance v3)** |
| Resolution | SQLite is the single persistence engine; dead PGlite files removed. Migration v2 normalizes UDM customers, contacts, invoices, payments, matches, credit notes/allocations, disputes/evidence, exceptions, bank transactions and idempotency keys. Migration v3 normalizes approval requests, terminal decisions, approval logs, autonomy configs, billing subscriptions and subscription history, and audit events, with FKs, CHECKs, tenant/status/version triggers, immutable decisions/audit and per-namespace migration markers. Legacy snapshots backfill transactionally and are removed only after commit. **Remaining gap:** auth/tenant, import, reconciliation and execution namespaces remain snapshot-based; non-subscription billing records intentionally remain snapshots. |
| Evidence | [HIGH-009 relational verification](./AIOSPARK_HIGH-009_RELATIONAL_VERIFICATION_2026-11-11.md), [HIGH-009R governance verification](./AIOSPARK_HIGH-009R_VERIFICATION_2026-11-11.md) — 68/68 governance, 8/8 relational, 85/85 SIGKILL migration recovery, 30/30 concurrency, 187/187 master, full verify exit 0, build succeeds. |

---

### HIGH-010 — Cross-process concurrent write safety not guaranteed (lost-update risk)

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Database / Concurrency |
| Affected Module | UDM Store / Data layer |
| Current Condition | `udmStore` loads a JSON snapshot into in-memory Maps at construction and mutates those Maps per request. Each serverless invocation has its own Map copy; concurrent invocations read/write the same `udm` snapshot namespace via `mergeConcurrentSnapshots` (last-write-wins by timestamp). No cross-process locking. |
| Evidence | Source-verified (`udm/store.ts:34-89`, `durable-repository.ts:47-70`). Stress test ran single-process; multi-process concurrency UNVERIFIED. |
| Root Cause | In-memory per-process cache with file-backed snapshot and no distributed lock. |
| Business Impact | Two concurrent financial mutations to the same org can overwrite each other (lost update). |
| Risk | Lost payments, lost invoice updates, corrupted financial state under concurrent use. |
| Recommended Fix | Implement database-level locking/transactions or optimistic concurrency (version check) for snapshot writes; serialize financial mutations per org. |
| Dependencies | `src/lib/db/durable-repository.ts`, `src/lib/udm/store.ts` |
| Acceptance Criteria | Concurrent financial mutations to same org do not lose updates; no silent overwrite. |
| Verification | Multi-process concurrent write test. |
| Status | **CLOSED — 2026-11-11 (scoped to UDM financial flows)** |
| Closure evidence | `BEGIN IMMEDIATE` serializes processes; every UDM mutation reloads committed state under lock. New `test:concurrency` spawns real OS processes: 8 identical idempotency keys → 1 invoice; 8 concurrent matches/payments on one invoice → all 8 preserved; SIGKILL mid-transaction → 0 partial records; concurrent org A/B writes stay isolated; legacy snapshot upgrade preserves data. 30/30 passed. |
| Residual risk (resolved by HIGH-010R, 2026-11-11) | The earlier two-process probe showed stale B overwriting A's approval. HIGH-010R now reloads approvals and billing under `BEGIN IMMEDIATE`; approval conflicts return HTTP 409; subscription updates use `expectedVersion` and return `BILLING_SUBSCRIPTION_CONFLICT`; audit appends join the business transaction. Verified by `test:cross-namespace` (5/5). See [HIGH-010R verification](./AIOSPARK_HIGH-010R_VERIFICATION_2026-11-11.md). |
| Log | [HIGH-009/010 verification log](./AIOSPARK_HIGH-009-010_VERIFICATION_2026-11-11.md) |

---

## MEDIUM-PRIORITY ISSUE REGISTER

### MED-001 — Copilot is rule-based keyword matching, not AI-driven

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Category | AI / Frontend |
| Affected Module | Copilot / Intelligence Workspace |
| Current Condition | `src/app/api/copilot/route.ts` matches intents via `cleanPrompt.includes(...)` keywords ("why", "stuck", "draft", "simulate", "approval"). No LLM call is made; product markets AI copilot but behavior is rule-based. |
| Evidence | Source-verified (`api/copilot/route.ts:33-223`). |
| Business Impact | Customers expecting AI reasoning get keyword replies; limited coverage of queries. |
| Risk | Misleading AI capability claims; poor user experience for out-of-scope queries. |
| Recommended Fix | Either back copilot with the LLM router (grounded in UDM/CFO data, approval-gated for actions) or accurately label it as rule-based assistance. |
| Dependencies | `src/lib/llm/router.ts`, `src/app/api/copilot/route.ts` |
| Acceptance Criteria | Copilot either uses LLM with financial grounding or is explicitly non-AI; no financial action without approval. |
| Verification | Copilot response test for an out-of-keyword query. |
| Status | Confirmed |

---

### HIGH-011 — RBAC matrix lacks financial resources (payments, credit notes, reconciliation, cash unblock, collections)

| Field | Value |
|---|---|
| Priority | HIGH |
| Category | Security / API |
| Affected Module | Authorization |
| Current Condition | `src/lib/tenant/permissions.ts` covers only `organization_settings`, `users_invites`, `customers`, `invoices`, `exceptions`, `approvals`, `integrations`, `billing` (and billing has no permissions for most roles). No `payments`, `credit_notes`, `reconciliation`, `cash_unblock`, `collections` resources. Any route allowing financial mutation without a mapped resource is potentially unprotected. |
| Evidence | Source-verified (`permissions.ts:5-13`). |
| Business Impact | Financial operations lack role-based authorization; cannot enforce least-privilege for payments/credit/reconciliation. |
| Risk | Unauthorized financial actions by users who should be restricted — account-level financial data exposure and mutation. |
| Recommended Fix | Extend `Resource` type and `PERMISSION_MATRIX` to cover all financial resources; wire `validatePermission` into payment/credit/reconciliation/cash-unblock routes; verify each financial endpoint enforces its permission before any customer data or external pilot. |
| Dependencies | `src/lib/tenant/permissions.ts`, `src/lib/tenant/middleware.ts` |
| Acceptance Criteria | Every financial mutation route enforces a role-based permission; least-privilege roles cannot create payments/credit notes; verified per resource/role before pilot. |
| Verification | Authorization test per financial resource/role. |
| Status | **CLOSED — 2026-11-11** |
| Closure evidence | `permissions.ts` now models `payments`, `credit_notes`, `reconciliation`, `collections`, `cash_unblock` with view/create/edit/approve/execute/reverse/export actions. Route gates use those resources: payments read, reconciliation read/create/execute, collections read/create, cash-unblock read/edit/execute, exceptions edit plus approve for terminal decisions, promises under collections, and approval execution additionally checks the underlying resource (credit notes, reconciliation, invoices). New `test:financial-rbac` exercises actual route handlers: 21/21 passed, including 403s for Viewer/Finance Executive, allowed Owner/Viewer reads, cross-tenant 401/404 rejection, unauthenticated 401, and platform-admin separation. Master 187/187, security 12/12, financial 54/54, tenant 8/8, TypeScript and build pass. No direct credit-note HTTP create/allocation/reversal route exists; issuance remains reachable only through the now resource-gated approval execution path. |

---

### MED-003 — Billing/subscription code has TypeScript errors; entitlements incomplete

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Category | API / Billing |
| Affected Module | Billing & Subscription Management |
| Current Condition | `src/lib/billing/entitlements.ts`, `webhook-recovery.ts`, `pilot-access.ts` reference missing store methods/properties (`getPlan`, `billing_interval`, `grace_period_end`, `WebhookEvent`). Contributes to HIGH-001 build failure. |
| Evidence | TypeScript errors (TEST EXECUTED — FAILED). |
| Business Impact | Billing and subscription management cannot compile; subscription gating unreliable. |
| Risk | Customers may access features without correct entitlement; webhook failures unrecovered. |
| Recommended Fix | Implement missing billing store methods/types; resolve TS errors; add webhook retry/recovery. |
| Dependencies | `src/lib/billing/store.ts`, `src/lib/billing/entitlements.ts`, `src/lib/billing/webhook-recovery.ts` |
| Acceptance Criteria | Billing module compiles; entitlement check returns correct plan/grace state. |
| Verification | `npm run typecheck`; billing unit tests. |
| Status | Confirmed (part of HIGH-001 root cause) |

---

### MED-004 — Razorpay / Supabase / Zoho integrations not configured; unverified

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Category | Integrations |
| Affected Module | Integrations (Razorpay, Zoho, Supabase) |
| Current Condition | Supabase URL/key are placeholders (`isAuthProviderConfigured()` false). Razorpay webhook route exists but billing code has TS errors. Zoho auth/callback routes exist but credentials not configured. No real external integration is active. |
| Evidence | Source-verified (`.env`, `supabase.ts:10-11`, `api/billing/razorpay-webhook/route.ts`, `api/integrations/zoho/*`). |
| Business Impact | Payments cannot be processed via Razorpay; no ERP sync; auth depends on unconfigured Supabase. |
| Risk | Core Order-to-Cash payment flow non-functional in production. |
| Recommended Fix | Configure real provider credentials (via env, not committed), implement and test webhook handling, ERP sync. |
| Dependencies | Environment configuration, provider SDKs |
| Acceptance Criteria | Integration routes respond correctly with test credentials; webhook signature verification implemented. |
| Verification | Integration tests with mock providers (no real payments). |
| Status | Confirmed |

---

### MED-005 — No automated backup or documented recovery procedure

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Category | DevOps / Database |
| Affected Module | Data reliability |
| Current Condition | `scripts/sqlite-backup.mjs` is a manual script; no scheduled backup, no backup monitoring, no restoration drill in code or docs. Durability test confirms snapshot survival but not backup/restore. |
| Evidence | Source-verified (`scripts/sqlite-backup.mjs` exists; no scheduler/cron observed). |
| Business Impact | Data loss event would have no proven recovery path. |
| Risk | Permanent loss of customer financial records. |
| Recommended Fix | Implement automated, scheduled backup of `.data/aiospark.sqlite` (or production DB); document and test restoration; verify backup integrity. |
| Dependencies | Production deployment infrastructure |
| Acceptance Criteria | Automated daily backup; restore test succeeds; backup alerts on failure. |
| Verification | Restore-from-backup drill. |
| Status | **CLOSED — 2026-11-11 (HIGH-012)** |
| Closure evidence | `scripts/sqlite-backup.mjs` now uses `VACUUM INTO` for a consistent WAL-inclusive snapshot, verifies before atomic publish, preserves the previous backup on failure, applies count-based retention, writes failure status and optionally alerts a generic webhook, and verifies restores only in an isolated temporary database. `scripts/test-backup-restore.mjs` (`npm run test:backup`) passes 11/11: WAL-only committed data, financial counts, retention, failed-backup preservation, webhook alert without customer data, corrupt-backup rejection, CLI verification, automated `schedule --once`, and isolated restore with an unchanged live database. Runbook: `docs/runbooks/BACKUP_RESTORE_RUNBOOK.md`. |

---

### MED-006 — No browser/E2E verification of customer workflows

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Category | QA / Frontend |
| Affected Module | All customer-facing workflows |
| Current Condition | No Playwright E2E executed in this assessment (`.playwright-mcp` present but unused). All validation is unit/API/source level. |
| Evidence | TEST EXECUTED: no browser tests run. |
| Business Impact | Cannot confirm pages render, navigation works, or forms submit end-to-end. |
| Risk | Undetected frontend integration defects; customer onboarding flow may be broken in browser. |
| Recommended Fix | Implement Playwright E2E for onboarding, receivables, payment reconciliation, credit notes; run in CI. |
| Dependencies | Playwright, test database |
| Acceptance Criteria | E2E suites pass for key customer journeys without real financial data. |
| Verification | Browser test execution report. |
| Status | Confirmed |

---

### MED-007 — Session cookie not Secure in non-production; 7-day TTL

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Category | Security |
| Affected Module | Authentication |
| Current Condition | `api/auth/login/route.ts:59` — `secure: process.env.NODE_ENV === "production"`, so dev cookies sent over HTTP. TTL is 7 days. |
| Evidence | Source-verified (`api/auth/login/route.ts:55-63`). |
| Business Impact | Session hijacking via network interception in dev/staging. |
| Risk | Session theft. |
| Recommended Fix | Use `secure` and `__Host-` prefix or `SameSite=Strict`; reduce TTL; use secure cookies in all non-local environments. |
| Dependencies | `src/app/api/auth/login/route.ts` |
| Acceptance Criteria | Session cookies Secure in all non-localhost deployments; shorter TTL. |
| Verification | Cookie attribute inspection. |
| Status | Confirmed |

---

### MED-008 — Org switching via client-controlled cookie/header without step-up auth

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Category | Security / Multi-tenancy |
| Affected Module | Tenant management |
| Current Condition | `resolveTenantContext` accepts `x-organization-id` header or `aiospark_active_org` cookie; falls back to user's first org; membership validated but no re-authentication/step-up when switching orgs. |
| Evidence | Source-verified (`tenant/middleware.ts:38-56`). Cross-tenant access blocked for non-members (pen tests pass), but org switching is client-influenced. |
| Business Impact | A user in multiple orgs can switch contexts freely; potential for accidental cross-org data operations. |
| Risk | Operational error; unauthorized viewing of another org's data if membership is overly broad. |
| Recommended Fix | Bind active org to session server-side; require re-authentication or explicit opt-in for org switch; audit org switches. |
| Dependencies | `src/lib/tenant/middleware.ts`, `src/lib/auth/session.ts` |
| Acceptance Criteria | Org switch recorded in audit log; no client-side forcing of org context without server validation. |
| Verification | Tenant isolation test with org switching. |
| Status | Confirmed |

---

### MED-009 — `AIOSPARK_PRIMARY_PROVIDER=gemini` env mismatch with router's `provider: 'google'`

| Field | Value |
|---|---|
| Priority | MEDIUM |
| Category | AI / Configuration |
| Affected Module | LLM Router |
| Current Condition | `.env` sets `AIOSPARK_PRIMARY_PROVIDER=gemini`; router default config hardcodes `provider: 'google'` (reads `GEMINI_API_KEY`). Unclear whether env value is used at all; possible dead config. |
| Evidence | Source-verified (`.env:24`, `router.ts:348-356`). UNVERIFIED whether mismatch causes runtime failure. |
| Business Impact | LLM routing may not honor configured provider; fallback behavior uncertain. |
| Risk | AI features silently use wrong provider or fail. |
| Recommended Fix | Make router read `AIOSPARK_PRIMARY_PROVIDER`/`AIOSPARK_FALLBACK_PROVIDER` and map to provider names consistently; document mapping. |
| Dependencies | `src/lib/llm/router.ts`, `.env` |
| Acceptance Criteria | Configured primary provider is used; fallback works when primary errors. |
| Verification | Router unit test with env-driven routes (mocked provider). |
| Status | Unverified (architecture review only) |

---

## LOW-PRIORITY ISSUE REGISTER

### LOW-001 — Dead PGlite code causes architectural confusion

| Field | Value |
|---|---|
| Priority | LOW |
| Category | DevOps / Code quality |
| Affected Module | Data layer |
| Current Condition | `src/lib/db/client.ts` PGlite relational client is defined but never imported; DDL duplicates `schema.ts`. |
| Evidence | Source-verified (grep: not imported). |
| Recommended Fix | Remove dead code or complete the migration to relational storage. |
| Status | Confirmed |

### LOW-002 — Minor UI/accessibility polish not assessed

| Field | Value |
|---|---|
| Priority | LOW |
| Category | UX / Frontend |
| Affected Module | All pages |
| Current Condition | No accessibility audit performed; no browser testing. |
| Recommended Fix | Run axe/Lighthouse; fix contrast, keyboard navigation, ARIA. |
| Status | Not verified |

### LOW-003 — Documentation gaps (runbook, env schema, deployment)

| Field | Value |
|---|---|
| Priority | LOW |
| Category | DevOps |
| Affected Module | Platform |
| Current Condition | `.env.example` present; no documented required env schema, runbook, or deployment procedure found in scope of this assessment. |
| Recommended Fix | Document required environment variables, deploy steps, backup/restore runbook. |
| Status | Not verified |

---

## CUSTOMER-READINESS DECISIONS

### Stage A — Synthetic-data demonstration: CONDITIONALLY READY (RESTRICTED)

Isolated module tests pass (financial, auth, tenant, onboarding, intelligence, durability) using synthetic/in-memory data, and the product can be demonstrated for query/display flows. **Blockers:** production build fails; credit notes non-functional; outstanding balance incorrect; no browser verification. **Correction C:** Demonstrations must be restricted to an isolated local environment with synthetic data until HIGH-002 (auth bypass) is resolved. Do not expose the current configuration through any public or shared deployment. A demo must avoid claiming credit-note, full reconciliation, or payment processing functionality.

### Stage B — Controlled customer pilot: NOT READY

Cannot safely expose real customer financial data. **Release blockers (all HIGH):**
- Authentication bypass (any password) + hardcoded session secret → accounts not secure.
- Financial invariant broken (credit notes ignored) → incorrect balances.
- Build does not compile → cannot deploy.
- No idempotency + no cross-entity transactions → financial data corruption risk.
- Dual/dead DB architecture → no relational integrity.
- **Correction A:** Financial RBAC (HIGH-011, missing permissions for payments, credit notes, reconciliation, Cash Unblock, collections) is a mandatory customer-data release gate — endpoint-by-endpoint verification required before any customer data or external pilot.
- **Correction B:** Backup/restore verification (HIGH-012, automated backup + demonstrated restoration) is a mandatory customer-data release gate — no real customer financial data without a tested recovery procedure.

A single HIGH security or financial failure blocks the pilot regardless of passing module tests.

### Stage C — Full commercial production: NOT READY

All HIGH issues unresolved; plus medium issues (integrations unconfigured, no automated backup, no E2E, incomplete RBAC) remain. Not viable for supported, monitored, recoverable production financial operations.

---

## PRIORITIZED REMEDIATION ROADMAP

### Wave 1 — HIGH PRIORITY (must complete before any customer financial data)

| # | Problem | Root cause | Required implementation | Affected files | Dependencies | Acceptance criteria | Release impact |
|---|---|---|---|---|---|---|---|
| W1-1 | Build broken (161 TS errors) | Missing store methods/types | Implement missing billing/webhook/subscription types; fix references | `src/lib/billing/*`, `src/lib/db/connection.ts`, `src/lib/financial/currency-org.ts`, test files | `src/lib/billing/store.ts` | `typecheck`=0, `build`=0 | Unblocks all deployment |
| W1-2 | Auth bypass (any password) | Accept-any-password fallback | Remove fallback; require configured provider | `src/lib/auth/supabase.ts`, `dev-mode.ts` | none | Wrong password rejected (401) without provider | Secures accounts |
| W1-3 | Hardcoded session secret | Dev secret returned outside strict gate | Require `AIOSPARK_SESSION_SECRET`; scope dev secret | `src/lib/auth/dev-mode.ts`, `session.ts` | none | No hardcoded secret outside explicit dev | Prevents session forgery |
| W1-4 | Outstanding ignores credit notes AND credit notes not allocatable | One root cause: credit-note allocation ledger never implemented (no `insertCreditAllocation`/`reverseCreditAllocation`/`getCreditNoteBalance`); outstanding calc never subtracts credit allocations | Implement `CreditNoteAllocation` ledger with balance limits; subtract active credit allocations from `getInvoiceOutstandingBalance` and receivables engine; add allocation/reversal audit records; fix failing financial test files | `src/lib/udm/store.ts`, `types.ts`, `dashboard/engine.ts`, `receivables/engine.ts`, `audit/service.ts`, financial test files | W1-1 | Invariant `Outstanding = Gross - Matched Payments - Active Credit Allocations` holds for all invoices; allocation reduces outstanding; reversal restores; both HIGH-004/HIGH-005 closed together | Correct balances; credit module functional |
| W1-6 | No cross-entity atomicity | Snapshot-per-mutation | Single transaction/rollback for financial mutations | `durable-repository.ts`, `udm/store.ts`, `reconciliation/engine.ts` | W1-1 | All-or-nothing mutation; rollback on failure | No corrupted ledger |
| W1-7 | No idempotency on financial creation | No idempotency key | Idempotency-key header + dedup for payment/invoice/credit creation | API routes, `udmStore` | W1-1 | Duplicate key → existing record, 409 | No duplicate financial records |
| W1-8 | Test infra blocked (`server-only`) | server-only in test-loaded modules | Isolate server-only or run tests in server runtime | `src/lib/llm/*`, test scripts | W1-1 | master + security suites run | CI can verify quality |
| W1-9 | Dual/dead DB; no relational integrity | Unfinished migration | One authoritative relational DB with constraints; remove/activate PGlite | `src/lib/db/*`, all stores | W1-1 | FK constraints; migrations; no dead confusion | Data integrity |
| W1-10 | Cross-process concurrency lost updates | In-memory per-process Maps + snapshot | DB-level locking or optimistic concurrency per org | `durable-repository.ts`, `udm/store.ts` | W1-9 | Concurrent writes don't lose updates | Safe concurrent use |

### Wave 2 — MEDIUM PRIORITY (before broader commercial release)

| # | Problem | Required implementation | Affected files | Acceptance criteria |
|---|---|---|---|---|
| W2-1 | Copilot rule-based not AI | Back with LLM router (approval-gated) or label non-AI | `api/copilot/route.ts`, `llm/router.ts` | Copilot grounded in UDM; no AI financial mutation without approval |
| W2-2 | RBAC lacks financial resources | Extend `Resource` matrix + enforce on financial routes | `tenant/permissions.ts`, `tenant/middleware.ts` | Least-privilege roles blocked from payments/credit/reconciliation |
| W2-3 | Integrations unconfigured | Configure Razorpay/Supabase/Zoho (env, not committed); mock tests | Integration routes, `.env` | Integration routes respond with test credentials |
| W2-4 | No automated backup/restore | Scheduled backup + restore drill + alerts | `scripts/sqlite-backup.mjs`, ops config | Daily backup; restore test succeeds |
| W2-5 | No browser E2E | Playwright E2E for key journeys | E2E test suite | E2E passes for onboarding/receivables/reconciliation |
| W2-6 | Session cookie not Secure | Secure cookie + shorter TTL | `api/auth/login/route.ts` | Secure cookies non-localhost |
| W2-7 | Org switch via client cookie/header | Server-bound active org + audit switch | `tenant/middleware.ts`, `auth/session.ts` | Org switch audited; server-validated |

### Wave 3 — LOW PRIORITY (refinements; some may remain open for pilot)

| # | Problem | Pilot OK open? | Must close before commercial launch? |
|---|---|---|---|
| W3-1 | Remove dead PGlite code | Yes | Yes (part of data integrity) |
| W3-2 | Accessibility polish (axe/Lighthouse) | Yes | No |
| W3-3 | Documentation/runbook/env schema | Yes | Yes (ops runbook needed) |
| W3-4 | LLM provider env mapping consistency | Yes | No |

**Sequencing rule:** Wave 2 items must not be implemented before their Wave 1 prerequisites (e.g., RBAC financial resources require a working build and auth). Wave 3 items may remain open for a narrowly scoped pilot only if explicitly approved and isolated; none should block Wave 1. **Correction B:** Financial RBAC (HIGH-011) and backup/restore verification (HIGH-012) are mandatory customer-data release gates — they may be implemented after core financial/persistence work but must be verified before any customer data or external pilot is introduced.

**Correction E:** The persistence fix (HIGH-009/HIGH-010) does not require PostgreSQL specifically. The essential requirements are transactional financial operations, relational integrity, safe concurrency, and recovery. Choose the database (PostgreSQL, properly-constrained SQLite, or other) according to deployment and concurrency requirements; do not assume installing a PostgreSQL package equals production use.

---
**End of backlog. Awaiting implementation authorization.**
