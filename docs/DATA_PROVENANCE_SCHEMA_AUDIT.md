# DATA PROVENANCE SCHEMA AUDIT

> **Audit Status:** Completed  
> **Target Schema:** Universal Data Model (UDM) Types (`src/lib/udm/types.ts`) & Import Engine Models (`src/lib/import/pilot-pipeline.ts`)

---

## 1. Overview of Existing Entity Provenance Fields

An audit of the primary financial entities in `src/lib/udm/types.ts` reveals that baseline entity-level provenance fields exist across core types, but key transformation and source-file level metadata fields are currently missing or unpopulated during batch ingestion.

---

## 2. Entity Field Provenance Audit Matrix

| UDM Entity | Available Provenance Fields | Mandatory Fields | Optional / Missing Fields | Provenance Status |
| :--- | :--- | :--- | :--- | :--- |
| **Customer** | `organization_id`, `source_system`, `source_id`, `created_at`, `updated_at` | `organization_id`, `source_system`, `source_id` | `import_batch_id`, `file_name`, `created_by`, `raw_data` | **PARTIALLY VERIFIED** |
| **Invoice** | `organization_id`, `source_system`, `source_id`, `number`, `po_reference`, `delivery_reference`, `created_at`, `updated_at` | `organization_id`, `source_system`, `source_id`, `number` | `import_batch_id`, `file_name`, `source_row`, `created_by` | **PARTIALLY VERIFIED** |
| **Payment** | `organization_id`, `source_system`, `source_id`, `reference`, `created_at`, `updated_at` | `organization_id`, `source_system`, `source_id` | `import_batch_id`, `file_name`, `bank_statement_id` | **PARTIALLY VERIFIED** |
| **PaymentInvoiceMatch** | `organization_id`, `payment_id`, `invoice_id`, `match_method`, `confidence`, `created_at` | `organization_id`, `payment_id`, `invoice_id` | `match_method` (optional), `matched_by_user_id` | **PARTIALLY VERIFIED** |
| **ExceptionRecord** | `organization_id`, `customer_id`, `invoice_id`, `evidence` (JSON), `created_at`, `updated_at` | `organization_id`, `type`, `severity` | `detected_by_agent_id`, `import_batch_id` | **PARTIALLY VERIFIED** |
| **BankTransaction** | `organization_id`, `source_system`, `raw_reference`, `narration_text`, `status`, `created_at`, `updated_at` | `organization_id`, `source_system` | `file_name`, `account_number`, `import_batch_id` | **PARTIALLY VERIFIED** |
| **CreditNote** | `organization_id`, `source_system`, `source_id`, `customer_id`, `created_at`, `updated_at` | `organization_id`, `source_system`, `source_id` | `linked_invoice_id`, `import_batch_id` | **PARTIALLY VERIFIED** |
| **Dispute** | `organization_id`, `invoice_id`, `reason`, `status`, `created_at`, `updated_at` | `organization_id`, `invoice_id` | `created_by_user_id`, `evidence_files` | **PARTIALLY VERIFIED** |

---

## 3. Key Findings & Provenance Information Loss

1. **Import Batch Disconnection**: While `PilotPipelineEngine` creates a `batchId` (e.g. `import_commit_...`), this `batchId` is tracked in application memory (`this.importHistories`) rather than attached directly onto individual UDM entity rows (`Invoice.import_batch_id`).
2. **Source Row / File Lineage Loss**: Individual rows within a CSV or XLSX sheet lose their row-level offset (`rowNumber`) and original file name (`file_name`) once committed to the UDM store.
3. **In-Memory Store Persistence Boundary**: Production code currently relies on the singleton `udmStore` in TypeScript memory. Process restarts clear non-persisted in-memory stores unless backed by PostgreSQL DB adapter sync.
