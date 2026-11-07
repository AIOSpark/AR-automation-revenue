# AIOSpark — AI Context Provenance Matrix

## Context Element Provenance Mapping

This matrix maps every field passed into the AI Investigation context to its underlying PostgreSQL source table, UDM model, and durable provenance attributes.

| AI Context Field | Source UDM Entity | Database Column | Provenance Attributes Tracked |
| :--- | :--- | :--- | :--- |
| `invoice.id` | `Invoice` | `invoices.id` | `import_batch_id`, `source_file_name`, `source_row_number` |
| `invoice.amount` | `Invoice` | `invoices.amount` (paise) | Minor units precision, verified against source ledger |
| `invoice.currency` | `Invoice` | `invoices.currency` | Source system ISO code (`INR`) |
| `invoice.status` | `Invoice` | `invoices.status` | State machine transition history |
| `customer.id` | `Customer` | `customers.id` | `import_batch_id`, `source_file_name`, `source_row_number` |
| `customer.name` | `Customer` | `customers.name` | Normalized ERP name |
| `purchaseOrder.po_number` | `PurchaseOrder` | `purchase_orders.po_number` | Linked PO document hash & source record ID |
| `purchaseOrder.total_amount` | `PurchaseOrder` | `purchase_orders.total_amount` | Contractual ceiling value |
| `dispute.id` | `Dispute` | `disputes.id` | Internal exception tracker ID |
| `dispute.reason` | `Dispute` | `disputes.reason` | Verified claim category |
| `dataQualityFlags` | `DataQualityFlag` | `data_quality_flags` | Validation rule failure log |

---

## Controlled Verification Evidence Matrix

### Scenario 1: PO Quantity Mismatch (`PROV-AI-INV-001`)

- **Invoice Amount**: ₹1,25,000 (12,500,000 paise)
- **Invoice Line Qty**: 1,200 units @ ₹100/unit
- **PO Line Qty**: 1,000 units @ ₹100/unit
- **Calculated Variance**: +200 units (+₹20,000 variance)
- **AI Investigation Output**:
  - **Category**: `DISCREPANCY`
  - **Root Cause**: Quantity billed (1,200) exceeds PO authorized quantity (1,000).
  - **Evidence Grounding**: Verified against `invoices` row 42 and `purchase_orders` row 18 in batch `BATCH-PILOT-20260924`.

---

### Scenario 2: Zero / Sparse Data Handling (`PROV-AI-CLEAN-001`)

- **Tenant**: Clean Org (`org-ai-clean-test`)
- **Query**: Run investigation on empty org context.
- **Result**: `0` invoices returned, `0` evidence items constructed.
- **AI Investigation Output**:
  - **Category**: `UNKNOWN`
  - **Confidence**: `0.0`
  - **Summary**: Insufficient data available. Zero synthetic findings emitted.
