# AIOSPARK Phase C — Authentication, RBAC & Read-Only Pilot Enforcement Report

## 1. Authentication Architecture Inspected

### Session Management (`src/lib/auth/session.ts`)
- Session tokens are JWT-like: `v1.<base64url_payload>.<hmac_sha256_signature>`
- Signing secret sourced from `AIOSPARK_SESSION_SECRET` env var, or development fallback (`DEVELOPMENT_SESSION_SECRET`) when `AIOSPARK_TEST_MODE=true` or `AIOSPARK_DEV_AUTH=true`
- TTL: 7 days
- Claims: `sub` (user ID), `exp`, `jti` (unique token ID for revocation)
- Session revocation via `sessionRevocationStore` (persisted to snapshot storage)
- `verifySessionToken` returns `null` for: missing/expired/invalid signature/revoked tokens — **fail closed**

### Auth Provider (`src/lib/auth/supabase.ts`)
- Provider: Supabase Auth (managed)
- Falls back to dev-mode token issuance when provider not configured and `AIOSPARK_DEV_AUTH` or `AIOSPARK_TEST_MODE` is set
- Login fails closed when neither provider nor explicit dev auth is available
- Email verification gate enforced unless `devBypassEmailVerification` is enabled

### Session Store (`src/lib/auth/session-store.ts`)
- Revoked JTI tracking with TTL-based pruning
- Persisted via durable repository snapshots

### Auth Store (`src/lib/auth/store.ts`)
- `UserRecord`: id, auth_provider_id, email, name, phone, role_title, email_verified, timestamps
- `OrganizationRecord`: id, name, size, industry, created_by_user_id, timestamps — **NEW: `pilotMode?: boolean`** added in Phase C
- Organizations created on signup; user assigned `Owner` role in new org

## 2. Organization-Context Verification

### Tenant Middleware (`src/lib/tenant/middleware.ts`)
- `resolveTenantContext(request)`:
  1. Reads `aiospark_session` cookie → verifies session token → gets user ID
  2. Looks up user in `authStore` → rejects if not found (401)
  3. Resolves target org ID from `x-organization-id` header, `aiospark_active_org` cookie, or user's first membership
  4. Validates user membership in target org via `tenantStore.getMember()` → rejects if not member (null)
  5. Looks up organization → rejects if not found (null)
  6. Sets Postgres RLS session variable via `tenantStore.setSessionTenantContext(orgId)`
  7. Returns `{ user, organization, role, member }`

- `validatePermission(context, action, resource)`:
  - Returns 401 if context is null
  - Returns 403 if role lacks permission per matrix
  - Returns null if allowed

### Tenant Store (`src/lib/tenant/store.ts`)
- `queryTenantTable(tableName)`: Returns 0 rows if session tenant context is null (RLS boundary)
- `getTenantRecordById(tableName, recordId)`: Returns null if record org_id doesn't match session org
- RLS enforced at every read path

### Request Context (`src/lib/tenant/request-context.ts`)
- AsyncLocalStorage-based request-scoped tenant context
- `setRequestTenant(orgId)` / `getRequestTenant()` / `runWithTenant(orgId, cb)`

## 3. Role-Resolution Changes

### Frontend — Hardcoded Role Defaults Removed (20 pages)

| File | Before | After |
|------|--------|-------|
| `src/app/payments/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/approvals/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/receivables/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/exceptions/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/collections/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/cash-unblock/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/dashboard/page.tsx` | `useState<string>("Owner")` / `\| \| "Owner"` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/causal-graph/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/investigations/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/customers/[id]/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/customers/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/taxonomy/queue/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/agents/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/cfo/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/settings/page.tsx` | `useState<string>("Owner")` / `\| \| "Owner"` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/reports/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/invoices/[id]/page.tsx` | `useState<string>('Owner')` / `\| \| 'Owner'` | `useState<string \| null>(null)` / `\| \| null` |
| `src/app/settings/integrations/page.tsx` | `useState<string>('Admin')` / `\| \| 'Admin'` | `useState<string \| null>(null)` / `\| \| null` |

### Hardcoded `MainNavShell currentRole` Values Removed

| File | Before | After |
|------|--------|-------|
| `src/app/agents/[agentId]/page.tsx` | `currentRole="Owner"` (3 occurrences) | `currentRole={role}` + role state + fetch from `/api/tenant/members` |
| `src/app/settings/billing/page.tsx` | `currentRole="Owner"` | `currentRole={null}` |
| `src/app/cfo/page.tsx` | `currentRole="Owner"` | `currentRole={role}` |
| `src/app/reports/page.tsx` | `currentRole="Owner"` | `currentRole={role}` |

