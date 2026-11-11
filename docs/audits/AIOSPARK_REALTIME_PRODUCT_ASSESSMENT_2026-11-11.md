# AIOSPARK — REAL-TIME PRODUCT ASSESSMENT & CUSTOMER-READINESS PROGRAM

**Assessment Date:** Wednesday, 11 November 2026, 05:53 UTC  
**Repository:** `/home/subham/AIOSpark/AR-automation-revenue`  
**Product:** AIOSpark — AI-Powered Order-to-Cash Intelligence Platform  
**Assessment Type:** Independent, evidence-based, current-state (not historical)  
**Status:** Assessment complete — remediation roadmap follows in separate backlog document

---

## PART 1 — ASSESSMENT BASELINE (SOURCE OF TRUTH)

All conclusions below are traceable to this baseline. Historical audit documents in `docs/audits/` were NOT used to override current evidence.

| Field | Value |
|---|---|
| Assessment timestamp | 2026-11-11T05:53:38Z |
| Repository path | `/home/subham/AIOSpark/AR-automation-revenue` |
| Git branch | `main` |
| Commit hash | `ad4a31bde96bc221645101e26ec818747269815c` |
| Working-tree status | CLEAN (no modified/untracked tracked files) |
| Node.js | `v26.7.0` |
| npm | `11.19.0` |
| Package name/version | `temp-app` / `0.1.0` |
| Engines | `node >= 22` |

### 1.1 Package scripts (`package.json`)

Key scripts (full list present in package.json):

| Script | Command |
|---|---|
| `dev` | `next dev` |
| `build` | `next build --webpack` |
| `start` | `next start` |
| `lint` | `eslint` |
| `typecheck` | `tsc --noEmit` |
| `test` / `verify` | composite: lint + typecheck + test:scan + test:master + test:financial-stress + test:durability + test:pilot-security |
| `test:master` | `AIOSPARK_TEST_MODE=true node --import tsx scripts/test-master.mjs` |
| `test:financial` | `AIOSPARK_TEST_MODE=true tsx scripts/test-financial.mjs` |
| `test:security` | `AIOSPARK_TEST_MODE=true tsx scripts/test-security.mjs` |
| `test:auth` | `AIOSPARK_TEST_MODE=true tsx scripts/test-auth.mjs` |
| `test:tenant` | `AIOSPARK_TEST_MODE=true tsx scripts/test-tenant.mjs` |
| `test:durability` | `AIOSPARK_DB_PATH=/tmp/... AIOSPARK_TEST_MODE=false node --import tsx scripts/test-durability.mjs` |
| `test:pilot-security` | `AIOSPARK_DB_PATH=/tmp/... AIOSPARK_TEST_MODE=false node --import tsx scripts/test-pilot-security.mjs` |
| Plus ~30 additional module-level test scripts (onboarding, intelligence, cfo, reports, billing, exceptions, agents, etc.) |

### 1.2 Dependencies (production)

`next 16.3.4`, `react 19.2.8`, `react-dom 19.2.8`, `@electric-sql/pglite ^0.5.8`, `drizzle-orm ^0.45.3`, `pg ^8.23.0`, `@supabase/supabase-js ^2.115.0`, `@supabase/ssr ^0.12.6`, `xlsx ^0.18.5`, `tailwind-merge`, `clsx`, `crypto`, `lucide-react`.

Dev: `typescript ^5`, `tsx ^4.23.13`, `eslint ^9`, `eslint-config-next 16.3.4`, `drizzle-kit ^0.31.11`, `tailwindcss ^4`, `@types/*`.

### 1.3 Runtime configuration (secrets not exposed)

`.env` (present on disk, gitignored) contains real-valued `GEMINI_API_KEY`, `GEMINI_BASE_URL`, `GEMINI_MODEL`, `MISTRAL_API_KEY`, `MISTRAL_BASE_URL`, `MISTRAL_MODEL`, `AIOSPARK_PRIMARY_PROVIDER=gemini`, `AIOSPARK_FALLBACK_PROVIDER=mistral`. API key values are **not** reproduced in this report.

**No `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set** — `src/lib/auth/supabase.ts` falls back to `https://placeholder-project.supabase.co` and `placeholder-anon-key`, so `isAuthProviderConfigured()` returns `false` (source-verified: `dev-mode.ts` checks for `"placeholder"` substring).

