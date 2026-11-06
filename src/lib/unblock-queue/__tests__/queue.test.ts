// AIOSpark Cash Unblock Queue Suite (Prompt 17B)

import { udmStore } from '../../udm/store';
import { getCashUnblockQueue, getUnblockQueueSummary } from '../engine';

export async function runCashUnblockQueueTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING PROMPT 17B CASH UNBLOCK QUEUE SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`⚡ [QUEUE_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [QUEUE_FAIL] ${message}`);
      failed++;
    }
  }

  const testOrg = 'org_queue_test';
  udmStore.setTenantContext(testOrg);

  // Setup Mock Golden Record: ABC Industries, INV-1048, ₹18.4L, PO mismatch
  const cust = udmStore.insertCustomer({
    organization_id: testOrg,
    name: 'ABC Industries',
    source_system: 'manual',
    source_id: 'cust_queue_1',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv = udmStore.insertInvoice({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'inv_queue_1',
    customer_id: cust.id,
    number: 'INV-1048',
    amount_minor_units: 184000000, // ₹18,40,000 (₹18.4 Lakhs)
    tax_amount_minor_units: 33120000,
    currency: 'INR',
    issue_date: '2026-07-01',
    due_date: '2026-08-01', // 42 days overdue
    status: 'open',
    po_reference: 'PO-1048-XYZ',
  });

  udmStore.insertException({
    organization_id: testOrg,
    invoice_id: inv.id,
    customer_id: cust.id,
    type: 'PO_MISMATCH',
    severity: 'high',
    status: 'detected',
    evidence: { description: 'Quantity variance detected between invoice line items and PO' },
    recommended_action: 'Resolve PO mismatch before issuing collection reminder',
  });

  // 1. Queue Generation Test
  const queue = getCashUnblockQueue(testOrg);
  testAssert(queue.length === 1, 'Golden Test: Queue generated 1 actionable unblock item');
  const item = queue[0];

  testAssert(item.customerName === 'ABC Industries', 'Golden Test: Account name matches ABC Industries');
  testAssert(item.invoiceNumber === 'INV-1048', 'Golden Test: Invoice number matches INV-1048');
  testAssert(item.cashAffectedMinorUnits === 184000000, 'Golden Test: Cash Affected matches ₹18,40,000 exactly');
  testAssert(item.priority === 'CRITICAL', 'Golden Test: Priority evaluated as CRITICAL due to overdue age & amount');
  testAssert(item.actionability === 'ACTIONABLE_NOW', 'Golden Test: Actionability classified as ACTIONABLE_NOW');
  testAssert(item.recommendedNextAction.includes('PO mismatch') || item.recommendedNextAction.includes('procurement'), 'Golden Test: Recommended Action directs to PO mismatch resolution');

  // 2. Queue Summary Metrics Test
  const summary = getUnblockQueueSummary(testOrg);
  testAssert(summary.totalCashAffectedMinorUnits === 184000000, 'Metrics Test: Total Cash Affected matches UDM outstanding total');
  testAssert(summary.actionableCashMinorUnits === 184000000, 'Metrics Test: Actionable Cash strictly segregated from Recovered Cash');
  testAssert(summary.recoveredCashMinorUnits === 0, 'Metrics Test: Recovered Cash remains ₹0 until payment is reconciled');

  console.log('\n==========================================');
  console.log(`CASH UNBLOCK QUEUE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