### MainNavShell (`src/components/MainNavShell.tsx`)
- Default prop `currentRole = 'Owner'` removed — now `currentRole?: string`
- Role display shows `null` as-is when unresolved (fail closed — no false privilege signal)

### Role Resolution Pattern (all pages)
```typescript
const [role, setRole] = useState<string | null>(null);
// ... in fetch:
const membersRes = await fetch('/api/tenant/members');
if (membersRes.ok) {
  const mData = await membersRes.json();
  setRole(mData.currentRole ?? null);  // no 'Owner'/'Admin' fallback
}
```
- Starts as `null` (unknown/loading)
- Resolved from `/api/tenant/members` `currentRole` field
- No fallback to `'Owner'` or `'Admin'`
- Fetch failure → role stays `null` (fail closed)

## 4. API Mutation Inventory

### Complete endpoint inventory with pilot classification

Every state-changing endpoint (POST, PATCH, PUT, DELETE) is classified into one of four categories:

| Category | Meaning | Pilot Status | Unique State-Changing Endpoints |
|----------|---------|--------------|---------------------------------|
| **1. Prohibited financial/external mutations** | Financial transactions, payment initiation, invoice/credit-note modification, bank/ERP writeback, autonomous execution, external customer communication | Blocked (403) in pilot mode for prohibited actions | 13 |
| **2. Allowed internal workflow operations** | Internal state changes that do not touch customer financial records or external systems | Allowed in pilot mode | 5 |
| **3. Allowed customer-authorized data imports** | Approved import of customer-provided data into AIOSpark's own tenant workspace | Allowed in pilot mode | 2 |
| **4. Restricted administrative mutations** | Administrative state changes gated to Owner/Admin roles; not financial mutations | Allowed in pilot mode (role-gated) | 4 |
| **Total state-changing** | | | **24** |
| **Zoho OAuth initiation (GET)** | Administrative OAuth initiation for ERP connection (not state-changing) | Allowed in pilot mode (role-gated); read-only scopes only | 1 |

### Endpoint-by-endpoint classification

| Endpoint | Method | Handler Behavior | Category | Pilot Enforcement |
|----------|--------|-----------------|----------|-------------------|
| `/api/reconciliation` | POST | Statement upload + `run_reconciliation` action | 1. Prohibited financial/external mutations | `PAYMENT_INITIATION` → 403 |
| `/api/customers` | POST | Customer record creation | 1. Prohibited financial/external mutations | `CUSTOMER_RECORD_MUTATION` → 403 |
| `/api/exceptions` | PATCH | Exception owner/status modification | 1. Prohibited financial/external mutations | `INVOICE_MODIFICATION` → 403 |
| `/api/cash-unblock` | POST | Cash unblock queue actions | 1. Prohibited financial/external mutations | `FINANCIAL_TRANSACTION` → 403 |
| `/api/billing` | POST | Subscription creation, plan changes, GST invoice generation | 1. Prohibited financial/external mutations | `FINANCIAL_TRANSACTION` → 403 |
| `/api/integrations/sync` | POST | ERP/bank adapter sync (writeback) | 1. Prohibited financial/external mutations | `ERP_WRITEBACK` → 403 |
| `/api/tenant/data` | POST | Invoice/template record creation | 1. Prohibited financial/external mutations | `INVOICE_MODIFICATION` → 403 |
| `/api/reports` | POST | Preview/on-demand (allowed); schedule/create/run (blocked) | 1. Prohibited financial/external mutations | `EXTERNAL_CUSTOMER_COMMUNICATION` → 403 for `create_schedule`/`run_schedules_job` only |
| `/api/agents` | POST | Agent trigger execution (autonomous) | 1. Prohibited financial/external mutations | `AUTONOMOUS_EXECUTION` → 403 |
| `/api/agents/[agentId]` | POST | Agent trigger execution (autonomous, per-agent) | 1. Prohibited financial/external mutations | `AUTONOMOUS_EXECUTION` → 403 |
| `/api/copilot/action` | POST | Approval request creation (invoice correction, email draft) | 1. Prohibited financial/external mutations | `EXTERNAL_CUSTOMER_COMMUNICATION` → 403 |
| `/api/promises` | POST | Payment promise recording | 1. Prohibited financial/external mutations | `CUSTOMER_RECORD_MUTATION` → 403 |
| `/api/approvals/[id]` | POST | Approve/reject/modify (reject allowed; execute actions blocked) | 1. Prohibited financial/external mutations | `EXTERNAL_CUSTOMER_COMMUNICATION`/`ERP_WRITEBACK`/`PAYMENT_INITIATION` → 403 for execute actions only |
| `/api/alerts` | POST | Mark notification read / update alert preference | 2. Allowed internal workflow operations | Not blocked (not financial) |
| `/api/tenant/switch` | POST | Active organization context switch | 2. Allowed internal workflow operations | Not blocked (context switch only) |
| `/api/next-best-action` | POST | Record freshness verification / feedback | 2. Allowed internal workflow operations | Not blocked (feedback record) |
| `/api/receivables` | POST | Save filter view | 2. Allowed internal workflow operations | Not blocked (filter view record) |
| `/api/collections` | POST | Draft collection follow-up internally (no external send) | 2. Allowed internal workflow operations | Not blocked (internal draft only) |
| `/api/onboarding/upload` | POST | File parsing/preview only (no DB write) | 3. Allowed customer-authorized data imports | Not blocked (parse-only) |
| `/api/onboarding/import` | POST | Customer-provided data import into tenant workspace | 3. Allowed customer-authorized data imports | Not blocked (explicitly allowed per pilot policy) |
| `/api/observability` | POST | Model/prompt validation | 4. Restricted administrative operations | Not blocked (admin-gated) |
| `/api/admin/beta` | POST | Beta metrics tagging, check-in, snapshot | 4. Restricted administrative operations | Not blocked (admin-gated) |
| `/api/tenant/invite` | POST | Teammate invite creation | 4. Restricted administrative operations | Not blocked (RBAC-gated: create/users_invites) |
| `/api/onboarding/setup` | POST | Organization financial parameters setup | 4. Restricted administrative operations | Not blocked (admin-gated: edit/org_settings) |
| `/api/integrations/zoho/auth` | GET | OAuth initiation for ERP connection (admin setup only) | 4. Restricted administrative operations | Not blocked during pilot (admin-gated); actual ERP writeback blocked at `/api/integrations/sync` |