`AIOSPARK_DB_PATH` is not set in `.env`; `durable-repository.ts` defaults to `path.join(process.cwd(), '.data', 'aiospark.sqlite')` unless `AIOSPARK_TEST_MODE=true` (then `:memory:`).

`.env.local` exists (82 bytes, `rw-------`), gitignored.

### 1.4 Databases / services actually configured

- **`.data/aiospark.sqlite`** (5,320,704 bytes): SQLite file. Contains ONLY the table `repository_snapshots` with 6 namespaces: `communication`, `billing` (2.2 MB), `auth`, `audit`, `import_batches`, `udm`. Source-verified via direct SQLite read.
  - `udm` snapshot contents: 6 customers, 0 contacts, 7 invoices, 1 payment, 1 match, 3 credit notes, 0 disputes, 0 dispute evidences, 0 exceptions, 0 bank transactions.
- **PGlite (`@electric-sql/pglite`)**: `src/lib/db/client.ts` creates an in-memory PGlite instance (`new PGlite()` with **no persistence path**) and runs `CREATE TABLE ...` DDL for `organizations`, `customers`, `invoices`, `payments`, `audit_logs` plus enum types. This is **in-memory only; data is lost on process restart**.
- **Dead code:** `src/lib/db/client.ts` / `dbService` is **not imported anywhere** in `src/` or `scripts/` (grep confirmed only the file itself matches). The PGlite relational schema is defined but unused. The authoritative store is the `durable-repository` (node:sqlite JSON snapshots).
- No PostgreSQL server is running or configured despite `pg` and `drizzle-orm` being dependencies.
- No external services (Supabase, Razorpay, Zoho) are reachable/configured with real credentials in this environment.

---

## PART 2 — CURRENT TECHNICAL CONDITION

### 2.1 TypeScript compilation — TEST EXECUTED — FAILED

Command: `npm run typecheck` → `tsc --noEmit`

**Result: 161 TypeScript errors.** Build is broken.

Representative errors (source-verified):
- `src/lib/db/connection.ts`: references schema members that do not exist: `schema`, `paymentInvoiceMatches`, `creditNotes`, `creditAllocations`, `disputes`, `disputeEvidences`, `exceptions`, `bankTransactions`, `usageEvents`, `subscriptions`, `webhookEvents`. (`schema.ts` does not export these tables; it only defines `organizations`, `users`, `organizationMembers`, `customers`, `customerContacts`, `invoices`, `payments`, `auditLogs`.)
- `src/lib/billing/entitlements.ts`: `getPlan`, `billing_interval`, `grace_period_end` missing on `UsageAndBillingStore` / `OrganizationSubscription`.
- `src/lib/billing/webhook-recovery.ts`: `WebhookEvent` not exported from `./store`; multiple missing store methods.
- `src/lib/financial/currency-org.ts`: `currency` missing on `OrganizationRecord`.
- `src/lib/testing/__tests__/financial-regression.test.ts`: `computeInvoiceOutstanding`, `insertCreditAllocation`, `reverseCreditAllocation` missing on `UniversalDataStore`; `invoice_id` not a valid CreditNote property.
- `src/lib/testing/__tests__/financial-correctness-sprint22.test.ts`: `getInvoiceSettlementBreakdown` missing; `insertCreditAllocation` / `reverseCreditAllocation` / `getCreditNoteBalance` missing on `UniversalDataStore`.
- `src/lib/billing/__tests__/pilot-access.test.ts`: `setPlatformAdmin`, `isPlatformAdmin`, `getPayments` missing.
- `scripts/test-billing-durability.ts:66`: `billing_interval` not a known property (this exact error fails the production build).

Root cause: feature code and tests reference methods/types that were never implemented on the stores (credit-note allocation, billing subscriptions, webhook events). The codebase is internally inconsistent.

### 2.2 ESLint — TEST EXECUTED — PASSED

Command: `npm run lint` → `eslint`. No errors reported. Exit code 0.

### 2.3 Production build — TEST EXECUTED — FAILED

Command: `npm run build` → `next build --webpack`

**Result: FAILED.** Next.js compiled successfully in 7.3s, then the TypeScript build check failed:

```
./scripts/test-billing-durability.ts:66:5
Type error: Object literal may only specify known properties, and 'billing_interval' does not exist in type 'Partial<OrganizationSubscription> & { plan_id: PlanTierId; }'.
```

**The production build does not succeed.** The application cannot be deployed in its current state.

### 2.4 Test infrastructure blocker — `server-only` import

`src/lib/llm/router.ts:5`, `provider.ts:4`, `openai-adapter.ts:5` import `server-only`. When test suites are executed via `tsx` / `node --import tsx` (plain Node, not the Next.js server runtime), importing `server-only` throws:

```
Error: This module cannot be imported from a Client Component module. It should only be used from a Server Component.
```

This **blocks** execution of:
- `test:master` (aggregated suite)
- `test:security` (`security-ci.test.ts`)
- Any test transitively importing `src/lib/llm/router.ts` (`evaluation-runner.ts`, `offline-router-test.ts`, `live-provider-test.ts`, `production-truth-test-live.ts`, `agents/executor.ts`)

These suites could NOT be executed in this assessment. Individual module tests that do not import the LLM router ran successfully (see Part 3).

---

## PART 3 — ACTUAL BUILD AND TEST RESULTS

Tests executed with `AIOSPARK_TEST_MODE=true`. Test databases: `:memory:` for unit-style suites; isolated SQLite files under `/tmp` for durability/pilot-security. No production data was touched. No real payments or external API calls were made.

| Test suite | Command | Result | Passed | Failed | Skipped | Notes / Evidence |
|---|---|---|---|---|---|---|
| Financial | `AIOSPARK_TEST_MODE=true npx tsx scripts/test-financial.mjs` | PASSED | 9 | 0 | 0 | Golden outstanding calcs, payment allocation validation, reconciliation safety, cross-module consistency. `:memory:` DB. |
| Auth | `AIOSPARK_TEST_MODE=true npx tsx scripts/test-auth.mjs` | PASSED | 17 | 0 | 0 | Signup, duplicate email, login, email verification, logout/revocation. `:memory:` DB. |
| Cross-tenant pen | `AIOSPARK_TEST_MODE=true npx tsx scripts/test-tenant.mjs` | PASSED | 8 | 0 | 0 | Cross-tenant record access blocked, list pollution, role writes denied, SoD, RLS boundary, multi-org membership. |
| Durability | `AIOSPARK_TEST_MODE=false node --import tsx scripts/test-durability.mjs` | PASSED | 27 | 0 | 0 | Data survives restart via SQLite `repository_snapshots` (invoices, payments, matches, approvals, audit logs, import batches, reconciliation outcomes). `/tmp/aiospark-durability-test.sqlite`. |
| Pilot security | `AIOSPARK_TEST_MODE=false node --import tsx scripts/test-pilot-security.mjs` | PASSED | 28 | 0 | 0 | Pilot-mode write blocks, external comms block, CSRF, pilot survives restart. `/tmp/aiospark-pilot-test.sqlite`. |
| Financial stress | `AIOSPARK_TEST_MODE=true npx tsx scripts/test-financial-stress.mjs` | PASSED | — | 0 | 0 | Partial allocations, precision boundaries, race condition (over-allocation rejected), multi-invoice vs single payment. `:memory:` DB. |
| Onboarding | `AIOSPARK_TEST_MODE=true npx tsx scripts/test-onboarding.mjs` | PASSED | 12 | 0 | 0 | Company setup, auto-suggest mapping, fault-tolerant pipeline, tenant ledger sync. |
| Intelligence | `AIOSPARK_TEST_MODE=true npx tsx scripts/test-intelligence.mjs` | PASSED | 4 | 0 | 0 | Contract integrity, confidence bands, structural enforcement, fallback state. Mock-based. |
| Master suite | `AIOSPARK_TEST_MODE=true npx tsx scripts/test-master.mjs` | BLOCKED | 0 | 0 | 0 | `server-only` import error (LLM router). Cannot run under plain Node/tsx. |
| Security CI | `AIOSPARK_TEST_MODE=true npx tsx scripts/test-security.mjs` | BLOCKED | 0 | 0 | 0 | `server-only` import error (LLM router). Cannot run under plain Node/tsx. |
| Financial regression | `financial-regression.test.ts` | NOT RUN (TS errors) | — | — | — | References `insertCreditAllocation`, `reverseCreditAllocation`, `computeInvoiceOutstanding` — none exist on `udmStore`. Does not compile. |
| Sprint 22 financial | `financial-correctness-sprint22.test.ts` | NOT RUN (TS errors) | — | — | — | References missing credit-allocation methods. Does not compile. |

