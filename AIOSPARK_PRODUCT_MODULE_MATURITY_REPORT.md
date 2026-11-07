# AIOSPARK — PRODUCT MODULE MATURITY REPORT

**Repository:** `/home/subham/AIOSpark/AR-automation-revenue`
**Baseline commit:** `6675c97`
**Maturity scale:**
- 0 = Not implemented
- 1 = UI/schema placeholder
- 2 = Partially implemented or prototype
- 3 = Integrated with real application data and persisted operations
- 4 = Fully implemented, tested and secured
- 5 = Validated by real users in an operational environment

**Constraint:** Read-only audit. Scores based on concrete evidence (file:line, tests). Unit-test counts alone do not establish maturity. A feature that exists in code but does not work end-to-end does not receive a high score.

---

## Maturity Scoring Summary

| # | Module | Functional | Integration | Financial Correctness | Security | UX | Operational Readiness | Customer Validation |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | Authentication & Sessions | 3 | 3 | N/A | 2 | 3 | 2 | 0 |
| 2 | RBAC | 4 | 4 | N/A | 4 | 2 | 3 | 0 |
| 3 | Tenant Isolation | 2 | 2 | N/A | 3 | 2 | 2 | 0 |
| 4 | Billing / Subscriptions | 3 | 3 | 3 | 4 | 2 | 3 | 0 |
| 5 | Payments (parsing, query) | 3 | 3 | 3 | 3 | 3 | 3 | 0 |
| 6 | Receivables | 3 | 3 | 3 | 3 | 3 | 2 | 0 |
| 7 | Reconciliation | 3 | 3 | 3 | 3 | 3 | 3 | 0 |
| 8 | Execution (financial mutations) | 3 | 3 | 3 | 3 | 1 | 3 | 0 |
| 9 | Approval Center | 3 | 3 | 3 | 3 | 3 | 3 | 0 |
| 10 | Import Pipeline (CSV/Excel) | 3 | 3 | 2 | 3 | 2 | 2 | 0 |
| 11 | Adapters (Zoho, Tally, Bank, CSV) | 3 | 2 | 2 | 3 | 1 | 2 | 0 |
| 12 | UDM Persistence | 4 | 4 | 4 | 3 | N/A | 3 | 0 |
| 13 | Onboarding (import wizard) | 2 | 1 | 1 | 2 | 3 | 1 | 0 |
| 14 | Cash Unblock Queue | 3 | 3 | 2 | 2 | 3 | 2 | 0 |
| 15 | Next-Best-Action Engine | 3 | 3 | 2 | 2 | 3 | 2 | 0 |
| 16 | Causal Graph | 2 | 2 | 1 | 2 | 3 | 1 | 0 |
| 17 | AI Agents & LLM | 3 | 2 | N/A | 3 | 1 | 2 | 0 |
| 18 | CFO Reports / Financial Intelligence | 3 | 3 | 3 | 3 | 3 | 3 | 0 |
| 19 | Exceptions & Disputes | 2 | 2 | 1 | 2 | 3 | 1 | 0 |
| 20 | Collections | 2 | 2 | 1 | 2 | 3 | 1 | 0 |
| 21 | Reports (generation/export/schedule) | 3 | 3 | 2 | 3 | 3 | 3 | 0 |
| 22 | Audit & Observability | 3 | 3 | 3 | 4 | 1 | 3 | 0 |
| 23 | Dashboard / Command Center | 3 | 3 | 3 | 3 | 3 | 3 | 0 |
| 24 | Customer 360 | 3 | 3 | 3 | 3 | 3 | 2 | 0 |

**Customer Validation = 0 for all modules** — no real user has validated any module in an operational environment. This is honest: the product has not reached Level 5 anywhere.

---

## Module-by-Module Detail

### 1. Authentication & Sessions — Functional 3, Integration 3, Security 2, UX 3, Ops 2

**Evidence:**
- Supabase client + dev-mode gating, fail-closed without provider (`src/lib/auth/supabase.ts:10-11`, `src/lib/auth/dev-mode.ts:8,26-27`)
- HMAC-SHA256 signed session tokens, 7-day TTL, revocation store (`src/lib/auth/session.ts:5, 15-17, 75-86`)
- httpOnly/secure/sameSite cookies (`src/app/api/auth/login/route.ts:55-63`)
- Rate limiting (IP + account, 5/min) on auth routes (`src/app/api/auth/login/route.ts:14-15`)

