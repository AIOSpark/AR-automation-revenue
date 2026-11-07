# AIOSPARK — SECURITY AND PILOT READINESS REPORT

**Repository:** `/home/subham/AIOSpark/AR-automation-revenue`
**Baseline commit:** `6675c97`
**Constraint:** Read-only audit. No real financial transactions or external customer communications performed.

---

## Executive Security Posture

AIOSpark has a **genuine security foundation** (Supabase auth or dev-mode with fail-closed gating, HMAC-signed sessions with revocation, a real RBAC matrix enforced at API route level, security headers applied via Next.js, an append-only immutable audit trail, and SSRF protection). However, **critical pilot-blocking gaps exist**: CSRF middleware is not wired into Next.js (state-changing endpoints unprotected), PostgreSQL RLS is defined in SQL but never executed against a live database, the tenant write path lacks org validation, a hardcoded dev signing secret sits in source, and reconciliation outcomes are volatile.

**Pilot readiness: NOT READY for a paid pilot; READY for controlled demonstration only** (read-only, partner data not loaded, security gaps remediated first).

---

## Risk Register (Classified Critical / High / Medium / Low)

| ID | Risk | Severity | Module | Evidence (file:line) | Pilot Impact |
|---|------|----------|--------|----------------------|--------------|
| SEC-01 | CSRF middleware not wired into Next.js | **RESOLVED** | Auth / Middleware | `src/proxy.ts:7-14` implements CSRF; auto-discovered by Next.js 16.3.4 as middleware; build reports `ƒ Proxy (Middleware)` active | CSRF enforced on state-changing `/api/:path*` routes; Razorpay webhook exempt |
| SEC-02 | PostgreSQL RLS defined but never active at runtime | **Critical** | Tenant / Database | `src/lib/db/security-migrations.ts`, `src/lib/tenant/schema-rls.sql` define RLS policies; no code executes them; runtime uses in-memory Maps + JSON snapshots (`tenant/store.ts:36-38`) | No database-level tenant isolation; isolation is application-layer only |
| SEC-03 | Tenant write path lacks org validation | **RESOLVED** | Tenant | `src/lib/tenant/store.ts` — `assertWriteTenant()` added to `insertTenantRecord()` | `insertTenantRecord()` rejects writes whose `organization_id` doesn't match active session context |
| SEC-04 | Hardcoded dev signing secret in source | **High** | Auth | `src/lib/auth/dev-mode.ts:1` `DEVELOPMENT_SIGNING_SECRET = "local-development-session-secret"` | Security hygiene violation; not reachable in production (blocked by `NODE_ENV === "production"` check at `:8`) but literal is committed |
| SEC-05 | Reconciliation outcomes not durable | **High** | Financial | `src/lib/reconciliation/engine.ts:41, 497-499` `this.outcomes` Map in-memory only; `clearAll()` clears memory with no snapshot | Match-outcome audit history lost on server restart |
| SEC-06 | Execution module has no tests | **High** | Financial | Execution module has only `service.ts`, `types.ts`, `store.ts`, `durable-verifier.ts` — no `__tests__` directory | Financial execution engine unverified by automated tests |
| SEC-07 | No optimistic concurrency control on allocation | **High** | Financial | `execution/service.ts:251-257` reads outstanding balance then writes match with no transaction wrapping both | Race window on concurrent payment allocation (over-allocation risk) |
| SEC-08 | Email provider defaults to sandbox mode | **Medium** | Communication | `src/lib/communication/email-provider.ts:21` `isSandboxMode = true` | Customer communications (dunning/reminders) may not actually send outside production |
| SEC-09 | Supabase placeholder credential fallbacks | **Medium** | Auth | `src/lib/auth/supabase.ts:10-11` placeholder URL/key; `isAuthProviderConfigured()` gates usage | Fragile pattern; auth fails closed (correct) but placeholder values in code |
| SEC-10 | Session IDs use `Math.random()` (not crypto) | **Medium** | Auth | `src/lib/auth/store.ts:68` `usr_${Math.random()...}` | Predictable user IDs (mitigated by signed session tokens) |
| SEC-11 | Rate limiter is in-memory per-process | **Medium** | Auth | `src/lib/auth/rate-limiter.ts:14-45` `Map`-based sliding window | Rate limits not shared across server instances in distributed deployment |
| SEC-12 | No refresh token rotation | **Medium** | Auth | `src/lib/auth/session.ts:5` 7-day TTL, no rotation | Long-lived stolen sessions remain valid |
| SEC-13 | Zoho OAuth callback missing RBAC | **Medium** | Integrations | `src/app/api/integrations/zoho/callback/route.ts` calls `resolveTenantContext()` but never `validatePermission()` | Any authenticated user can complete Zoho OAuth and persist integration credentials |
| SEC-14 | `customers/[id]/route.ts` placeholder arrays | **Medium** | Data | Returns empty arrays for `communications`, `promises`, `exceptions` | Not a security risk; data-integrity gap |
| SEC-15 | `cash-unblock/route.ts` ASSIGN_OWNER not persisted | **Medium** | Financial | Route returns success but "no owner-assignment store mechanism exists yet" | Mocked mutation; security-relevant action not audited |
| SEC-16 | Health endpoint unprotected | **Low** | API | `src/app/api/health/route.ts` — no auth, no tenant, no RBAC; returns env config details | Minor information disclosure if exposed publicly |
| SEC-17 | 14 root-level `test-*.ts` dev experiments unused | **Low** | Code hygiene | Root `test-add1.ts`…`test-types-temp.ts` not imported anywhere | No production impact; attack surface / technical debt |

---

## Verification of Specific Pilot Requirements