Skipped tests were not counted as passed (none skipped in executed suites).

**Interpretation:** The isolated, non-LLM module test suites pass. However, two suites cannot run due to the `server-only` import blocker, and two financial-correctness test files do not compile because they test credit-note allocation methods that were never implemented. TypeScript compilation and the production build fail.

---

## PART 4 — FINANCIAL SYSTEM FORENSIC ASSESSMENT

### 4.1 Accounting invariant check

Invariant required: `Outstanding = Gross Invoice Amount - Matched Payments - Active Credit Allocations`

**Confirmed: INVARIANT VIOLATED.**

`src/lib/dashboard/engine.ts:20-29` — `getInvoiceOutstandingBalance`:
```ts
const paidMatchedSum = matches.reduce((acc, m) => acc + m.matched_amount_minor_units, 0);
const outstanding = invoice.amount_minor_units - paidMatchedSum;
return Math.max(0, outstanding);
```
Only matched payments are subtracted. **Credit-note allocations are never subtracted.** `src/lib/receivables/engine.ts:171` computes `outstandingMinorUnits = Math.max(0, inv.amount_minor_units - paidMatchedSum)` — same omission.

### 4.2 Credit notes exist but cannot be allocated

- `src/lib/udm/types.ts:134-149` — `CreditNote` type exists (`amount_minor_units`, `currency`, `customer_id`, `date`, `reason`).
- `src/lib/udm/store.ts` — `insertCreditNote` / `getCreditNotes` exist (3 credit notes present in the `udm` snapshot).
- **`insertCreditAllocation`, `reverseCreditAllocation`, `getCreditNoteBalance` do NOT exist** (grep across `src/lib/udm/store.ts` and `types.ts` returned no matches — exit 1). Confirmed by TypeScript errors in `financial-regression.test.ts` and `sprint22.test.ts`.

**There is no credit-note-to-invoice allocation mechanism.** Credit notes can be created but never applied against an invoice. Credit notes are therefore not counted as cash received (good) but also cannot reduce outstanding (bad — invariant broken).

### 4.3 Allocation limits

- `insertMatch` (udm/store.ts:291-312): prevents duplicate payment→invoice matches but does **not** validate that `matched_amount_minor_units` ≤ available payment amount or ≤ open invoice balance. Over-allocation possible via direct match insertion.
- `reconciliation/engine.ts` `executeApprovedMatch`: does guard total allocation (`availableBalance < tx.amount_minor_units` throws) and allocates `Math.min(remainingTxAmount, openBal)`. Reconciliation path is reasonably guarded.
- Financial stress test confirmed race-condition safety: two concurrent 40M allocations against a 50M invoice → one succeeds, one rejected; total allocated never exceeds invoice amount.

### 4.4 Invoice status transitions

In `reconciliation/engine.ts:406-410`, invoice status set to `paid` when `newPaidTotal >= inv.amount_minor_units`, else `partially_paid`. This considers payments only, not credit notes — an invoice could be marked `paid` while a credit-note balance is still outstanding, or vice versa.

### 4.5 Multi-currency / precision

- All amounts stored in minor units (integer, e.g. paise). `src/lib/financial/currency.ts` and `monetary-parser.ts` exist. Currency stored per-record (`currency` TEXT default `INR`).
- No cross-currency conversion logic observed; no enforcement that a payment and invoice share a currency before matching. Currency mixing risk is **UNVERIFIED** (no test exercised mixed currency).
- Stress test confirmed integer precision (99,999,999 - 12,345,678 = 87,654,321).

### 4.6 Atomicity / audit

