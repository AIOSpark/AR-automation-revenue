# AIOSPARK — PRODUCT GAP REGISTER

**Repository:** `/home/subham/AIOSpark/AR-automation-revenue`
**Baseline commit:** `6675c97`
**Constraint:** Read-only audit. No source modified. Not every improvement idea is a blocker.

**Severity:** Critical = blocks pilot / data integrity / security; High = significant customer impact; Medium = moderate impact / technical debt; Low = cosmetic / nice-to-have.
**Priority:** P0 = must fix before pilot; P1 = fix before/during pilot; P2 = post-pilot; P3 = optional.
**Effort:** S = small (<1 week), M = medium (1-3 weeks), L = large (3+ weeks).

---

## Gap Register

| ID | Module | Issue | Evidence | Severity | Business Impact | Root Cause | Recommended Action | Priority | Effort | Dependencies |
|---|---|---|---|---|---|---|---|---|---|---|
| GAP-01 | Security / Middleware | [RESOLVED] CSRF middleware (`proxy.ts`) wired via Next.js auto-discovery; production build reports Proxy middleware active | `src/proxy.ts:7-14`; `next.config.ts`; `npm run build` output | Resolved | CSRF now enforced on state-changing `/api/:path*` routes; Razorpay webhook exempt | Middleware never registered | `src/proxy.ts` auto-discovered by Next.js 16.3.4 as middleware; verified via build output | — | — | None |
| GAP-02 | Security / Tenant | PostgreSQL RLS defined in SQL but never executed against live database; runtime uses in-memory Maps | `src/lib/db/security-migrations.ts`; `src/lib/tenant/schema-rls.sql`; `tenant/store.ts:36-38` | Critical | No database-level tenant isolation; isolation is application-layer only | RLS SQL not executed at runtime | Do NOT activate PostgreSQL RLS blindly; confirm app-layer enforcement suffices (tenant write path fixed in GAP-03) and document | P0 | M | DB client init |
| GAP-03 | Security / Tenant | [RESOLVED] Tenant write path `insertTenantRecord()` now validates session org matches record org; `addMember`/`createInvite` remain membership ops | `tenant/store.ts:259-272` + `assertWriteTenant` helper | Resolved | Cross-tenant write blocked when tenant context is active | Missing session-context validation on writes | Added `assertWriteTenant()` to `insertTenantRecord()`; verified via cross-tenant pen test | — | — | None |
| GAP-04 | Security / Auth | Hardcoded dev signing secret in source | `src/lib/auth/dev-mode.ts:1` | High | Security hygiene violation; literal secret committed | Dev convenience left in source | Remove or gate to fail in production unless `AIOSPARK_SESSION_SECRET` set | P0 | S | None |
| GAP-05 | Financial / Reliability | [RESOLVED] Reconciliation outcomes persisted to SQLite snapshot via `writeSnapshot('reconciliation_outcomes')` | `reconciliation/engine.ts:41, 497-499` + `persist()` calls | Resolved | Match-outcome audit history survives server restart | No snapshot write for outcomes | Added `persist()` after outcome writes and `readSnapshot` in constructor; `clearAll()` deletes snapshot | — | — | durable-repository |
| GAP-06 | Financial / Reliability | Execution module has no dedicated `__tests__` directory; coverage via `execution-verification-phase4.test.ts` + new `o2c-core-e2e.test.ts` + financial-stress | Execution module has only `service.ts`, `types.ts`, `store.ts`, `durable-verifier.ts` | High | Financial execution engine covered by Phase 4 + E2E + stress tests | Tests not in adjacent `__tests__` dir | Execution covered by `execution-verification-phase4.test.ts` (5 tests), financial-stress (concurrency/over-allocation), and new O2C E2E test | P1 | M | None |
| GAP-07 | Financial / Reliability | [RESOLVED] No async lock needed — `executePaymentAllocation` is fully synchronous within single-process runtime; over-allocation check (`amount > currentOutstanding`) prevents over-allocation; `total_allocated <= invoice_amount` invariant holds | `execution/service.ts:251-254`; `reconciliation/engine.ts:344, 372` | Resolved | Concurrent allocation cannot over-allocate | Synchronous read-then-write within single process | Original over-allocation check is correct; verified by financial-stress race test (40M+40M > 50M → Payment B rejected) | — | — | None |
| GAP-08 | Workflow / Onboarding | [RESOLVED] Onboarding UI path (`/api/onboarding/import` → `importEngine`) writes customers/invoices/payments to `udmStore`; verified by O2C E2E test | `src/app/api/onboarding/import/route.ts`; `src/lib/import/engine.ts:198-256` | Resolved | Uploaded invoices visible in Receivables/Customer 360/CFO | Onboarding UI uses canonical import pipeline (importEngine → UDM) | Verified via O2C E2E test: import → UDM → receivables → CFO metrics | — | — | UDM store |
| GAP-09 | Workflow / Import | Import batch history volatile (engine.ts, pilot-pipeline.ts in-memory Maps, no `persist()`) | `import/engine.ts:49`; `pilot-pipeline.ts:333` | Medium | Import audit trail lost on restart | No persistence for batch history | Persist import batches to durable-repository | P1 | S | durable-repository |
| GAP-10 | Workflow / Cash Unblock | [RESOLVED] Cash affected uses `getInvoiceOutstandingBalance()` (not gross); `recoveredCashMinorUnits` computed from persisted matches | `unblock-queue/engine.ts:159, 217` | Resolved | Cash-at-risk not overstated; recovery figures real | Incorrect calculation + hardcoded placeholder | Changed to outstanding balance; recovered cash from `udmStore.getMatches()` | — | — | receivables engine |
| GAP-11 | Workflow / Execution | Cash-unblock execute action blocked (must go through Approval Center); no execution-service call | `cash-unblock/route.ts` | Medium | Cash-unblock actions can't execute directly | Not wired to execution service | Wire unblock-queue execute to approval→execution pipeline | P1 | M | execution service |
| GAP-12 | Workflow / Settings | Organization settings PATCH returns 405; writes not persisted | `settings/page.tsx` honest 405 handling | Medium | Organization settings not configurable via API | Missing API handler | Implement `PATCH /api/tenant/organizations` | P1 | S | tenant store |
| GAP-13 | Data / Lineage | Data lineage incomplete outside pilot-pipeline path (engine.ts, sync-engine lack `source_file_name`/`source_row_number`) | `engine.ts:198-207`; `sync-engine.ts:447, 453` | Medium | Source→UDM not universally traceable | Lineage fields optional, not auto-populated | Auto-populate lineage fields on UDM inserts | P2 | S | UDM types |
| GAP-14 | Data / Mocks | Email provider defaults to sandbox mode (`isSandboxMode = true`) | `communication/email-provider.ts:21` | Medium | Customer communications may not send outside production | Dev default left in production code | Gate sandbox mode strictly behind `NODE_ENV !== production` | P2 | S | None |
| GAP-15 | Data / Mocks | Bank account-aggregator sync returns `mock_mode_active` without credentials | `adapters/bank.ts:151` | Medium | No real bank feed ingestion without credentials | Mock fallback | Document as mock; require credentials for live sync | P2 | S | None |
| GAP-16 | Data / Mocks | Zoho OAuth `mock_zoho_client_id_123` fallback | `integrations/zoho/auth/route.ts:11` | Medium | Zoho OAuth broken in dev without real credentials | Dev fallback | Remove mock fallback; require real credentials | P2 | S | None |
| GAP-17 | Workflow / E2E | [RESOLVED] Genuine O2C E2E test calls actual services through full pipeline: import → receivables → approval → execute → verify → audit | `src/lib/testing/__tests__/o2c-core-e2e.test.ts` (27 tests, all pass) | Resolved | Full O2C transactional flow verified with real execution + durable verification | Test used `markExecutionResult` status flag | Added `runO2CCoreE2ETest()` registered in `master.test.ts` Section 8 | — | — | execution service |
| GAP-18 | AI / Intelligence | Next-best-action is rule-based (no LLM call); causal graph labeled `RULE_INFERRED` (not VERIFIED) | `next-best-action-engine.ts:162-473`; `advanced-engine.ts:109-191` | Medium | Deterministic rules clearly distinguished from AI inference; no false AI claims | No LLM integration in NBA/graph | Document deterministic vs AI paths; connect LLM where credentials configured | P2 | M | LLM credentials |
| GAP-19 | UX / Consistency | `formatCurrency` duplicated inline in 8 pages instead of shared `@/lib/ui/formatters.ts` | Multiple pages inline `formatCurrency` | Low | Visual inconsistency; maintenance debt | Shared formatter underused | Import from shared lib; deprecate duplicates | P2 | S | formatters.ts |
| GAP-20 | UX / Tokens | Design tokens (`src/lib/ui/tokens.ts`) defined but not adopted; inline Tailwind classes used | `tokens.ts` unused by pages | Low | Visual inconsistency | Tokens not adopted | Adopt tokens in components | P2 | M | tokens.ts |
| GAP-21 | UX / Accessibility | Incomplete keyboard accessibility on clickable divs; no `prefers-reduced-motion` | `globals.css` uses `animate-pulse`/`animate-spin` unconditionally | Low | Accessibility gaps for keyboard/vestibular users | Missing a11y handling | Add keyboard handlers; `prefers-reduced-motion` support | P2 | M | None |
| GAP-22 | UX / Customer 360 | `customers/[id]/route.ts` returns empty placeholder arrays for communications/promises/exceptions | `customers/[id]/route.ts` | Medium | Customer 360 incomplete sections | Placeholder data | Connect to real UDM/communications/promises/exceptions | P2 | M | UDM |
| GAP-23 | Code Hygiene | 14 root-level `test-*.ts` dev experiments unused; 7 `scripts/test-*.ts` scratch files | Root `test-add1.ts`…`test-types-temp.ts` not imported | Low | Attack surface / technical debt | Dev experiments left in repo | Remove or move to `__tests__` | P3 | S | None |
| GAP-24 | Operational | Rate limiter in-memory per-process (not shared across instances) | `auth/rate-limiter.ts:14-45` | Low | Rate limits not shared in distributed deployment | Map-based limiter | Use distributed rate limiter (Redis) or document single-instance | P3 | M | Infrastructure |
| GAP-25 | Operational | No refresh token rotation (7-day static sessions) | `auth/session.ts:5` | Low | Long-lived stolen sessions valid | No rotation mechanism | Add refresh token rotation | P3 | M | Auth flow |

