# 004C-A — Repository Audit

## Objective

Audit the AIOSpark AR Automation Revenue repository on branch `high-008-baseline` to identify all SafetyMiddleware idempotency and duplicate-execution paths, ReportSchedulerStore persistence mechanisms, PromiseCheckJob claim logic, and existing database/transaction patterns. This is a design-audit task only — no production code modifications.

---

## Phase 1 — Key Findings

### 1. SafetyMiddleware Idempotency

**File**: `src/lib/agents/safety-middleware.ts`

**Previous implementation** (original, pre-004C):
- `private recentActionHashes: Map<string, number> = new Map()` — process-local Map
- `checkDoubleExecution()`: 5-second in-memory window, keys: `org:agent:entity:id:action`
- `clearDeduplicationCache()`: clears in-memory Map only
- **Risk**: Process-local only. No cross-instance protection. Two Vercel instances would not see each other's records.

**Current implementation** (after 004C first commit):
- Idempotency tracker uses durable SQLite storage (namespace: `'safety:double_execution'`)
- `checkDoubleExecution()`: reads/writes to SQLite snapshot via `getDatabase()` / `writeSnapshot()`
- Idempotency window: **24 hours** (was 5s locally)
- `clearDeduplicationCache()`: deletes the durable SQLite snapshot
- **Limitation**: SQLite on Vercel is per-instance unless on shared storage. Cross-instance safety **not verified**.

**Key functions and lines**:
- `checkDoubleExecution()` — lines 269–312
- `clearDeduplicationCache()` — lines 313–315
- `idempotencyNamespace` — private field, `'safety:double_execution'`
- Database operations: `getDatabase()`, `writeSnapshot()`, `deleteSnapshot()`

**Idempotency key format**: `{organizationId}:{agentName}:{targetEntity}:{targetId}:{actionType}`

**Storage**: SQLite via `repository_snapshots` table. In production, `AIOSPARK_DB_PATH` defaults to `path.join(process.cwd(), '.data', 'aiospark.sqlite')`. On Vercel, each deployment may have its own copy unless configured for shared storage.

---

### 2. ReportSchedulerStore Persistence

**File**: `src/lib/reports/scheduler.ts`

**Current implementation** (post-004B):
- In-memory `Map<string, ReportScheduleRecord>` — process-local only
- `createSchedule()`: sets `organization_id`, returns record with `id`, `next_run_at`
- `getSchedule(id, orgId)`: **mandatory orgId** — throws "Cross-tenant access denied" on mismatch (F-008 fix)
- `getSchedules(orgId)`: filters by `organization_id` (org-scoped)
- `runScheduledReportsJob(orgId)`: calls `this.getSchedules(orgId)` — already org-scoped
- `clearAll()`: clears in-memory Map

**Persistence gap**: Schedules are **not persisted** to any database. They exist only in the process memory of the current Vercel server instance. On restart or scale, all schedules are lost.

**Key functions and lines**:
- `createSchedule()` — lines 38–72
- `getSchedule(id, orgId)` — lines 73–89
- `getSchedules(orgId)` — lines 85–91
- `runScheduledReportsJob(orgId)` — lines 92–137
- `clearAll()` — line 139 (previously outside class, moved inside)

**Design concern**: No durable storage. Scheduler data is ephemeral. Any Vercel server restart loses all schedules.

---

### 3. PromiseCheckJob Claim Logic

**File**: `src/lib/promises/job.ts`

**Process-local claim set**:
```typescript
const claimedPaymentIds = new Set<string>();
```

**Usage**: Tracked within `runDailyCheck()` to prevent double-processing of the same promise/payment within a single invocation. No persistence. On next invocation (next day, next instance), the Set is fresh — no cross-invocation protection.

**Gap**: No durable claim mechanism. Two workers running the same daily check could both process the same promise. No lease, no flag, no durable state.

**Key lines**:
- Line 34: `const claimedPaymentIds = new Set<string>();`
- Lines 61, 66, 70, 77, 81: `claimedPaymentIds.add(...)` 
- No database interaction for claim tracking

---

### 3. Existing PostgreSQL & SQLite Patterns

**PostgreSQL (Supabase)**:
- Used via `relational-repository.ts` and `relational-schema.ts`
- Tables: `udm_customers`, `udm_invoices`, `udm_payments`, `udm_bank_transactions`, `udm_idempotency_keys`, `udm_api_idempotency_keys`
- UDM state projection via `writeUdmRelationalState()`, `writeUdmRelationalDelta()`
- Idempotency keys stored in `udm_idempotency_keys(organization_id, key, record_id)` and `udm_api_idempotency_keys(organization_id, endpoint, key, record_id, fingerprint, response, status)`
- Upsert pattern: `INSERT ... ON CONFLICT(id) DO UPDATE SET ...`
- Transactions via `withWriteTransaction()`

