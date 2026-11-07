# AIOSPARK — REAL VS MOCK DATA FORENSIC AUDIT

**Repository:** `/home/subham/AIOSpark/AR-automation-revenue`
**Baseline commit:** `6675c97`
**Constraint:** Read-only audit. No source modified. Do not remove mock data or modify source.

---

## Executive Finding

**No hardcoded financial KPI values, fake customers, fake invoices, or fake payment values were found in production source code.** All financial figures in production logic are computed from Universal Data Model (UDM) records using integer minor-unit (paise) arithmetic.

However, **mock/sandbox fallbacks exist in production source** and are gated behind `NODE_ENV === "production"` checks or credential checks (fail-closed in production, but present in the codebase). Additionally, **onboarding import data is siloed** (does not reach UDM), and **some production fields return placeholder/empty arrays**.

---

## Classification Definitions

| Class | Meaning |
|---|---|
| 1. Legitimate test fixtures | Data used only in test files (not production runtime) |
| 2. Development-only data | Dev experiments, scratch files, not imported by app |
| 3. Static demo content | Landing page marketing copy (no data claims) |
| 4. Production fallback values | Placeholders/sandbox modes gated behind env checks; fail-closed in production |
| 5. Actual financial records | Data computed from persisted UDM/source records |

---

## Real vs Mock Data Findings Table

| # | Component | Finding | Production Impact | Evidence | Classification |
|---|-----------|---------|-------------------|----------|----------------|
| 1 | `src/lib/communication/email-provider.ts` | `isSandboxMode = true` default; customer communications (dunning/reminders) may not actually send outside production with Resend key | Communications may not send in dev/staging | `:21` | Class 4 (production fallback, sandbox) |
| 2 | `src/lib/adapters/bank.ts` | `syncAccountAggregatorApi()` returns `{ status: 'mock_mode_active', syncedCount: 0 }` when `!config.credentialsEncrypted` | No real bank feed ingestion without credentials | `:151` | Class 4 (mock fallback) |
| 3 | `src/app/api/integrations/zoho/auth/route.ts` | `mock_zoho_client_id_123` fallback in non-production; production fails closed (503) if not configured | Zoho OAuth broken in dev without real credentials | `:11` | Class 4 (mock fallback) |
| 4 | `src/app/api/integrations/zoho/callback/route.ts` | Same `mock_zoho_client_id_123` fallback | Same as #3 | `:32` | Class 4 (mock fallback) |
| 5 | `src/lib/auth/supabase.ts` | `supabaseUrl`/`supabaseAnonKey` fall back to placeholder values; `isAuthProviderConfigured()` returns false if placeholder detected | Auth fails closed (correct) but fragile pattern | `:10-11` | Class 4 (placeholder) |
| 6 | `src/lib/auth/dev-mode.ts` | `DEVELOPMENT_SIGNING_SECRET = "local-development-session-secret"` hardcoded literal | Security debt; not reachable in production due to NODE_ENV check | `:1` | Class 4 (dev fallback) |
| 7 | `src/lib/receivables/engine.ts` | Comment: "Interim Risk Heuristic (Layer 12 placeholder)"; `exceptionStatus: '—'` hardcoded dash | Risk band is interim heuristic, not production credit model | `:73, :15, :193` | Class 4 (interim placeholder) |
| 8 | `src/lib/unblock-queue/engine.ts` | `recoveredCashMinorUnits: 0` hardcoded; uses gross `amount_minor_units` not outstanding balance | Cash-at-risk overstated; recovery figures fake | `:159, :217` | Class 4 (incorrect calc + hardcoded) |
| 9 | `src/app/api/customers/[id]/route.ts` | Returns empty placeholder arrays for `communications`, `promises`, `exceptions` ("Placeholder for Layer 19/20/15") | Customer 360 shows empty sections for those fields | `customers/[id]/route.ts` | Class 4 (placeholder data) |
| 10 | `src/app/api/cash-unblock/route.ts` | POST `ASSIGN_OWNER` returns `success: true` but "no owner-assignment store mechanism exists yet" — not persisted | Write operation acknowledged but not persisted | `:49` | Class 4 (mocked mutation) |
| 11 | `src/lib/onboarding/store.ts` | Onboarding import writes to `tenantStore.insertTenantRecord` — **never reaches `udmStore` customers/invoices/payments** | Uploaded invoices don't reach receivables unless re-imported | `:197-212` | Siloed data (architectural gap) |
| 12 | `src/lib/import/pilot-pipeline.ts` | Sets `import_batch_id`, `source_file_name`, `source_sheet_name`, `source_row_number` on UDM records (real lineage) | Traceable source→UDM | `:634-639, :707-710` | Class 5 (actual records) |
| 13 | `src/lib/receivables/engine.ts` | Outstanding = `inv.amount_minor_units − SUM(matches.matched_amount_minor_units)` from persisted UDM | Real financial computation | `:169-171` | Class 5 (actual records) |
| 14 | `src/lib/cfo/engine.ts` | All KPIs (totalReceivables, overdue, cashReceived, DSO) computed from `udmStore.getInvoices()`/`getPayments()` | Real financial intelligence | `:209-214` | Class 5 (actual records) |
| 15 | `src/lib/reconciliation/engine.ts` | Real deterministic + fuzzy matching; creates real UDM Payment/Match records on approval | Real reconciliation | `:54-404` | Class 5 (actual records) |
| 16 | Root-level `test-*.ts` files (14 files) | Unused dev experiments; not imported anywhere in `src/` | No production impact; technical debt | root `test-add1.ts`…`test-types-temp.ts` | Class 2 (dev-only) |
| | `test-fixtures/pilot/` (customers.csv, invoices.csv, payments.csv, exceptions.csv, pilot_master.xlsx) | Legitimate test fixtures; `pilot_master.xlsx` unused by any test | Used by import tests; `pilot_master.xlsx` unused | `test-fixtures/pilot/` | Class 1 (test fixtures) |
| | Landing page (`src/app/page.tsx`) | Static marketing copy ("recover trapped cash 18 days faster"); zero API calls | No data claims; marketing only | `app/page.tsx` | Class 3 (static demo content) |

