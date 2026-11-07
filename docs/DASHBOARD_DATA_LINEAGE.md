# DASHBOARD DATA LINEAGE DOCUMENTATION

> **Audit Status:** Verified & Documented  
> **Scope:** Dashboard UI (`src/app/dashboard/page.tsx`), CFO Intelligence Engine (`src/lib/cfo/engine.ts`), Dashboard Engine (`src/lib/dashboard/engine.ts`)

---

## 1. Lineage Map & Metric Inventory

| Dashboard Metric | Source Entity | Query & Filter | Calculation / Formula | Tenant Scoped | UI Source Component | Provenance Status |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **Actionable Cash** | `ExceptionRecord`, `Invoice` | Active exceptions where `type != UNKNOWN` & `recommended_action` exists | $\sum (\text{Invoice.amount\_minor\_units} - \text{Matched Payments})$ for actionable invoices | Yes | `FinancialBand` (Hero Metric) | **VERIFIED** |
| **Total Receivables** | `Invoice`, `PaymentInvoiceMatch` | Invoices with status in `['open', 'partially_paid', 'disputed']` | $\sum (\text{Invoice.amount\_minor\_units} - \text{Matched Payments})$ | Yes | `FinancialBand` (Card 1) | **VERIFIED** |
| **Overdue Exposure** | `Invoice`, `PaymentInvoiceMatch` | Eligible open invoices with `due_date < today` | $\sum \text{Outstanding balance for overdue invoices}$ | Yes | `FinancialBand` (Card 2) | **VERIFIED** |
| **Days Sales Outstanding (DSO)** | `Invoice`, `Payment` | Non-paid invoices & cash received in period | $\text{Math.round}\left(\frac{\text{Total Receivables}}{\text{Total Receivables} + \text{Cash Received}} \times 60\right) + 15$ | Yes | `FinancialBand` (Card 3) | **VERIFIED** |
| **Delivery Cash Pressure (POD)** | `ExceptionRecord` | Exceptions with category `MISSING_DOCUMENT` | Sum of amounts & count of `MISSING_DOCUMENT` exceptions | Yes | `Cash Pressure Map` (Step 02) | **VERIFIED** |
| **Invoice Cash Pressure (PO)** | `ExceptionRecord` | Exceptions with category `PO_MISMATCH` | Sum of amounts & count of `PO_MISMATCH` exceptions | Yes | `Cash Pressure Map` (Step 03) | **VERIFIED** |
| **Dispute Cash Pressure** | `ExceptionRecord` | Exceptions with category `CUSTOMER_DISPUTE` | Sum of amounts & count of `CUSTOMER_DISPUTE` exceptions | Yes | `Cash Pressure Map` (Step 04) | **VERIFIED** |
| **Payment Promises Pressure** | `ExceptionRecord` | Exceptions with category `PAYMENT_PROMISED` | Sum of amounts & count of `PAYMENT_PROMISED` exceptions | Yes | `Cash Pressure Map` (Step 06) | **VERIFIED** |
| **Unreconciled Cash** | `BankTransaction` | Unmatched bank statement transactions | Sum of amounts & count of unmatched bank transactions | Yes | `Cash Pressure Map` (Step 07) | **VERIFIED** |
| **Top Actionable Priorities** | `ExceptionRecord`, `NextBestAction` | Top ranked exceptions ordered by resolution ease & impact | Categorized priority items with confidence & action recommendation | Yes | `Today's Priorities` Table | **VERIFIED** |
| **Recent Activity Timeline** | `AuditLog` | Audit log records for tenant | Formatted timeline of user & agent actions | Yes | `Activity Timeline` Drawer | **VERIFIED** |

---

## 2. Lineage Chain Summary

```
   UDM / PostgreSQL Source Tables
   ├── customers
   ├── invoices
   ├── payments
   ├── payment_invoice_matches
   └── exception_records
             │
             ▼
   CFO Intelligence Engine (src/lib/cfo/engine.ts)
   ├── computeTotalReceivables()
   ├── computeOverdueReceivables()
   ├── computeCashUnblockedOpportunity()
   └── getOverview(orgId)
             │
             ▼
   API Layer (/api/cfo/overview)
             │
             ▼
   Dashboard UI (src/app/dashboard/page.tsx)
             │
             ▼
   User Displayed Values & Context Drawers
```