**SQLite (durable-repository.ts)**:
- Default path: `path.join(process.cwd(), '.data', 'aiospark.sqlite')` or `:memory:` for tests
- Tables: `repository_snapshots(namespace, payload, updated_at)`, `repository_schema_migrations(version, applied_at)`
- One-time migration: `backfillUdmFromSnapshot()` — project legacy `udm` snapshot into relational tables atomically
- Snapshot pattern: `writeSnapshot(namespace, value)`, `readSnapshot(namespace)`
- Concurrency: `PRAGMA busy_timeout = 5000`, `PRAGMA journal_mode = WAL`, retry on `SQLITE_BUSY`
- Transactions: `BEGIN IMMEDIATE`, `COMMIT`, `ROLLBACK`
- `withWriteTransaction()`: handles nested calls within same async context, joins outer transaction

**Key files**:
- `src/lib/db/durable-repository.ts` — SQLite read/write/snapshot operations
- `src/lib/db/relational-repository.ts` — PostgreSQL UDM CRUD with idempotency
- `src/lib/db/relational-schema.ts` — PostgreSQL schema definitions
- `src/lib/db/operational-schema.ts` — PostgreSQL operational schema
- `src/lib/db/governance-schema.ts` — PostgreSQL governance schema
- `src/lib/db/security-migrations.ts` — RLS policies, audit log immutability triggers

---

### 4. Existing Idempotency Patterns (PostgreSQL)

**`udm_idempotency_keys` table**:
- Columns: `organization_id`, `key`, `record_id`
- Used by `insertIdempotency()` to record API call idempotency
- Pattern: `INSERT INTO udm_idempotency_keys(organization_id, key, record_id) VALUES (?, ?, ?)`
- No unique constraint documented beyond the natural key combination

**`udm_api_idempotency_keys` table**:
- Columns: `organization_id`, `endpoint`, `key`, `record_id`, `fingerprint`, `response`, `status`
- Status enum: `'reserved' | 'committed' | 'failed'`
- Used for API endpoint-level idempotency
- Pattern: `INSERT INTO udm_api_idempotency_keys(organization_id, endpoint, key, record_id, fingerprint, response, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
- On conflict: `ON CONFLICT(organization_id, endpoint, key) DO UPDATE SET record_id = excluded.record_id, fingerprint = excluded.fingerprint, response = excluded.response, status = excluded.status`

**Lesson**: PostgreSQL already has idempotency key infrastructure. The new 004C design should leverage existing tables/patterns or create a dedicated namespace.

---

### 5. Tenant Isolation Patterns

**Existing mechanisms**:
- `udmStore.setTenantContext(orgId)` — sets session-level tenant context
- RLS policies via `security-migrations.ts`: `current_app_tenant_id()` function, policies on `invoices`, `audit_logs`, etc.
- `can(role, action, resource)` — Layer 3 RBAC permission matrix
- `SafetyMiddlewareEngine.checkPermission()` — maps actionType to RBAC (action, resource) pair
- Tenant filtering on queries: `.filter((p) => p.organization_id === orgId)`

**PostgreSQL RLS**: Row-level security via `current_app_tenant_id()` function. Every query that touches tenant data must filter by this function.

**SQLite**: No RLS. Tenant filtering is application-layer (`p.organization_id === orgId`).

---

### 6. Test Coverage

**Existing concurrency/idempotency tests**:
- `src/lib/testing/__tests__/concurrent-idempotency.test.ts` — SQLite-backed concurrent idempotency (5 concurrent requests → 1 payment)
- `src/lib/tenant/__tests__/cross-tenant-pen.test.ts` — Cross-tenant penetration tests (F-007/F-008 scope)
- `src/lib/testing/__tests__/tenant-isolation.test.ts` — Tenant isolation tests
- `src/lib/testing/__tests__/tenant-isolation-concurrent.test.ts` — Concurrent tenant isolation

**Test execution requirement**: `AIOSPARK_TEST_MODE=true` and `AIOSPARK_DB_PATH` must be set. Tests modify test data in the configured SQLite database.

---

### 7. Summary of Gaps

| Component | Current State | Gap |
|-----------|--------------|-----|
| **SafetyMiddleware idempotency** | SQLite snapshot (24h window) | Not cross-instance safe without shared storage |
| **ReportSchedulerStore** | In-memory Map only | No durability — lost on restart |
| **PromiseCheckJob claims** | Process-local `Set<string>` | No durable claim tracking |
| **Scheduler persistence** | None | Ephemeral only |
| **Cross-instance coordination** | None | Must use Supabase PostgreSQL |
| **Tenant isolation** | Application-layer + PostgreSQL RLS | Partially enforced |

---

## Phase 2 — Recommended next steps (not yet implemented)

1. **Design PostgreSQL schema** for shared idempotency + scheduler durability + job claims
2. **Migrate ReportSchedulerStore** from in-memory Map to PostgreSQL
3. **Implement lease-based job claiming** with atomic operations
4. **Implement SafetyMiddleware** PostgreSQL-backed idempotency (using existing `udm_idempotency_keys` pattern or dedicated namespace)
5. **Add adversarial testing** for concurrent claims, lease expiration, crash recovery
6. **Verify cross-tenant regression** for F-007/F-008

---

*End of Repository Audit*