| Requirement | Verified? | Evidence | Notes |
|---|---|---|---|
| Partner organization can be configured for pilot mode | Yes (server-side) | `src/lib/auth/pilot.ts:33-36` `isPilotOrganization()`; `validatePilotReadOnly()` returns 403 for prohibited actions | Enforced at API route level, not UI-only |
| Pilot restrictions survive application restart | Partially | Pilot mode read from `authStore` (SQLite snapshot) — survives restart if snapshot written; but `sessionRevocationStore` and rate-limiter counters are in-memory Maps loaded from snapshot | Core pilot config durable; ephemeral state lost on crash |
| Ordinary users cannot disable pilot restrictions | Yes | `validatePilotReadOnly()` server-side; `canGrantRole()` prevents privilege escalation (`permissions.ts:97-101`); auto-approve disabled by default | Server-side enforcement, not UI-only |
| Financial mutation endpoints reject unauthorized operations | Yes | `validatePermission()` returns 403 for denied role/action/resource; unknown role/resource/action denied by default | 45 of 49 routes enforce; 5 partial |
| Customer communications cannot execute without authorization | Partially | Email provider defaults to sandbox mode (`isSandboxMode = true`); communications engine gated by policy engine mandatory approval floor for `SEND_CUSTOMER_COMMUNICATION` | Sandbox mode means emails may not actually send; approval required for high-risk actions |
| Data remains isolated across organizations | Partially | Read path enforced (returns [] when no context, org-filtered); **write path lacks tenant validation** (SEC-03); no database-level RLS active | Reads isolated; writes have a cross-tenant gap |

---

## Authentication Detail

| Check | Status | Evidence |
|---|---|---|
| Signup/login real (Supabase) or dev-mode | Real Supabase OR dev-mode, fail-closed | `supabase.ts:39-43`, `dev-mode.ts:12-21` |
| Fails closed without provider | Yes | Returns `"Authentication provider is not configured"` |
| Session signing fail-closed | Yes | `createSessionToken` returns `null` without secret; `verifySessionToken` returns `null` on any failure |
| Session revocation | Yes | `sessionRevocationStore.isRevoked()` checked on every verification |
| Cookie security | httpOnly/secure/sameSite | `login/route.ts:55-63` |
| Rate limiting on auth | Yes (IP + account, 5/min) | `login/route.ts:14-15`, `signup/route.ts:37-41` |
| CSRF on auth routes | Yes | `proxy.ts` auto-discovered by Next.js 16.3.4 as middleware; `isCsrfRequestSafe()` enforced on `/api/:path*`; Razorpay webhook exempt | `src/proxy.ts`, `npm run build` |
| Email verification | Dev-mode only endpoint; production via Supabase | `verify-email/route.ts:19` (410 unless dev auth) |

---

## Tenant Isolation Detail

| Check | Status | Evidence |
|---|---|---|
| Read path org-enforced | Yes | `queryTenantTable`/`getTenantRecordById` return []/null when no session context or org mismatch |
| Write path org-validated | Yes (when session context active) | `insertTenantRecord()` calls `assertWriteTenant()`; rejects writes whose org doesn't match session context | `src/lib/tenant/store.ts`, cross-tenant pen test passes |
| Database-level RLS active | **No** | RLS SQL defined but never executed against live DB |
| Cross-tenant read leakage | No (in-memory) | `cross-tenant-pen.test.ts` passes for reads |
| Cross-tenant write leakage | **Blocked** | `assertWriteTenant()` prevents cross-tenant writes when session context is active | SEC-03 resolved |
| Tenant context mechanism | AsyncLocalStorage (app memory) | `request-context.ts`, `tenant/middleware.ts:68` |

---

## Pilot-Mode Readiness Decision

| Readiness Level | Decision | Evidence Required to Reach Next Level |
|---|---|---|
| Ready for discovery | ✅ Yes | Genuine data-driven foundation; real auth/RBAC; real financial arithmetic |
| Ready for controlled demonstration | ✅ Yes | Build + verify pass; real dashboard/CFO/receivables; honest about missing data (no faked KPIs) |
| Ready for read-only design-partner pilot | ⚠️ Conditional | Must remediate SEC-01 (CSRF), SEC-02 (RLS inactive), SEC-03 (tenant write path), SEC-04 (dev secret) before loading partner data |
| Ready for paid pilot | ❌ No | Requires SEC-01 through SEC-07 remediation + genuine E2E O2C test + execution module tests |

**Recommended pilot path:** Controlled read-only demonstration with the partner's own CSV/Excel data (imported via the real import pipeline), **after** remediating SEC-01 to SEC-04. Do not proceed to a read-only design-partner pilot with live partner data until CSRF, RLS, tenant write-path, and dev-secret gaps are closed.

---

## What Must Be Completed Before First Paid Pilot (Security/Pilot Focus)

| Priority | Item | Evidence |
|---|---|---|
| P0 | Wire CSRF middleware into Next.js (`src/middleware.ts` or register `proxy.ts`) | SEC-01 |
| P0 | Activate/enforce PostgreSQL RLS at runtime OR confirm application-layer enforcement is sufficient | SEC-02 |
| P0 | Validate session org matches record org on `insertTenantRecord()` write path | SEC-03 |
| P0 | Remove hardcoded dev signing secret from source or gate to fail in production | SEC-04 |
| P1 | Persist reconciliation outcomes (durable snapshot) | SEC-05 |
| P1 | Add test directory for execution module | SEC-06 |
| P1 | Add optimistic concurrency control to payment allocation | SEC-07 |
| P2 | Add RBAC to Zoho OAuth callback | SEC-13 |
| P2 | Persist `cash-unblock` ASSIGN_OWNER | SEC-15 |
| P3 | Protect `/api/health` endpoint | SEC-16 |
| P3 | Remove 14 root-level `test-*.ts` dev experiments | SEC-17 |