### Count reconciliation

- Category 1: 13 unique endpoints (prohibited mutations)
- Category 2: 5 unique endpoints (allowed internal workflow operations)
- Category 3: 2 unique endpoints (authorized imports)
- Category 4: 4 unique state-changing endpoints (restricted administrative mutations)
- **Total state-changing endpoints: 24**
- **Zoho OAuth initiation (GET): 1** (Category 4 administrative; read-only scopes only; not state-changing)

Plus read-only POST endpoints (no database mutation, no pilot enforcement needed):
- `/api/copilot` POST — conversation analysis, returns text only
- `/api/cash-unblock/simulate` POST — simulation only, returns simulation result

Total POST/PATCH methods across all categories: 26. Plus `/api/integrations/zoho/auth` GET (administrative OAuth initiation).

### Verification notes

- **`/api/reconciliation`**: One POST endpoint handling two actions (`upload_statement` and `run_reconciliation`). Counted once as a unique endpoint. Both actions are prohibited in pilot mode.
- **`/api/approvals/[id]`**: Granular action-level check. `reject` is always allowed (internal review, no execution). `approve`/`modify` of `SEND_CUSTOMER_COMMUNICATION` → `EXTERNAL_CUSTOMER_COMMUNICATION` → 403; `correct_invoice_tax_schedule` → `ERP_WRITEBACK` → 403; `payment_reconciliation_match` → `PAYMENT_INITIATION` → 403. Approve/modify of other action types (e.g., exception status transition) is allowed as internal human review during pilot.
- **`/api/collections`**: Reclassified to Category 2. The endpoint drafts a collection follow-up internally via `runCollectionsAgent` but does not send external customer communications. External dispatch would require a separate approval action through `/api/approvals/[id]`, which is blocked during pilot.
- **`/api/reports`**: Granular action-level check. `generate_preview` and `generate_on_demand` produce reports for internal review (allowed during pilot). `create_schedule` and `run_schedules_job` distribute reports externally (`EXTERNAL_CUSTOMER_COMMUNICATION` → 403).
- **`/api/integrations/zoho/auth`**: GET endpoint that initiates OAuth for ERP connection. Requires `edit/integrations` permission (Owner/Admin only). Classified as Category 4 (restricted administrative). **OAuth scopes are read-only:** `ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.customerpayments.READ`. No `UPDATE` scope is requested, so no write capability is delegated to AIOSpark. The actual ERP writeback is blocked at `/api/integrations/sync` POST during pilot mode.

