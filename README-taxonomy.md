# AIOSpark Payment-Delay Classification Taxonomy Reference Document

## Architectural Overview

This reference document defines the official, locked **11-value Payment-Delay Classification Taxonomy** for AIOSpark. This taxonomy is enforced at the database level via PostgreSQL ENUM `payment_delay_category_enum`, at the AI Reasoning Engine level via strict schema validation, and across all dashboards, reports, and exception engines.

---

## The 11 Taxonomy Categories & Definitions

| Enum Category | Display Title | Plain-Language Definition |
| :--- | :--- | :--- |
| `NORMAL_CYCLE` | Normal Payment Cycle | The invoice is processing normally within agreed credit terms with no detected blockers. |
| `PAYMENT_PROMISED` | Payment Promised | The customer has committed to a specific payment date or remittance schedule. |
| `CUSTOMER_DISPUTE` | Customer Dispute | The customer has formally logged a dispute regarding pricing, goods quality, or service delivery. |
| `PO_MISMATCH` | PO Mismatch | The invoice quantity, unit pricing, or line items do not match the associated purchase order. |
| `INVOICE_ERROR` | Invoice Error | The invoice contains calculation errors, wrong billing details, or duplicate billing. |
| `GST_TAX_ISSUE` | GST Tax Issue | Tax identification, GST rate, or tax credit reconciliation mismatch identified. |
| `MISSING_DOCUMENT` | Missing Document | Required supporting documentation (Proof of Delivery, Bill of Lading, PO copy) is missing. |
| `DELIVERY_ISSUE` | Delivery Issue | Goods or services were delivered late, damaged, or partially fulfilled. |
| `APPROVAL_PENDING` | Approval Pending | Invoice is awaiting internal Accounts Payable or departmental manager approval step at buyer. |
| `CREDIT_ISSUE` | Credit / Liquidity Issue | Customer is experiencing liquidity constraints, cash flow difficulties, or credit limit hold. |
| `UNKNOWN` | Needs Classification | Inconclusive or sparse signals — requires manual finance review and human classification. |

---

## UNKNOWN Routing Workflow

`UNKNOWN` is a first-class, legitimate classification state. When the AI Reasoning Engine cannot confidently classify an invoice into one of the 10 specific categories, it outputs `UNKNOWN`. These invoices are automatically routed to the **Needs Classification Queue** (`/taxonomy/queue`), where finance teams can perform manual review and reclassification.
