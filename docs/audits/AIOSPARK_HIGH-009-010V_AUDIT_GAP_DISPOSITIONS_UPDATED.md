# HIGH-009/010V Audit Gap Dispositions — Updated

This document updates the audit gap dispositions with evidence that the four runtime mutation paths have been instrumented with audit events.

## Gap 1: Approval Request Creation
- **Status**: **RESOLVED** — Audit event now generated
- **Code**: `insertApprovalRequest()` in `src/lib/db/governance-repository.ts`
- **Evidence**: `appendAuditEvent({ action_type: 'approval_request_create', ... })` called within `withWriteTransaction()`
- **Result**: One audit event per approval request creation; transactional atomicity guaranteed

## Gap 2: Approval Request Update
- **Status**: **RESOLVED** — Audit event now generated
- **Code**: `updateApprovalRequest()` in `src/lib/db/governance-repository.ts`
- **Evidence**: `appendAuditEvent({ action_type: 'approval_request_update', before_state, after_state })` called within `withWriteTransaction()`
- **Result**: One audit event per approval request update; before/after state captured; stale/conflicting updates do not generate false events

## Gap 3: Billing Subscription Creation
- **Status**: **RESOLVED** — Audit event now generated
- **Code**: `insertBillingSubscription()` in `src/lib/db/governance-repository.ts`
- **Evidence**: `appendAuditEvent({ action_type: 'billing_subscription_create', after_state })` called within `withWriteTransaction()`
- **Result**: One audit event per billing subscription creation; organization and subscription references correct; concurrent creation does not produce duplicate events

## Gap 4: Billing Subscription Update
- **Status**: **RESOLVED** — Audit event now generated
- **Code**: `updateBillingSubscription()` in `src/lib/db/governance-repository.ts`
- **Evidence**: `appendAuditEvent({ action_type: 'billing_subscription_update', before_state, after_state })` called within `withWriteTransaction()`
- **Result**: One audit event per versioned billing subscription update; before/after state accurate; stale expectedVersion produces conflict and no false audit event

## Previously Exempt (Unchanged)
- **Gap 5**: Governance backfill — approvals (intentionally exempt; migration-only function)
- **Gap 6**: Governance backfill — billing (intentionally exempt; migration-only function)

## Summary
All six gaps now have explicit dispositions. Four are resolved (audit events instrumented); two are intentionally exempt (migration-only functions). The audit inventory is complete.