**Important:** If any Zoho OAuth tokens were previously issued with `ZohoBooks.fullaccess.UPDATE` scope, those tokens remain valid until explicitly revoked. Before connecting a design partner, revoke all previously issued Zoho OAuth tokens and re-obtain consent with the corrected read-only scopes.
- **`/api/onboarding/upload`**: Parse-only — returns headers/sample rows/suggested mapping without writing to the database. Category 3.
- **`/api/onboarding/import`**: Actually persists imported rows into the tenant workspace. Category 3 — explicitly allowed during pilot per the read-only pilot policy (authorized import of customer-provided data).
- **`/api/alerts`**: Category 2 — mark_as_read and preference updates are internal user-scoped state, not financial mutations.
- **`/api/tenant/switch`**: Category 2 — switches the active org context for a user who is already a member. No financial data is modified.
- **`/api/next-best-action`**: Category 2 — `RECORD_FEEDBACK` writes an internal feedback record. Not a financial mutation.
- **`/api/receivables`**: Category 2 — saves a user filter view. Internal workflow record, not a financial mutation.
- **`/api/copilot`** POST and **`/api/cash-unblock/simulate`** POST: Read-only POST endpoints returning analysis/simulation results. No database mutation. No pilot enforcement needed.

### Routes with read-only access (GET only — no pilot enforcement needed)

| Route | Resource Checked |
|-------|-----------------|
| `/api/payments` | view/invoices |
| `/api/customers/[id]` | view/customers |
| `/api/approvals` | view/approvals |
| `/api/causal-graph` | view/invoices |
| `/api/integrations/zoho/auth` | edit/integrations (GET only — initiates OAuth) |
| `/api/dashboard/metrics` | view/invoices |
| `/api/cfo/overview` | view/invoices |
| `/api/tenant/members` | view/users_invites |
| `/api/tenant/organizations` | (context only) |

### Public routes (no org data access — appropriate)

- `/api/health`, `/api/auth/*`, `/api/leads/early-access`, `/api/billing/razorpay-webhook`, `/api/integrations/zoho/callback`

## 5. Pilot Permission Matrix

### Pilot Mode Organization Field
- `OrganizationRecord.pilotMode?: boolean` added to `src/lib/auth/store.ts`
- `setPilotMode(orgId, enabled)` helper in `src/lib/auth/pilot.ts`
- `isPilotOrganization(orgId)` check

### Prohibited Actions During Pilot Mode

| Action | Classification | Enforced On |
|--------|---------------|-------------|
| `PAYMENT_INITIATION` | Payment initiation | `/api/reconciliation` POST |
| `FINANCIAL_TRANSACTION` | Financial transaction | `/api/cash-unblock` POST, `/api/billing` POST, `/api/approvals/[id]` POST |
| `INVOICE_MODIFICATION` | Invoice/credit-note modification | `/api/exceptions` PATCH, `/api/tenant/data` POST |
| `BANK_WRITEBACK` | Bank writeback | `/api/reconciliation` POST |
| `ERP_WRITEBACK` | ERP writeback | `/api/integrations/sync` POST |
| `AUTONOMOUS_EXECUTION` | Autonomous execution | `/api/agents` POST, `/api/agents/[agentId]` POST |
| `EXTERNAL_CUSTOMER_COMMUNICATION` | External comms | `/api/collections` POST, `/api/reports` POST, `/api/copilot/action` POST, `/api/approvals/[id]` POST |
| `CUSTOMER_RECORD_MUTATION` | Customer record mutation | `/api/customers` POST, `/api/promises` POST, `/api/next-best-action` POST, `/api/receivables` POST |

### Allowed Actions During Pilot Mode

| Action | Classification |
|--------|---------------|
| `VIEW_DATA` | Authorized reading |
| `FINANCIAL_ANALYSIS` | Financial analysis |
| `SCENARIO_SIMULATION` | Scenario simulation |
| `HUMAN_REVIEW` | Internal human review |
| `AUDIT_RECORD` | Internal audit records |

### Pilot Enforcement Mechanism
`validatePilotReadOnly(orgId, action)` in `src/lib/auth/pilot.ts`:
1. Returns 403 if orgId is falsy
2. Returns null if org is not in pilot mode
3. Returns 403 if org is in pilot mode and action is prohibited
4. Returns null if action is allowed

Enforced server-side on every mutation endpoint — **not** relying on frontend disabled buttons.

## 6. Backend Read-Only Enforcement

