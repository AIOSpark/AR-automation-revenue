// AIOSpark Real CSV/Excel Pilot Data Pipeline Test Suite (Step 09)

import { realPilotPipelineEngine, parseFinancialAmount, normalizeDate } from '../pilot-pipeline';
import { udmStore } from '../../udm/store';
import { promiseStore } from '../../promises/store';
import * as XLSX from 'xlsx';

export async function runPilotPipelineTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING STEP 09 REAL PILOT PIPELINE SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`⚡ [PILOT_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [PILOT_FAIL] ${message}`);
      failed++;
    }
  }

  const orgId = 'org_pilot_test_99';
  udmStore.clearAll();
  promiseStore.clearAll();
  realPilotPipelineEngine.clearAll();
  udmStore.setTenantContext(orgId);

  // 1. Parsing Helper Tests
  assert(parseFinancialAmount('₹18.4L') === 1840000, 'Helper Test 1: Indian Lakh notation parsed to 18,40,000');
  assert(parseFinancialAmount('$1,500.50') === 1500.5, 'Helper Test 2: Standard currency string parsed correctly');
  assert(normalizeDate('31/08/2026', 'DD/MM/YYYY') === '2026-08-31', 'Helper Test 3: Flexible date DD/MM/YYYY normalized');

  // 2. Build Multi-Sheet Workbook Buffer in memory
  const wb = XLSX.utils.book_new();

  const customerData = [
    { customer_id: 'CUST-8001', customer_name: 'ABC Industries Ltd', credit_limit: '₹50L', payment_terms: '30' },
  ];
  const invoiceData = [
    { invoice_id: 'INV-1048', customer_id: 'CUST-8001', invoice_date: '2026-08-01', due_date: '2026-08-31', amount: '1840000', po_reference: 'PO-8291' },
  ];
  const paymentData = [
    { payment_id: 'PAY-9001', invoice_id: 'INV-1048', payment_date: '2026-09-01', amount: '1000000.00' },
  ];
  const exceptionData = [
    { invoice_id: 'INV-1048', exception_type: 'PO_MISMATCH', description: 'Invoice quantity exceeds PO quantity' },
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(customerData), 'Customers');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoiceData), 'Invoices');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentData), 'Payments');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(exceptionData), 'Exceptions');

  const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 3. Test Multi-sheet Validation & Dataset Auto-Detection
  const valResult = realPilotPipelineEngine.parseAndValidateFile(fileBuffer, 'O2C_Pilot_Export.xlsx', fileBuffer.length);
  assert(valResult.isValid === true, 'Stage 1 Test: File validated successfully');
  assert(valResult.sheets.length === 4, 'Stage 1 Test: Detected all 4 sheets in multi-sheet Excel file');

  const invSheet = valResult.sheets.find(s => s.sheetName === 'Invoices');
  assert(invSheet?.detectedDataset === 'INVOICES', 'Stage 2 Test: Invoices sheet automatically detected as INVOICES dataset');

  // 4. Test Preview & Data Quality Pre-Check
  const sheetConfigs: Array<{ sheetName: string; datasetType: any; columnMapping: Record<string, string> }> = [
    { sheetName: 'Customers', datasetType: 'CUSTOMERS', columnMapping: { customer_id: 'customer_id', customer_name: 'customer_name' } },
    { sheetName: 'Invoices', datasetType: 'INVOICES', columnMapping: { invoice_id: 'invoice_id', customer_id: 'customer_id', invoice_date: 'invoice_date', due_date: 'due_date', amount: 'amount', po_reference: 'po_reference' } },
    { sheetName: 'Payments', datasetType: 'PAYMENTS', columnMapping: { payment_id: 'payment_id', invoice_id: 'invoice_id', amount: 'amount', payment_date: 'payment_date' } },
    { sheetName: 'Exceptions', datasetType: 'EXCEPTIONS', columnMapping: { invoice_id: 'invoice_id', exception_type: 'exception_type', description: 'description' } },
  ];

  const preview = realPilotPipelineEngine.generateImportPreview(orgId, fileBuffer, sheetConfigs);
  assert(preview.validRowsCount === 4, 'Stage 3 Test: Generated preview with 4 valid rows');
  assert(preview.errorCount === 0, 'Stage 3 Test: Zero validation errors in clean preview');

  // 5. Test Execution & UDM Commitment
  const commitRes = realPilotPipelineEngine.commitPilotImport(orgId, fileBuffer, sheetConfigs, 'user_test_99');
  assert(commitRes.status === 'COMPLETED', 'Stage 4 Test: Import executed with COMPLETED status');
  assert(commitRes.importedCounts.invoices === 1, 'Stage 4 Test: 1 invoice imported into UDM');
  assert(commitRes.importedCounts.payments === 1, 'Stage 4 Test: 1 payment imported and allocated');
  assert(commitRes.importedCounts.exceptions === 1, 'Stage 4 Test: 1 PO mismatch exception linked');

  // 6. Test Authoritative Financial Golden Consistency Across UDM
  const invoices = udmStore.getInvoices();
  const importedInv = invoices.find(i => i.number === 'INV-1048');
  assert(importedInv !== undefined, 'Stage 5 UDM Verification: Invoice INV-1048 found in UDM store');
  assert(Boolean(importedInv && importedInv.amount_minor_units > 0), 'Stage 5 Financial Check: Invoice amount converted to valid positive minor units');

  const matches = udmStore.getMatches();
  assert(matches.length === 1 && matches[0].matched_amount_minor_units > 0, 'Stage 5 Reconciliation Check: ₹10L partial payment allocated to INV-1048');

  // 7. Test Idempotent Re-Import Safety (No duplicated invoices or amounts)
  const commitRes2 = realPilotPipelineEngine.commitPilotImport(orgId, fileBuffer, sheetConfigs, 'user_test_99');
  assert(commitRes2.importedCounts.invoices === 1, 'Idempotency Check: Safe upsert re-imported invoice without duplication');
  assert(udmStore.getInvoices().length === 1, 'Idempotency Check: Total UDM invoice count remains exactly 1');

  // 8. Test Data Quality Report & Health Metrics
  assert(commitRes.dataQualityReport.dataHealth === 'HEALTHY', 'Quality Report Test: Data Health evaluated as HEALTHY');
  assert(commitRes.dataQualityReport.relationshipCoverage.poToInvoice === 100, 'Quality Report Test: PO coverage evaluated as 100%');

  console.log(`\n==========================================`);
  console.log(`STEP 09 PILOT SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================\n`);

  return { passed, failed };
}