- UDM store mutations (`insertPayment`, `insertMatch`, `updateInvoice`, etc.) each call `this.persist()` which writes a single JSON snapshot via `writeSnapshot` (`durable-repository.ts:84-101`) wrapped in `BEGIN IMMEDIATE`/`COMMIT`. Per-mutation atomic at the snapshot level, but **no cross-entity transaction** (e.g., payment + match + invoice update are separate snapshot writes — not one atomic transaction).
- `reconciliation/engine.ts` `executeApprovedMatch` performs payment insert + matches + invoice updates + bank-transaction update as separate UDM calls; if one fails mid-way, partial state is possible (no rollback across the whole operation).
- `AuditService.record` is called for invoice/customer updates and reconciliation matches — material mutations are audited (audit snapshot had 91 records). Credit-note create has **no audit call** (`insertCreditNote` does not call `AuditService`).

### 4.7 Duplicate financial records

- `insertMatch` prevents duplicate payment→invoice pairs.
- `insertPayment` / `insertInvoice` / `insertCreditNote` have **no idempotency key** — retrying a payment creation creates a new payment record each time. Duplicate-request → duplicate-financial-record risk is present for direct payment/invoice creation endpoints.
- No idempotency-key middleware observed on financial mutation API routes.

### Financial assessment summary (SOURCE VERIFIED + TEST EXECUTED)

| Item | Condition |
|---|---|
| Outstanding calc | BROKEN — ignores credit notes (same root cause as credit-note allocation) |
| Credit note allocation | NOT IMPLEMENTED (same root cause as outstanding calc) |
| Payment allocation limits | Partial (guarded in reconciliation, not in direct match insert) |
| Invoice status transitions | Payment-only, ignores credit |
| Atomicity | Per-mutation snapshot; no cross-entity transaction |
| Audit logging | Present for payments/invoices; ABSENT for credit-note creation |
| Duplicate prevention | Match-level only; no idempotency on payment/invoice creation |
| Multi-currency | UNVERIFIED |

---

## PART 5 — SECURITY AND CUSTOMER DATA PROTECTION

### 5.1 Authentication — HIGH RISK FINDINGS

`src/lib/auth/supabase.ts` `executeLogin` (lines 141-144):
```ts
if (!providerConfigured) {
  if (passwordInput.toLowerCase().includes("wrong") || passwordInput === "WrongPassword999!") {
    return { success: false, error: "Invalid email or password" };
  }
}
```
**When Supabase is not configured (current state — placeholders only), login accepts ANY password for an existing user**, except passwords containing "wrong". There is no password verification against a stored hash. `executeSignup` similarly creates users without Supabase when dev auth is on.

`src/lib/auth/dev-mode.ts:23-33` — `getAuthSigningSecret()` returns hardcoded `DEVELOPMENT_SIGNING_SECRET = "local-development-session-secret"` when dev auth is enabled (non-production + test mode or `AIOSPARK_DEV_AUTH=true`). In production it throws if `AIOSPARK_SESSION_SECRET` unset.

`src/lib/auth/session.ts` — session token `v1.<payload>.<hmac-sha256>`, 7-day TTL, HMAC with the dev secret in dev. Revocation via in-memory `SessionRevocationStore` backed by SQLite snapshot.

**Confirmed security defects:**
1. **Authentication bypass in development/default mode:** any password authenticates an existing user when Supabase is not configured. (Source-verified: `supabase.ts:141-144`.)
2. **Hardcoded development session signing secret** ("local-development-session-secret") usable whenever dev auth is on. (Source-verified: `dev-mode.ts:1`.)
3. Default `AIOSPARK_OPERATIONAL_MODE` = `development` (`operational-mode.ts:17-20`) — no financial write restrictions by default.
4. No `AIOSPARK_SESSION_SECRET` configured → production auth would fail closed (throws), but in dev/default mode auth is weak.

### 5.2 Authorization / RBAC

`src/lib/tenant/permissions.ts` — explicit role matrix (Owner, Admin, Finance Manager, Finance Executive, Viewer) across resources (customers, invoices, exceptions, approvals, integrations, billing). `validatePermission` returns 401/403 correctly when context resolved.

**Gap:** Role matrix lacks resources for `payments`, `credit_notes`, `reconciliation`, `cash_unblock`, `collections`, `billing` has no permissions for most roles. Several product modules have no RBAC mapping at all → authorization enforcement incomplete for financial operations.

### 5.3 Multi-tenancy