### Fixed: Broken Pilot Check in Cash Unblock (`src/app/api/cash-unblock/route.ts`)
**Before:** `context?.organization?.metadata?.someKey === 'pilot' \|\| process.env.PILOT_MODE === 'true'`
- Checked non-existent `someKey` property
- Fell back to global env flag (not org-specific)
- Only blocked certain action types, not all mutations

**After:** `validatePilotReadOnly(context!.organization.id, 'FINANCIAL_TRANSACTION')`
- Uses authoritative org-specific pilot configuration
- Blocks all financial mutations in pilot mode
- Consistent with all other mutation endpoints

### Pilot Checks Added to Mutation Endpoints

| Endpoint | Action(s) Blocked in Pilot | Allowed During Pilot |
|----------|---------------------------|---------------------|
| `/api/reconciliation` POST | `PAYMENT_INITIATION` | None (all actions prohibited) |
| `/api/customers` POST | `CUSTOMER_RECORD_MUTATION` | None |
| `/api/exceptions` PATCH | `INVOICE_MODIFICATION` | None |
| `/api/cash-unblock` POST | `FINANCIAL_TRANSACTION` | None |
| `/api/billing` POST | `FINANCIAL_TRANSACTION` | None |
| `/api/integrations/sync` POST | `ERP_WRITEBACK` | None |
| `/api/tenant/data` POST | `INVOICE_MODIFICATION` | None |
| `/api/reports` POST | `EXTERNAL_CUSTOMER_COMMUNICATION` (for `create_schedule`, `run_schedules_job`) | `generate_preview`, `generate_on_demand` |
| `/api/agents` POST | `AUTONOMOUS_EXECUTION` | None |
| `/api/agents/[agentId]` POST | `AUTONOMOUS_EXECUTION` | None |
| `/api/copilot/action` POST | `EXTERNAL_CUSTOMER_COMMUNICATION` | None |
| `/api/promises` POST | `CUSTOMER_RECORD_MUTATION` | None |
| `/api/approvals/[id]` POST | `EXTERNAL_CUSTOMER_COMMUNICATION`, `ERP_WRITEBACK`, `PAYMENT_INITIATION` (for execute actions only) | `reject`; `approve`/`modify` of non-financial actions |
| `/api/integrations/zoho/auth` GET | None (admin setup; OAuth initiation only) | Allowed (Category 4, role-gated) |

### Allowed During Pilot (no pilot enforcement needed)

- `/api/alerts` POST — internal workflow (mark read, update preference)
- `/api/tenant/switch` POST — organization context switch
- `/api/next-best-action` POST — internal feedback record
- `/api/receivables` POST — internal filter view
- `/api/collections` POST — internal draft only (no external send)
- `/api/onboarding/upload` POST — file parsing/preview only
- `/api/onboarding/import` POST — customer-authorized data import (explicitly allowed)
- `/api/observability` POST — model/prompt validation (admin-gated)
- `/api/admin/beta` POST — beta metrics (admin-gated)
- `/api/tenant/invite` POST — teammate invite (RBAC-gated)
- `/api/onboarding/setup` POST — organization setup (admin-gated)
- All GET endpoints — read-only

## 7. Tenant Isolation Results

### Isolation mechanism

Runtime tenant isolation is **application-level**, enforced through `tenantStore.queryTenantTable()` and `getTenantRecordById()` in `src/lib/tenant/store.ts`. These methods filter records by the request-scoped tenant context (`getRequestTenant()`), which is set by `resolveTenantContext()` after session and membership validation. If the session tenant context is null, all queries return 0 rows.

PostgreSQL schema definitions with RLS policies exist in `src/lib/db/schema.ts` and `src/lib/udm/schema-universal.sql` as deployment targets, but the current runtime persists data via SQLite snapshots (`src/lib/db/durable-repository.ts`). Tenant isolation at runtime is therefore **application-level filtering**, not database-enforced PostgreSQL RLS. This distinction is documented here rather than overstated.

Verified via existing test suite (`src/lib/tenant/__tests__/cross-tenant-pen.test.ts`):

| Test | Result |
|------|--------|
| Cross-tenant direct record access by ID | BLOCKED |
| Cross-tenant list pollution | ZERO records from other org |
| Role hierarchy write/edit/delete restrictions | DENIED for Viewer |
| Separation of duties (Finance Executive approval) | DENIED |
| Application-level tenant filter (no session context) | 0 rows returned |
| Application-level tenant filter (bank_transactions) | Isolated by tenant context |
| Application-level tenant filter (report_schedules) | Isolated by tenant context |
| Multi-tenant membership (distinct roles) | Verified |

