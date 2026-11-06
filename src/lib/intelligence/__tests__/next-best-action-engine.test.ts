// AIOSpark Next-Best-Action Engine Test Suite (Step 07)

import { NextBestActionEngine } from '../next-best-action-engine';
import { udmStore } from '../../udm/store';
import { promiseStore } from '../../promises/store';

export async function runNextBestActionTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING STEP 07 NEXT-BEST-ACTION ENGINE SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`⚡ [NBA_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [NBA_FAIL] ${message}`);
      failed++;
    }
  }

  const orgId = 'org_nba_test';
  udmStore.clearAll();
  promiseStore.clearAll();
  udmStore.setTenantContext(orgId);

  const testCust = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'cust_001',
    name: 'ABC Industries',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const testInv = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'inv_001',
    customer_id: testCust.id,
    number: 'INV-1048',
    amount_minor_units: 18400000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
    po_reference: 'PO-8291',
  });

  udmStore.insertException({
    organization_id: orgId,
    invoice_id: testInv.id,
    customer_id: testCust.id,
    type: 'PURCHASE_ORDER_MISMATCH',
    severity: 'high',
    status: 'detected',
    evidence: { description: 'Invoice quantity exceeds PO quantity' },
  });

  // SCENARIO A: PO Mismatch -> Recommend REQUEST PO REVIEW
  const recA = NextBestActionEngine.evaluateCase(testInv.id, orgId);
  assert(recA !== null, 'Scenario A: Evaluated case successfully');
  if (recA) {
    assert(recA.actionType === 'REQUEST_INFORMATION', 'Scenario A: Recommends REQUEST_INFORMATION');
    assert(recA.actionLabel === 'REQUEST PO REVIEW', 'Scenario A: Recommends REQUEST PO REVIEW');
    assert(recA.ownerTeam === 'Procurement', 'Scenario A: Owner is Procurement');
    assert(recA.actionabilityState === 'WAITING_ON_INTERNAL_TEAM', 'Scenario A: State is WAITING_ON_INTERNAL_TEAM');
    const contactAlt = recA.alternatives.find(a => a.actionType === 'FOLLOW_UP_WITH_CUSTOMER');
    assert(Boolean(contactAlt), 'Scenario A: Contact Customer present as alternative');
    assert(Boolean(contactAlt?.whyNotPreferredReason?.includes('Internal blocker')), 'Scenario A: Customer follow-up flagged non-preferred due to internal blocker');
  }

  // SCENARIO B & C: Payment Promises
  const invFuture = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'inv_prom_future',
    customer_id: testCust.id,
    number: 'INV-FUTURE',
    amount_minor_units: 18400000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
  });

  promiseStore.createPromise({
    organization_id: orgId,
    invoice_id: invFuture.id,
    customer_id: testCust.id,
    promised_amount_minor_units: 18400000,
    expected_date: '2099-12-31',
    recorded_via: 'manual_note',
    recorded_by_user_id: 'user_test',
  });

  const recFuture = NextBestActionEngine.evaluateCase(invFuture.id, orgId);
  assert(recFuture !== null, 'Scenario B: Evaluated future promise case');
  if (recFuture) {
    assert(recFuture.actionLabel === 'WAIT UNTIL PROMISE DATE', 'Scenario B: Recommends WAIT UNTIL PROMISE DATE for future promise');
    assert(recFuture.actionabilityState === 'WAITING_ON_CUSTOMER', 'Scenario B: Actionability is WAITING_ON_CUSTOMER');
  }

  const invBroken = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'inv_prom_broken',
    customer_id: testCust.id,
    number: 'INV-BROKEN',
    amount_minor_units: 18400000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2020-01-01',
    due_date: '2020-01-31',
    status: 'open',
  });

  promiseStore.createPromise({
    organization_id: orgId,
    invoice_id: invBroken.id,
    customer_id: testCust.id,
    promised_amount_minor_units: 18400000,
    expected_date: '2020-01-01',
    recorded_via: 'manual_note',
    recorded_by_user_id: 'user_test',
  });

  const recBroken = NextBestActionEngine.evaluateCase(invBroken.id, orgId);
  assert(recBroken !== null, 'Scenario C: Evaluated broken promise case');
  if (recBroken) {
    assert(recBroken.actionLabel === 'FOLLOW UP ON BROKEN PROMISE', 'Scenario C: Recommends FOLLOW UP ON BROKEN PROMISE for expired promise');
    assert(recBroken.actionType === 'FOLLOW_UP_ON_PAYMENT_PROMISE', 'Scenario C: ActionType is FOLLOW_UP_ON_PAYMENT_PROMISE');
  }

  const invUnalloc = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'src_inv_unalloc_99',
    customer_id: testCust.id,
    number: 'INV-UNALLOC-99',
    amount_minor_units: 18400000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
  });

  udmStore.insertPayment({
    organization_id: orgId,
    source_system: 'bank',
    source_id: 'INV-UNALLOC-99',
    customer_id: testCust.id,
    amount_minor_units: 18400000,
    currency: 'INR',
    date: '2026-09-01',
  });

  const recUnalloc = NextBestActionEngine.evaluateCase(invUnalloc.id, orgId);
  assert(recUnalloc !== null, 'Scenario D: Evaluated unallocated payment case');
  if (recUnalloc) {
    assert(recUnalloc.actionType === 'MATCH_PAYMENT', 'Scenario D: Recommends MATCH_PAYMENT when bank deposit exists');
    assert(recUnalloc.actionLabel === 'REVIEW PAYMENT MATCH', 'Scenario D: Label is REVIEW PAYMENT MATCH');
  }

  // State recheck before execution
  const checkBefore = NextBestActionEngine.verifyFreshnessAndState(testInv.id, orgId);
  assert(checkBefore.isValid === true, 'Freshness check: Fresh recommendation is valid');

  const invoices = udmStore.getInvoices();
  const inv1 = invoices.find(i => i.id === testInv.id);
  if (inv1) (inv1 as any).status = 'paid';

  const checkAfter = NextBestActionEngine.verifyFreshnessAndState(testInv.id, orgId);
  assert(checkAfter.isValid === false, 'Freshness check: Invalidated when invoice is paid');
  assert(Boolean(checkAfter.reason?.includes('Invoice has been marked paid')), 'Freshness check: Reason identifies state change');

  // User feedback logging
  const fb = NextBestActionEngine.recordFeedback({
    recommendationId: 'rec_test_1',
    invoiceId: testInv.id,
    userRole: 'Finance Manager',
    feedbackType: 'ACCEPT',
  });
  assert(Boolean(fb.timestamp), 'Feedback: Timestamp set on feedback record');
  assert(NextBestActionEngine.getFeedbackLogs().length > 0, 'Feedback: Recorded in audit store');

  console.log(`\n==========================================`);
  console.log(`STEP 07 SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================\n`);

  return { passed, failed };
}