---

## Defects vs Missing Capabilities vs Technical Debt vs UX vs Infrastructure

**Actual defects (block data integrity/security):**
- GAP-02 (RLS inactive) — remaining defect
- GAP-01, GAP-03, GAP-05, GAP-07, GAP-08, GAP-10, GAP-17 — RESOLVED in Iteration 19

**Missing capabilities:**
- GAP-06 (execution tests — covered by phase4 + stress + E2E), GAP-09 (import history), GAP-11 (unblock-queue execution), GAP-12 (settings write API), GAP-22 (Customer 360 completeness)

**Technical debt:**
- GAP-04 (dev secret), GAP-13 (lineage), GAP-19 (formatCurrency dup), GAP-20 (tokens), GAP-23 (dev experiments), GAP-24 (rate limiter), GAP-25 (refresh rotation)

**UX improvements:**
- GAP-21 (accessibility), plus GAP-19/GAP-20

**Production infrastructure requirements:**
- GAP-02 (RLS activation), GAP-24 (distributed rate limiting), infrastructure for durable SQLite path (`AIOSPARK_DB_PATH`)

**Customer-validation questions (not blockers, but require answers):**
- Real-user validation of UX, financial metric definitions, import pipeline with actual CSV/Excel files

---

## Iteration 19 — Resolved Gaps Summary

