# AIOSpark HIGH-009 — Relational Normalization Verification

Date: 2026-11-11
Scope: UDM financial and supporting entities in the authoritative SQLite database.

## 1. Schema inventory

Migration version **2** adds normalized tables:

| Table | Relationships / constraints |
|---|---|
| `udm_customers` | PK; tenant index; non-negative credit limit; ISO-3 currency; payment terms range |
| `udm_contacts` | FK `customer_id` → customers (`ON DELETE CASCADE`) |
| `udm_invoices` | FK `customer_id`; non-negative amount/tax; status CHECK; tenant/status and source indexes |
| `udm_payments` | FK `customer_id`; non-negative amount; ISO-3 currency; source index |
| `udm_payment_matches` | FKs to payments and invoices; positive matched amount |
| `udm_credit_notes` | FK customer and optional invoice; positive amount; ISO-3 currency |
| `udm_credit_allocations` | FKs to credit notes and invoices; positive amount; `allocated`/`reversed` CHECK |
| `udm_disputes` | FK invoice; status CHECK; optional non-negative amount |
| `udm_dispute_evidence` | FK dispute (`ON DELETE CASCADE`) |
| `udm_exceptions` | optional FKs to customer/invoice; severity and status CHECKs |
| `udm_bank_transactions` | non-negative amount; status CHECK; optional FK to payment |
| `udm_idempotency_keys` | composite PK `(organization_id, key)` |
| `udm_api_idempotency_keys` | composite PK `(organization_id, endpoint, key)` |

Each table also stores a `payload` JSON column for fields outside the core relational columns (addresses, evidence, import metadata). Identity, tenant ownership, core financial scalars and relationships are real columns with database enforcement.

Indexes support tenant/status/source and relationship lookups.

## 2. Migration and backfill

`src/lib/db/relational-schema.ts` is the versioned v2 schema. `durable-repository.ts` applies it idempotently at startup and records version 2 in `repository_schema_migrations`.

On first UDM load:

1. If relational rows exist, they are authoritative.
2. If relational tables are empty and a legacy `udm` JSON snapshot exists, the snapshot is projected into relational tables.
3. The projection and legacy-snapshot deletion run in **one transaction**, preventing deleted data from reappearing and preventing the snapshot from being removed before the projection commits.
4. A crash at any point leaves either the complete snapshot with no relational rows, or the complete relational projection with no snapshot. A restarted process reruns the migration safely.
5. If no snapshot exists, the database is treated as empty.

`test:relational` verifies backfill and idempotency. `test:migration-recovery` verifies interruption safety across OS processes.

## 3. Authoritative reads and writes

- UDM reads load relational payloads and relationships.
- Mutations still run under `BEGIN IMMEDIATE`, reload committed state, validate invariants, then write relational rows and commit atomically.
- Normal mutations use a differential upsert. Invoice-heavy imports use a focused invoice upsert; a 1,500-row import runs in ~480 ms.
- Deletions use a full relational projection so FK ordering remains correct.
- `readSnapshotDirect('udm')` is served from relational state as a compatibility view for existing readers. No second stored source is maintained.

## 4. Verification

`npm run test:migration-recovery` — **85/85**:

- Seeds a version-1 database with 30,000 invoices, 4,000 payments/matches, 400 customers/contacts/credit notes/allocations/disputes/evidence/exceptions/bank transactions, and 4,400 idempotency keys.
- Starts migration v2 in a separate OS process.
- Sends `SIGKILL` while the backfill transaction's WAL is growing (observed at ~634 KB, before `COMMIT`).
- Reopens the database: `integrity_check` is `ok`, zero FK violations, all uncommitted relational rows rolled back, and the complete legacy snapshot remains.
- Restarts in a fresh process: all 13 tables have exact expected counts and no duplicate identities; invoice, payment and match totals are preserved; schema version is at least 2 (3 after the governance migration).
- Confirms the snapshot is deleted only after the full projection commits.
- Runs the migration again: no-op, no duplicates, no snapshot recreated.

`npm run test:relational` — **8/8**:

- Version 2 recorded.
- Legacy snapshot backfills and backfill is idempotent.
- Invoice→customer FK enforced.
- Negative amounts/invalid statuses rejected by CHECK.
- Zero match/allocation amounts rejected.
- Primary-key identity uniqueness enforced.
- UDM writes update relational rows.
- Invalid write rolls back both relational and compatibility view.

Regression:

| Check | Result |
|---|---|
| `npm run test:master` | 187/187 |
| `npm run test:concurrency` | 30/30 |
| `npm run test:durability` | 27 + 28 |
| `npm run test:relational` | 8/8 |
| `npm run test:migration-recovery` | 85/85 |
| `npm run test:cross-namespace` | 5/5 |
| `npm run test:financial-rbac` | 21/21 |
| `npm run test:backup` | 11/11 |
| `npm run verify` | Exit 0 |
| `npx tsc --noEmit` | 0 errors |
| `npm run build` | Success |

## 5. Rollback boundary

The v2 migration is additive and idempotent. No destructive table alteration is performed. The legacy snapshot and relational projection switch atomically. To roll back, stop the application and restore the pre-migration database backup using the HIGH-012 backup utility; the legacy `udm` snapshot was retained until backfill and is included in any backup taken before the first v2 read. Once backfill has run, rollback requires that backup rather than a SQL down-migration.

## 6. Remaining boundary

- Approvals, approval logs, subscriptions, and audit events still use their transactional snapshot tables. Their concurrency/audit guarantees are covered by HIGH-010R, but they are not yet normalized relational tables.
- Non-UDM namespaces (auth, tenant, imports, reconciliation outcomes, executions) remain snapshots.
- The UDM `payload` columns retain optional extended fields; core financial identity, tenant, amount, status and relationship columns are database-enforced.