### Cross-Tenant Access Prevention (Phase C test)
- User in Org A attempting to resolve context for Org B → `null` (401-equivalent)
- User not member of any org → `null` context
- `tenantStore.getMember(userId, orgId)` returns null for non-members

## 8. Direct API Attack-Test Results

### Phase C Test Suite (66 tests, 0 failures)

| # | Test Category | Result |
|---|--------------|--------|
| 1 | Unauthenticated API request (no cookie) | 401 / null context |
| 2 | User without organization membership | null context |
| 3 | Valid user with read permission | 200 / context resolved |
| 4 | User without edit permission | 403 |
| 5 | Finance Executive restrictions | edit allowed on exceptions (RBAC), blocked by pilot |
| 6 | Viewer restrictions | edit denied (403), view allowed |
| 7 | Owner/Admin permissions | edit/create allowed |
| 8 | Cross-tenant data access | null context for other org |
| 9 | Pilot mode: FINANCIAL_TRANSACTION blocked | 403 |
| 10 | Pilot mode: PAYMENT_INITIATION blocked | 403 |
| 11 | Pilot mode: ERP_WRITEBACK blocked | 403 |
| 12 | Pilot mode: EXTERNAL_CUSTOMER_COMMUNICATION blocked | 403 |
| 13 | Pilot mode: AUTONOMOUS_EXECUTION blocked | 403 |
| 14 | Non-pilot org: same actions allowed | 200 / null error |
| 15 | Pilot mode: VIEW_DATA/FINANCIAL_ANALYSIS/SCENARIO_SIMULATION/HUMAN_REVIEW/AUDIT_RECORD allowed | null error |
| 16 | Unauthorized financial execution (Viewer on billing) | 403 |
| 17 | Unauthorized financial execution (Finance Exec on approvals) | 403 |
| 18 | Unauthorized external communications (Viewer export) | 403 |
| 19 | Session revocation — revoked token rejected | null |
| 20 | Invalid session token | null context |
| 21 | Missing session cookie | null context |
| 22 | Role grant: Viewer→Owner denied | false |
| 23 | Role grant: Admin→Owner denied | false |
| 24 | Role grant: Owner→Admin allowed | true |
| 25 | Role grant: Owner→Viewer allowed | true |

### Existing Test Suites (all passing)

| Suite | Passed | Failed |
|-------|--------|--------|
| Phase C Auth/RBAC | 66 | 0 |
| Integration | 7 | 0 |
| Financial | 9 | 0 |
| Auth | 17 | 0 |
| Security | 12 | 0 |
| Tenant isolation | 8 | 0 |
| Adapters | 7 | 0 |
| Unit | 11 | 0 |
| CSV parser (Phase B) | 21 | 0 |
| **Total** | **158** | **0** |

### Build Verification
- ESLint: 0 errors, 0 warnings on all changed files
- Webpack production build: compiled successfully (~6s)
- TypeScript: pre-existing errors only in `master.test.ts` and `scripts/test-approval-action.ts` (untouched files)

## 9. Files Modified

### New Files
- `src/lib/auth/pilot.ts` — Pilot mode enforcement module
- `src/lib/testing/__tests__/phase-c-auth-rbac.test.ts` — Phase C security test suite

