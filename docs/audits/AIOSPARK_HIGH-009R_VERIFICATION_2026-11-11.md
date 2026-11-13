# AIOSpark HIGH-009R — Approvals, Billing and Audit Normalization

Date: 2026-11-11
Scope: relational persistence for approval control records, billing subscriptions and audit events.

## 1. Schema version 3

Migration version **3** adds:

| Table | Integrity enforcement |
|---|---|
| `approval_requests` | PK, tenant/status indexes, status CHECK, confidence CHECK `0..1`, reviewed-at CHECK, execution-status CHECK |
| `approval_decisions` | PK/FK to request, decision CHECK, one row per request, tenant trigger, request-status trigger, immutable-decision trigger |
| `approval_logs` | PK, FK to request, event-type CHECK, tenant trigger, append-only API |
| `approval_autonomy_configs` | PK, unique `(organization_id, action_type)`, confidence CHECK |
| `billing_subscriptions` | PK `organization_id`, unique subscription id, plan/status/interval CHECKs, non-negative version, exactly-one version increment trigger |
| `billing_subscription_history` | PK, FK to subscription, unique `(organization_id, version)`, tenant trigger, immutable history trigger |
| `audit_events` | PK, actor/result CHECKs, tenant/action/subject indexes, UPDATE and DELETE triggers reject mutation |
| `governance_migrations` | Per-namespace completion marker |

The existing TypeScript shapes are preserved in payload/detail JSON columns. Identity, tenant, state, financial relationships and versions are real enforced columns.

## 2. Transaction semantics

- Approval decision, terminal decision row, decision log and audit event commit in one `BEGIN IMMEDIATE` transaction.
- Subscription update, history row and audit event commit in one transaction.
- A second approval decision raises `ApprovalConflictError` and remains an HTTP 409 at the route.
- A stale subscription version raises `BillingConflictError`; the SQL `UPDATE ... WHERE version = ?` and the version trigger independently reject stale or skipped versions.
- Audit failure rolls back the business row and its local control records.
- Audit events are append-only at the database level; controlled purge is used only by explicit test cleanup.

## 3. Legacy migration and recovery

`backfillGovernanceFromSnapshots()` migrates approvals, billing subscriptions and audit events in one transaction, then records one marker per namespace.

- Approval and audit snapshots are deleted only after their rows commit.
- Billing retains usage/payment/webhook/refund snapshot data; only subscriptions move to relational tables and are removed from the legacy snapshot.
- Any crash rolls back rows, markers and snapshot deletion together.
- Rerunning the migration after commit is a no-op.

## 4. Verification

`npm run test:governance` — **68/68**:

- Seeds a version-2 database with **8,000 approval requests**, **20,000 audit events**, **600 subscriptions** and supporting billing data.
- Starts migration v3 in another OS process and sends `SIGKILL` at ~140 KB of WAL growth.
- Reopens the database: `integrity_check` is `ok`, zero FK violations, all governance rows rolled back, and all three legacy snapshots remain complete.
- Fresh-process migration restores exact counts, including one terminal decision and `requests + 1` logs.
- Confirms approval/audit snapshots are removed, billing non-subscription data is retained, and direct compatibility views expose relational data.
- Reruns migration: no duplicates and no snapshot recreation.
- Verifies CHECK constraints, FKs, decision/tenant triggers, immutable decisions, immutable audit events, version jumps, duplicate history and tenant query isolation.
- Verifies stale subscription rejection, one terminal decision, and audit-failure rollback with a successful retry.

Regression suites:

| Check | Result |
|---|---|
| `test:governance` | 68/68 |
| `test:cross-namespace` | 5/5 |
| `test:migration-recovery` | 85/85 |
| `test:relational` | 8/8 |
| `test:concurrency` | 30/30 |
| `test:durability` | 27 + 28 |
| `test:master` | 187/187 |

## 5. Remaining HIGH-009 scope

The following namespaces remain snapshot-based and are not covered by this migration:

- Authentication and tenant state.
- Import, reconciliation and execution outcomes.
- Other billing records (usage events, payments, webhooks, refunds) intentionally remain snapshots for this milestone.
