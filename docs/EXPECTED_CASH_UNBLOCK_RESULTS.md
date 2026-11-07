# AIOSpark — Expected Cash Unblock Verification Results

## Controlled Scenario Independent Calculations

### Scenario Parameters (`PROV-CASH-TEST-001`)

- **Customer Name**: `PROV-CASH-CUST-001`
- **Invoice Number**: `PROV-CASH-INV-001`
- **Gross Invoice Amount**: ₹1,25,000 (12,500,000 paise)
- **Initial Allocated Payment**: ₹25,000 (2,500,000 paise)
- **Blocker Type**: `PO_QUANTITY_MISMATCH` (PO Qty: 1,000 vs Billed Qty: 1,200)

---

## Independent Calculation Matrix

| Verification Phase | Action / Event | Gross Amount | Allocated Payments | Outstanding Balance | Actionable Cash | Cash Unblock Queue Status |
| :--- | :--- | ---: | ---: | ---: | ---: | :--- |
| **Phase 4 & 7** | Initial Import + Partial Payment | ₹1,25,000 | ₹25,000 | **₹1,00,000** | **₹1,00,000** | Active (`ready_to_act`) |
| **Phase 9** | Simulator Evaluation | ₹1,25,000 | ₹25,000 | **₹1,00,000** | **₹1,00,000** | Read-Only Scenario (`isReadOnly: true`) |
| **Phase 12** | Partial Payment (+₹50,000) | ₹1,25,000 | ₹75,000 | **₹50,000** | **₹50,000** | Active (`ready_to_act`, updated amount) |
| **Phase 11** | Full Payment (+₹50,000) | ₹1,25,000 | ₹1,25,000 | **₹0** | **₹0** | **Closed / Removed from Queue** |

---

## Zero-Data Verification Baseline (`PROV-CASH-CLEAN-001`)

- **Organization ID**: `org-cash-clean-test`
- **Customers**: 0
- **Invoices**: 0
- **Payments**: 0
- **Exceptions**: 0
- **Queue Items**: 0
- **Actionable Cash**: ₹0

---

## Overpayment Financial Safety Baseline

- Attempting to allocate payments exceeding gross invoice balance triggers financial control rejection.
- Cash Unblock actionable amount is capped strictly by `Math.max(0, invoice.amount - totalAllocated)`.