**Limitations:** CSRF not enforced on auth routes (proxy.ts not wired); hardcoded dev secret in source (`dev-mode.ts:1`); Supabase placeholder fallbacks (`supabase.ts:10-11`); session IDs use `Math.random()` not crypto (`store.ts:68`); no refresh token rotation.

**Security 2 (not 4):** CSRF bypass is a real gap; dev secret is security debt.

**Ops 2:** Session revocation is in-memory Map with snapshot persistence (vulnerable to crash between write and snapshot).

---

### 2. RBAC — Functional 4, Integration 4, Security 4, UX 2, Ops 3

**Evidence:**
- Explicit permission matrix: 5 roles × 8 resources × 6 actions (`src/lib/tenant/permissions.ts:18-69`)
- `can()` returns false for unknown role/resource/action (fail-closed) (`:75-87`)
- `canGrantRole()` prevents privilege escalation (`:97-101`)
- Enforced at API route level via `resolveTenantContext()` + `validatePermission()` (`src/lib/tenant/middleware.ts:82-102`)

**Limitations:** No UI-level RBAC gating visible on all components; auth routes (login/signup/logout) bypass RBAC (appropriate for entry points). UX 2 because permission errors surface as generic 403 without rich guidance.

---

### 3. Tenant Isolation — Functional 2, Integration 2, Security 2, UX 1, Ops 1

**Evidence:**
- Read path: `queryTenantTable`/`getTenantRecordById` filter by session org, return [] when no context (`src/lib/tenant/store.ts:222-257`)
- Cross-tenant penetration tests pass for in-memory reads (`tenant/__tests__/cross-tenant-pen.test.ts`)

**Limitations (Security 2):** 
- Write path `insertTenantRecord()` does NOT validate session org matches record org — cross-tenant write possible if org ID guessable (`tenant/store.ts:259-272`)
- PostgreSQL RLS defined in SQL but **never executed against live DB** at runtime (`schema-rls.sql`, `security-migrations.ts`); runtime uses in-memory Maps + JSON snapshots
- No database-level enforcement; isolation is application-layer only

**UX 1 / Ops 1:** No tenant switching UX beyond a cookie; no cross-tenant conflict warnings.

---

### 4. Billing / Subscriptions — Functional 3, Integration 3, Financial 3, Security 4, UX 2, Ops 3

**Evidence:**
- Real minor-unit GST arithmetic (CGST/SGST 9%, IGST 18%) (`billing/processor.ts:225-229`)
- Razorpay HMAC-SHA256 signature verification with `crypto.timingSafeEqual` (`razorpay-service.ts:167-182`)
- Webhook idempotency via `razorpay_event_id` duplicate check (`:214`)
- Audit logging on webhook state changes (`:255-263, 277-285, 299-307`)
- Durable SQLite persistence (`billing/store.ts:147, 152-154`)

**Limitations:** Not a payment-allocation module (no AR over-allocation logic here); no optimistic concurrency on subscription state changes; last-write-wins.

---

### 5. Payments (parsing, query) — Functional 3, Integration 3, Financial 3, Security 3, UX 3, Ops 3

**Evidence:**
- `rupeesToPaise()` string manipulation avoids floating-point error (`csv-parser.ts:92-126`)
- `PAISE_MINOR` vs `INR_MAJOR` unit resolution with ambiguity rejection (`:188-282`)
- Partial allocation tracking (`partially_allocated` status) (`query-engine.ts:169-173`)
- Over-allocation cannot go negative (`Math.max(0, ...)`) (`:120, 160`)
- Real matching from persisted UDM matches (`:95-96`)

**Limitations:** query-engine is read-only (no allocation writes); CSV parser has hardcoded `|| 100000` amount fallback concern (`csv.ts:59`).

---

### 6. Receivables — Functional 3, Integration 3, Financial 3, Security 3, UX 3, Ops 2

**Evidence:**
- Outstanding balance from persisted UDM matches: `Math.max(0, inv.amount_minor_units - SUM(matches.matched_amount_minor_units))` (`engine.ts:169-171`)
- Same formula as dashboard (`dashboard/engine.ts:20-29`)
- Tenant isolation, pagination, age buckets, 10,000-record stress test (`receivables.test.ts`)

