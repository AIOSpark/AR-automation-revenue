// AIOSpark Layer 7 Data Import Test Suite with Deliberately Corrupted Data

import { importEngine } from '../engine';
import { udmStore } from '../../udm/store';

export async function runImportPipelineTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 7 IMPORT TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`🚀 [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  importEngine.clearAll();
  udmStore.clearAll();

  const orgId = 'org-import-test-123';
  udmStore.setTenantContext(orgId);

  // 1. Deliberately Corrupted Sample Data Batch
  const corruptedPayload = [
    { customer_name: 'Acme Corp', invoice_number: 'INV-001', amount: '1200.00', due_date: '2026-09-30' }, // Valid
    { customer_name: '', invoice_number: 'INV-002', amount: '500.00', due_date: '2026-09-30' }, // Missing Customer Name
    { customer_name: 'Beta Ltd', invoice_number: 'INV-003', amount: '-150.00', due_date: '2026-09-30' }, // Negative Amount
    { customer_name: 'Gamma Inc', invoice_number: 'INV-004', amount: 'abc', due_date: '2026-09-30' }, // Non-numeric Amount
    { customer_name: 'Delta LLC', invoice_number: 'INV-005', amount: '900.00', due_date: '' }, // Missing Due Date
    { customer_name: 'Epsilon Co', invoice_number: 'INV-006', amount: '3500.00', due_date: '2026-10-15' }, // Valid
  ];

  const batch1 = importEngine.createBatch(
    { organizationId: orgId, sourceSystem: 'csv', dateFormatConvention: 'YYYY-MM-DD' },
    corruptedPayload
  );

  const res1 = importEngine.processBatch(batch1.id, {
    organizationId: orgId,
    sourceSystem: 'csv',
    dateFormatConvention: 'YYYY-MM-DD',
  });

  assert(res1.successCount === 2 && res1.skippedCount === 4, '1a. Corrupted Data Fault Tolerance - Processed valid rows and skipped 4 bad rows');
  assert(res1.summary.includes('2 invoices imported successfully, 4 skipped'), '1b. User-Facing Summary - Plain language summary generated correctly');

  const errors = importEngine.getBatchErrors(batch1.id);
  const errorReasons = errors.map((e) => e.reason);
  assert(
    errorReasons.some((r) => r.includes('Missing customer name')) &&
      errorReasons.some((r) => r.includes('not a valid non-negative number')) &&
      errorReasons.some((r) => r.includes('Missing due date')),
    '1c. Human-Readable Error Log - Captured specific field failure reasons'
  );

  // 2. Re-import Idempotency Test (Import Same File Twice)
  const initialInvoiceCount = udmStore.getInvoices().length;

  const batch2 = importEngine.createBatch(
    { organizationId: orgId, sourceSystem: 'csv', dateFormatConvention: 'YYYY-MM-DD' },
    corruptedPayload
  );
  importEngine.processBatch(batch2.id, {
    organizationId: orgId,
    sourceSystem: 'csv',
    dateFormatConvention: 'YYYY-MM-DD',
  });

  const postReimportInvoiceCount = udmStore.getInvoices().length;
  assert(initialInvoiceCount === postReimportInvoiceCount, '2a. Re-import Idempotency - Re-importing exact file created zero duplicate invoices');

  // 3. Ambiguous Date Format Handling (DD/MM/YYYY vs MM/DD/YYYY)
  const dateStr = importEngine.parseDate('12/05/2026', 'DD/MM/YYYY');
  assert(dateStr === '2026-05-12', '3a. Date Resolution - Explicit DD/MM/YYYY format parsed as 2026-05-12');

  const usDateStr = importEngine.parseDate('12/05/2026', 'MM/DD/YYYY');
  assert(usDateStr === '2026-12-05', '3b. Date Resolution - Explicit MM/DD/YYYY format parsed as 2026-12-05');

  // 4. Fuzzy Duplicate Match Routing
  const fuzzyPayload = [
    { customer_name: 'Acme Corp', invoice_number: 'INV-999', amount: '1200.00', due_date: '2026-09-30' },
  ];
  const batch3 = importEngine.createBatch({ organizationId: orgId, sourceSystem: 'csv' }, fuzzyPayload);
  importEngine.processBatch(batch3.id, { organizationId: orgId, sourceSystem: 'csv' });

  const dups = importEngine.getDuplicates(orgId);
  assert(dups.length > 0 && dups[0].confidence === 0.85, '4a. Fuzzy Match Pass - Flagged possible duplicate for human review queue');

  // 5. Large Batch Stress Test (1,500 rows)
  const largeBatchPayload = [];
  for (let i = 1; i <= 1500; i++) {
    largeBatchPayload.push({
      customer_name: `Stress Customer ${i % 50}`,
      invoice_number: `PERF-INV-${i}`,
      amount: `${(i * 10).toFixed(2)}`,
      due_date: '2026-11-30',
    });
  }

  const startTime = Date.now();
  const batchStress = importEngine.createBatch({ organizationId: orgId, sourceSystem: 'csv' }, largeBatchPayload);
  const stressRes = importEngine.processBatch(batchStress.id, { organizationId: orgId, sourceSystem: 'csv' });
  const durationMs = Date.now() - startTime;

  assert(stressRes.successCount === 1500 && durationMs < 2000, `5a. Large Batch Performance - Ingested 1,500 records in ${durationMs}ms (<2000ms)`);

  console.log('\n==========================================');
  console.log(`IMPORT SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