`src/lib/tenant/middleware.ts` `resolveTenantContext` resolves org from `x-organization-id` header, `aiospark_active_org` cookie, or falls back to user's **first** organization, then validates membership via `tenantStore.getMember`. Cross-tenant pen tests PASSED (8/8): direct record access and list pollution blocked, RLS boundary active.

**Gap:** Org can be switched via client-controlled cookie/header; a user who is a member of multiple orgs can target any of them. Membership check prevents access to orgs they are not in, but there is no "primary org" binding or re-authentication on org switch. Object-level authorization is enforced at the UDM layer via `assertWriteTenant` and read filters.

### 5.4 Operational modes

`operational-mode.ts`: `assertFinancialWriteAllowed` throws only in `pilot` mode; `development` (default) and `production` allow all financial writes. No server-side enforcement of pilot restrictions beyond the billing/pilot-access store and execution service (which were tested and pass).

### 5.5 Other security risks

- **CSRF:** `csrf.ts` exists; pilot-security test confirmed same-origin POST allowed, cross-origin POST rejected, missing-origin state-changing rejected.
- **Security headers:** `src/lib/security/headers.ts` + `next.config.ts` `headers()` applying `getSecurityHeaders()` to all routes.
- **Rate limiting:** `auth/rate-limiter.ts` applied to login/signup (IP + account).
- **Session:** httpOnly, SameSite=lax, `secure` only in production (not secure in dev — cookie sent over HTTP).
- **SQL injection:** Drizzle parameterized + node:sqlite prepared statements; risk low but raw `database.exec` in `client.ts` with tenant ID string interpolation (`SET app.current_tenant_id = '${orgId}';`) — PGlite path is dead code so not actively exposed.
- **Secrets:** Real API keys committed to `.env` (gitignored but present on disk). `.env.local` present.
- **CORS / XSS / SSRF / file upload:** Not comprehensively implemented or verified. `adapters/url-safety.ts` exists for SSRF/URL safety in ERP adapters.

---

## PART 6 — DATABASE AND DATA RELIABILITY

### 6.1 Actual persistence architecture

Two disconnected stores:

1. **PGlite client (`src/lib/db/client.ts`)** — in-memory PostgreSQL via Wasm, `new PGlite()` with no persistence directory. Creates relational tables (`organizations`, `customers`, `invoices`, `payments`, `audit_logs`) + enums. **NOT imported anywhere — dead code.** Data lost on restart if it were used.
2. **node:sqlite durable repository (`src/lib/db/durable-repository.ts`)** — `DatabaseSync` at `.data/aiospark.sqlite` (or `:memory:` in test mode). Single table `repository_snapshots(namespace, payload, updated_at)` storing **JSON snapshots**. This is the **authoritative store** used by `udmStore`, `authStore`, `audit`, `billing`, `reconciliation`, etc.

**The "database" is JSON blobs in a single SQLite table, not a relational financial ledger.** There are no foreign keys, no referential integrity, no column-level constraints on the financial data itself (customers/invoices/payments). Constraints are enforced only in application code.

### 6.2 Durability (TEST EXECUTED — PASSED)

Durability test (27/27) confirmed: invoices, customers, payments, matches, approvals, executions, audit logs (91 records), import batches, reconciliation outcomes all survive a simulated restart by reading directly from the SQLite `repository_snapshots` table. `PRAGMA journal_mode=WAL`, `busy_timeout=5000`.

### 6.3 Reliability gaps

- **No transactions across mutations:** each UDM write is a separate snapshot `BEGIN`/`COMMIT`. A payment+match+invoice-status update is not atomic.
- **Snapshot merge conflict resolution** (`mergeConcurrentSnapshots`) uses last-write-wins by timestamp for arrays — concurrent writes to the same namespace can lose updates. No row-level locking.
- **Single process in-memory Maps** (`udmStore` constructor loads snapshot once; mutations mutate Maps + persist). Under concurrent serverless invocations, each invocation has its own Map copy loaded from the snapshot — **lost updates / stale reads across concurrent requests are a real risk** (no cross-process coordination). The stress test exercised this within one process; multi-process safety is UNVERIFIED.
- **No backup automation** observed (`scripts/sqlite-backup.mjs` exists but is a manual script, not scheduled). No restoration drill documented in code.
- **PGlite dead code** creates confusion about which DB is authoritative and implies an unfinished migration to a real relational DB.