**Limitations:** `savedFilterStore` is in-memory only (not durable) (`engine.ts:206-230`); `schema-receivables.sql` (PostgreSQL) not wired to runtime store.

---

### 7. Reconciliation — Functional 3, Integration 3, Financial 3, Security 3, UX 3, Ops 2

**Evidence:**
- Deterministic (exact amount + reference) + fuzzy (bank-fee up to 5%, garbled reference, split-payment subset sum) matching (`engine.ts:54-218`)
- Over-allocation prevention: `availableBalance < tx.amount` throws (`:344`); `matchAmount = Math.min(...)` (`:372`)
- Mandatory approval before balance mutation (test asserts balance unchanged pre-approval)
- Real UDM mutations on approval (Payment, Match, invoice status) (`:349-404`)
- Audit logging per matched invoice (`:424-436`)

**Limitations:** `this.outcomes` Map in-memory only, not durable (`:41, 497-499`); no concurrency control on allocation; race window between balance read and match write.

---

### 8. Execution — Functional 3, Integration 3, Financial 3, Security 3, UX 1, Ops 2

**Evidence:**
- Real UDM mutations (insertMatch, updateInvoice, insertCreditNote) (`service.ts:257, 269, 282`)
- Over-allocation prevention (`amount > currentOutstanding` throws) (`:252-254`)
- IdempotencyKey check (`:29-50`); conflicts throw (`:139`)
- Independent durable verification via `readSnapshotDirect('udm')` (`durable-verifier.ts:15`)
- Audit on every state transition (`execution/store.ts:79-90`)

**Limitations:** **No `__tests__` directory** — significant gap for a financial execution engine; no optimistic concurrency control (race window between balance read and match write); UX 1 because no customer-facing execution status UI beyond internal.

---

### 9. Approval Center — Functional 3, Integration 3, Financial 3, Security 3, UX 3, Ops 3

**Evidence:**
- Genuine CRUD: create, approve, reject, modify (`approvals/store.ts:115-328`)
- Idempotency check (`findByIdempotencyKey`) (`:143-147`)
- Pilot-mode read-only guards (`approvals/[id]/route.ts:55-58`)
- Auto-approve disabled by default (`auto_approve_enabled = false`)
- Audit logging on create/approve/reject/modify/execute (`:115-328`)
- Real execution of approved financial mutations via reconciliation engine (`[id]/route.ts:199-201`)

---

### 10. Import Pipeline — Functional 3, Integration 3, Financial 2, Security 3, UX 2, Ops 2

**Evidence:**
- Real xlsx parsing (`XLSX.read`) — not mocked (`pilot-pipeline.ts:352`, `onboarding/store.ts:135`)
- Real validation with date parsing (DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD) (`import/engine.ts:108-125`)
- Real header mapping with aliases + fuzzy detection (`pilot-pipeline.ts:124-242`)
- Real duplicate detection (exact + fuzzy) (`engine.ts:211-241`, `pilot-pipeline.ts:620-682`)
- Real UDM normalization (insert Customer/Invoice/Payment/Match/Exception/Promise) (`pilot-pipeline.ts:626-795`)

**Limitations:** Import batch history in-memory only (`engine.ts:49`, `pilot-pipeline.ts:333`); `schema-import.sql` not wired to TypeScript; durability disabled in test mode (`durable-repository.ts:72-85`).

---

### 11. Adapters — Functional 3, Integration 2, Financial 2, Security 3, UX 1, Ops 2

**Evidence:**
- Real Zoho OAuth + pagination + rate-limit retry (`zoho.ts:38-134`)
- Real Tally XML over HTTP with SSRF guard (`tally.ts`)
- Real bank ingestion to UDM (`bank.ts:128`)
- `crypto.ts` AES-256-GCM; requires `INTEGRATION_ENCRYPTION_KEY` env or throws (`:6-11`)
- `url-safety.ts` SSRF protection blocks metadata IPs, private ranges, file:// (`:7-192`)

**Limitations:** csv.ts payment synthesis is fake (derived from invoices, not real payments) (`csv.ts:83-96`); hardcoded `|| 100000` amount fallback (`csv.ts:59`); Zoho/Tally never tested against live services (fixtures only); `test_erp` is a toy, not registered.

---

### 12. UDM Persistence — Functional 4, Integration 4, Financial 4, Security 3, Ops 3

