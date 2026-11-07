# AIOSpark — Real Data → Cash Unblock Lineage

## End-to-End Data Lineage Matrix

This matrix details the exact data lineage for verified Cash Unblock opportunities from raw source ingestion down to payment outcome verification.

| Opportunity ID | Customer | Invoice | Outstanding | Blocker | Evidence | Recommended Action | Verified Outcome |
| :--- | :--- | :--- | ---: | :--- | :--- | :--- | :--- |
| `queue_inv-prov-001` | PROV-CASH-CUST-001 | PROV-CASH-INV-001 | ₹1,00,000 | PO Quantity Mismatch | Billed 1,200 vs PO 1,000 | Reconcile PO line items with procurement | ₹25,000 initial payment matched; ₹1,00,000 actionable |
| `queue_inv-prov-002` | ACME Global | INV-2026-8801 | ₹4,50,000 | Customer Dispute | Commercial claim open | Review commercial dispute terms with Sales owner | Active dispute logged; waiting on customer |
| `queue_inv-prov-003` | TechCorp Pvt Ltd | INV-2026-9902 | ₹6,00,000 | Price Discrepancy | Unit price ₹1,200 vs PO ₹1,000 | Issue credit note / price adjustment | Approval required by Finance Manager |

---

## Controlled Lineage Verification Chain (`PROV-CASH-INV-001`)

```
+-----------------------------------------------------------------------------------+
| STEP 1: RAW SOURCE INGESTION                                                      |
| File: cash_pilot.csv | Row: 2                                                     |
| Invoice: PROV-CASH-INV-001 | Customer: PROV-CASH-CUST-001 | Amount: ₹1,25,000      |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| STEP 2: UDM PERSISTENCE & PAYMENT ALLOCATION                                      |
| Invoices Table: inv-prov-cash-001 (Amount: 12,500,000 minor units)               |
| Matches Table: match-prov-cash-01 (Allocated: 2,500,000 minor units)               |
| Net Outstanding: 10,000,000 minor units (₹1,00,000)                               |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| STEP 3: EXCEPTION LINKAGE                                                         |
| Exceptions Table: exc-prov-cash-01 (Type: PO_QUANTITY_MISMATCH)                   |
| Evidence: Billed 1,200 vs PO Authorized 1,000 (+200 units variance)               |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| STEP 4: CASH UNBLOCK QUEUE                                                        |
| Queue Engine: getCashUnblockQueue("org-cash-test-001")                            |
| Item: queue_inv-prov-cash-001 | Cash Affected: ₹1,00,000 | Status: ready_to_act   |
+-----------------------------------------------------------------------------------+
                                          │
                                          ▼
+-----------------------------------------------------------------------------------+
| STEP 5: ACTIONABLE OUTCOME VERIFICATION                                           |
| Additional Payment: ₹50,000 matched -> Cash Affected dynamically updates to ₹50k|
| Final Payment: ₹50,000 matched -> Invoice status 'paid' -> Removed from Queue     |
+-----------------------------------------------------------------------------------+
```