---

## PART 7 — CUSTOMER WORKFLOW VALIDATION

Workflows were validated at the source/API/test level, not via browser (no Playwright execution performed; `.playwright-mcp` present but no browser test run in this assessment). Browser verification = NOT VERIFIED.

| Workflow | Condition | Evidence |
|---|---|---|
| A. Onboarding (signup→org→dashboard) | PARTIALLY | Onboarding tests pass (12/12); auth passes. No browser E2E. |
| B. Data import | PARTIALLY | Import tests pass; fault-tolerant pipeline (3 valid, 2 invalid rows). No persistence-to-receivables E2E verified at runtime. |
| C. Receivables | PARTIALLY | Receivables engine + API exist; tests pass for query engine. Outstanding calc ignores credit notes (defect). |
| D. Payment reconciliation | PARTIALLY | Reconciliation engine + approval flow implemented and tested. Deterministic + fuzzy matching. |
| E. Credit notes | BROKEN | Credit notes creatable (3 in DB) but **no allocation mechanism**; cannot reduce outstanding. |
| F. Collections | PARTIALLY | `promises/store.ts`, `collections-agent.ts` exist; promises test present. Not runtime-verified end-to-end. |
| G. Exceptions | PARTIALLY | `exceptions/engine.ts`, query engine, tests present. Cash-unblock metric references exceptions. |
| H. Cash Unblock | PARTIALLY | `cash-unblock-simulator.ts`, API routes, simulator modal exist. Not live-verified. |
| I. Reporting | PARTIALLY | `reports/definitions.ts`, `export-service.ts`, scheduler, reports API exist. |
| J. Tenant isolation | VERIFIED (unit) | Cross-tenant pen tests 8/8 pass. Not browser-verified. |
| K. Data recovery | VERIFIED (unit) | Durability test 27/27 confirms SQLite snapshot survival. |

**No workflow was browser-verified.** No Playwright E2E was executed.

---

## PART 8 — MODULE-BY-MODULE COMPLETENESS MATRIX

| Module | Classification | Evidence |
|---|---|---|
| Dashboard / Command Center | IMPLEMENTED NOT RUNTIME-VERIFIED | `dashboard/engine.ts`, metrics API, page exists; not browser-tested |
| Receivables Management | PARTIALLY IMPLEMENTED | Query engine + API; outstanding calc ignores credit notes (defect) |
| Customer 360 | PARTIALLY | `customers/[id]` page + API; customer engine exists |
| Invoice Management | PARTIALLY | CRUD via UDM; status transitions incomplete (credit-note-blind) |
| Payments & Reconciliation | IMPLEMENTED NOT RUNTIME-VERIFIED | Reconciliation engine + approval flow; tested (stress passes) |
| Credit Notes & Allocations | BROKEN | Credit notes creatable; **no allocation** (missing methods) |
| Collections / Promises | PARTIALLY | Store + agent exist; not E2E verified |
| Exceptions & Disputes | PARTIALLY | Engine + query engine; disputes table not in UDM snapshot (0 records) |
| Cash Unblock | PARTIALLY | Simulator + API; not live-verified |
| Causal Graph | UI ONLY / PARTIAL | `causal-graph` page + API; no verified runtime behavior |
| CFO Intelligence | IMPLEMENTED NOT RUNTIME-VERIFIED | `cfo/engine.ts`, overview API; tested indirectly via copilot |
| Next-Best-Action | PARTIAL | `next-best-action-engine.ts`, API; intelligence tests pass (mock) |
| AI Employees / Agents | PARTIAL | Agent registry, executors, safety middleware; LLM router blocked from testing |
| Copilot | RULES-BASED (not AI) | Keyword intent matching (`cleanPrompt.includes`), not LLM-driven |
| Approvals & Execution Center | IMPLEMENTED NOT RUNTIME-VERIFIED | `approvals/store.ts`, execution service, pilot-mode enforced |
| Org / Tenant Mgmt | IMPLEMENTED NOT RUNTIME-VERIFIED | Tenant middleware, members, RLS; pen tests pass |
| Data Import / Onboarding | IMPLEMENTED NOT RUNTIME-VERIFIED | Import engine + pipeline; 12 tests pass |
| Reports & Analytics | PARTIAL | Definitions, export, scheduler exist; not E2E verified |
| Integrations (Supabase/Razorpay/Zoho) | NOT IMPLEMENTED / BLOCKED | Supabase not configured (placeholders); Razorpay webhook TS errors; Zoho OAuth routes exist but unverified |
| Billing & Subscription | BROKEN (TS errors) | `entitlements.ts`, `webhook-recovery.ts`, `pilot-access.ts` have TS errors; `billing_interval`/`getPlan` missing |
| Platform Administration | PARTIAL | Admin API routes exist; unverified |
| Monitoring / Observability | PARTIAL | `observability/` store, metrics, alerts exist; tests present |

