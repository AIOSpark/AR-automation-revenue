# AIOSpark — Approval → Action Architecture

## Executive Overview

AIOSpark's **Approval and Action Dispatcher Layer** (`src/lib/approvals/store.ts`, `src/lib/agents/policy-engine.ts`, `src/lib/tenant/permissions.ts`, `src/app/api/approvals/[id]/route.ts`) acts as a strict financial control boundary between AI recommendation and real-world execution. No high-risk action can execute directly without explicit, authorized human decision-making and policy verification.

---

## 1. Architectural Pipeline Trajectory

```
┌───────────────────────────────────────────┐
│         Source O2C Record & Exception     │
│        (UDM PostgreSQL Invoices/Exc)      │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│        AI Investigation Recommendation    │
│       (Layer 16 / Reasoning Engine)       │
└─────────────────────┬─────────────────────┘
                      │ High-Risk Action Interception
                      ▼
┌───────────────────────────────────────────┐
│           Policy Engine Guard             │
│   (MANDATORY_APPROVAL_HIGH_RISK_ACTIONS)  │
└─────────────────────┬─────────────────────┘
                      │ Routes to Approval Queue (Status: PENDING)
                      ▼
┌───────────────────────────────────────────┐
│      Approval Request & Append Log        │
│   (Immutable Snapshot & Audit Entry)      │
└─────────────────────┬─────────────────────┘
                      │ Human Decision (RBAC Authorization Check)
                      ▼
┌───────────────────────────────────────────┐
│      Approval Action Execution Dispatch   │
│     (APPROVED | REJECTED | MODIFIED)      │
└─────────────────────┬─────────────────────┘
                      │ Outcome Verification
                      ▼
┌───────────────────────────────────────────┐
│       Verified System State & Audit Log   │
│ (State Transition / Communication Log)    │
└───────────────────────────────────────────┘
```

---

## 2. Action Risk Classification Inventory

AIOSpark classifies actions into risk levels with mandatory policy guardrails:

| Action Type | Risk Level | Approval Policy Required | Direct Execution Allowed? |
| :--- | :--- | :--- | :--- |
| `ALTER_INVOICE_VALUE` | **HIGH** | Mandatory Approval Request | ❌ DENIED |
| `ISSUE_CREDIT_NOTE` | **HIGH** | Mandatory Approval Request | ❌ DENIED |
| `RECORD_PAYMENT_MATCH` | **HIGH** | Mandatory Approval Request | ❌ DENIED |
| `SEND_CUSTOMER_COMMUNICATION` | **HIGH** | Mandatory Approval Request | ❌ DENIED |
| `MODIFY_ACCOUNTING_RECORD` | **HIGH** | Mandatory Approval Request | ❌ DENIED |
| `OTHER_HIGH_RISK` | **HIGH** | Mandatory Approval Request | ❌ DENIED |
| `RECLASSIFY_INVOICE` | **MEDIUM** | Policy Engine Interception | ❌ DENIED |
| `CREATE_EXCEPTION` | **LOW** | Automated Exception Logging | ✅ PERMITTED |
| `UPDATE_RISK_SCORE` | **LOW** | Customer 360 Recalculation | ✅ PERMITTED |

---

## 3. Approval State Machine & Transitions

```
                    ┌─────────────────────────┐
                    │        PENDING          │
                    └────────────┬────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           │                     │                     │
           ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│     APPROVED     │  │     REJECTED     │  │     MODIFIED     │
└──────────┬───────┘  └──────────┬───────┘  └──────────┬───────┘
           │                     │                     │
           ▼                     ▼                     ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│     EXECUTED     │  │  EXEC BLOCKED    │  │ MODIFIED EXECUTE │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

### State Machine Rules
1. **Transition from PENDING**: Can transition to `approved`, `rejected`, or `modified` via `approveRequest`, `rejectRequest`, or `modifyAndApproveRequest`.
2. **Terminal / Locked State**: Once `approved`, `rejected`, or `modified`, an approval request **cannot** be re-approved, re-rejected, or reverted back to `pending`.
3. **RBAC Guard**: Only users with the `approve` permission on `approvals` (e.g., `Finance Manager`, `Owner`, `Admin`) can trigger transitions. `Viewer` or unauthorized roles receive an immediate HTTP 403 response.

---

## 4. Multi-Tenant & Audit Lineage Guarantees

- **Tenant Boundaries**: Approval requests and logs strictly scope to `organization_id`. Tenant A users cannot query or mutate Tenant B approval requests.
- **Append-Only Logs**: `ApprovalStore` enforces append-only logging (`appendLog`). There are no `updateLog` or `deleteLog` methods, ensuring audit trail immutability.
- **Data Change Protection**: Modifying an action payload requires `modifyAndApproveRequest`, which explicitly logs both the original proposed action and the modified action payload in the append-only ledger.