---

## Financial Totals Determination

**All financial totals are derived deterministically from UDM source records, NOT hardcoded.**

| Metric | Computation | Evidence | Class |
|---|---|---|---|
| Outstanding balance per invoice | `Math.max(0, inv.amount_minor_units − SUM(matches.matched_amount_minor_units))` | `receivables/engine.ts:169-171`, `dashboard/engine.ts:20-29` | Class 5 |
| Total receivables | SUM of invoice outstanding across UDM | `cfo/engine.ts:209-214`, `dashboard/engine.ts` | Class 5 |
| Overdue receivables | Invoices with `dueDate < now` and outstanding > 0 | `receivables/engine.ts`, `cfo/engine.ts` | Class 5 |
| Cash received | SUM of `payments.amount_minor_units` from UDM | `cfo/engine.ts` | Class 5 |
| DSO | Computed from invoices + payments (avg payment time) | `cfo/engine.ts`, `customers/[id]/page.tsx` (`avgPaymentTimeDaysT12M`) | Class 5 |
| Cash-at-risk | Unblock-queue uses **gross** `amount_minor_units` (NOT outstanding) | `unblock-queue/engine.ts:159` | Class 4 (overstated) |
| Recovered cash | Hardcoded `0` | `unblock-queue/engine.ts:217` | Class 4 (hardcoded) |

**No hardcoded financial dollar/rupee amounts found in production source.** The only hardcoded numbers are business-rule thresholds (₹5L risk ceiling, ₹50k fee tolerance, 5% fee, 30/45-day aging buckets, 18% GST) — legitimate configuration, not mock data.

---

## Honest Anti-Patterns (Pages That Do NOT Fake Data)

| Page | Finding | Evidence |
|---|---|---|
| Cash Unblock | "Recovered Cash" metric labeled `statusText="NO DATA"` / `sublabel="No verified recoveries recorded"` — does not invent recovery numbers | `cash-unblock/page.tsx` |
| Invoice Detail | "Request Approval" code comments "No POST endpoint exists" and surfaces an honest notice instead of faking success | `invoices/[id]/page.tsx` |
| Settings | PATCH to `/api/tenant/organizations` returns 405; page shows "Changes were not persisted" — does not fake successful save | `settings/page.tsx` |
| Login SSO | Google/Microsoft SSO buttons show alerts that feature flags are required — does not pretend to work | `login/page.tsx` |
| Causal Graph | Distinguishes `VERIFIED` vs `AI_INFERRED` provenance on edges/nodes | `causal-graph/page.tsx`, `advanced-engine.ts` |

---

## Data Lineage Traceability

| Path | Lineage fields populated? | Evidence |
|---|---|---|
| pilot-pipeline commit (CSV/Excel) | Yes — `import_batch_id`, `source_file_name`, `source_sheet_name`, `source_row_number` on Customer/Invoice/Payment/Exception | `pilot-pipeline.ts:634-639, 707-710, 740-743, 773-776` |
| import/engine.ts | No — lineage fields not set despite UDM types having them | `engine.ts:198-207, 244-256` |
| sync-engine (adapters) | Partial — `source_system` + `source_id` set; no `source_file_name`/`source_row_number` | `sync-engine.ts:447, 453, 492, 528` |
| onboarding import | No — data siloed in tenantStore, no UDM lineage | `onboarding/store.ts:197-212` |
| UDM types | Lineage fields exist (optional) on all financial entities | `udm/types.ts:35-39, 72-76, 91-95` |

**Lineage is real only in the pilot-pipeline commit path.** The engine.ts import path and adapter/sync path lack complete lineage. Not universally traceable.

---

## In-Memory vs Persisted State

| Store | Persisted? | Mechanism | Test Mode |
|---|---|---|---|
| UDM (customers, invoices, payments, matches, etc.) | Yes (conditional) | `writeSnapshot('udm')` → `.data/aiospark.sqlite` WAL | `:memory:` |
| Approvals | Yes (conditional) | `writeSnapshot('approvals')` | `:memory:` |
| Audit | Yes (conditional) | `writeSnapshot('audit')`; append-only + immutability proxy | `:memory:` |
| Billing, Promises, Execution | Yes (conditional) | snapshot writes | `:memory:` |
| Reconciliation outcomes | No — in-memory Map only | `clearAll()` clears memory, no snapshot | In-memory only |
| Receivables savedFilterStore | No — in-memory Map only | No snapshot write | In-memory only |
| Import batch history (engine.ts, pilot-pipeline.ts) | No — in-memory only | No `persist()` call | Volatile |
| Onboarding import batches | Yes (conditional) | `writeSnapshot('onboarding')` | Conditional |

**Core financial state IS persisted across server restarts.** Some observability/quality/reconciliation-outcome state is in-memory only and would be lost on restart.

---

## Conclusion

AIOSpark is **not a mock/demo app** — financial numbers are computed from real UDM records, and there are no fake customers/invoices/payments in production source. However, mock/sandbox fallbacks exist (email sandbox mode, bank sync mock_mode, Zoho mock client ID, Supabase placeholders, dev signing secret) and are fail-closed in production. Two significant data-integrity gaps: onboarding import is siloed (not reaching UDM), and unblock-queue uses gross amounts with recovered cash hardcoded to 0. Data lineage is complete only in the pilot-pipeline path.
