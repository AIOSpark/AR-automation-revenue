# AIOSpark — Real Data → AI Investigation Lineage

## Data Lineage Trajectory

This document defines the complete end-to-end data lineage from raw file ingestion down to the final AI investigation report output.

```
+-------------------------------------------------------------------------+
| STEP 1: RAW INGESTION                                                  |
| Source File: pilot_o2c_data_2026.xlsx                                  |
| Sheet: Invoices | Row: 14                                              |
| Record: INV-2026-901 | Customer: ACME Corp | Amount: ₹1,25,000         |
+-------------------------------------------------------------------------+
                                   │
                                   ▼
+-------------------------------------------------------------------------+
| STEP 2: UDM PERSISTENCE                                                 |
| Table: invoices | ID: inv-901-uuid                                      |
| Organization: org-ai-investigation-test                                 |
| Provenance: batch_id=BATCH-PILOT-01, source_row=14                      |
+-------------------------------------------------------------------------+
                                   │
                                   ▼
+-------------------------------------------------------------------------+
| STEP 3: CONTEXT EXTRACTION                                              |
| Engine: buildReasoningContext("inv-901-uuid", "org-ai-investigation-test")|
| Action: SQL Query scoped strictly by organization_id                    |
| Fetched: Invoice, PO, Customer, Data Quality Flags                      |
+-------------------------------------------------------------------------+
                                   │
                                   ▼
+-------------------------------------------------------------------------+
| STEP 4: AI REASONING ENGINE                                             |
| Function: analyzeInvoice(context)                                       |
| Computations:                                                           |
|   - Line Item Qty Delta: 1,200 (Inv) vs 1,000 (PO) = +200              |
|   - Monetary Variance: 200 * ₹100 = ₹20,000                             |
+-------------------------------------------------------------------------+
                                   │
                                   ▼
+-------------------------------------------------------------------------+
| STEP 5: AI INVESTIGATION REPORT & NEXT-BEST-ACTION                       |
| Root Cause: Quantity discrepancy of 200 units                           |
| Action Recommended: Issue Credit Note for ₹20,000 or seek PO amendment  |
| Confidence: 0.95 | Evidence Items: 3 Lineage-Verified Findings        |
+-------------------------------------------------------------------------+
```

---

## Lineage Verification Checklist

- [x] **File-to-Database Traceability**: `import_batch_id` and `source_row_number` preserved end-to-end.
- [x] **Database-to-Context Traceability**: UDM models mapped 1:1 without data loss or key renaming.
- [x] **Context-to-Reasoning Traceability**: Fact vs inference separation strictly enforced.
- [x] **Reasoning-to-Action Traceability**: Recommended actions cite exact underlying invoice line and PO variance.