| ID | Issue | Resolution | Evidence |
|---|---|---|---|
| GAP-01 | CSRF middleware not wired | `src/proxy.ts` auto-discovered by Next.js 16.3.4 as middleware; build reports `ƒ Proxy (Middleware)` active | `next.config.ts`, `npm run build` |
| GAP-03 | Tenant write path gap | `assertWriteTenant()` added to `tenantStore.insertTenantRecord()` | `src/lib/tenant/store.ts`, cross-tenant pen test passes |
| GAP-05 | Reconciliation outcomes not durable | `writeSnapshot('reconciliation_outcomes')` on outcome writes; `readSnapshot` in constructor | `src/lib/reconciliation/engine.ts` |
| GAP-07 | No concurrency control on allocation | Original synchronous `executePaymentAllocation` is race-free within single process; over-allocation check enforced | `execution/service.ts`, financial-stress race test passes |
| GAP-08 | Onboarding import siloed | UI path (`/api/onboarding/import` → `importEngine`) writes to `udmStore`; verified by O2C E2E test | `src/lib/import/engine.ts`, `o2c-core-e2e.test.ts` |
| GAP-10 | Unblock-queue gross amount / fake recovered cash | Uses `getInvoiceOutstandingBalance()`; recovered cash from `udmStore.getMatches()` | `src/lib/unblock-queue/engine.ts` |
| GAP-17 | No genuine O2C E2E test | `runO2CCoreE2ETest()` imports → receivables → approval → execute → verify → audit; registered in `master.test.ts` | `src/lib/testing/__tests__/o2c-core-e2e.test.ts` (27/27 pass) |

---

## Top P0 Blocker Summary (must fix before pilot)

| ID | Issue | Why it blocks pilot |
|---|---|---|
| GAP-02 | RLS not active | No DB-level tenant isolation (application-layer enforcement used instead; tenant write path fixed) |
| GAP-04 | Dev secret in source | Security hygiene / compliance |
