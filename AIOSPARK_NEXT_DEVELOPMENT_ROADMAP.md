# AIOSPARK — NEXT DEVELOPMENT ROADMAP

**Repository:** `/home/subham/AIOSpark/AR-automation-revenue`
**Baseline commit:** `6675c97`
**Basis:** AIOSPARK Complete Product Progress Report, Module Maturity Report, O2C E2E Audit, Real-vs-Mock Data Audit, Security & Pilot Readiness Report, Frontend UX Report, Product Gap Register.
**Constraint:** No new unrelated features unless a validated customer need supports them. Read-only audit baseline.

---

## Roadmap Stages

### Stage 1 — Product Correctness
**Objective:** Make financial calculations, source data, payment matching, persistence, and reliability production-hard.

| Item | Deliverable | Dependencies | Acceptance Criteria | Priority | Effort |
|---|---|---|---|---|---|
| S1-1 | Wire CSRF middleware into Next.js | None | `src/middleware.ts` (or registered `proxy.ts`) applies CSRF to state-changing `/api/:path*`; auth routes protected | P0 | S |
| S1-2 | Activate/enforce PostgreSQL RLS at runtime | `db/client.ts` PGlite init | RLS policies executed on DB init; tenant-context queries return org-scoped rows only | P0 | M |
| S1-3 | Validate session org on tenant write path | `tenant/store.ts` | `insertTenantRecord()` rejects records whose `organization_id` doesn't match active session context | P0 | S |
| S1-4 | Remove hardcoded dev signing secret | `auth/dev-mode.ts` | `getAuthSigningSecret()` returns `null` in production unless `AIOSPARK_SESSION_SECRET` set; no literal secret in source | P0 | S |
| S1-5 | Add optimistic concurrency control to payment allocation | `execution/service.ts`, `reconciliation/engine.ts` | Concurrent allocations cannot over-allocate; second allocation rejected with conflict error | P1 | M |
| S1-6 | Persist reconciliation outcomes durably | `reconciliation/engine.ts`, `durable-repository.ts` | Match outcomes survive server restart; `readSnapshot` returns prior outcomes | P1 | S |
| S1-7 | Add execution module test suite | `execution/` | `__tests__/` directory covers allocation, idempotency, over-allocation prevention, durable verification | P1 | M |
| S1-8 | Write genuine end-to-end O2C transactional test | `execution/service.ts`, `reconciliation/engine.ts` | Single test exercises Upload→Understand→Prioritize→Review→Approve→Execute→Verify with real `executeApprovedAction` + `verifyExecution` | P2 | M |

**Stage 1 exit gate:** `npm run verify` + `npm run build` pass; E2E O2C test passes; no P0 gaps open.

---

### Stage 2 — Operational Completeness
**Objective:** Finish incomplete business workflows and connect disconnected modules.

| Item | Deliverable | Dependencies | Acceptance Criteria | Priority | Effort |
|---|---|---|---|---|---|
| S2-1 | Connect onboarding import to UDM | `onboarding/store.ts`, `udm/store.ts` | Uploaded customers/invoices/payments reach `udmStore` (not just tenantStore) | P1 | M |
| S2-2 | Persist import batch history | `import/engine.ts`, `pilot-pipeline.ts` | Import batches survive restart; `getImportHistory` returns persisted records | P1 | S |
| S2-3 | Fix unblock-queue calculation | `unblock-queue/engine.ts` | Uses `getInvoiceOutstandingBalance()` (not gross); `recoveredCashMinorUnits` tracked from matches, not hardcoded 0 | P1 | S |
| S2-4 | Wire cash-unblock execute to execution pipeline | `cash-unblock/route.ts`, `execution/service.ts` | Cash-unblock execute action routes through approval→execution; result persisted | P1 | M |
| S2-5 | Implement settings write API | `api/tenant/organizations` | `PATCH /api/tenant/organizations` persists organization settings; settings page save succeeds | P1 | S |
| S2-6 | Complete Customer 360 | `api/customers/[id]/route.ts` | `communications`, `promises`, `exceptions` return real UDM data (not empty arrays) | P2 | M |
| S2-7 | Persist `cash-unblock` ASSIGN_OWNER | `cash-unblock/route.ts` | Owner assignment stored and audited | P2 | S |

**Stage 2 exit gate:** All major workflows (import, settings, cash-unblock, customer 360) functional end-to-end.

---

### Stage 3 — Security and Pilot Safety
**Objective:** Authentication, tenant isolation, access controls, read-only restrictions, recovery.

| Item | Deliverable | Dependencies | Acceptance Criteria | Priority | Effort |
|---|---|---|---|---|---|
| S3-1 | Add RBAC to Zoho OAuth callback | `integrations/zoho/callback/route.ts` | `validatePermission()` (`edit` on `integrations`) enforced | P1 | S |
| S3-2 | Protect `/api/health` endpoint | `api/health/route.ts` | Health endpoint authenticated or returns no env details | P2 | S |
| S3-3 | Add refresh token rotation | `auth/session.ts` | Sessions rotate; stolen long-lived sessions limited | P3 | M |
| S3-4 | Distributed rate limiting (or document single-instance) | `auth/rate-limiter.ts` | Rate limits shared across instances OR documented single-instance deployment | P3 | M |
| S3-5 | Pilot-mode restart resilience | `auth/pilot.ts`, `auth/store.ts` | Pilot restrictions persist across server restart; ordinary users cannot disable | P1 | S |

