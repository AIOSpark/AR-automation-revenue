# AIOSpark — Real Data → Cash Unblock Architecture

## Executive Overview

AIOSpark's **Cash Unblock Engine** (`src/lib/unblock-queue/engine.ts`), **Cash Unblock Simulator** (`src/lib/intelligence/cash-unblock-simulator.ts`), and **Next-Best-Action Engine** (`src/lib/intelligence/next-best-action-engine.ts`) derive financial opportunities, actionable cash metrics, and resolution workflows strictly from persisted UDM records in PostgreSQL.

---

## 1. Architectural Pipeline Trajectory

```
┌─────────────────────────────────────────┐
│     Source O2C Ingestion Layer          │
│ (ERP / Tally / CSV / Bank Reconciliation│
└────────────────────┬────────────────────┘
                     │ Durable Provenance (Batch ID, File, Row)
                     ▼
┌─────────────────────────────────────────┐
│       PostgreSQL / UDM Store            │
│  (invoices, payments, matches, exc)     │
└────────────────────┬────────────────────┘
                     │ Tenant-Scoped Query (WHERE org_id = :orgId)
                     ▼
┌─────────────────────────────────────────┐
│       Cash Unblock Queue Engine         │
│     (getCashUnblockQueue / Summary)     │
└────────────────────┬────────────────────┘
                     │ Fact Baseline Calculation (Outstanding - Matches)
                     ▼
┌─────────────────────────────────────────┐
│    Cash Unblock Simulator / NBA Engine  │
│  (Read-Only Scenario Impact Evaluation)  │
└────────────────────┬────────────────────┘
                     │ Human Approval Gate (Approval Queue for high-value)
                     ▼
┌─────────────────────────────────────────┐
│        Source State Transition          │
│    (Payment Received / Discrepancy Resolved)
└─────────────────────────────────────────┘
```

---

## 2. Terminology & Financial Definitions

AIOSpark strictly enforces clear domain boundary definitions across modules:

| Metric Term | Definition & Derivation | Primary Module |
| :--- | :--- | :--- |
| **Outstanding Cash** | Gross invoice amount minus allocated payment matches and credit notes | UDM / Receivables |
| **Actionable Cash** | Outstanding cash blocked by internal operational dependencies | Cash Unblock Queue |
| **Potential Cash** | Hypothetical recoverable amount evaluated by the read-only simulator | Cash Unblock Simulator |
| **Received Cash** | Verified bank deposit matched to an invoice in UDM | Bank Reconciliation |
| **Recovered Cash** | Cash unblocked and deposited following action execution | CFO Metrics |

---

## 3. Core Architectural Components

### 3.1 Cash Unblock Queue Engine (`src/lib/unblock-queue/engine.ts`)
- Computes `cashAffectedMinorUnits`, `daysOverdue`, `primaryBlocker`, `actionability`, `dependency`, and `recommendedNextAction`.
- Explicitly filters out fully paid (`inv.status === 'paid'`) or written off (`inv.status === 'written_off'`) invoices.
- Integrates Layer 30 approval policy requirements (`approvalRequired` threshold set at ₹5,00,000 or credit note requests).

### 3.2 Cash Unblock Simulator (`src/lib/intelligence/cash-unblock-simulator.ts`)
- Operates as a **read-only scenario evaluation layer** marked strictly with `isReadOnly: true`.
- Displays side-by-side scenario nodes (Scenario A: Recommended Blocker Resolution vs Scenario B: Blind Customer Chasing).
- Emits explicit disclaimers: hypothetical scenario cash is never credited until verified payment matches occur in UDM.

---

## 4. Multi-Tenant & Safety Isolation

- **Tenant Boundary**: Every UDM fetch in `getCashUnblockQueue(orgId)` enforces `udmStore.setTenantContext(orgId)`.
- **Zero-Mock Policy**: A clean organization returns 0 queue items, ₹0 total cash affected, and ₹0 actionable cash.
- **Prompt Injection Defense**: Input fields passed from customer or invoice notes are treated strictly as inert plain text.
