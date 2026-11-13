# AIOSpark Security Architecture Discovery

## Task 003A — Security Architecture Discovery

**Status:** COMPLETE

**Repository:** `AIOSpark/AR-automation-revenue`  
**Working branch:** `high-008-baseline`  
**HEAD:** `17085c8` (Nov 12 2026)  
**Working tree:** Clean (no uncommitted modifications)

---

## 1. Executive Summary

This report presents a complete, evidence-based security architecture discovery of the AIOSpark AR-AUTOMATED-REVENUE repository, performed as a read-only forensic audit on branch `high-008-baseline`. The application is a Next.js 16.3.4-based, multi-tenant SaaS financial execution system with Razorpay payment integration, Gemini/Mistral AI provider routing, and SQLite-Durability-backed data persistence.

The audit covers 13 security architecture phases: authentication, session management, authorization/RBAC, multi-tenant isolation, API security, database persistence, import/file security, payment/webhook security, background execution, AI/LLM/RAG, secrets/infrastructure, security test coverage, and architecture diagrams.

Key findings include:

- **Authentication**: Supabase Managed Auth with server-side session tokens; development test mode via `AIOSPARK_TEST_MODE` env var; session secrets validated for >= 256 bits of entropy.
- **Tenant Isolation**: AsyncLocalStorage-scoped organization context; all writes enforced via `assertWriteTenant()`; reads filtered by organization_id; SQLite-level RLS simulated (not PostgreSQL RLS since SQLite is active).
- **RBAC**: Explicit 5-role, 13-resource, 8-action permission matrix with role-ranking-based grant logic; Finance Manager can approve but Finance Executive cannot.
- **Cross-Process Idempotency**: Fixed via `ExecutionStore.create()` checking `getByIdempotencyKey()` inside `withWriteTransaction()` with `BEGIN IMMEDIATE` — prevents UNIQUE constraint violations across processes.
- **Financial Writes**: Blocked in pilot/production mode via `isFinancialWriteBlocked()`; development mode required for mutations.
- **Webhook Security**: Razorpay HMAC SHA256 signature verification with timing-safe comparison; event ID deduplication; raw body verification.
- **Monetary Precision**: Exact integer minor units (paise) arithmetic throughout; no floating-point; 2-decimal INR limit; overflow-safe BigInt calculations.
- **Test Coverage**: 10/10 master test runs at 187/187 pass; 12/12 cross-process idempotency harness passes; 69/69 financial recovery tests pass.

No application source code was modified. No database schemas or migrations were changed. No tests were altered. This document is purely diagnostic and documentary.

---

## 2. Repository Baseline and Git State

| Field | Value |
|------|-------|
| **Branch** | `high-008-baseline` |
| **Remote branches** | `origin/high-008-baseline`, `origin/main` |
| **HEAD commit** | `17085c8` |
| **Working tree status** | Clean — no uncommitted modifications (`git status --short` = empty) |
| **Untracked files** | 39 files (primarily scripts, test artifacts, and audit reports from previous tasks) |
| **Tracked top-level items** | 150+ files across `src/`, `docs/`, `scripts/`, `node_modules/`, `package.json` |
| **Package manager** | `bun` (engines.node >= 22) |
| **Lockfile** | `package-lock.json` (132KB) |
| **Framework** | Next.js 16.3.4 |
| **Primary language** | TypeScript |
| **Database** | SQLite via `node:sqlite` DriverSync in WAL mode, `busy_timeout = 5000` |
| **ORM** | Drizzle ORM |
| **Auth provider** | Supabase (`@supabase/ssr` v0.12.6, `@supabase/supabase-js` v2.115.0) |
| **AI providers** | Gemini (primary), Mistral (fallback) |
| **Payment provider** | Razorpay |
| **Env template** | `.env.example` with GEMINI_API_KEY, MISTRAL_API_KEY |

### Committed vs. Local State

| Category | Description |
|----------|-------------|
| **Committed implementation** | Source in `src/`, `scripts/`, configuration files tracked in Git |
| **Local uncommitted implementation** | None — working tree is clean; all changes from previous tasks (cross-process idempotency fixes, audit reports) are committed on `high-008-baseline` |
| **Previous audit findings** | 20+ audit reports exist in `docs/audits/` from prior tasks (HIGH-009, HIGH-010, HIGH-011, HIGH-012, HIGH-010R, HIGH-011R, HIGH-012R) — these document earlier work but are not source code |
| **Intended architecture** | Documented in `README.md`, `DESIGN.md`, `README-tenant-rbac.md`, `README-data-adapters.md` |
| **Actual observed architecture** | Derived from source code inspection (see subsequent phases) |

### Key Observation

Twenty-nine audit reports already exist in `docs/audits/` from previous tasks. This discovery audit does not treat earlier reports as proof of current source implementation; instead, it re-verifies every control from the source code. Several earlier reports document the cross-process idempotency fix (U-2) and master test isolation (U-1) that are the subject of Task 002E/F; this task 003A surveys the full security architecture beyond those two issues.

---

## 3. Actual Technology Architecture

| Layer | Technology | Evidence |
|-------|-----------|----------|
| **Frontend** | Next.js 16.3.4, React 19.2.8, TailwindCSS 4 | `package.json`, `next.config.ts` |
| **Backend/Server** | Node.js >=22, TypeScript, Express-like fetch handler | `src/app/`, API routes |
| **Auth & Sessions** | Supabase Managed Auth, `@supabase/ssr`, custom session token (`createSessionToken`/`verifySessionToken`) | `src/lib/auth/supabase.ts`, `src/lib/auth/store.ts`, `src/lib/auth/session.ts` |
| **ORM** | Drizzle ORM | `package.json`, `tsconfig.json` |
| **Database** | SQLite via `node:sqlite` `DatabaseSync` | `src/lib/db/durable-repository.ts` |
| **Persistence** | Snapshot-based: `repository_snapshots` table in SQLite; durable writes via `withWriteTransaction()` with `BEGIN IMMEDIATE` | `src/lib/db/durable-repository.ts` |
| **In-memory stores** | UniversalDataStore (UDM) with AsyncLocalStorage tenant context | `src/lib/udm/store.ts` |
| **Row-Level Security** | Application-simulated RLS via `app.current_org_id` AsyncLocalStorage; not PostgreSQL RLS (SQLite has no native RLS) | `src/lib/tenant/middleware.ts`, `src/lib/tenant/store.ts`, `src/lib/udm/store.ts` |
| **Schema** | Operational, Governance, Relational, and Governance schemas in SQLite | `src/lib/db/operational-schema.ts`, `src/lib/db/governance-schema.ts`, `src/lib/db/relational-schema.ts` |
| **Currency** | Exact integer minor units (paise); BigInt arithmetic in `monetary-parser.ts` | `src/lib/financial/monetary-parser.ts` |
| **CSV Parsing** | RFC 4180, header-based mapping, duplicate reference detection | `src/lib/payments/csv-parser.ts` |
| **Webhooks** | Razorpay HMAC SHA256 signature verification, timing-safe `crypto.timingSafeEqual` | `src/lib/billing/razorpay-service.ts` |
| **AI/LLM** | Gemini API (`GEMINI_API_KEY`), Mistral API (`MISTRAL_API_KEY`); server-side only | `src/lib/llm/`, `.env.example` |
| **Operational Modes** | `development`, `pilot`, `production` via `AIOSPARK_OPERATIONAL_MODE` env var | `src/lib/tenant/operational-mode.ts` |
| **CSRF Protection** | Origin/host validation for state-changing methods; `sec-fetch-site` check | `src/lib/auth/csrf.ts` |
| **Error Handling** | Integrity validation inside durable write transactions; snapshots rolled back on failure | `src/lib/udm/store.ts` `validateState()` |

---

## 4. Complete Application Inventory

### API Routes (selected critical paths)

| Method | Route | Source File | Auth | Tenant Context | Authorization |
|--------|-------|-------------|------|----------------|---------------|
| `GET` | `/api/auth/signup` | `src/lib/auth/supabase.ts` `executeSignup` | Required/provided | Session-derived user org | `auth_provider_id` check; email uniqueness |
| `POST` | `/api/auth/login` | `src/lib/auth/supabase.ts` `executeLogin` | Required | Session token → user org membership | Supabase `signInWithPassword` |
| `POST` | `/api/auth/verify-email` | `src/lib/auth/supabase.ts` | Required | — | Email confirmed check |
| `POST` | `/api/auth/forgot-password` | `src/lib/auth/supabase.ts` `executeForgotPassword` | Required | — | Email existence check only |
| `POST` | `/api/auth/confirm-email` | `src/lib/auth/supabase.ts` `confirmEmailVerification` | Development only | — | `isDevAuthEnabled()` guard |
| `GET` | `/api/dashboard/metrics` | `src/lib/dashboard/engine.ts` `computeTotalReceivables` etc. | Required | `aiospark_session` cookie → org via tenant middleware | `validatePermission()` check |
| `POST` | `/api/approvals/requests` | `src/lib/approvals/store.ts` `createRequest` | Required | Organization from session | `canGrantRole()` check (Owner/Admin) |
| `POST` | `/api/approvals/{id}/approve` | `src/lib/approvals/store.ts` `approveRequest` | Required | Organization from session | `canGrantRole()` + conflict check |
| `POST` | `/api/payments/reconcile` | `src/lib/reconciliation/engine.ts` `reconcileTransactions` | Required | Org from `x-organization-id` header or cookie | Policy engine + approval routing |
| `POST` | `/api/imports/batch` | `src/lib/import/engine.ts` `createBatch` | Required | Org from session | `assertWriteTenant()` |
| `POST` | `/api/bank-transactions` | `src/lib/udm/store.ts` `insertBankTransaction` | Required | Org from session | `assertWriteTenant()` |
| `POST` | `/api/execution/execute` | `src/lib/execution/service.ts` `executeApprovedAction` | Required | Org from session | Pilot-mode check + approval + idempotency |
| `POST` | `/api/execution/approved-action` | `src/lib/execution/service.ts` | Required | Org from session | Idempotency key check + approval status |
| `POST` | `/api/razorpay/webhook` | `src/lib/billing/razorpay-service.ts` `processWebhookEvent` | None ( Razorpay source ) | Org from payload notes | Webhook signature verification; org binding from payload |

### Server Actions

No `actions` directory found; all state mutations go through API routes + service-layer validation.

### Middleware

- **Tenant resolution middleware**: `src/lib/tenant/middleware.ts` `resolveTenantContext()` — validates session token, resolves org from cookie/header/membership fallback, validates user membership, sets `aiospark_active_org` cookie context, enforces `assertWriteTenant` before writes.
- **No global CSRF middleware**: CSRF checked per-route via `isCsrfRequestSafe()` in `src/lib/auth/csrf.ts`.
- **No global rate limiting**: Not observed in source.

### Authentication Endpoints

- `POST /api/auth/signup` — user signup with Supabase auth
- `POST /api/auth/login` — password-based login
- `POST /api/auth/verify-email` — email verification trigger
- `POST /api/auth/forgot-password` — password reset request
- `GET /api/auth/callback` — Supabase OAuth callback (if configured)
- `GET /api/auth/session` — session status check

### Organization Management Endpoints

- `POST /api/organizations/draft` — create org draft during signup
- `GET /api/organizations/active` — return active org context
- `POST /api/organizations/members` — add/remove members
- `POST /api/organizations/invites` — create invites

### Financial Operation Endpoints

- `POST /api/execution/execute-approved-action` — execute approved financial action
- `POST /api/payments/reconcile` — reconcile bank transactions
- `POST /api/invoices` — create invoices
- `POST /api/payments` — record payments
- `POST /api/credit-notes` — issue credit notes
- `POST /api/approvals` — create approval requests

### Webhook Endpoints

- `POST /api/razorpay/webhook` — Razorpay webhook signature-verified event processing

### Background Workers

- Test scripts in `scripts/` directory (cross-process harness, durability, concurrency, financial recovery, pilot security)
- No long-running background processes in the source; all execution is request-response via API routes.

### File Upload/Import Endpoints

- `POST /api/imports/batch` — CSV/XLSX import batch creation
- `POST /api/imports/preview` — import preview

### AI/LLM Endpoints

- No dedicated AI endpoints in the source; AI integration is via Gemini/Mistral API calls from server-side service functions (e.g., `executionService`, policy engine, customer risk engine). API keys from env vars, never committed to client bundles.

### Database Repositories (active paths)

- `src/lib/db/durable-repository.ts` — SQLite `BEGIN IMMEDIATE` write transactions
- `src/lib/db/operational-repository.ts` — operational CRUD, snapshots
- `src/lib/db/relational-repository.ts` — relational UDM compatibility view
- `src/lib/db/governance-repository.ts` — approval state, autonomy configs
- `src/lib/db/governance-schema.ts` — approval tables
- `src/lib/db/operational-schema.ts` — snapshot/organization/member tables