**Stage 3 exit gate:** Security risk register P0/P1 items resolved; pilot restrictions survive restart.

---

### Stage 4 — Finance-User UX
**Objective:** Workflow clarity, operational controls, data explanation, accessibility.

| Item | Deliverable | Dependencies | Acceptance Criteria | Priority | Effort |
|---|---|---|---|---|---|
| S4-1 | Adopt shared `formatCurrency` | `lib/ui/formatters.ts` | All pages import from shared lib; duplicates removed | P2 | S |
| S4-2 | Adopt design tokens | `lib/ui/tokens.ts` | Components use tokens instead of inline Tailwind where applicable | P2 | M |
| S4-3 | Keyboard accessibility + reduced motion | `globals.css`, components | Clickable divs have keyboard handlers; `prefers-reduced-motion` respected | P2 | M |
| S4-4 | Dedicated audit UI for finance admins | `audit/store.ts`, `audit/service.ts` | Finance admin can view export/inspect audit trail for a financial record | P2 | M |

**Stage 4 exit gate:** Accessibility audit passes key WCAG checks; visual consistency improved.

---

### Stage 5 — Design-Partner Readiness
**Objective:** Onboarding, data imports, testing, documentation, support for first Indian B2B finance design partner (ACME Manufacturing / BridgeTech Solutions).

| Item | Deliverable | Dependencies | Acceptance Criteria | Priority | Effort |
|---|---|---|---|---|---|
| S5-1 | CSV/Excel onboarding validated with real partner data | `onboarding/store.ts`, `pilot-pipeline.ts` | Partner's CSV/Excel imports correctly; header mapping works with their column names | P1 | M |
| S5-2 | Test Zoho/Tally against real services (or document as mock) | `adapters/zoho.ts`, `adapters/tally.ts` | Live integration verified OR clearly documented as mock/not-yet-live | P2 | M |
| S5-3 | Read-only pilot runbook | `auth/pilot.ts` | Documented read-only pilot procedure; partner data isolated | P1 | S |
| S5-4 | Data confidentiality & retention | `durable-repository.ts`, `.data/aiospark.sqlite` | Documented DB path, backup/restore, data retention policy | P2 | M |
| S5-5 | CFO reporting for partner | `cfo/engine.ts`, `reports/` | Partner can generate/export receivables aging, DSO, cash-at-risk reports | P2 | S |

**Stage 5 exit gate:** Controlled read-only demonstration successful with partner data; runbook documented.

---

### Stage 6 — Paid Pilot
**Objective:** Measure real business outcomes, user adoption, willingness to pay.

| Item | Deliverable | Dependencies | Acceptance Criteria | Priority | Effort |
|---|---|---|---|---|---|
| S6-1 | Controlled read-only design-partner pilot | Stage 1–5 complete | Partner uses product read-only; no financial mutations; feedback collected | P1 | — |
| S6-2 | Measure business outcomes | Pilot runbook | Quantified: overdue identified, exceptions investigated, cash-at-risk prioritized | P1 | — |
| S6-3 | Assess willingness to pay | Pilot feedback | Partner indicates willingness to pay; pricing validated | P1 | — |

**Stage 6 exit gate:** Partner validates value; ready to commercialize.

---

## Acceptance Criteria Summary (Cross-Stage)

| Criterion | How Measured |
|---|---|
| Build stability | `npm run build` exit 0 |
| Verify pipeline | `npm run verify` exit 0 (typecheck, lint, scan, master 160/0, financial-stress) |
| Financial correctness | Over-allocation prevented; cross-module consistency (Dashboard==Receivables==CFO==Collections); minor-unit arithmetic |
| Security | CSRF wired; RLS active; tenant write-path validated; no hardcoded secrets |
| Pilot safety | Pilot restrictions survive restart; read-only enforcement server-side |
| E2E O2C | Single transactional test passes Upload→Verify |

---

## Estimated Engineering Effort (Summary)

| Stage | S | M | L | Total Estimate |
|---|---:|---:|---:|---|
| Stage 1 (Product Correctness) | 4 | 3 | 0 | ~7–9 weeks |
| Stage 2 (Operational Completeness) | 3 | 3 | 0 | ~6–8 weeks |
| Stage 3 (Security & Pilot Safety) | 3 | 1 | 0 | ~4–5 weeks |
| Stage 4 (Finance-User UX) | 1 | 3 | 0 | ~5–7 weeks |
| Stage 5 (Design-Partner Readiness) | 1 | 3 | 0 | ~5–7 weeks |
| Stage 6 (Paid Pilot) | — | — | — | Partner-dependent |

**Shortest responsible path to first paid pilot:** Complete Stage 1 (P0 items) + Stage 3 (P1 security) + Stage 5 (onboarding validation), then run a controlled read-only design-partner pilot (Stage 6-1). Full paid pilot readiness requires Stage 2 completion and demonstrated business outcomes.

**Do not** build new unrelated features (e.g., additional AI agents, new integrations, marketing pages) until the above gaps are resolved and a validated customer need supports them.
