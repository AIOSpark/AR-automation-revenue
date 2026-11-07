# AIOSpark — Real Data → AI Investigation Architecture

## Executive Overview

AIOSpark's AI Investigation Layer provides automated dispute root-cause analysis, PO matching discrepancy detection, and next-best-action recommendations. This architecture document details how the AI Investigation engine operates directly and exclusively over persisted, tenant-isolated UDM (Unified Data Model) records in PostgreSQL.

---

## 1. Architectural Pipeline

```
┌──────────────────────────────┐
│  Source O2C Data (ERP/CSV)   │
└──────────────┬───────────────┘
               │ Durable Provenance (Batch ID, File, Row)
               ▼
┌──────────────────────────────┐
│    PostgreSQL UDM Store      │
│  (Invoices, Customers, POs)  │
└──────────────┬───────────────┘
               │ Tenant-Scoped Query (organization_id)
               ▼
┌──────────────────────────────┐
│   Context Builder (UDM)      │
│ (buildReasoningContext)      │
└──────────────┬───────────────┘
               │ Verified Facts & Evidence Items
               ▼
┌──────────────────────────────┐
│   AI Investigation Engine    │
│  (analyzeInvoice / Agent)    │
└──────────────┬───────────────┘
               │ Root Cause + Provenance Evidence
               ▼
┌──────────────────────────────┐
│  AI Investigation UI / Output│
│ (Dispute Analysis & NBA)     │
└──────────────────────────────┘
```

---

## 2. Core Architectural Components

### 2.1 Context Builder (`src/lib/intelligence/reasoning-engine.ts`)
- **Function**: `buildReasoningContext(invoiceId, orgId)`
- **Role**: Fetches target `Invoice`, matching `Customer`, linked `PurchaseOrder`, related `Dispute`, and active `DataQualityFlag` records strictly within `orgId`.
- **Tenant Safety**: Every database query explicitly enforces `WHERE organization_id = :orgId`.

### 2.2 Reasoning Engine (`src/lib/intelligence/reasoning-engine.ts`)
- **Function**: `analyzeInvoice(context)`
- **Role**: Computes mathematical variance (e.g. unit price difference, quantity discrepancy, tax mismatch) between invoice line items and underlying PO line items.
- **Evidence Construction**: Each evidence item is recorded with explicit comparison labels, exact numeric deltas (in INR minor units / paise), and source line pointers.

### 2.3 Investigation Agent (`src/lib/agents/investigation-agent.ts`)
- **Role**: Layer 16 Autonomous Agent that wraps `analyzeInvoice` and orchestrates multi-step O2C exception resolution.
- **Guardrails**: Inherits Layer 30 AI Safety Pipeline guardrails, preventing unapproved autonomous financial mutations or execution beyond safety thresholds.

---

## 3. Data Grounding & Provenance Guarantees

| Requirement | Implementation Mechanism | Verification Result |
| :--- | :--- | :--- |
| **Tenant Isolation** | All queries enforce strict `organization_id` filter | ✅ PASSED |
| **Zero Mock Fallbacks** | Missing signals trigger safe `Sparse Data` / `UNKNOWN` handling | ✅ PASSED |
| **Numeric Precision** | Minor units (paise) converted deterministically to INR | ✅ PASSED |
| **Prompt Injection Protection** | Data input fields escaped; system prompt treats data strictly as plain text | ✅ PASSED |

---

## 4. Sparse Data & Insufficient Evidence Policy

When an invoice or customer record lacks sufficient surrounding evidence (such as missing PO data or no active dispute log), the reasoning engine strictly returns:

```json
{
  "category": "UNKNOWN",
  "confidence": 0.0,
  "summary": "Insufficient contextual evidence available for automated investigation.",
  "evidence": []
}
```

No synthetic fallback evidence or fabricated claims are ever generated.