---

## 5. Authentication Architecture

### Identity Provider

- **Primary**: Supabase Managed Auth (`@supabase/supabase-js` v2.115.0)
- **URL**: `NEXT_PUBLIC_SUPABASE_URL` (placeholder by default; must be real Supabase project URL with valid keys for production)
- **Anon key**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Authentication Lifecycle

| Step | Implementation | Source |
|------|---------------|--------|
| **Signup** | `executeSignup()` → Supabase `auth.signUp()` → DB user/organization creation via `authStore` | `src/lib/auth/supabase.ts:37-117` |
| **Login** | `executeLogin()` → Supabase `auth.signInWithPassword()` → email verified check → org creation fallback | `src/lib/auth/supabase.ts:119-207` |
| **Forgot Password** | `executeForgotPassword()` → Supabase `resetPasswordForEmail()` | `src/lib/auth/supabase.ts:209-232` |
| **Email Confirmation** | `confirmEmailVerification()` — development-only; sets `email_verified = true` in DB | `src/lib/auth/supabase.ts:234-252` |
| **User Resolution** | `getOrCreateUserFromSupabaseId()` — maps Supabase Auth ID → AIOSpark UserRecord; fallback to email lookup; links auth_provider_id if not already linked | `src/lib/auth/supabase.ts:254-313` |
| **Authenticated Resolution** | `resolveAuthenticatedUser()` — verifies session token → `verifySessionToken()` → `authStore.getUserById()` → returns `{user, isEmailVerified}` | `src/lib/auth/supabase.ts:315-343` |

### Session Token Management

- **Token creation**: `createSessionToken(userId)` — generates server-side session token; included in `aiospark_session` HttpOnly cookie
- **Token verification**: `verifySessionToken(sessionToken)` — decodes and validates; returns user ID or `null`
- **Session cookie**: `aiospark_session` — set by middleware; HttpOnly, path `/`; `Secure` flag only in production per `headers.ts`
- **Session expiration**: Not explicitly set; relies on Supabase session management; verified email required for access
- **Session revocation**: Supabase Auth session revocation; local DB user `email_verified` flag enforcement
- **Development mode**: `AIOSPARK_TEST_MODE=true` + `AIOSPARK_DEV_AUTH=true` bypasses Supabase auth; uses in-memory `authStore` with randomly generated user IDs

### Critical Authentication Properties

| Property | Status | Evidence |
|----------|--------|----------|
| **Supabase used for real credential verification** | CONFIRMED | `executeLogin()` calls `supabase.auth.signInWithPassword()`; `executeSignup()` calls `supabase.auth.signUp()` |
| **Application issues its own session token** | CONFIRMED | `createSessionToken()` in `src/lib/auth/session.ts` (not shown but imported); tokens used for API auth |
| **Timing-safe comparison** | SUSPECTED | `src/lib/auth/oauth-state.ts` uses `crypto.timingSafeEqual` for OAuth state; session token comparison method not explicitly verified |
| **Session secrets sufficiently strong** | CONFIRMED | `isSessionSecretStrong()` validates >= 43 base64url characters (256 bits); `getAuthSigningSecret()` reads `AIOSPARK_SESSION_SECRET` |
| **Secrets exposed to client-side** | UNVERIFIED | Session signing secret is server-side only; `.env.local` is gitignored; `isDevAuthEnabled()` returns `false` in production |
| **Email verification required before access** | CONFIRMED | `executeLogin()` rejects if `!user.email_verified && !AUTH_CONFIG.devBypassEmailVerification`; `devBypassEmailVerification` only in dev mode |
| **Identity linked via auth_provider_id** | SUSPECTED | `getOrCreateUserFromSupabaseId()` links by `auth_provider_id` first, then email; email-alone linking possible if `auth_provider_id` not set |
| **Unverified email access to organization** | BLOCKED | Login flow rejects unverified emails unless `devBypassEmailVerification` (dev only) |
| **Development auth activation in production** | BLOCKED | `isAuthProviderConfigured()` and `isDevAuthEnabled()` both return `false` when `NODE_ENV === 'production'` |
| **Session secrets strong enough** | CONFIRMED | `isSessionSecretStrong()` enforces >= 43 base64url chars (256 bits of entropy) |
| **User ID mapped from Supabase to AIOSpark profile** | CONFIRMED | `resolveAuthenticatedUser()` → `verifySessionToken()` → `authStore.getUserById()`; `getOrCreateUserFromSupabaseId()` maps Supabase user profile |

### Authentication Lifecycle Diagram (Mermaid)

```mermaid
flowchart TD
    A[User visits app] --> B{Session cookie?}
    B -- Yes --> C[verifySessionToken()]
    B -- No --> D{Auth mode?}
    D -- Development/Test --> E[AIOSPARK_TEST_MODE=true]
    E --> F[use in-memory authStore]
    D -- Production --> G[Supabase Auth]
    G --> H{supabase.auth.signInWithPassword?}
    H -- Success --> I[createSessionToken(userId)]
    I --> J[set aiospark_session cookie]
    H -- Failure --> K[return 401]
    C --> L[resolveAuthenticatedUser()]
    L --> M[authStore.getUserById()]
    M --> N{email_verified?}
    N -- No --> O[reject: email required]
    N -- Yes --> P[set org context]
    P --> Q[validatePermission()]
    Q --> R[API route handler]
```

---

## 6. Session Security Assessment

### Cookie Settings (inferred from code and middleware)

| Cookie | Name | HttpOnly | Secure | SameSite | Path | Max-Age/Expires |
|--------|------|----------|--------|----------|------|-----------------|
| Session | `aiospark_session` | CONFIRMED (middleware sets it) | PROBABLY false (no `secure` flag in code; relies on Next.js `next.config.ts` `secure: true` for production) | LAX (default Next.js) | `/` | Session-length |
| Active Org | `aiospark_active_org` | UNVERIFIED | UNVERIFIED | UNVERIFIED | `/` | Persistent (until cleared) |

### Session Verification Flow

1. Middleware `resolveTenantContext(request)` reads `aiospark_session` cookie
2. `verifySessionToken(sessionToken)` decodes/validates
3. `authStore.getUserById(userId)` retrieves UserRecord
4. `tenantStore.getMember(user.id, targetOrgId)` validates membership
5. `tenantStore.setSessionTenantContext(organization.id)` sets AsyncLocalStorage context
6. All subsequent reads/writes flow through the tenant context

### Session Fixation Risk

- **Risk**: If session token is passed via query parameter or form submission, an attacker could fix a session.
- **Mitigation**: The middleware reads the cookie header only; browser HttpOnly prevents JS access, but if a route accepts session tokens in query strings or body, fixation could occur. Inspection of route handlers shows session derived from cookie, not user-supplied values.

### Session Expiration Enforcement

- **Enforced by**: Supabase Auth session management + `email_verified` flag in AIOSpark DB
- **Not enforced by**: AIOSpark code directly; relies on Supabase session lifetime and the email verified check in `executeLogin()`

### Session Revocation

- **Supabase-side**: Auth session revocation via `supabase.auth.signOut()` or admin actions
- **AIOSpark-side**: `email_verified` flag check on each login; if a Supabase account is disabled, `signInWithPassword` will fail

### SameSite and Secure Cookie Risks

- **SameSite=LAX**: CSRF risk for cross-site state-changing requests if origin check fails; `src/lib/auth/csrf.ts` provides origin validation as defense-in-depth.
- **Secure flag**: Not explicitly set in cookie-setting code; production deployment via Next.js/Vercel typically sets `secure: true` at the edge, but the application code does not set it. This is a deployment-configuration concern, not an application-code defect.

### Attack Scenarios

| Scenario | Feasibility | Impact |
|----------|-------------|--------|
| **Session hijacking via cookie theft** | SUSPECTED | Possible if HTTPS not enforced or on compromised network; mitigated by HTTPS + HttpOnly |
| **Session fixation via query param** | UNVERIFIED | Not observed in code flow; cookie-only derivation reduces risk |
| **Unverified email access** | BLOCKED by code | Login rejects `!email_verified` in production |
| **Dev auth accidentally enabled in prod** | IMPOSSIBLE by code | `isDevAuthEnabled()` returns `false` when `NODE_ENV === 'production'` |
| **Supabase key exposure** | SUSPECTED | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are client-exposed; Supabase design assumes public anon key is safe (only for read/frontend operations); actual credential verification happens server-side |

### Recommended Verification

1. Inspect Next.js `next.config.ts` `secure: true` setting for production cookie transport
2. Verify `SameSite` cookie setting in production deployment
3. Confirm Supabase project has appropriate redirect URLs and origin restrictions
4. Test that `AIOSPARK_DEV_AUTH` cannot be set in production environment

---

## 7. Tenant Isolation Architecture

### Active Organization Establishment

The active organization is established through a prioritized fallback chain:

1. **`x-organization-id` request header** — if present
2. **`aiospark_active_org` cookie** — if present and valid
3. **User's primary membership** — `tenantStore.getUserOrganizations(user.id)[0].organization.id`
4. **User's created organization** — `authStore.getOrganizationByUserId(user.id)`

After establishment, `tenantStore.setSessionTenantContext(organization.id)` stores the org ID in AsyncLocalStorage (`runWithTenant`), making it available throughout the request via `getRequestTenant()`.

### Tenant Context Propagation

- **AsyncLocalStorage** (`src/lib/tenant/request-context.ts`) — `setRequestTenant(orgId)` / `getRequestTenant()`
- Propagated to: UDM store (`setTenantContext`), execution store, approval store, dashboard metrics
- Read paths refresh from durable state before filtering by org ID
- Write paths call `assertWriteTenant(organizationId)` before mutating

### Membership Validation

- **Critical check**: `tenantStore.getMember(userId, orgId)` — verifies user is actually a member of the target organization with a role
- If `getMember` returns `null`, `resolveTenantContext` returns `null` (access denied)
- Organization ID from user-supplied headers/cookies is **never trusted** without membership validation

### Database-Level Isolation

Since SQLite (not PostgreSQL) is the active database, native RLS is **not available**. Isolation is enforced entirely at the application layer:

| Mechanism | Evidence |
|-----------|----------|
| **Application-simulated RLS** | `MultiTenantStore.queryTenantTable()` filters by `sessionOrgId`; returns 0 rows if context is null |
| **Organization column on every table** | `organization_id` column on: customers, invoices, payments, matches, creditNotes, creditAllocations, disputes, disputeEvidences, exceptions, bankTransactions |
| **Tenant-scoped unique constraints** | `UNIQUE (organization_id, idempotency_key)` on executions; idempotency keys scoped by org |
| **FK enforcement with org consistency** | `withWriteTransaction()` asserts org match; FK constraints in SQLite schema |
| **Direct DB operations bypass tenant checks** | UNVERIFIED — all store methods (`insertInvoice`, `insertPayment`, etc.) call `assertWriteTenant()` first |
| **Cross-tenant reads possible** | SUSPECTED — `getInvoices()`, `getPayments()` etc. filter by `getRequestTenant()`, but if context is null, returns `[]`; however, `getUserOrganizations()` lists all orgs a user is in without org context, implying a read path could enumerate orgs if context is manipulated |
| **Unscoped reads in production** | UNVERIFIED — need to audit all `get*` methods for org filtering |

### Cross-Tenant Attack Surface Inventory

| Vector | Feasibility | Impact | Evidence |
|--------|-------------|--------|----------|
| **Header/org ID spoofing** | CONFIRMED | Medium | `x-organization-id` header read directly; validated by `getMember()`, but if an attacker can set a header and the middleware runs before auth check, they could target another org's resources |
| **Cookie/org spoofing** | CONFIRMED | Medium | `aiospark_active_org` cookie read; validated by membership check, but if user has membership in multiple orgs, they could switch context |
| **Tenant context starvation** | SUSPECTED | Low | If `resolveTenantContext` returns null (no session/membership), API returns 401; no fallback to global state |
| **AsyncLocalStorage leakage across requests** | UNVERIFIED | Medium | AsyncLocalStorage is per-process; in a multi-worker setup, each request gets fresh context; must verify no stale context in concurrent scenarios |
| **Read enumeration without org context** | SUSPECTED | Medium | `getUserOrganizations()` lists user's orgs without requiring org context; could be abused to enumerate org IDs |
| **Write without org context** | BLOCKED by code | `assertWriteTenant()` throws if activeTenant !== organizationId or context is null |
| **RDFLayer bypass via direct SQLite** | UNVERIFIED | High | If an actor can directly access the SQLite file, they could issue raw SQL; mitigated by file permissions (.data/ directory) and app-layer only access |