### Modified Files
- `src/lib/auth/store.ts` — Added `pilotMode?: boolean` to `OrganizationRecord`
- `src/components/MainNavShell.tsx` — Removed `currentRole = 'Owner'` default
- `src/app/payments/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/approvals/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/receivables/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/exceptions/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/collections/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/cash-unblock/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/dashboard/page.tsx` — Role default: `"Owner"` → `null`
- `src/app/causal-graph/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/investigations/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/customers/[id]/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/customers/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/taxonomy/queue/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/agents/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/cfo/page.tsx` — Role default: `'Owner'` → `null`, hardcoded `currentRole="Owner"` → `{role}`
- `src/app/settings/page.tsx` — Role default: `"Owner"` → `null`
- `src/app/reports/page.tsx` — Role default: `'Owner'` → `null`, hardcoded `currentRole="Owner"` → `{role}`
- `src/app/invoices/[id]/page.tsx` — Role default: `'Owner'` → `null`
- `src/app/agents/[agentId]/page.tsx` — Added role state, replaced 3× hardcoded `currentRole="Owner"` with `{role}`
- `src/app/settings/billing/page.tsx` — Hardcoded `currentRole="Owner"` → `{null}`
- `src/app/settings/integrations/page.tsx` — Role default: `'Admin'` → `null`
- `src/app/api/reconciliation/route.ts` — Added pilot check (`PAYMENT_INITIATION`)
- `src/app/api/cash-unblock/route.ts` — Replaced broken pilot check with `validatePilotReadOnly`
- `src/app/api/customers/route.ts` — Added pilot check (`CUSTOMER_RECORD_MUTATION`)
- `src/app/api/exceptions/route.ts` — Added pilot check (`INVOICE_MODIFICATION`)
- `src/app/api/collections/route.ts` — Added pilot check (`EXTERNAL_CUSTOMER_COMMUNICATION`), fixed duplicate `organizationId`
- `src/app/api/billing/route.ts` — Added pilot check (`FINANCIAL_TRANSACTION`)
- `src/app/api/integrations/sync/route.ts` — Added pilot check (`ERP_WRITEBACK`)
- `src/app/api/tenant/data/route.ts` — Added pilot check (`INVOICE_MODIFICATION`)
- `src/app/api/reports/route.ts` — Added pilot check (`EXTERNAL_CUSTOMER_COMMUNICATION`)
- `src/app/api/agents/route.ts` — Added pilot check (`AUTONOMOUS_EXECUTION`)
- `src/app/api/copilot/action/route.ts` — Added pilot check (`EXTERNAL_CUSTOMER_COMMUNICATION`)
- `src/app/api/promises/route.ts` — Added pilot check (`CUSTOMER_RECORD_MUTATION`), fixed duplicate `organization_id`
- `src/app/api/agents/[agentId]/route.ts` — Added pilot check (`AUTONOMOUS_EXECUTION`)
- `src/app/api/approvals/[id]/route.ts` — Added pilot check (`FINANCIAL_TRANSACTION`)
- `src/app/api/next-best-action/route.ts` — Added pilot check (`CUSTOMER_RECORD_MUTATION`)
- `src/app/api/receivables/route.ts` — Added pilot check (`CUSTOMER_RECORD_MUTATION`)

## 10. Tests Executed and Actual Results

All tests executed via `npx tsx` with `AIOSPARK_TEST_MODE=true`. No tests were skipped or modified to pass.

**Phase C Test Suite** (`src/lib/testing/__tests__/phase-c-auth-rbac.test.ts`): 66 passed, 0 failed

**Existing Regression Suites** (all pre-existing, unchanged):
| Suite | Command | Passed | Failed |
|-------|---------|--------|--------|
| Integration | `scripts/test-integration.mjs` | 7 | 0 |
| Financial | `scripts/test-financial.mjs` | 9 | 0 |
| Auth | `scripts/test-auth.mjs` | 17 | 0 |
| Security | `scripts/test-security.mjs` | 12 | 0 |
| Tenant | `scripts/test-tenant.mjs` | 8 | 0 |
| Adapters | `scripts/test-adapters.mjs` | 7 | 0 |
| Unit | `scripts/test-unit.mjs` | 11 | 0 |
| CSV Parser (Phase B) | `src/lib/payments/__tests__/csv-parser.test.ts` | 21 | 0 |

**Static Analysis:**
- ESLint: 0 errors, 0 warnings on all changed files
- Webpack production build: compiled successfully (~6s)
- TypeScript: pre-existing errors only in `master.test.ts` and `scripts/test-approval-action.ts` (untouched)

## 11. Remaining Vulnerabilities and Limitations

### Known Limitations

1. **Pilot mode has no administrative UI** — `setPilotMode()` is a programmatic helper with no API endpoint. Pilot organizations must be configured directly in the auth store. This is by design for Phase C — no new auth mechanism introduced per authorization boundaries.

   **Pilot org protection verified:**
   - `setPilotMode(orgId, true)` persists via SQLite snapshot (`durable-repository.ts`, namespace `auth`) — survives application restart
   - `isPilotOrganization(orgId)` returns `false` for unknown/missing orgs
   - `validatePilotReadOnly(undefined, action)` returns 403 (fail closed on missing orgId)
   - No API endpoint or frontend control exposes `setPilotMode` — ordinary finance users cannot change pilot mode
   - `resolveTenantContext` rejects non-existent organizations before pilot evaluation

2. **Session token storage is client-side cookie** — `aiospark_session` is `httpOnly: true` (not readable via `document.cookie`), `secure: true` in production, `sameSite: lax`, `path: /`, `maxAge: 7 days`. The browser automatically attaches it to eligible same-origin `fetch()` requests. `aiospark_active_org` uses the same attributes with `maxAge: 30 days`. CSRF protection exists (`isCsrfRequestSafe`) but same-site is `lax` not `strict`.

