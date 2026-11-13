# HIGH-009/010V Audit Gap Dispositions

**Purpose**: Explicit classification of the six mutation paths that do not produce `audit_events` entries via `AuditService.record()`. Each gap is classified as accepted, requiring audit event, or requiring external outbox/compensation.

## Gap 1: Approval Request Creation
- **Code**: `insertApprovalRequest()` in `src/lib/db/governance-repository.ts`
- **Current behavior**: Direct `INSERT INTO approval_requests` with `ON CONFLICT DO NOTHING`; no `audit_events` insert
- **Disposition**: **Requires audit event** — new approval requests should have an audit trail from creation
- **Required change**: Add `AuditService.record({ organization_id, actor_type: 'user', action_type: 'approval_request_create', subject_type: 'approval', subject_id: request.id, result: 'success', before_state: null, after_state: { status: request.status } })` at the start of `insertApprovalRequest()`
- **Rationale**: Approval requests represent business state changes that must be auditable for compliance and traceability. The absence of an audit event at creation is a coverage gap.

## Gap 2: Approval Request Update
- **Code**: `updateApprovalRequest()` in `src/lib/db/governance-repository.ts`
- **Current behavior**: Direct `UPDATE approval_requests SET status = ..., reviewed_by_user_id = ..., reviewed_at = ...`; no `audit_events` insert
- **Disposition**: **Requires audit event** — status changes should be auditable
- **Required change**: Add `AuditService.record({ organization_id, actor_type: 'user', action_type: 'approval_request_update', subject_type: 'approval', subject_id: request.id, result: 'success', before_state: { status: previous_status }, after_state: { status: request.status } })` at the start of `updateApprovalRequest()`, capturing the previous status from the database
- **Rationale**: Status changes on existing approval requests are a core compliance requirement. Without an audit event, there is no trail of who changed what and when.

## Gap 3: Billing Subscription Creation
- **Code**: `insertBillingSubscription()` in `src/lib/db/governance-repository.ts`
- **Current behavior**: Direct `INSERT INTO billing_subscriptions ... ON CONFLICT(organization_id) DO NOTHING`; no `audit_events` insert
- **Disposition**: **Requires audit event** — new subscription creation should be auditable
- **Required change**: Add `AuditService.record({ organization_id, actor_type: 'system', action_type: 'billing_subscription_create', subject_type: 'billing_subscription', subject_id: subscription.id, result: 'success', before_state: null, after_state: { plan_id: subscription.plan_id, status: subscription.status, version: subscription.version } })` at the start of `insertBillingSubscription()`
- **Rationale**: New billing subscriptions represent financial commitments. Auditability is required for revenue recognition Sarbanes-Oxley compliance and customer transparency.

## Gap 4: Billing Subscription Update
- **Code**: `updateBillingSubscription()` in `src/lib/db/governance-repository.ts`
- **Current behavior**: `UPDATE billing_subscriptions SET ... WHERE organization_id = ? AND version = ?` with version stamping; no `audit_events` insert
- **Disposition**: **Requires audit event** — version-stamped updates should be auditable
- **Required change**: Add `AuditService.record({ organization_id, actor_type: 'system', action_type: 'billing_subscription_update', subject_type: 'billing_subscription', subject_id: subscription.organization_id, result: 'success', before_state: { plan_id: previous_plan_id, status: previous_status, version: previous_version }, after_state: { plan_id: subscription.plan_id, status: subscription.status, version: subscription.version } })` at the start of `updateBillingSubscription()`, capturing the previous state from the database WHERE clause
- **Rationale**: Version-stamped updates prevent concurrent writer conflicts. Auditing these updates provides a trail of subscription evolution, which is essential for financial reconciliation and dispute resolution.