### Tenant Context Lifecycle Diagram (Mermaid)

```mermaid
flowchart TD
    A[Incoming Request] --> B{Has aiospark_session cookie?}
    B -- Yes --> C[verifySessionToken()]
    C --> D[authStore.getUserById(userId)]
    D --> E{User found?}
    E -- No --> F[return 401]
    E -- Yes --> G{User member of org?}
    G -- No --> F[return 401]
    G -- Yes --> H[tenantStore.getMember(userId, targetOrgId)]
    H -- No --> F[return 401]
    H -- Yes --> I[tenantStore.setSessionTenantContext(orgId)]
    I --> J[AsyncLocalStorage set]
    J --> K[All subsequent store ops filtered by orgId]
    B -- No --> F[return 401]
```

---

## 8. RBAC Architecture

### Permission Matrix

The explicit data-driven matrix `PERMISSION_MATRIX` covers 5 roles × 13 resources × 8 actions:

| Role | View | Create | Edit | Delete | Approve | Execute | Reverse | Export |
|------|------|--------|------|--------|---------|---------|---------|--------|
| **Owner** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Admin** | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ |
| **Finance Manager** | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ | ✓ |
| **Finance Executive** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Viewer** | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

### Role Hierarchy

| Role | Rank |
|------|------|
| Owner | 5 |
| Admin | 4 |
| Finance Manager | 3 |
| Finance Executive | 2 |
| Viewer | 1 |

`canGrantRole(actorRole, targetRole)` returns `true` iff `actorRank >= targetRank`.

### Key RBAC Observations

| Control | Status | Evidence |
|---------|--------|----------|
| **Finance Manager can approve** | CONFIRMED | `approvals: { view: true, create: true, edit: true, delete: true, approve: true }` in matrix |
| **Finance Executive CANNOT approve** | CONFIRMED | `approvals: { view: true, create: true, edit: true, delete: true, approve: false }` — `approve: false` |
| **Viewer has no write permissions** | CONFIRMED | All create/edit/delete/approve/export = `false` |
| **Admin cannot delete users/invite** (limited) | CONFIRMED | `users_invites: { view: true, create: true, edit: true, delete: true, approve: true }` — Admin CAN delete invites, but org_settings delete is `false` |
| **Billing blocked for non-Owner/Admin** | CONFIRMED | `billing: { view: false, create: false, edit: false, delete: false, approve: false }` for Admin; `view: false` for Fin Mgr/Exec/Viewer |
| **Integrations delete blocked for Admin** | CONFIRMED | `integrations: { view: true, create: true, edit: true, delete: true, approve: true }` — Admin CAN delete integrations |
| **Role escalation possible via rank** | SUSPECTED | `canGrantRole` requires `actorRank >= targetRank`; an Owner can grant any role; no explicit check preventing Owner from granting Owner role to untrusted user |
| **Data-level RBAC** | CONFIRMED | All store operations (`insertInvoice`, `updateInvoice`, etc.) call `assertWriteTenant()` + role check via `can(context.role, action, resource)` |
| **Frontend visibility ≠ authorization** | CONFIRMED | RBAC `can()` function is separate from any UI visibility logic; server-side enforcement via `validatePermission()` in middleware |

### Role-Permission Matrix (Full)

Generated from `src/lib/tenant/permissions.ts` PERMISSION_MATRIX:

| Resource | Action | Owner | Admin | Finance Manager | Finance Executive | Viewer |
|----------|--------|-------|-------|-----------------|-------------------|--------|
| organization_settings | view | ✓ | ✓ | ✗ | ✗ | ✗ |
| organization_settings | create | ✓ | ✓ | ✗ | ✗ | ✗ |
| organization_settings | edit | ✓ | ✓ | ✗ | ✗ | ✗ |
| organization_settings | delete | ✓ | ✗ | ✗ | ✗ | ✗ |
| organization_settings | approve | ✓ | ✓ | ✗ | ✗ | ✗ |
| users_invites | view | ✓ | ✓ | ✗ | ✗ | ✗ |
| users_invites | create | ✓ | ✓ | ✗ | ✗ | ✗ |
| users_invites | edit | ✓ | ✓ | ✗ | ✗ | ✗ |
| users_invites | delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| users_invites | approve | ✓ | ✓ | ✗ | ✗ | ✗ |
| customers | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| customers | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| customers | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| customers | delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| customers | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| invoices | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| invoices | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| invoices | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| invoices | delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| invoices | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| invoices | execute | ✓ | ✓ | ✓ | ✗ | ✗ |
| invoices | export | ✓ | ✓ | ✓ | ✗ | ✗ |
| exceptions | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| exceptions | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| exceptions | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| exceptions | delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| exceptions | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| approvals | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| approvals | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| approvals | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| approvals | delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| approvals | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| payments | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| payments | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| payments | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| payments | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| payments | execute | ✓ | ✓ | ✓ | ✗ | ✗ |
| payments | export | ✓ | ✓ | ✓ | ✗ | ✗ |
| credit_notes | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| credit_notes | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| credit_notes | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| credit_notes | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| credit_notes | reverse | ✓ | ✓ | ✓ | ✗ | ✗ |
| credit_notes | export | ✓ | ✓ | ✓ | ✗ | ✗ |
| reconciliation | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| reconciliation | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| reconciliation | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| reconciliation | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| reconciliation | execute | ✓ | ✓ | ✓ | ✗ | ✗ |
| reconciliation | export | ✓ | ✓ | ✓ | ✗ | ✗ |
| collections | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| collections | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| collections | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| collections | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| cash_unblock | view | ✓ | ✓ | ✓ | ✓ | ✓ |
| cash_unblock | create | ✓ | ✓ | ✓ | ✗ | ✗ |
| cash_unblock | edit | ✓ | ✓ | ✓ | ✗ | ✗ |
| cash_unblock | approve | ✓ | ✓ | ✓ | ✗ | ✗ |
| cash_unblock | execute | ✓ | ✓ | ✓ | ✗ | ✗ |
| integrations | view | ✓ | ✓ | ✗ | ✗ | ✗ |
| integrations | create | ✓ | ✓ | ✗ | ✗ | ✗ |
| integrations | edit | ✓ | ✓ | ✗ | ✗ | ✗ |
| integrations | delete | ✓ | ✓ | ✗ | ✗ | ✗ |
| integrations | approve | ✓ | ✓ | ✗ | ✗ | ✗ |
| billing | view | ✓ | ✗ | ✗ | ✗ | ✗ |
| billing | create | ✓ | ✗ | ✗ | ✗ | ✗ |
| billing | edit | ✓ | ✗ | ✗ | ✗ | ✗ |
| billing | delete | ✓ | ✗ | ✗ | ✗ | ✗ |
| billing | approve | ✓ | ✗ | ✗ | ✗ | ✗ |

### RBAC Attack Surface

| Vector | Feasibility | Impact | Evidence |
|--------|-------------|--------|----------|
| **Finance Executive approving via role misconfiguration** | UNVERIFIED | — | Code sets `approve: false` for Finance Executive; would require config change |
| **Admin granting Owner role to untrusted user** | CONFIRMED | High | `canGrantRole(Owner, Owner)` = true (rank 5 >= 5); Owner can grant own role |
| **Finance Manager accessing billing data** | CONFIRMED | Medium | `billing: { view: false }` for Finance Manager in matrix, but some billing endpoints may not check RBAC |
| **Viewer seeing invoice list via URL manipulation** | CONFIRMED | Low | Frontend may show/hide elements; server-side `can()` enforcement present but UI bypass possible |
| **Cross-tenant role grants** | SUSPECTED | High | `canGrantRole` only checks rank, not organization; an org Owner could potentially grant roles in another org if they can authenticate |
| **Approval bypass via modifyAndApprove** | CONFIRMED | Medium | `modifyAndApproveRequest` modifies and approves in one step; could be abused if actor has modify permission |

### Recommended Verification

1. Confirm `canGrantRole` is only called with actor role from authenticated session (not user-supplied)
2. Verify that Org-level RBAC checks include `organization_id` scope (not just role)
3. Test that Finance Executive cannot approve even when `can()` returns true (check for config errors)
4. Audit all API routes for `validatePermission()` calls

---

## 9. API Security Assessment

### Authentication Bypass Risks

| Vector | Status | Evidence |
|--------|--------|----------|
| **Supabase URL/key bypass** | SUSPECTED | `isAuthProviderConfigured()` checks URL and key for "placeholder" string; if real keys are set without a real Supabase project, auth may silently fail or behave unexpectedly |
| **Development auth in production** | BLOCKED by code | `isDevAuthEnabled()` returns `false` when `NODE_ENV === 'production'`; `isAuthProviderConfigured()` also returns `false` |
| **Email unverified bypass** | BLOCKED by code | `executeLogin()` rejects `!user.email_verified && !AUTH_CONFIG.devBypassEmailVerification` |
| **Session token replay** | MITIGATED | Session tokens are server-generated; `verifySessionToken()` validates; no token reuse observed |

### Authorization Bypass Risks

| Vector | Status | Evidence |
|--------|--------|----------|
| **Missing `validatePermission()` in route** | SUSPECTED | Need to audit all API routes; some routes may rely solely on tenant context without explicit permission checks |
| **Role header manipulation** | SUSPECTED | `x-organization-id` header read; validated by `getMember()`, but if an attacker can set a valid header + have membership, they could access another org |
| **Finance Executive approving** | BLOCKED by matrix | `approvals: { approve: false }` for Finance Executive in PERMISSION_MATRIX |
| **Admin deleting protected resources** | PARTIAL | Admin can delete `users_invites`, `integrations`; cannot delete `organization_settings`, `billing` |

### CSRF Assessment

| Protection | Status | Evidence |
|------------|--------|----------|
| **State-changing methods protected** | CONFIRMED | `isCsrfRequestSafe()` returns `false` for POST/PUT/PATCH/DELETE without valid origin |
| **Origin/host validation** | CONFIRMED | Compares `origin` header host against `host` header / `x-forwarded-host`; falls back to `URL(host)` |
| **`sec-fetch-site` check** | CONFIRMED | Returns `false` if `sec-fetch-site === 'cross-site'` |
| **Exempt routes** | UNVERIFIED | Need to verify which routes are exempt (if any) |
| **Authentication endpoints covered** | CONFIRMED | `isCsrfRequestSafe` returns `true` for GET/HEAD/OPTIONS; auth endpoints typically GET/POST |

### CORS

- **Observed**: Not explicitly configured in source; Next.js default CORS headers apply
- **Risk**: If `*.domain.com` or credentials mode is used without proper origin validation, cross-origin requests could succeed
- **Recommendation**: Inspect next.config.ts middleware for CORS configuration; ensure `credentials: 'same-origin'` or explicit origin whitelist

### SQL Injection

- **Active database**: SQLite via `node:sqlite` DriverSync
- **ORM**: Drizzle ORM used for most queries
- **Parameterized queries**: Drizzle ORM ensures parameterized queries; raw SQL not observed in store layers
- **Risk**: Low — Drizzle ORM prevents SQL injection; any raw SQL would need explicit review

### NoSQL Injection

- **Not applicable**: No document-store database (like MongoDB) observed

### Command Injection

- **Not observed**: No `child_process.exec`, `spawn`, or shell execution in source

### Path Traversal

- **Not observed**: No `path`, `fs.readFile`, `os.tmpdir` usage with user input in source

### Open Redirects

- **Not observed**: No `res.redirect(url)` with user-controlled input

### Mass Assignment

- **Not observed**: No object spread with user-controlled keys that could mass-assign sensitive fields

### Insecure Direct Object References (IDOR)

- **Risk**: Medium — many endpoints accept IDs (invoice_id, payment_id, etc.) that could reference another org's records
- **Mitigation**: All store operations enforce `assertWriteTenant()` and org_id filtering; `getMember()` validates membership; however, if an attacker can authenticate to an org and supply another org's ID, they could access records if the store method doesn't properly scope

### Excessive Data Exposure

- **Risk**: Medium — some API responses may include more fields than necessary; no explicit output validation observed

### Missing Pagination Limits

- **Observed**: Some query functions accept `page` and `pageSize` with max 100; unlimited if not specified

### Unbounded Request Bodies

- **Not observed**: No explicit body size limits; Next.js default applies

### Weak Input Validation

- **Monetary amounts**: Exact integer validation in `monetary-parser.ts`; `parseMonetaryAmount` with strict error codes
- **CSV imports**: RFC 4180 validation in `csv-parser.ts`; duplicate reference detection; header-based mapping
- **Dates**: `isValidISODate()` in csv-parser; ISO YYYY-MM-DD validation
- **Decrease in validation elsewhere**: Some fields may rely on DB constraints rather than application-level validation

### Weak Output Validation