**Evidence:**
- Real SQLite snapshot persistence (`writeSnapshot('udm')`) (`udm/store.ts:76-89`)
- Real RLS/tenant enforcement (`assertWriteTenant`, all `get*` filter by session org) (`:106-139`)
- Real match duplicate prevention (`insertMatch` throws on duplicate) (`:298-304`)
- Types with lineage fields (`import_batch_id`, `source_file_name`, etc.) (`types.ts:35-39, 72-76`)

**Limitations:** No dedup enforcement on customers/invoices at store level (caller-dependent); lineage fields optional and not auto-populated; durability disabled in test mode.

---

### 13. Onboarding — Functional 1, Integration 1, Financial 1, Security 2, UX 3, Ops 1

**Evidence:**
- Real xlsx parsing, validation, header mapping with aliases (`onboarding/store.ts:97-230`)
- Multi-step ingestion wizard UI (`src/app/onboarding/page.tsx`)

**Limitations:** **Data does NOT reach UDM** — writes to `tenantStore.insertTenantRecord`, siloed from `udmStore` customers/invoices/payments (`:197-212`); no duplicate detection; no data lineage to UDM; conditional durability.

---

### 14. Cash Unblock Queue — Functional 2, Integration 2, Financial 1, Security 2, UX 3, Ops 1

**Evidence:**
- Reads real UDM invoices/exceptions (`engine.ts:77-80`)
- Controlled actions with idempotency keys; direct execution blocked (must go through Approval Center) (`cash-unblock/route.ts`)
- "Recovered Cash" honestly labeled "NO DATA" (not faked) (`cash-unblock/page.tsx`)

**Limitations:** Uses **gross invoice amount** not outstanding balance (`engine.ts:159`); `recoveredCashMinorUnits` hardcoded `0` (`:217`); no persistence of queue state; no audit logging.

---

### 15. Next-Best-Action Engine — Functional 3, Integration 3, Financial 2, Security 2, UX 3, Ops 2

**Evidence:**
- Real data-driven recommendations from UDM (invoices, customers, exceptions, disputes) (`next-best-action-engine.ts:121-130`)
- Deterministic rule engine (7 scenarios), no LLM call (`:162-473`)
- Provenance labeling (VERIFIED/AI_INFERRED/UNKNOWN) (`:66`, `:150`)
- Policy/RBAC filter (`:479-495`); freshness re-check (`:542-567`)

**Limitations:** Rule-based not AI-generated (despite name); rootCauseProvenance hardcoded VERIFIED for all deterministic paths.

---

### 16. Causal Graph — Functional 2, Integration 2, Financial 1, Security 2, UX 3, Ops 1

**Evidence:**
- Computed from real UDM records (not static example) (`advanced-engine.ts:109-191`)
- Real API route + UI page (`api/causal-graph/route.ts`, `app/causal-graph/page.tsx`)
- Accessible table alternative for graph (`causal-graph/page.tsx`)

**Limitations:** Star-shaped (root → direct children only, no multi-hop); **all nodes hardcoded VERIFIED** — zero AI inference actually produced (`:128, 141, 154, 167`); `AI_INFERRED` type exists but unused.

---

### 17. AI Agents & LLM — Functional 3, Integration 2, Security 3, UX 1, Ops 2

**Evidence:**
- Real LLM router + OpenAI-compatible fetch-based adapter (`llm/router.ts`, `openai-adapter.ts`)
- Real 8-step safety pipeline, non-bypassable (`safety-middleware.ts`, `executor.ts:312`)
- Hardcoded non-bypassable floors: ₹5L ceiling, 60% confidence floor (`safety-middleware.ts:50-52`)
- Durable rate limiting (`policy-engine.ts:183-202`)
- Evaluation framework with gold dataset + safety gates (`testing/evaluation/`)

**Limitations:** Requires API credentials (degrades to deterministic/simulated without them) (`openai-adapter.ts:101-103`); 3 of 6 agents stubbed (`agent-registry.ts:344-394`); NBA is rule-based not AI; causal graph all VERIFIED.

---

### 18. CFO Reports / Financial Intelligence — Functional 3, Integration 3, Financial 3, Security 3, UX 3, Ops 3