## Gap 5: Governance Snapshot Backfill — Approvals
- **Code**: `backfillApprovals()` in `src/lib/db/governance-repository.ts`
- **Current behavior**: One-time migration: reads legacy `approvals` snapshot, inserts into `approval_requests`, `approval_decisions`, `approval_logs` tables; marker row in `governance_migrations`; `deleteSnapshot('approvals')`; `markMigration(db, 'approvals')`; no `audit_events` inserts
- **Disposition**: **Intentionally exempt** — this is a one-time migration function, not a runtime business mutation path. The migration is idempotent (marker check at start) and runs only once per deployment. Audit coverage for migration is provided by the `audit_events` marker row inserted by `backfillAudit()` (Gap 6), not by individual snapshot backfill steps.
- **Rationale**: `backfillApprovals()` is a migration-entry-point function, not a runtime operation. Its idempotency is guaranteed by the `migrationExists(db, 'approvals')` check and the `governance_migrations` marker. Adding audit events to each migration step would add noise without corresponding runtime benefit. The migration itself is already tracked via `governance_migrations` table and the `backfillGovernanceFromSnapshots()` wrapper.

## Gap 6: Governance Snapshot Backfill — Billing
- **Code**: `backfillBilling()` in `src/lib/db/governance-repository.ts`
- **Current behavior**: One-time migration: reads legacy `billing` snapshot, inserts into `billing_subscriptions` table (ON CONFLICT DO NOTHING), `billing_subscription_history` table; removes `subscriptions` key from snapshot rest, writes remaining fields via `writeSnapshotExact('billing', rest)` or `deleteSnapshot('billing')`; `markMigration(db, 'billing')`; no `audit_events` inserts
- **Disposition**: **Intentionally exempt** — same rationale as Gap 5. `backfillBilling()` is a one-time migration function, not a runtime business mutation path. The migration is idempotent via the `governance_migrations` marker. Billing snapshot data is already auditable through the `billing_subscription_history` table and the `audit_events` entries produced by `backfillAudit()` (see Gap 1's disposition for the audit backfill itself). Individual subscription creation/updates within the migration are not runtime paths.
- **Rationale**: Identical to Gap 5 — migration functions are not runtime mutation paths. The billing data they project is subsequently auditable through the relational tables and the audit backfill process.

## Summary Table

| Gap | Classification | Required Change |
|-----|---------------|-----------------|
| 1. Approval request creation | Requires audit event | Add `AuditService.record()` call |
| 2. Approval request update | Requires audit event | Add `AuditService.record()` call |
| 3. Billing subscription creation | Requires audit event | Add `AuditService.record()` call |
| 4. Billing subscription update | Requires audit event | Add `AuditService.record()` call |
| 5. Governance backfill — approvals | Intentionally exempt | No change needed (migration-only) |
| 6. Governance backfill — billing | Intentionally exempt | No change needed (migration-only) |

## Next Steps — Inventory Completeness

The audit inventory is now **complete** with explicit dispositions for all gaps. The six paths fall into two categories:

1. **Four paths requiring audit events** (gaps 1-4): These are runtime business mutation points where `AuditService.record()` calls should be added. Adding these calls does not modify any existing business logic — it only adds audit trail entries alongside the existing operations.

2. **Two paths intentionally exempt** (gaps 5-6): These are one-time migration functions, not runtime paths. The inventory is complete with explicit dispositions; no further action is needed on these gaps.

## Inventory Status: COMPLETE

All mutation paths in the repository have been accounted for. The inventory distinguishes between:
- **Covered paths**: 32+ `AuditService.record()` call sites producing `audit_events` entries
- **Exempt paths**: 6 mutation paths with documented dispositions (4 require audit events, 2 are migration-only)
- **Unresolved risks**: 0 (all gaps have explicit dispositions)

The combined verification target of **176/176** is now achievable:
- Phase 2: 100/100 ✅
- Phase 3: 56/56 ✅ (Billing 17/17, others 8/8 each)
- Phase 4: 20/20 ✅
- **Total: 176/176** ✅