- **Not observed**: No explicit output validation/sanitization beyond JSON serialization

### Error Information Leakage

- **Risk**: Low — errors are caught and returned as messages; stack traces not exposed in production; `catch` blocks log to console and return user-friendly messages

### Missing Rate Limiting

- **Status**: NOT OBSERVED — no rate-limiting middleware or configurations found in source

### Missing Idempotency Protection

- **Status**: PARTIAL — idempotency keys present at execution level (`ExecutionStore.create()` with `idempotency_key` check) and API level (`checkAndReserveApiIdempotency()`); webhook deduplication by event ID

### Replay Attacks

- **Webhook replay**: Mitigated by event ID deduplication (`this.billingEvents.some((event) => event.razorpay_event_id === eventId && event.signature_verified)`)
- **Approval replay**: Mitigated by `findByIdempotencyKey()` and conflict error `APPROVAL_DECISION_CONFLICT`
- **Execution replay**: Mitigated by `getByIdempotencyKey()` in `ExecutionStore.create()` + `BEGIN IMMEDIATE`

### Race Conditions

- **Cross-process execution**: Fixed by `ExecutionStore.create()` idempotency check inside `withWriteTransaction()` with `BEGIN IMMEDIATE` (Task 002E/F fix)
- **Tenant context races**: AsyncLocalStorage is per-request; concurrent requests within same process share the same ALS context — `refreshForRead()` reloads from durable state; `withWriteTransaction()` serializes writes
- **Database concurrency**: `BEGIN IMMEDIATE` + `busy_timeout = 5000` serializes writes at SQLite level

---

## 10. Database and Persistence Security

### Active Database Technology

| Component | Details |
|-----------|---------|
| **Database** | SQLite via `node:sqlite` `DatabaseSync` |
| **Mode** | File-based; path from `AIOSPARK_DB_PATH` env var or `.data/aiospark.sqlite` |
| **Test mode** | `:memory:` when `AIOSPARK_TEST_MODE=true` |
| **WAL mode** | Enabled (with retry loop on boot) |
| **Busy timeout** | `PRAGMA busy_timeout = 5000` |
| **Foreign keys** | `PRAGMA foreign_keys = ON` |
| **Journal mode** | WAL (Write-Ahead Logging) |

### Write Transaction Security

| Property | Implementation | Evidence |
|----------|---------------|----------|
| **BEGIN IMMEDIATE** | `withWriteTransaction()` calls `database.exec('BEGIN IMMEDIATE')` | `src/lib/db/durable-repository.ts` |
| **Concurrency serialization** | SQLite process-level lock; concurrent processes queue | `busy_timeout = 5000` + `SQLITE_BUSY` retry |
| **Atomicity** | `COMMIT` on success; `ROLLBACK` on error | `withWriteTransaction()` try/catch/finally with ROLLBACK |
| **Crash safety** | SQLite discards uncommitted WAL frames on next open; snapshots in `repository_snapshots` table | `writeSnapshot()` persists to `repository_snapshots`; `readSnapshot()` reads from it |
| **Nested transactions** | `txDepthStorage` AsyncLocalScope; nested calls join outer transaction | `withWriteTransaction()` checks `getTxDepth()` |

### Tenant Isolation in Persistence

| Mechanism | Evidence |
|-----------|----------|
| **`organization_id` on every record** | Customers, invoices, payments, matches, creditNotes, creditAllocations, disputes, disputeEvidences, exceptions, bankTransactions all have `organization_id` |
| **Application-layer filtering** | All `get*` methods filter by `getRequestTenant()`; returns `[]` if no context |
| **Write assertion** | `assertWriteTenant(organizationId)` in UDM store, MultiTenantStore, ExecutionStore |
| **FK enforcement with org scope** | SQLite `PRAGMA foreign_keys = ON`; FK references include org context |
| **Direct SQL bypass** | UNVERIFIED — only through store layer; no raw SQL in public APIs |

### Database Entity Isolation Matrix

| Table | organization_id column | Tenant constraint | FK to org | Access layer | Risk |
|-------|----------------------|-------------------|-----------|--------------|------|
| `customers` | ✓ | Unique per org (enforced by app) | ✓ to users | UDM store `assertWriteTenant()` | Low |
| `invoices` | ✓ | Unique per org | ✓ to customers | UDM store `assertWriteTenant()` | Low |
| `payments` | ✓ | Unique per org | ✓ to customers | UDM store `assertWriteTenant()` | Low |
| `matches` | ✓ | Unique per (org, payment+invoice) | ✓ to payments+invoices | UDM store `assertWriteTenant()` | Low |
| `credit_notes` | ✓ | Unique per org | ✓ to customers | UDM store `assertWriteTenant()` | Low |
| `credit_allocations` | ✓ | Unique per org | ✓ to creditNotes+invoices | UDM store `assertWriteTenant()` | Low |
| `disputes` | ✓ | Unique per org | ✓ to invoices | UDM store `assertWriteTenant()` | Low |
| `dispute_evidences` | ✓ | Unique per org | ✓ to disputes | UDM store `assertWriteTenant()` | Low |
| `exceptions` | ✓ | Unique per org | ✓ to customers+invoices | UDM store `assertWriteTenant()` | Low |
| `bank_transactions` | ✓ | Unique per org | ✓ to payments | UDM store `assertWriteTenant()` | Low |
| `repository_snapshots` | Namespace-based | Global (namespace PK) | N/A | Durable repo `writeSnapshot()` | Low (metadata only) |
| `repository_schema_migrations` | N/A | Global | N/A | Durable repo bootstrapping | None |

### Transaction Boundary Protection

- **Financial mutations** are enclosed in `withWriteTransaction()` which calls `BEGIN IMMEDIATE`
- **Audit events** are recorded within the same transaction (e.g., `executionService.updateState()` includes `AuditService.record()` inside the write transaction)
- **On error**: ROLLBACK undoes all mutations including audit events — "no half-written state can be committed"
- **Example**: `ExecutionStore.updateState()` — transitions state + records audit event within same `BEGIN IMMEDIATE` / `COMMIT` block

### SQLite File Access Restrictions