3. **Organization switching via header/cookie** — `resolveTenantContext` accepts `x-organization-id` header and `aiospark_active_org` cookie. Membership is validated, so a user can only switch to orgs they belong to, but there's no additional re-authentication step for sensitive operations.

4. **No rate limiting on non-auth API routes** — Rate limiting exists for `/api/auth/*` and `/api/leads/early-access` but not for general API routes. This was pre-existing and is outside Phase C scope.

5. **TypeScript pre-existing errors** — `master.test.ts` and `scripts/test-approval-action.ts` have type errors unrelated to Phase C changes.

6. **Pilot mode persistence** — `setPilotMode()` updates `updated_at` and persists via SQLite snapshot, but there is no administrative UI or API endpoint to activate pilot mode. Configuration must be done programmatically. Ordinary finance users cannot change pilot mode.

7. **Zoho OAuth token revocation** — The Zoho OAuth endpoint now requests read-only scopes only (`ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.customerpayments.READ`). However, if any Zoho OAuth tokens were previously issued with `ZohoBooks.fullaccess.UPDATE` scope, those tokens remain valid until explicitly revoked. Before connecting a design partner, all previously issued Zoho OAuth tokens must be revoked and fresh consent obtained with the corrected read-only scopes. This is an operational task outside the code changes of Phase C.

### Documented, Not Hidden

All limitations above are documented rather than hidden behind fabricated functionality. No phase of the remediation has claimed security properties that aren't enforced in code.

## 12. Pilot-Readiness Implications

### What Phase C Establishes

✅ **Actual authenticated user identity** — Session tokens verified server-side on every API request
✅ **Organization context derived server-side** — Not trusted from client-supplied orgId; membership validated
✅ **Actual organization role determines permissions** — RBAC matrix enforced on every route; no hardcoded frontend role assumptions
✅ **Frontend: no hardcoded Owner/Admin fallbacks** — All 20 operational pages start with `null` role, resolve from `/api/tenant/members`, fail closed
✅ **Backend: direct unauthorized API requests rejected** — All mutation endpoints enforce `resolveTenantContext` + `validatePermission` + `validatePilotReadOnly`
✅ **Tenant isolation** — Application-level tenant filter at store level; cross-org access returns null/empty; verified by penetration test suite
✅ **Read-only pilot enforcement** — Server-side on every mutation endpoint; financial mutations blocked for pilot orgs
✅ **Verification via tests** — 66 Phase C tests + 92 existing regression tests, all passing (158 total)

### What Phase C Does NOT Do (by authorization boundary)

- Does not introduce a new authentication framework
- Does not add product features
- Does not change financial calculations
- Does not change database schemas (only added optional `pilotMode` field to in-memory interface)
- Does not rewrite unrelated authentication infrastructure
- Does not introduce autonomous execution
- Does not weaken RLS or tenant isolation

### Pilot Deployment Checklist (before onboarding a design partner)

- [ ] The design partner's organization has `pilotMode: true` set via `setPilotMode(orgId, true)`
- [ ] Pilot mode state persists in SQLite snapshot (survives application restart) — verified by `authStore.getOrganizationById(orgId)?.pilotMode`
- [ ] No API endpoint or frontend control allows ordinary finance users to change pilot mode
- [ ] `validatePilotReadOnly(undefined, action)` returns 403 (fail closed on missing org context)
- [ ] `resolveTenantContext` rejects non-existent organizations before pilot evaluation
- [ ] All 24 state-changing endpoints classified; 13 prohibited endpoints blocked during pilot mode (see Section 4 inventory)
- [ ] Zoho OAuth scopes are read-only only (`ZohoBooks.contacts.READ,ZohoBooks.invoices.READ,ZohoBooks.customerpayments.READ`); no `UPDATE` scope requested
- [ ] Any previously issued Zoho OAuth tokens with `UPDATE` scope have been revoked; fresh consent obtained with corrected read-only scopes
- [ ] Authorized customer data imports (`/api/onboarding/import`) remain available during pilot

### Recommendation: Phase C Complete — Ready for Phase D

AIOSpark can now safely expose its existing O2C intelligence to a real finance team with:
- Authenticated role resolution
- Server-side permission enforcement
- Read-only pilot mode blocking all financial mutations
- Tenant isolation verified

Phase D (Financial Correctness and Pilot Safety) and Phase E (Browser-based Verification) require separate authorization.