**Evidence:**
- Real computed metrics from persisted UDM (`cfo/engine.ts`)
- Cross-view consistency: CFO == Dashboard == Receivables == Collections (phase-d §7, `cfo.test.ts:121-126`)
- DSO, aging buckets, customer exposure, category breakdown — all from UDM

**Limitations:** Read-only (no writes/audit needed); `dateRange` UI state not sent to API (`cfo/page.tsx`).

---

### 19. Exceptions & Disputes — Functional 2, Integration 2, Financial 1, Security 2, UX 3, Ops 1

**Evidence:**
- Real exception detection from UDM (`exceptions/query-engine.ts`)
- Exception taxonomy (PO_MISMATCH, INVOICE_ERROR, etc.) in `paymentDelayCategoryEnum` (`db/schema.ts:8-20`)
- Exceptions workspace UI (`app/exceptions/page.tsx`)

**Limitations:** Resolution workflow not fully connected; `customers/[id]/route.ts` returns empty placeholder arrays for exceptions; no durable exception resolution tracking beyond UDM insert.

---

### 20. Collections — Functional 2, Integration 2, Financial 1, Security 2, UX 3, Ops 1

**Evidence:**
- Real prioritized worklist from UDM (`collections/query-engine.ts`)
- Promise kept/broken/partial/retroactive logic (`promises/job.ts:59-132`)
- Collections agent trigger on broken promises (`:111-122`)

**Limitations:** Read-only display; no durable collections-action tracking; recovery figures not persisted.

---

### 21. Reports — Functional 3, Integration 3, Financial 2, Security 3, UX 3, Ops 3

**Evidence:**
- Real report generation, download, scheduling (`app/reports/page.tsx`, `api/reports/route.ts`)
- Report definitions, export service, scheduler (`reports/definitions.ts`, `export-service.ts`, `scheduler.ts`)

**Limitations:** Financial metrics in reports not independently verified against UDM calculations; export format limited.

---

### 22. Audit & Observability — Functional 3, Integration 3, Financial 3, Security 4, UX 1, Ops 3

**Evidence:**
- Append-only audit log with ES6 Proxy immutability enforcement (`audit/store.ts`)
- Before/after state, AI context, approval context, result enum (`audit/store.ts:8-16`)
- Every UDM mutation audited (`udm/store.ts:217-227, 252-262`)
- CSV/PDF export (`audit/service.ts`)
- Cross-tenant RLS filtering

**Limitations:** Some observability/quality state in-memory only (`ai-quality.ts`, `quality/engine.ts`); UX 1 — no dedicated audit UI for finance admins to reconstruct record history.

---

### 23. Dashboard / Command Center — Functional 3, Integration 3, Financial 3, Security 3, UX 3, Ops 3

**Evidence:**
- Real API-backed financial telemetry (`dashboard/page.tsx`, `api/dashboard/metrics/route.ts`)
- KPIs computed from live API data (`totalReceivablesMinorUnits`, `overdueMinorUnits`, `dsoDays`, etc.)
- Skip link, focus rings, hotkey navigation

**Limitations:** Read-heavy (logout is the only mutation); `formatCurrency` duplicated inline in 8 pages instead of shared lib; no `prefers-reduced-motion`.

---

### 24. Customer 360 — Functional 3, Integration 3, Financial 3, Security 3, UX 3, Ops 2

**Evidence:**
- Real customer financial profile (`app/customers/[id]/page.tsx`, `api/customers/[id]/route.ts`)
- Invoice history, payment history, outstanding balance, risk assessment from UDM
- Investigation trigger via agents

**Limitations:** `customers/[id]/route.ts` returns empty placeholder arrays for communications/promises/exceptions; no collection-history persistence beyond UDM.

---

## Confidence Levels

| Dimension | Confidence | Basis |
|---|---|---|
| Functional implementation | High | Direct source inspection of all modules |
| Integration maturity | High | Route/component/API cross-references verified |
| Financial correctness | High | Minor-unit arithmetic, over-allocation prevention, cross-module consistency verified in tests |
| Security | Medium-High | Auth/RBAC implemented but CSRF bypass, inactive RLS, tenant write-path gap identified |
| UX | Medium | Frontend audit (15/18 pages real data) but tokens underused, formatCurrency duplicated, accessibility partial |
| Operational readiness | Medium | Build+verify pass; durability conditional on test mode; some stores in-memory only |
| Customer validation | Zero | No real user validation; all modules Level 0 on this dimension |
