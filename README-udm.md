# AIOSpark Universal Data Model (UDM) & Entity-Relationship Documentation

## Architectural Overview

The **Universal Data Model (UDM)** serves as the canonical, multi-tenant database backbone for AIOSpark. Regardless of source system origin (`csv`, `zoho`, `tally`, or manual entry), all customer ledger records, invoice streams, payments, credit notes, disputes, and AI-detected exceptions are transformed into this schema.

---

## Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ CUSTOMERS : "belongs to"
    ORGANIZATIONS ||--o{ INVOICES : "belongs to"
    ORGANIZATIONS ||--o{ PAYMENTS : "belongs to"
    ORGANIZATIONS ||--o{ CREDIT_NOTES : "belongs to"
    ORGANIZATIONS ||--o{ DISPUTES : "belongs to"
    ORGANIZATIONS ||--o{ EXCEPTIONS : "belongs to"

    CUSTOMERS ||--o{ CUSTOMER_CONTACTS : "has contacts"
    CUSTOMERS ||--o{ CUSTOMERS : "parent subsidiary"
    CUSTOMERS ||--o{ INVOICES : "issues"
    CUSTOMERS ||--o{ PAYMENTS : "makes"
    CUSTOMERS ||--o{ CREDIT_NOTES : "receives"

    INVOICES ||--o{ PAYMENT_INVOICE_MATCHES : "reconciled in"
    PAYMENTS ||--o{ PAYMENT_INVOICE_MATCHES : "applied to"

    INVOICES ||--o{ DISPUTES : "has"
    DISPUTES ||--o{ DISPUTE_EVIDENCES : "contains evidence"

    INVOICES ||--o? EXCEPTIONS : "flagged by"
    CUSTOMERS ||--o? EXCEPTIONS : "flagged by"
```

---

## Data Dictionary

### 1. `customers`
Stores organizational accounts and buyer profiles.
- `id` (UUID, PK): Unique customer identifier.
- `organization_id` (UUID, FK): Tenant boundary.
- `source_system` (TEXT): Origin adapter (`csv`, `zoho`, `tally`, `manual`).
- `source_id` (TEXT): Original ID in external provider.
- `name` (TEXT): Official company name.
- `tax_id` (TEXT, Nullable): GSTIN / Tax ID.
- `billing_address` (JSONB): Structured address object.
- `shipping_address` (JSONB): Structured shipping location.
- `credit_limit_minor_units` (BIGINT): Approved credit limit in integer minor units (e.g., Paise).
- `currency` (VARCHAR(3)): ISO 4217 currency code (default `'INR'`).
- `payment_terms_days` (INTEGER): Contracted payment terms (e.g., 30, 45, 60 days).
- `risk_score` (NUMERIC(5,2), Nullable): AI computed risk assessment score (0.00 - 100.00).
- `parent_customer_id` (UUID, FK, Nullable): Self-referencing FK for parent enterprise groups.

### 2. `customer_contacts`
Normalized table for individual contact persons associated with accounts.
- `id` (UUID, PK)
- `customer_id` (UUID, FK): Parent customer.
- `name` (TEXT): Full contact name.
- `email` (TEXT): Email address.
- `phone` (TEXT, Nullable): Phone / Mobile number.
- `role_title` (TEXT, Nullable): Job title (e.g., AP Manager, CFO).
- `is_primary` (BOOLEAN): Indicates primary billing contact.

### 3. `invoices`
Accounts Receivable invoice entries.
- `id` (UUID, PK)
- `organization_id` (UUID, FK)
- `source_system`, `source_id` (TEXT)
- `customer_id` (UUID, FK)
- `number` (TEXT): Invoice reference number.
- `amount_minor_units` (BIGINT): Total invoice amount in integer minor units (e.g. ₹18,00,000.00 = 180000000).
- `currency` (VARCHAR(3)): ISO 4217 currency code.
- `tax_amount_minor_units` (BIGINT): Tax portion in minor units.
- `issue_date` (DATE): Invoice issuance date.
- `due_date` (DATE): Payment due date.
- `status` (ENUM): Strict status: `'open'`, `'partially_paid'`, `'paid'`, `'disputed'`, `'written_off'`, `'blocked'`.
- `po_reference` (TEXT, Nullable): Customer PO number.
- `delivery_reference` (TEXT, Nullable): Proof of Delivery / Bill of Lading reference.

### 4. `payments`
Cash receipts and incoming remittances.
- `id` (UUID, PK)
- `organization_id` (UUID, FK)
- `source_system`, `source_id` (TEXT)
- `customer_id` (UUID, FK)
- `amount_minor_units` (BIGINT): Received amount in integer minor units.
- `currency` (VARCHAR(3))
- `date` (DATE): Remittance date.
- `reference` (TEXT, Nullable): UTR / Cheque / Bank transaction narration.

### 5. `payment_invoice_matches`
Many-to-many join table for partial or multi-invoice cash application.
- `id` (UUID, PK)
- `organization_id` (UUID, FK)
- `payment_id` (UUID, FK)
- `invoice_id` (UUID, FK)
- `matched_amount_minor_units` (BIGINT): Allocated amount in integer minor units.
- `confidence` (NUMERIC(4,3), Nullable): AI reconciliation confidence score (0.000 to 1.000).

### 6. `credit_notes`
Credit adjustments and return allowances.
- `id` (UUID, PK)
- `organization_id` (UUID, FK)
- `customer_id` (UUID, FK)
- `amount_minor_units` (BIGINT): Adjustment amount in integer minor units.
- `currency` (VARCHAR(3))
- `date` (DATE)
- `reason` (TEXT, Nullable): Reason for credit note issuance.

### 7. `disputes` & `dispute_evidences`
Formal billing disputes raised by buyers.
- `disputes`: `invoice_id` (FK), `reason` (TEXT), `amount_minor_units` (BIGINT, partial dispute support), `status` (`'open'`, `'under_review'`, `'resolved'`, `'rejected'`), `resolution` (TEXT).
- `dispute_evidences`: `dispute_id` (FK), `file_name`, `file_url`, `file_type`, `uploaded_by_user_id`.

### 8. `exceptions`
First-class anomaly and delay tracking entity.
- `id` (UUID, PK)
- `organization_id` (UUID, FK)
- `customer_id` (UUID, FK, Nullable)
- `invoice_id` (UUID, FK, Nullable)
- `type` (TEXT): Category string (aligns with classification taxonomy in later layers).
- `severity` (ENUM): `'critical'`, `'high'`, `'medium'`, `'low'`.
- `owner_user_id` (UUID, FK, Nullable): Assigned finance manager.
- `evidence` (JSONB): Structured evidence payload.
- `recommended_action` (TEXT, Nullable): Action proposed by AI engine.
- `status` (ENUM): `'detected'`, `'classified'`, `'pending_approval'`, `'approved'`, `'executed'`, `'verified'`, `'rejected'`, `'closed'`.

---

## RLS Security Boundary Enforcement

Every table enforces PostgreSQL Row-Level Security:

```sql
CREATE POLICY tenant_isolation_<table_name> ON public.<table_name>
  FOR ALL USING (organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid);
```