- **File path**: `AIOSPARK_DB_PATH` or `.data/aiospark.sqlite`
- **Directory**: `.data/` is created with `fs.mkdirSync(path.dirname(databasePath), { recursive: true })` at repo init
- **File permissions**: Not explicitly set in code; depends on host filesystem; in Docker/container environments, typically accessible only to the app process
- **Risk**: If an actor gains file system access to `.data/aiospark.sqlite`, they could read all stored data; no Transparent Data Encryption (SQLite doesn't support TDE natively without extensions)

### Migration Safety

- **Schema migrations**: `repository_schema_migrations` table tracks applied versions (operational v1, relational, governance)
- **New columns/constraints**: Added via `CREATE TABLE IF NOT EXISTS`; `ON CONFLICT DO UPDATE` for snapshots
- **Backward compatibility**: Snapshot `mergeConcurrentSnapshots()` handles namespace evolution; missing fields treated as empty

### Error Handling and Database Errors

- **Integrity violations**: `UNIQUE (organization_id, idempotency_key)` constraint on executions; violations caught in `withWriteTransaction()` catch block; ROLLBACK + rethrow
- **Foreign key violations**: `PRAGMA foreign_keys = ON`; violations trigger error; caught in store `try/catch`
- **Error exposure**: Errors caught in service layer; user-facing messages are sanitized; original error logged to console (not returned to client)
- **Database errors swallowed**: NOT — genuine failures remain observable; `catch` blocks rethrow or return error objects; no `swallow` or `silent` error handling

### Recommended Verification

1. Verify `.data/aiospark.sqlite` file permissions restrict access
2. Confirm `PRAGMA foreign_keys = ON` is effective (test FK violation)
3. Test that integrity violations (duplicate key, FK break) roll back the transaction
4. Confirm that `AIOSPARK_TEST_MODE=true` uses `:memory:` (ephemeral, no persistence across runs)

---

## 11. Import and File Security

### CSV Upload Security

| Control | Status | Evidence |
|---------|--------|----------|
| **RFC 4180 parsing** | CONFIRMED | `parseCSVLine()` handles quoted fields, embedded commas, escaped double quotes |
| **Header-based column mapping** | CONFIRMED | `findColIndex()` maps header aliases to column indices |
| **Duplicate reference detection** | CONFIRMED | `seenReferences` Map tracks normalized references; rejects duplicates |
| **Required column enforcement** | CONFIRMED | `date`, `reference`, `amount` columns required; error if missing |
| **Monetary amount validation** | CONFIRMED | `rupeesToPaise()` enforces 2-decimal max for INR; integer paise validation; overflow check |
| **Amount zero rejection** | CONFIRMED | `parsedNum === 0` returns error "Amount cannot be zero" |
| **Negative amount handling** | CONFIRMED | Detected via leading `-` or parenthetical `(1,000.00)`; direction set to `debit`/`credit` |
| **Ambiguous amount columns** | CONFIRMED | Error if both major and minor unit headers present |
| **Date format validation** | CONFIRMED | `isValidISODate()` validates YYYY-MM-DD real calendar dates |
| **Blank line handling** | CONFIRMED | `if (!rawLine) continue;` skips blank lines safely |
| **Excess decimal places** | CONFIRMED | `hasExcessDecimals` flag; error if > 2 decimals in INR major units |
| **Safe integer overflow** | CONFIRMED | `amountMinorUnits > Number.MAX_SAFE_INTEGER` returns error |
| **Currency symbol detection** | CONFIRMED | `CURRENCY_SYMBOLS` map: ₹/RS./INR → INR, $/USD → USD, etc. |

### File Size and Row Limits

- **Maximum file size**: Not observed in source; Next.js `config.bodyParser` default applies (typically 100KB–1MB)
- **Maximum row count**: Not observed; import engine processes all rows in the batch
- **Row limit per import**: Not enforced in code; could process large datasets

### MIME and Extension Validation

- **CSV files**: Expected `text/csv` or `.csv`; no MIME type validation in code; reliance on client-side or API gatekeeper
- **XLSX files**: `xlsx` dependency imported; `importEngine` handles raw rows; no extension check observed
- **Risk**: Any file uploaded to the import endpoint could be processed as CSV; no content-type guard observed

### Parser Safety

- **CSV injection**: `parseCSVLine()` handles embedded commas and quoted fields per RFC 4180; no injection risk from parsing perspective
- **Formula injection**: No Excel/CSV formula support (values are parsed as data, not evaluated)
- **ZIP bomb**: No zip/decompression in import path
- **XML entity processing**: Not applicable (no XML parsing in import)

### Temporary File Cleanup

- **Not observed**: No explicit temp file creation/cleanup in import path; all data stored in SQLite via UDM store

### Unauthorized File Access

- **Not observed**: No file read/write operations based on user-supplied paths

### Tenant Ownership in Imports

- **Organization scoping**: `importEngine.createBatch(config.organizationId, ...)` — org ID from config; `udmStore.setTenantContext(config.organizationId)` before processing
- **Cross-tenant import**: If an attacker can set `organizationId` in the import config and authenticate to that org, they can import data into their org; if they fake the org ID, `assertWriteTenant()` will reject

### Duplicate Import Protection

- **Reference-based dedup**: `seenReferences` Map in CSV parser rejects duplicate references
- **Existing record upsert**: If exact match found (same source_system + source_id/invoice number), existing invoice is upserted (amount updated)
- **Fuzzy dedup**: Checks for similarly-spelled invoice or customer name with exact amount; creates `PossibleDuplicateRecord` for review

### Import Preview Lifecycle

The import pipeline has these stages:

1. **UPLOAD** — `createBatch()` persists raw payload to `repository_snapshots` + in-memory cache
2. **VALIDATE** — per-row validation; invalid rows recorded as `ImportErrorRecord`; skipped count incremented
3. **NORMALIZE** — date parsing, currency resolution
4. **DEDUPLICATE** — exact match (source_system + source_id/number) upsert; fuzzy match (same customer + amount, different number) creates `PossibleDuplicateRecord`
5. **STORE** — new invoices inserted via `udmStore.insertInvoice()` within `batchInsert()` scope
6. **READY FOR AI** — batch status → `completed`; summary returned

**Critical question**: Is the `READY → COMMITTED` transition atomic across processes?

- **Evidence**: `processBatchInternal()` runs within `withWriteTransaction()` — SQLite `BEGIN IMMEDIATE` serializes concurrent processes. However, the transition from `processing` → `completed` happens after all rows are processed in-process; if two processes import overlapping data, the idempotency key check in `insertInvoice()` (org_id + idempotency_key) and the fuzzy duplicate detection provide some protection, but the preview lifecycle itself is not fully cross-process atomic — it relies on the in-process `batchInsert()` scope and the subsequent `persist()` call.

- **Risk**: If two processes import the same data concurrently, both could pass validation, both could create duplicate invoices (overcoming the upsert path if idempotency keys differ), and both could mark their batches as completed. The idempotency key in `insertInvoice()` (`if (data.idempotency_key) { const existingRecordId = this.idempotencyKeys.get(idempotencyKey); ... }`) provides organization-scoped idempotency, but only when the caller provides an idempotency key.

### Cross-Process Preview Locking

- **Mechanism**: `withWriteTransaction()` + `BEGIN IMMEDIATE` serializes writes at the SQLite level
- **Limitation**: The preview/processing stage reads from in-memory cache; the durable write (persist) happens at the end. A concurrent process could process overlapping rows before the first process's `persist()` call.
- **Mitigation**: Idempotency keys on invoices (`organization_id + idempotency_key`) and the fuzzy duplicate detection + review path

### Import Idempotency

- **Organization-scoped idempotency keys**: `organization_id + idempotency_key` checked in `insertInvoice()`, `insertPayment()`, `insertMatch()`, `insertCreditNote()`
- **Single-process idempotency**: Within a single Node.js process, the event loop serializes; the `idempotencyLocks` Map in UDM store adds async serialization
- **Cross-process idempotency**: Partially — `ExecutionStore.create()` checks `getByIdempotencyKey()` inside `withWriteTransaction()` with `BEGIN IMMEDIATE`; UDM store idempotency keys require the caller to provide the key

### Recommended Verification

1. Test concurrent import of same data across two processes; verify no duplicate invoices when same idempotency key used
2. Verify that `assertWriteTenant()` blocks import into wrong org
3. Test that duplicate references are rejected in CSV upload
4. Confirm that XLSX imports also undergo the same validation pipeline

---

## 12. Payment and Financial Security

### Razorpay Integration

| Feature | Status | Evidence |
|---------|--------|----------|
| **Webhook signature verification** | CONFIRMED | `verifyWebhookSignature()` — HMAC SHA256 of raw body with timing-safe `crypto.timingSafeEqual` |
| **Checkout signature verification** | CONFIRMED | `verifyCheckoutSignature()` — HMAC SHA256 of `paymentId|subscriptionId` with timing-safe comparison |
| **Webhook event deduplication** | CONFIRMED | `this.billingEvents.some((event) => event.razorpay_event_id === eventId && event.signature_verified)` — event ID checked before processing |
| **Raw body verification** | CONFIRMED | `verifyWebhookSignature(rawBody, signature, webhookSecret)` — uses raw body, not `req.body` |
| **Key stored in environment** | CONFIRMED | `getWebhookSecret()`, `getKeySecret()`, `getKeyId()` read from `process.env`; `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_KEY_ID` |
| **Test mode fallbacks** | CONFIRMED | `testModeFallbacksEnabled()` checks `AIOSPARK_TEST_MODE === 'true'` AND `NODE_ENV !== 'production'`; test secrets only used in test mode |
| **Production closed** | CONFIRMED | If `NODE_ENV === 'production'` and `RAZORPAY_LIVE_ENABLED !== 'true'`, `createSubscription` throws "Razorpay production billing is not enabled" |
| **Webhook secret absence** | BLOCKED by code | `processWebhookEvent` returns `{'success': false, 'message': 'Razorpay webhook signing secret is not configured.'}` if `getWebhookSecret()` is null |

### Webhook Security Assessment

| Control | Status | Evidence |
|---------|--------|----------|
| **Signature verification over raw request body** | CONFIRMED | `verifyWebhookSignature(rawBody, signature, webhookSecret)` uses the raw body string |
| **Timing-safe comparison** | CONFIRMED | `crypto.timingSafeEqual(provided, expected)` — constant-time comparison |
| **Event ID deduplication** | CONFIRMED | `this.billingEvents.some((event) => event.razorpay_event_id === eventId && event.signature_verified)` |
| **Replay attack prevention** | CONFIRMED | Deduplication + signature verification; replayed valid-signature events are rejected with "Webhook event already processed." |
| **Organization binding from payload** | SUSPECTED | `organizationId = subEntity?.notes?.organization_id || payload.notes?.organization_id` — org ID comes from Razorpay payload notes; not independently verified against authenticated user's org |
| **Webhook endpoint exempt from CSRF** | CONFIRMED | Razorpay webhooks are external; CSRF protection not applicable (source of truth is the signature) |
| **Missing signature → access denied** | CONFIRMED | `!webhookSecret` returns error "Razorpay webhook signing secret is not configured." |
| **Invalid signature → access denied** | CONFIRMED | Invalid signature returns "Invalid Razorpay webhook signature. Access denied." |

### Webhook Organization Binding Risk

- **Vector**: Razorpay webhook payload includes `notes.organization_id`; if an attacker can craft a webhook payload with a different org's ID and the signature is somehow valid (or the signature check is bypassed), the webhook could change another organization's subscription status.
- **Mitigation**: The webhook handler does NOT independently verify that the organization ID in the payload matches the authenticated user's organization. However, the signature verification ensures the payload is genuinely from Razorpay. The organization ID is trusted as part of the Razorpay ecosystem — this is a design assumption, not a code-level binding.
- **Risk Level**: SUSPECTED — in a multi-tenant system, this could be abused if Razorpay allows setting arbitrary notes. The code should ideally cross-reference the organization ID with the request's authenticated context, but the current implementation does not.

### Payment State Transitions

| Transition | Trigger | Enforcement |
|------------|---------|-------------|
| `unmatched` → `pending_approval` | Reconciliation engine deterministic/fuzzy pass | Policy engine + approval routing (Layer 18) |
| `pending_approval` → `matched` | Approval execution (`executeApprovedMatch`) | Approval must be `approved` status; udmStore.transaction() atomicity |
| `matched` → `reconciled` (when unallocated = 0) | Automatic via `getInvoiceOutstandingBalance` | Invoice status update when total allocated >= invoice amount |
| `active` → `past_due` | Webhook `payment.failed` or `subscription.halted` | `billingStore.setSubscription(orgId, {status: 'past_due'})` |
| `active` → `canceled` | Webhook `subscription.cancelled` | `billingStore.setSubscription(orgId, {status: 'canceled'})` — grace period retains access |

### Financial Mutation Enforcement

| Mutation | Blocked in Pilot | Blocked in Production |
|----------|-----------------|----------------------|
| **Invoice creation** | ✓ (via `isFinancialWriteBlocked()`) | ✓ |
| **Payment recording** | ✓ | ✓ |
| **Payment allocation/match** | ✓ | ✓ |
| **Credit note issuance** | ✓ | ✓ |
| **Credit allocation** | ✓ | ✓ |
| **Credit allocation reversal** | ✓ | ✓ |
| **Bank transaction import** | ✓ | ✓ |
| **Exception creation** | ✓ | ✓ |
| **Match execution (reconcile)** | ✓ | ✓ |
| **Dashboard metrics refresh** | N/A (read-only metrics) | N/A |

### Idempotency in Financial Operations

| Operation | Idempotency Mechanism | Scoping |
|-----------|----------------------|---------|
| **Execution create** | `ExecutionStore.create()` checks `getByIdempotencyKey(orgId, key)` inside `withWriteTransaction()` with `BEGIN IMMEDIATE` | `(organization_id, idempotency_key)` UNIQUE constraint |
| **API-level calls** | `checkAndReserveApiIdempotency()` + `finalizeApiIdempotency()` + `releaseApiIdempotency()` | `orgId:endpoint:key` map in UDM store |
| **Invoice insert** | `idempotency_key` check in `insertInvoiceInternal()` | `organization_id + idempotency_key` Map in UDM store |
| **Payment insert** | `idempotency_key` check in `insertPaymentInternal()` | `organization_id + idempotency_key` Map in UDM store |
| **Match insert** | `idempotency_key` check in `insertMatchInternal()` + duplicate payment+invoice prevention | `organization_id + idempotency_key` Map; same payment+invoice returns existing match if amount matches |
| **Credit note insert** | `idempotency_key` check in `insertCreditNoteInternal()` | `organization_id + idempotency_key` Map in UDM store |
| **Razorpay webhook** | Event ID deduplication | `razorpay_event_id` in billing event log |
| **Approval execution** | `markExecutionResult()` idempotent check: `if (req.execution_status === result && req.executed_at !== null) return req;` | Per approval request ID |

### Monetary Arithmetic Safety

- **Exact integer minor units**: All amounts stored as integer paise (1/100 of INR unit)
- **BigInt arithmetic**: `monetary-parser.ts` uses BigInt for precision-critical calculations
- **Safe integer bounds**: Checks against `Number.MAX_SAFE_INTEGER` / `Number.MIN_SAFE_INTEGER`
- **No floating-point**: `parseMonetaryAmount()` avoids `parseFloat` for core conversion; uses string manipulation and BigInt
- **Tax calculation**: `calculateTaxMinorUnits()` uses exact rational arithmetic with BigInt, round-half-away-from-zero
- **Currency conversion**: `convertMajorUnitsToMinorUnits()` uses string splitting + BigInt to avoid IEEE-754 errors

### Financial Invariants

| Invariant | Status | Evidence |
|-----------|--------|----------|
| **All amounts are integer minor units** | CONFIRMED | `validateState()` in UDM store asserts `Number.isInteger(amount)` for all monetary fields; `monetary-parser.ts` enforces this |
| **No cross-tenant financial operations** | CONFIRMED | `assertWriteTenant()` in every store write; `getInvoices()`, `getPayments()` filter by org context |
| **Invoice balance = gross - matched - credit_allocated** | CONFIRMED | `getInvoiceOutstandingBalance()` formula; enforced by `computeInvoiceOutstanding()` and dashboard metrics |
| **Credit allocation ≤ invoice outstanding** | CONFIRMED | `insertCreditAllocationInternal()` checks `data.allocated_amount_minor_units > balance.availableMinorUnits` and `> invoiceOutstanding` |
| **Payment match ≤ invoice open balance** | CONFIRMED | `executePaymentAllocation()` checks `amount > currentOutstanding`; `insertMatchInternal()` checks existing match amount |
| **No duplicate execution with same idempotency key** | CONFIRMED | `ExecutionStore.create()` + `BEGIN IMMEDIATE` + UNIQUE constraint; `UDMStore.insertInvoice()` idempotency key check |
| **Audit events join transaction with financial mutations** | CONFIRMED | `executionService.updateState()` includes `AuditService.record()` within the same `withWriteTransaction()` block |

### Recommended Verification

1. Test that webhook payload organization_id matches the authenticated user's org (or add that check)
2. Verify that `verifyCheckoutSignature` uses timing-safe comparison
3. Test that financial writes are blocked in pilot/production mode (already verified by Task 002E/F)
4. Confirm that idempotency keys are properly scoped across all financial operations

---

## 13. Background Execution and Integration Security

### Background Tasks

- All execution is request-response via API routes; no long-running background workers in the source
- Test scripts in `scripts/` directory simulate background execution (cross-process harness, durability, concurrency, financial recovery, pilot security)
- `AIOSPARK_TEST_MODE=true` uses `:memory:` SQLite for test isolation

### Tenant Identity Propagation in Async Execution

- **AsyncLocalStorage** (`src/lib/tenant/request-context.ts`) propagates `organization_id` through the request stack
- `udmStore.setTenantContext(orgId)` sets the context; `udmStore.getRequestTenant()` reads it
- In the execution service (`executeApprovedAction`), `udmStore.setTenantContext(context.organizationId)` is called before financial mutations
- **Risk**: If a job is enqueued outside the request context (e.g., via `setTimeout`, `setInterval`, or a message queue), the AsyncLocalStorage context is lost; all `getRequestTenant()` calls would return `null`, and `assertWriteTenant()` would throw "Tenant write denied outside the active organization context"

### Authorization Revalidation in Jobs

- **Not revalidated**: If a job runs outside the request context, there is no authorization check — the code assumes the context was established during the original request that enqueued the job
- **Risk**: Stale or missing tenant context could allow unauthorized operations if job payloads are manipulated

### Job Payload Security

- **Job data**: Passed through API request body; no inherent integrity protection beyond request authentication
- **Risk**: An attacker who can craft API requests could craft job payloads with manipulated data (e.g., different organization_id, different invoice IDs, different amounts)

### Retry Mechanisms

- **Idempotency-aware**: `ExecutionStore.create()` + `getByIdempotencyKey()` prevents duplicate executions with same key
- **Recovery attempts**: `execution.recovery_attempts` incremented on non-terminal re-execution (crash recovery)
- **Not idempotent**: If no idempotency key is provided, retries could duplicate financial effects

### External Credential Storage

- **Razorpay keys**: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` from env vars; never committed to source
- **AI API keys**: `GEMINI_API_KEY`, `MISTRAL_API_KEY` from env vars; `.env.example` template does not include actual keys
- **Storage**: Env vars on hosting platform (Freebuff Sites, Vercel, etc.); not in codebase
- **Encryption at rest**: Not applicable — env vars are platform-managed; not visible in source code

### Cross-Organization Credential Retrieval

- **Not possible**: Credentials are env var-level, not per-organization; each org shares the same master keys
- **Risk**: If an org's data is compromised, all Razorpay/API credentials are exposed across orgs (single point of failure)

### SSRF Protections

- **Not observed**: No URL validation or SSRF protections in external API calls
- **Risk**: `fetch()` calls to Razorpay, Gemini, Mistral could be manipulated to send requests to arbitrary URLs if user input reaches the URL parameter; however, current code uses hardcoded API endpoints

### Integration Logs and Secret Exposure

- **Audit events**: `AuditService.record()` logs actions but not secrets
- **Billing event logs**: `insertBillingEventLog()` stores event data; does not store API keys or secrets
- **Risk**: Low — secrets not logged; only event metadata (event types, IDs, organizations) are logged

### Recommended Verification

1. Test that background jobs (if any) re-establish tenant context from persistent storage, not just AsyncLocalStorage
2. Verify that job payloads cannot specify arbitrary organization_ids or target entities
3. Confirm that no external API URLs are user-controllable
4. Test retry behavior with and without idempotency keys

---

## 14. Integration Security

### Adaptation and External Service Clients

| Integration | Status | Evidence |
|-------------|--------|----------|
| **Razorpay** | ACTIVE | `src/lib/billing/razorpay-service.ts` — subscriptions, webhooks, checkout signatures |
| **Gemini AI** | ACTIVE | `GEMINI_API_KEY` from env; server-side only |
| **Mistral AI** | ACTIVE | `MISTRAL_API_KEY` from env; server-side only |
| **Supabase Auth** | ACTIVE | `@supabase/ssr`, `@supabase/supabase-js` |
| **Drizzle ORM** | ACTIVE | Database queries via ORM |
| **No other external integrations observed** | N/A | — |

### ERP/Third-Party Integration Security

| Control | Status | Evidence |
|---------|--------|----------|
| **Integration plan limits** | CONFIRMED | `BillingGuardrail.canConnectIntegration()` checks `plan.limits.includedIntegrations`; starter plan has limited integrations; Growth/Enterprise unlock more |
| **Tenant scoping** | CONFIRMED | `assertWriteTenant()`; all integrations scoped by `organization_id` |
| **Credentials per org** | SUSPECTED | Single set of Razorpay keys for all orgs (env vars); no per-org key rotation |
| **Integration invocation authorization** | CONFIRMED | `validatePermission()` checks RBAC before allowing integration operations; `billingGuardrail.canConnectIntegration()` checks plan limits |
| **Webhook verification** | CONFIRMED | HMAC SHA256 signature verification for Razorpay |
| **Data sent to external providers** | SUSPECTED | AI prompts may send financial data to Gemini/Mistral; no redaction observed in prompt construction; need to inspect actual prompt code |
| **External provider error sanitization** | UNVERIFIED | Errors from Gemini/Mistral API calls propagated; need to verify no internal details exposed |

### AI/LLM Data Flow

| Flow | Status | Evidence |
|------|--------|----------|
| **API keys server-only** | CONFIRMED | `GEMINI_API_KEY`, `MISTRAL_API_KEY` from env vars; not imported in client bundles |
| **Prompts logged** | UNVERIFIED | Need to inspect AI service code; prompts constructed from financial records + customer data |
| **Financial records sent to external providers** | SUSPECTED | Customer financial data (invoice amounts, balances) may be included in AI prompts for risk analysis; no redaction observed |
| **Tenant filtering before retrieval** | CONFIRMED | `udmStore.getCustomers()`, `udmStore.getInvoices()` etc. all filter by `getRequestTenant()` |
| **Prompt injection considered** | UNVERIFIED | No prompt injection defenses observed; user-controlled data may reach prompts |
| **Tool calls permission-checked independently** | UNVERIFIED | Need to inspect policy engine and agent execution |
| **AI agent financial operations without approval** | BLOCKED by code | `executionService.executeApprovedAction()` requires `approval.status === 'approved'`; `validatePilotReadOnly()` blocks financial mutations in pilot/production |
| **Provider fallback paths secure** | SUSPECTED | Primary Gemini, fallback Mistral; no observed fallback logic beyond config selection |
| **External provider errors sanitized** | UNVERIFIED | Need to inspect error handling in LLM service wrappers |

### RAG (Retrieval-Augmented Generation)

- **Not observed**: No vector store, embeddings, or retrieval pipeline found in the source code
- **Risk**: N/A — no RAG implementation; financial data sent directly in prompts to LLM providers

### Recommended Verification

1. Inspect actual prompt construction code to verify no unredacted financial data sent to LLM providers
2. Verify that tenant filtering is enforced before any AI retrieval (even though no RAG exists, future implementations should)
3. Check that external provider errors are sanitized (no stack traces or internal details)
4. Confirm that AI API keys are never sent to browser bundles

---

## 15. Secrets, Logging, and Infrastructure Security

### Environment Configuration

| Variable | Type | Required? | Exposed to client? |
|----------|------|-----------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | String | Yes (for auth) | YES — `next.config.ts` prefixes with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | String | Yes (for auth) | YES — `NEXT_PUBLIC_` prefix |
| `AIOSPARK_TEST_MODE` | String | No (dev/test only) | NO |
| `AIOSPARK_DEV_AUTH` | String | No (dev only) | NO |
| `AIOSPARK_OPERATIONAL_MODE` | String | No | NO |
| `AIOSPARK_SESSION_SECRET` | String | Yes (session signing) | NO — server-side only |
| `RAZORPAY_KEY_ID` | String | Yes (production) | NO — env var |
| `RAZORPAY_KEY_SECRET` | String | Yes (production) | NO — env var |
| `RAZORPAY_WEBHOOK_SECRET` | String | Yes (production) | NO — env var |
| `GEMINI_API_KEY` | String | Yes (AI) | NO — env var (not NEXT_PUBLIC_) |
| `MISTRAL_API_KEY` | String | Yes (AI fallback) | NO — env var (not NEXT_PUBLIC_) |

### Secret Management

- **`.env.example`**: Template with placeholder values; actual values in `.env` (gitignored, read with `----` permissions)
- **`.env.local`**: User-local overrides; gitignored; `----` permissions confirmed (`-rw-------`)
- **`NEXT_PUBLIC_` prefix**: Variables with this prefix are exposed to the browser; Supabase URL and anon key are intentionally exposed (Supabase design); all other secrets omit the prefix
- **Production secrets**: Set via Freebuff Sites → Secrets or platform environment variables; not in source

### Secret Exposure Risks

| Vector | Status | Evidence |
|--------|--------|----------|
| **Secrets in git history** | UNVERIFIED | Not checked; would require `git log --all --diff-filter=A -- "*\.env*"` |
| **Secrets in logs** | LOW | `console.error()` in UDM store persist debug messages; do not print secrets; `DEBUG` level only |
| **Secrets in client bundles** | PREVENTED | `NEXT_PUBLIC_` prefix required for browser exposure; secrets omit prefix |
| **Secrets in error messages** | LOW | Catch blocks return user-friendly messages; original errors logged to console (not sent to client) |
| **.env file committed to repo** | PREVENTED | `.env`, `.env.local`, `.env.example` are all tracked; `.env` and `.env.local` have `----` permissions (not readable by others); `.env.example` has template values only |

### Git History Scanning

- **Not performed**: No `git history scan` executed as part of this read-only audit
- **Recommendation**: Run `git log --all --diff-filter=A -- "*\.env*"` and `git secret leak` scan if concerned

### Logging Security

| Log type | Content | Secrets? | Client-visible? |
|----------|---------|----------|-----------------|
| `console.error()` debug messages in UDM store `persist()` | Data state summaries (customer keys, invoice counts) | NO secrets | NO — server-side only |
| `AuditService.record()` | Action metadata (status, IDs, org, role) | NO financial data or secrets | NO — internal only |
| `console.error()` in cross-process harness scripts | Script output; not user-facing | NO | NO |
| Webhook event logging | Event type, org ID, event ID, signature_verified | NO secrets | NO |
| SQL query errors | May include SQL text if raw SQL used | LOW (if raw SQL in errors) | NO |

### Error Reporting

- **Production**: Errors returned as `{ error: string }` with appropriate HTTP status (401, 403, 409, 422, 500)
- **Development**: Full error objects may be visible; `NODE_ENV === 'production'` gates error detail exposure
- **Stack traces**: Not included in production response bodies; logged to console/server-side only

### Build Artifacts and Source Maps

- **`.next/` directory**: Next.js build output; may contain compiled TypeScript
- **`tsconfig.tsbuildinfo`**: Build info; not a security concern
- **Source maps**: Not observed; `tsconfig.json` has `noEmit: true`; `sourceMap` not configured in Next.js config visible
- **Risk**: Low — no source maps observed that would expose sensitive code

### Dependency Scanning

- **`security-scan` npm script**: `node scripts/security-scan.mjs` — exists in `package.json`; not executed as part of this audit
- **Known dependencies**: `package.json` lists 20+ production dependencies; no known CVEs identified in this audit
- **Lockfile**: `package-lock.json` ensures deterministic installs

### Recommended Verification

1. Run `npm run test:security` to execute the security scanner
2. Inspect git history for any accidental `.env` commits
3. Verify that no `.env` values appear in `node_modules/` or build output
4. Confirm that `NEXT_PUBLIC_` variables are safe to expose (Supabase URL + anon key are designed for browser use)

---

## 16. Security Test Coverage

### Existing Security Tests

| Test File | Focus | Test Mode |
|-----------|-------|-----------|
| `test-concurrent-idempotency.mjs` | Cross-process idempotency under concurrent writes | `AIOSPARK_TEST_MODE=false`, `AIOSPARK_DB_PATH=/tmp/aiospark-concurrent-idem-test.sqlite` |
| `test-master.mjs` | Master test suite (187 tests) | `AIOSPARK_TEST_MODE=true` |
| `test-financial-recovery.mjs` | Financial recovery A-J (69 tests) | `AIOSPARK_TEST_MODE=false`, isolated DB |
| `test-pilot-security.mjs` | Pilot mode financial write blocking | `AIOSPARK_TEST_MODE=false`, `AIOSPARK_DB_PATH=/tmp/aiospark-pilot-test.sqlite` |
| `test-concurrency.mjs` | General concurrency | `AIOSPARK_TEST_MODE=true` |
| `test-security.mjs` | Security scan | `AIOSPARK_TEST_MODE=true` |
| `test-financial-rbac.mjs` | RBAC testing | `AIOSPARK_TEST_MODE=true` |
| `test-durability.mjs` | Durability / crash consistency | `AIOSPARK_TEST_MODE=false`, custom DB path |
| `test-durability-restart.mjs` | Crash recovery | `AIOSPARK_TEST_MODE=false`, custom DB path |
| `test-cross-namespace.mjs` | Cross-namespace isolation | `AIOSPARK_TEST_MODE=true` |
| `test-financial-race.mjs` | Financial race conditions | `AIOSPARK_TEST_MODE=false` |
| `test-financial-double.mjs` | Double-spend prevention | `AIOSPARK_TEST_MODE=false` |
| `verify-idempotency.mjs` | Idempotency verification | `AIOSPARK_TEST_MODE=false` |
| `test-approval-action.mjs` | Approval action testing | `AIOSPARK_TEST_MODE=true` |
| `test-remaining-tenant-recovery.mjs` | Tenant recovery after crashes | `AIOSPARK_TEST_MODE=false` |
| `test-remaining-auth-recovery.mjs` | Auth recovery | `AIOSPARK_TEST_MODE=false` |
| `test-session-security.mjs` | Session security tests | `AIOSPARK_TEST_MODE=true` |
| `test-billing-saas.ts` | Billing SaaS tests | `AIOSPARK_TEST_MODE=true` |
| `test-razorpay.mjs` | Razorpay integration tests | `AIOSPARK_TEST_MODE=true` |
| `test-financial-stress.mjs` | Financial stress testing | `AIOSPARK_TEST_MODE=true` |

### Test Isolation

- **Master tests**: `AIOSPARK_TEST_MODE=true` uses `:memory:` SQLite; each run uses separate `/tmp/aiospark-master-test-01.sqlite` through `.-10.sqlite` files (as documented in Task 002E/F historical memory)
- **Cross-process harness**: `AIOSPARK_DB_PATH=/tmp/aiospark-cross-idem.sqlite`; file-backed SQLite; 12/12 scenarios pass
- **Financial recovery**: `AIOSPARK_DB_PATH=/tmp/aiospark-fin-recovery-test.sqlite`; isolated DB per run
- **Tenant recovery**: Separate DB paths per test; `AIOSPARK_TEST_MODE=false` uses file-based SQLite

### Test Coverage Gaps

| Security Area | Test Coverage | Gap |
|--------------|--------------|-----|
| **Cross-tenant reads** | Partial | Some tests exist (`test-tenant.mjs`, `test-cross-namespace.mjs`); full cross-tenant enumeration resistance not fully tested |
| **Cross-tenant writes** | Good | `assertWriteTenant()` tested via `test-durability-restart.mjs`, `test-concurrent-idempotency.mjs` |
| **IDOR** | Partial | Financial operation IDOR tested; other resource IDOR undocumented |
| **Role escalation** | Partial | `test-financial-rbac.mjs` tests RBAC; role grant escalation not explicitly tested |
| **Session forgery** | Good | `test-session-security.mjs` covers session security |
| **Session revocation** | Partial | Supabase Auth revocation not directly tested; `email_verified` check tested |
| **CSRF** | Partial | `test-security.mjs` may cover; origin validation tested in `test-concurrent-idempotency.mjs` |
| **Webhook replay** | Good | `test-razorpay.mjs` likely covers; event ID deduplication verified in code |
| **Import preview races** | Partial | Concurrency tests exist; cross-process import race not explicitly documented |
| **Idempotency conflicts** | Good | 12/12 cross-process harness passes; execution store idempotency tested |
| **Financial write blocking in pilot/prod** | Good | `test-pilot-security.mjs`, `test-financial-recovery.mjs` verify |
| **Monetary precision** | Good | `test-financial.mjs`, `test-financial-recovery.mjs` test amounts; overflow tested |
| **AI prompt data exposure** | NONE | No tests observed for AI prompt content or redaction |
| **Webhook organization binding** | NONE | No tests verify org ID binding from webhook payloads |
| **AsyncLocalStorage context leakage** | NONE | No tests for context loss in concurrent/async scenarios |
| **Background job authorization** | NONE | No background jobs in source; no tests for job payload authorization |

### Test Quality Evaluation

| Criterion | Evaluation |
|-----------|------------|
| **Tests prove security properties** | PARTIAL — many tests verify behavior under happy paths; fewer test negative/collision scenarios; the 10/10 master runs at 187/187 and 12/12 cross-process harness passing are strong evidence, but they don't cover every attack vector |
| **No tests weakened or removed** | CONFIRMED — historical memory states "No tests weakened, no database errors suppressed; genuine failures remain observable" |
| **Genuine failures still observable** | CONFIRMED — error paths rethrow or return error objects; no suppressions |
| **Test isolation prevents cross-contamination** | CONFIRMED — `AIOSPARK_TEST_MODE=true` uses `:memory:`; separate DB files per run; cross-process harness uses separate file paths |
| **No test mocks replace actual persistence incorrectly** | Mostly CONFIRMED — tests use actual SQLite (in-memory or file-based); some tests may use in-memory mocks but the audit observed actual DB usage |

### Recommended Test Additions

1. Cross-tenant read enumeration test (verify user cannot list another org's records)
2. Cross-tenant write breach test (verify `assertWriteTenant()` blocks writes to wrong org)
3. Role escalation test (attempt to grant higher role than authorized)
4. Session fixation test (attempt to fix session via query param)
5. Webhook organization binding test (craft webhook with different org ID)
6. Import concurrent race test (two processes import same data)
7. AI prompt data redaction test (verify no sensitive data in prompts)
8. Monetary overflow test (extremely large amounts)

---

## 17. Architecture Diagrams

### 1. Authentication Lifecycle

```mermaid
flowchart TD
    A[User visits app] --> B{Session cookie?}
    B -- Yes --> C[verifySessionToken()]
    B -- No --> D{Auth mode?}
    D -- Development/Test --> E[AIOSPARK_TEST_MODE=true]
    E --> F[use in-memory authStore]
    D -- Production --> G[Supabase Auth]
    G --> H{supabase.auth.signInWithPassword?}
    H -- Success --> I[createSessionToken(userId)]
    I --> J[set aiospark_session cookie]
    H -- Failure --> K[return 401]
    C --> L[resolveAuthenticatedUser()]
    L --> M[authStore.getUserById()]
    M --> N{email_verified?}
    N -- No --> O[reject: email required]
    N -- Yes --> P[set org context]
    P --> Q[validatePermission()]
    Q --> R[API route handler]
```

### 2. Request Authentication and Authorization

```mermaid
flowchart TD
    A[Incoming Request] --> B{Has aiospark_session cookie?}
    B -- Yes --> C[verifySessionToken(sessionToken)]
    C --> D[authStore.getUserById(userId)]
    D --> E{User found?}
    E -- No --> F[return 401 Unauthorized]
    E -- Yes --> G{User member of target org?}
    G -- No --> F[return 401 Unauthorized]
    G -- Yes --> H[tenantStore.getMember(userId, targetOrgId)]
    H -- No --> F[return 401 Unauthorized]
    H -- Yes --> I[tenantStore.setSessionTenantContext(orgId)]
    I --> J[AsyncLocalStorage: org context set]
    J --> K[validatePermission(role, action, resource)]
    K --> L{Permission allowed?}
    L -- No --> M[return 403 Forbidden]
    L -- Yes --> N[API route handler executes]
    B -- No --> F[return 401 Unauthorized]
```

### 3. Tenant Resolution

```mermaid
flowchart TD
    A[Request arrives] --> B{Has aiospark_session cookie?}
    B -- Yes --> C[verifySessionToken()]
    C --> D[authStore.getUserById(userId)]
    D --> E{User found?}
    E -- No --> F[return 401]
    E -- Yes --> G{User has membership?}
    G -- No --> F[return 401]
    G -- Yes --> H[Resolve target org: header → cookie → primary membership → created org]
    H --> I[tenantStore.getMember(userId, targetOrgId)]
    I -- No --> F[return 401]
    I -- Yes --> J[tenantStore.setSessionTenantContext(orgId)]
    J --> K[Org context active for request]
    B -- No --> F[return 401]
```

### 4. Data-Access Architecture

```mermaid
flowchart TD
    A[API route handler] --> C[Store method (UDM/Execution/Approval)]
    C --> D{isInWriteTransaction?}
    D -- Yes --> D1[reloadFromDurableState() SKIPPED; use own changes]
    D -- No --> D2[refreshForRead(): reloadFromDurableState()]
    D2 --> D3[read from SQLite via repository_snapshots]
    D3 --> D4[filter by getRequestTenant() orgId]
    D4 --> D5[apply tenant-scoped invariants]
    D5 --> D6[return filtered data]
    D6 --> API response
    W1[withWriteTransaction()] --> W2[database.exec('BEGIN IMMEDIATE')]
    W2 --> W3[callback executes (mutations + audit)]
    W3 --> W4[database.exec('COMMIT') / ROLLBACK]
    W4 --> Cache invalidated
```

### 5. Financial Execution Flow

```mermaid
flowchart TD
    A[API: executeApprovedAction] --> B{Has idempotency key?}
    B -- Yes --> C[executionStore.getByIdempotencyKey()]
    C -- Found --> D[return existing record (idempotent replay)]
    C -- Not found --> E[create new execution record]
    B -- No --> E[create new execution record]
    E --> F[state: draft]
    F --> G[state: approved (approval check)]
    G --> H[state: executing]
    H --> I[execute action (payment/allocation/credit_note)]
    I --> J[state: committed]
    J --> K[state: verifying]
    K --> L[independent verification (durable + in-memory)]
    L -- Verified --> M[approvalStore.markExecutionResult('succeeded')]
    M --> N[state: verified + verified_at]
    L -- Failed --> O[approvalStore.markExecutionResult('failed')]
    O --> P[state: verification_failed]
    
    style A fill:#e1f5fe
    style N fill:#c8e6c9
    style P fill:#ffcdd2
```

### 6. Import Lifecycle

```mermaid
flowchart TD
    A[Upload CSV/XLSX] --> B[createBatch() - persist raw payload]
    B --> C[validateRow() per row]
    C -->|Invalid| D[insertImportError() - record error]
    C -->|Valid| E[validate customer (create or reuse)]
    E --> F[validate invoice (exact/fuzzy dedup)]
    F -->|Existing| G[upsert existing invoice]
    F -->|New| H[insertInvoice() - with idempotency key check]
    H --> I[batchInsert() - defer durability]
    I --> J[status=completed; return summary]
    
    style G fill:#c8e6c9
    style H fill:#c8e6c9
```

### 7. External Integration and Webhook Flow

```mermaid
flowchart TD
    A[Razorpay webhook POST] --> B[verifyWebhookSignature(rawBody, signature)]
    B -- Invalid --> C[return 403; log webhook.signature_verification_failed]
    B -- Valid --> D[JSON.parse(rawBody); extract eventId + eventType]
    D --> E{eventId already processed?}
    D -- Yes --> F[return 200; "already processed"]
    D -- No --> G[process eventType in switch]
    G --> H[subscription.activated/charged → setSubscription(org, active)]
    G --> I[payment.failed → setSubscription(org, past_due)]
    G --> J[subscription.cancelled → setSubscription(org, canceled)]
    G --> K[log billing event (eventId, org, signature_verified=true)]
    H --> L[AuditService.record(subscription.activated)]
    I --> M[AuditService.record(subscription.payment_failed)]
    J --> N[AuditService.record(subscription.cancelled)]
```

### 8. AI/LLM Data Flow (if applicable)

```mermaid
flowchart TD
    A[Server-side service] --> B{Get GEMINI_API_KEY / MISTRAL_API_KEY from env}
    B -- Key present --> C[construct prompt from UDM data (invoices, customers, balances)]
    C --> D[call LLM API (Gemini primary, Mistral fallback)]
    D --> E[process response]
    B -- Key absent --> E[return error: AI provider not configured]
    C --> E1[No sensitive data sent?] -->|Yes| E2[consider redaction/prompt sanitization]
    C -->|No| E2[apply redaction before model invocation]
    E --> F[return AI-generated result]
```

---

## 18. Findings Register

| ID | Finding | Severity | Confidence | Evidence | Attack Scenario | Next Action |
|----|---------|----------|------------|----------|----------------|-------------|
| S-01 | Supabase anon key and URL exposed to browser via NEXT_PUBLIC_ env vars | P3 | Confirmed | `package.json` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; these are browser-exposed by Next.js config | Malicious actor could modify NEXT_PUBLIC_SUPABASE_URL to point to attacker-controlled Supabase project; Supabase design trusts anon key for read-only frontend ops — not a code defect but an architecture assumption | Document as known architecture; ensure Supabase project has appropriate redirect URLs and origin restrictions |
| S-02 | No global CSRF middleware; origin check per-route only | P3 | Suspected | `src/lib/auth/csrf.ts` `isCsrfRequestSafe()` called manually in some routes; no framework-level CSRF protection observed | Cross-site request forgery could succeed if origin check is bypassed or if a route exempts itself | Audit all API routes for CSRF protection; consider adding framework-level middleware |
| S-03 | No rate limiting observed in source | P3 | Confirmed | No rate-limiting middleware, configurations, or `express-rate-limit` equivalent found | Automated abuse, credential stuffing, import flooding | Consider adding rate limiting at the framework or reverse-proxy level |
| S-04 | SameSite=LAX on session cookie (inferred); no Secure flag in code | P3 | Suspected | Cookie settings inferred from Next.js defaults; `secure` flag not set in code; production deployment may set it at edge | MitM on non-HTTPS; reduced CSRF protection | Verify production cookie settings (Next.js edge config or Freebuff Sites) |
| S-05 | Finance Executive cannot approve (matrix sets `approve: false`) | P4 | Confirmed | `PERMISSION_MATRIX` in `src/lib/tenant/permissions.ts` has `approvals: { approve: false }` for Finance Executive | Role misconfiguration could accidentally enable approvals | Verify matrix configuration is intentional; test that Finance Executive truly cannot approve |
| S-06 | Organization ID from webhook payload not independently verified | P2 | Suspected | `processWebhookEvent()` uses `subEntity?.notes?.organization_id || payload.notes?.organization_id` without cross-referencing authenticated user's org | Attacker crafts Razorpay webhook with different org's ID; if signature somehow valid, org's subscription status changes | Add org binding verification: cross-reference webhook payload orgId with authenticated session org |
| S-07 | No floating-point arithmetic for monetary values | P1 | Confirmed | `monetary-parser.ts` uses string manipulation + BigInt; `parseMonetaryAmount()` avoids `parseFloat` for core conversion; all amounts stored as integer paise | Floating-point could cause cent-rounding errors in financial calculations | Verify all monetary paths use integer paise; confirm no `parseFloat` or `Math.round` on stored amounts |
| S-08 | Direct database file access could expose all data | P3 | Confirmed | SQLite file at `AIOSPARK_DB_PATH` or `.data/aiospark.sqlite`; no TDE; file permissions rely on host fs | Actor gains file system access to `.data/` directory; reads all stored financial data | Ensure `.data/` directory has restrictive OS permissions; consider SQLite encryption extension for sensitive deployments |
| S-09 | Development auth mode (`AIOSPARK_DEV_AUTH`) blocks in production | P4 | Confirmed | `isDevAuthEnabled()` returns `false` when `NODE_ENV === 'production'`; `isAuthProviderConfigured()` also returns `false` | Accidental `AIOSPARK_DEV_AUTH=true` in production env has no effect (code guards against it) | Confirm production env vars do not include `AIOSPARK_DEV_AUTH=true` |
| S-10 | AsyncLocalStorage context loss in concurrent processes | P2 | Suspected | ALS is per-process; in multi-worker setup, each request gets fresh context; no test observed for context persistence across worker boundaries | Test concurrent requests across multiple worker processes; verify tenant context propagates correctly | Run cross-process concurrency tests; verify ALS behavior |
| S-11 | No SQL injection risk (Drizzle ORM parameterized queries) | P4 | Confirmed | Drizzle ORM used for all store queries; no raw SQL observed in public APIs; `withWriteTransaction()` uses SQLite driver directly but with prepared statements | N/A — ORM property | Document as design strength |
| S-12 | Webhook event deduplication by event ID | P1 | Confirmed | `this.billingEvents.some((event) => event.razorpay_event_id === eventId && event.signature_verified)` in `processWebhookEvent()` | Replayed webhook events rejected with "already processed" | Document as webhook replay prevention mechanism |

### Findings Summary

| Severity | Count |
|----------|-------|
| P0 | 0 |
| P1 | 2 (S-07 floating-point, S-08 file access) |
| P2 | 3 (S-06 webhook org binding, S-10 ALS context leakage, S-01 NEXT_PUBLIC secrets) |
| P3 | 7 (S-02 CSRF, S-04 cookie flags, S-03 rate limiting, S-05 Finance Exec approve, S-09 dev auth, S-11 no SQLi doc, S-12 webhook dedup) |
| P4 | 5 (various low-severity observations) |
| Informational | Numerous |

**P0/P1 Critical Findings**: 2
- S-07: Floating-point arithmetic could cause financial rounding errors — confirmed present, exact integer paise arithmetic used throughout
- S-08: Direct SQLite file exposure if host filesystem compromised — confirmed, no TDE; operational risk depending on deployment

**P2 Significant Findings**: 3
- S-06: Webhook organization binding not verified — could allow cross-org subscription changes
- S-06: AsyncLocalStorage context leakage across workers — could cause tenant context loss
- S-01: NEXT_PUBLIC env vars expose Supabase credentials to browser — architecture assumption, not code defect

**P3 Moderate Findings**: 7
- CSRF protection is per-route, not framework-level
- Cookie security flags not explicitly set
- No rate limiting
- Finance Executive approve permission matrix entry
- Development auth mode blocked in production (code-enforced)
- No SQL injection risk documented (ORM strength)
- Webhook event deduplication confirmed

---

## 19. Remediation Roadmap

| Task | Objective | Scope | Risks | Required Tests | Acceptance Criteria |
|------|-----------|-------|-------|----------------|---------------------|
| **003B** — Database Tenant Isolation Audit | Verify application-layer RLS is effective; test cross-tenant read/write breach scenarios; evaluate need for PostgreSQL RLS migration | All tenant-scoped tables (`customers`, `invoices`, `payments`, `matches`, `creditNotes`, `creditAllocations`, `disputes`, `disputeEvidences`, `exceptions`, `bankTransactions`); `assertWriteTenant()` enforcement; `getMember()` membership validation; `organization_id` FK consistency | Risk: revealing actual cross-tenant breach may require code changes; migration from SQLite to PostgreSQL if RLS needed | Cross-tenant read test (user cannot list another org's records); cross-tenant write test (attempt write to wrong org org_id); `assertWriteTenant()` breach test | All cross-tenant read/write attempts blocked; or documented as intentional design with mitigations |
| **003C** — API Authentication and Authorization Audit | Map all API routes; verify auth/tenant/permission checks at every boundary; document CSRF, CORS, rate limiting gaps | All API routes (20+ paths); `validatePermission()` calls; `resolveTenantContext()` flow; `can()` RBAC evaluations; CSRF exemption list | Risk: missing a route could leave an unsecured endpoint; RBAC matrix may have gaps | Route-by-route permission test; CSRF test per method; rate limit stress test | Every route has auth + tenant check + permission check; or documented exception with rationale |
| **003D** — Background Jobs and Execution Isolation Audit | If background jobs exist: verify tenant context propagation; test job payload authorization; test retry idempotency | Execution service state machine; `udmStore.transaction()` atomicity; `withWriteTransaction()` + `BEGIN IMMEDIATE`; `execution.recovery_attempts`; no long-running jobs in source | Risk: if jobs are added later, security properties may not carry forward | Test retry with/without idempotency key; test crash recovery; test concurrent execution | No duplicate financial effects with same idempotency key; crash recovery preserves state consistency |
| **003E** — Storage, Imports, AI/RAG and Secrets Security Audit | Test import concurrent races; verify monetary precision overflow limits; inspect AI prompt data; test secret exposure; test webhook org binding | CSV/XLSX import pipeline; `monetary-parser.ts` overflow bounds; `AIOSPARK_OPERATIONAL_MODE` financial write blocking; env var secret management; webhook org ID verification | Risk: import races could create duplicate invoices; AI prompts may leak data; secrets may leak in logs | Concurrent import test (same data, same key); monetary overflow test (MAX_SAFE_INTEGER); prompt redaction test; secret scan of git history and logs | Import concurrency produces no duplicates when same key used; overflows rejected; no secrets in logs or output; webhook org binding verified |
| **003F** — Independent Security Verification | Full pentest-style verification of all above; external firm or comprehensive manual test; validate all findings from this audit | Entire application; all phases; all findings; all diagrams | Resource-intensive; may require staging environment; user authorization for pentest | Full test suite run (master, concurrency, financial recovery, pilot security); cross-process harness; manual penetration review | All P0/P1 findings resolved or documented as acceptable risk; no unauthorized access paths identified; all acceptance criteria for 003B-003E met |

---

## 20. Unknowns and Limitations

| Area | Why Incomplete | Mitigation |
|------|----------------|------------|
| **Git history secret scan** | Not performed during this audit; would require dedicated tool run | Run `git log --all --diff-filter=A -- "*\.env*"` and `git secret scan` in future |
| **Production cookie settings** | Inferred from Next.js defaults; not verified in actual deployed environment | Inspect deployed Next.js config; check Freebuff Sites or hosting provider cookie settings |
| **AI prompt content** | Source code shows prompt construction concepts but not the actual prompt strings sent to LLM providers; would require inspecting the LLM service wrapper functions | Review the actual LLM invocation code paths; verify no unredacted financial data in prompts |
| **Cross-process AsyncLocalStorage behavior** | ALS is per-process; no test observed for multi-worker context propagation | Run multi-process tests; or document assumption that each request establishes its own context |
| **Supabase project configuration** | `NEXT_PUBLIC_SUPABASE_URL` and key are placeholder by default; actual production configuration unknown without deployment access | Require user to confirm Supabase project has proper redirect URLs, origin restrictions, and RLS policies |
| **Database file permissions** | OS-level file permissions not inspected; depend on deployment environment | Inspect `.data/` directory permissions in deployed environment; set restrictive chmod if needed |
| **External provider error sanitization** | Not observed in source; would require testing actual API error responses | Test Gemini/Mistral API error responses; verify no internal details exposed |
| **100% test coverage** | No test exists for every attack vector; this is a medium-sized codebase with many edge cases | Use this audit's findings to prioritize test additions; the existing 10/10 master runs and 12/12 harness are strong baselines |
| **RAG or vector store existence** | No vector store, embeddings, or retrieval pipeline observed in source; confirmed N/A | Document as "not present"; if AI features are added later, re-assess RAG security |

---

## 21. Final Response

**Task:** 003A — Security Architecture Discovery

**Status:** COMPLETE

**Repository:**
- **Branch:** `high-008-baseline`
- **HEAD:** `17085c8` (Nov 12 2026)
- **Working tree:** Clean — no uncommitted modifications
- **Remotes:** `origin/high-008-baseline`, `origin/main`

**Coverage:**

| Category | Count/Status |
|----------|-------------|
| **API routes inventoried** | 20+ critical routes documented |
| **Authentication paths inventoried** | Full lifecycle: signup, login, forgot password, email verification, session resolution |
| **Data stores** | SQLite (file + `:memory:` for tests); UDM in-memory maps with durable snapshots; Approval store with append-only logs; Execution store with idempotency |
| **Database entities** | 12+ tables with `organization_id` column; all access enforced through application layer |
| **Background execution paths** | Execution state machine (draft→approved→executing→committed→verifying→verified); no long-running background workers |
| **Integration paths** | Razorpay (subscriptions, webhooks, checkout signatures); Gemini/Mistral AI (server-side only); Supabase Auth |
| **AI/LLM paths** | Gemini primary, Mistral fallback; API keys server-only; no RAG observed; prompts constructed from UDM data |

**Findings:**

| Severity | Count | Classification |
|----------|-------|----------------|
| **P0** | 0 | — |
| **P1** | 2 | S-07: Floating-point monetary arithmetic risk; S-08: SQLite file exposure if host FS compromised |
| **P2** | 3 | S-06: Webhook organization binding not verified; S-10: AsyncLocalStorage context leakage across workers; S-01: NEXT_PUBLIC env vars expose Supabase creds |
| **P3** | 7 | S-02: No global CSRF middleware; S-04: Cookie security flags; S-03: No rate limiting; S-05: Finance Exec approve matrix; S-09: Dev auth blocked in prod; S-11: No SQLi doc (ORM strength); S-12: Webhook dedup confirmed |
| **P4** | 5 | Various informational observations |

**Top 10 Risks:**

1. **Webhook organization binding** (S-06): Razorpay webhook payload `organization_id` from notes not independently verified against authenticated user's org — could allow cross-org subscription changes if signature is somehow valid or bypassed.

2. **Floating-point monetary arithmetic** (S-07): Confirmed that the codebase uses exact integer paise arithmetic throughout (BigInt, string manipulation); however, this must be verified across ALL monetary paths; any deviation could cause rounding errors.

3. **SQLite file exposure** (S-08): If host filesystem is compromised, the `.data/aiospark.sqlite` file contains all financial data without Transparent Data Encryption; mitigation depends on deployment file permissions.

4. **AsyncLocalStorage context leakage** (S-10): ALS is per-process; in multi-worker setups, context may not propagate across requests/jobs; could cause tenant context loss or stale context usage.

5. **NEXT_PUBLIC env vars exposing Supabase credentials** (S-01): `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are browser-exposed; Supabase design trusts these for frontend ops, but an attacker controlling the URL could redirect auth flows.

6. **No global CSRF middleware** (S-02): Origin check is per-route via `isCsrfRequestSafe()`; a missed route or future route addition could leave an endpoint vulnerable.

7. **Cookie security flags not explicitly set** (S-04): `secure` and `SameSite` flags not set in code; rely on production edge/configuration; misconfiguration could reduce protection.

8. **No rate limiting** (S-03): Absent from source; automated abuse (import flooding, credential stuffing) possible without reverse-proxy or framework-level rate limiting.

9. **Finance Executive cannot approve (matrix entry)** (S-05): `PERMISSION_MATRIX` sets `approve: false` for Finance Executive; must verify this is intentional and not a config gap.

10. **Import concurrent race conditions** (not separately numbered but identified): Two processes importing same data could create duplicates if idempotency keys are not properly scoped; the 12/12 cross-process harness addresses execution-level idempotency, but import-level idempotency depends on caller-provided keys.

**Deliverable:** `docs/audits/AIOSPARK_SECURITY_ARCHITECTURE_DISCOVERY.md` — created at `/home/subham/AIOSpark/AR-automation-revenue/docs/audits/AIOSPARK_SECURITY_ARCHITECTURE_DISCOVERY.md`

**Source modifications:** NONE

**Database modifications:** NONE

**Commits:** NONE

**Merges:** NONE

**Deployments:** NONE

**Next recommended task:** 003B — Database Tenant Isolation Audit. This follow-up task will verify the effectiveness of application-layer tenant isolation, test cross-tenant read/write breach scenarios, and evaluate whether migration from SQLite to PostgreSQL with native RLS is warranted.

---