**No module is classified COMPLETE AND VERIFIED at runtime/browser level.**

---

## PART 9 — AI AND INTELLIGENCE RELIABILITY

- LLM router (`src/lib/llm/router.ts`): configured for primary `google` (reads `GEMINI_API_KEY`) + fallback `mistral` (`MISTRAL_API_KEY`). `.env` has real keys. `AIOSPARK_PRIMARY_PROVIDER=gemini` in `.env` does not match router's hardcoded `provider: 'google'` route (potential config/code mismatch — UNVERIFIED impact).
- Router has retry + timeout + fallback logic; returns `AUTH_ERROR` when no provider configured.
- **BLOCKED from testing:** `server-only` import prevents router execution under `tsx`/plain Node. No live LLM call was made (would require real external API call — not permitted/safe).
- Copilot (`api/copilot/route.ts`): **rule-based keyword intent matching**, not LLM. Grounded in `cfoIntelligenceEngine.getOverview` + UDM data. No independent financial mutation by AI.
- Agent orchestration: `agent-registry.ts`, `executor.ts`, `safety-middleware.ts`, `policy-engine.ts` exist; agents require approval (`policyEngine.checkPolicy` → approval store). Approval enforcement present for reconciliation matches.
- Hallucination protection: intelligence tests use confidence bands and structural enforcement (mock-based). Not live-tested.

**AI does not independently alter financial records** — actions route through approval store. (Confirmed via code inspection; not live-tested.)

---

## PART 10 — PERFORMANCE, OPERATIONS, DEPLOYMENT

- No benchmarks executed (no safe isolated benchmarking environment established; would not invent figures).
- Build fails → cannot deploy via `next build`.
- Logging: `observability/api-metrics.ts`, `ai-quality.ts`, `alerts.ts`, `store.ts` exist; structured logging not verified at runtime.
- Backup: `scripts/sqlite-backup.mjs` manual only; not automated/scheduled.
- Recovery: durability test shows snapshot recovery works, but no formal backup/restore procedure documented.
- CI/CD: `.github/` exists; workflow contents not examined in depth (no CI run performed).
- Environment separation: `.env`, `.env.local`, `.env.example` present; `.env` contains real keys (should not be committed long-term).

---

## PART 11 — SUMMARY OF CONDITION

1. **TypeScript compilation fails (161 errors). Production build fails.** The application cannot be built or deployed as-is.
2. **Authentication is weak in default/dev mode:** any password works when Supabase is unconfigured; hardcoded dev session secret.
3. **Financial invariant is broken:** outstanding ignores credit notes; no credit-note allocation mechanism exists (referenced by tests that don't compile).
4. **Dual/dead database architecture:** PGlite relational client is unused; authoritative store is JSON snapshots in one SQLite table (no relational integrity, no cross-mutation transactions).
5. **Test suites blocked:** master + security-ci cannot run due to `server-only` import; credit-note financial tests don't compile.
6. **Core modules exist and isolated tests pass** (financial, auth, tenant, durability, pilot-security, onboarding, intelligence), but nothing is browser/E2E-verified and no module is production-complete.

The product is **not** ready for customer financial data in its current state.

---

## PART 12 — EVIDENCE LABELS USED

- SOURCE VERIFIED — read directly from source files
- TEST EXECUTED — PASSED / FAILED — actual command run
- RUNTIME VERIFIED — (none at browser level)
- NOT VERIFIED — suspected but not confirmed
- BLOCKED — could not execute (e.g. `server-only` import)

Both report files were written and verified after completion.
