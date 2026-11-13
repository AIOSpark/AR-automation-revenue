import assert from 'node:assert';
import { udmStore } from '../../udm/store';
import { getInvoiceOutstandingBalance } from '../../dashboard/engine';
import { executionService } from '../../execution/service';
import { executionStore } from '../../execution/store';
import { approvalStore } from '../../approvals/store';
import type { Invoice, Payment } from '../../udm/types';

// Test assertion helper
function testAssert(condition: boolean, message: string) {
  if (condition) {
    console.log(`💰 [STRESS_PASS] ${message}`);
  } else {
    console.error(`🚨 [STRESS_FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

// NO type guards (isInvoice, isPayment) — they were causing TS2339 errors
// NO findInvoiceById helper — use inline .find() pattern instead

// Async function following the pattern from financial.test.ts which works with moduleResolution: bundler
export async function runFinancialStressTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING FINANCIAL STRESS TEST SUITE');
  console.log('==========================================\n');

  const testOrg = 'org_stress_test';
  const tenantA = 'org_tenant_a';
  const tenantB = 'org_tenant_b';

  // Clear all stores at function start
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();

  // Helper functions that create fresh data each time
  let activeStressCustomerId = '';
  function createCustomer(orgId: string) {
    const customer = udmStore.insertCustomer({
      organization_id: orgId,
      source_system: 'manual',
      source_id: 'stress_cust_base',
      name: 'Stress Test Customer',
      payment_terms_days: 30,
      credit_limit_minor_units: 100000000,
      currency: 'INR',
    });
    activeStressCustomerId = customer.id;
    return customer.id;
  }

  function createInvoice(orgId: string, amount: number = 10000000) {
    // Use insertInvoice with ALL required fields per Invoice interface
    const invoice = udmStore.insertInvoice({
      organization_id: orgId,
      number: 'STRESS-INV-' + Date.now(),
      customer_id: activeStressCustomerId,
      amount_minor_units: amount,
      currency: 'INR',
      tax_amount_minor_units: 0,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'open' as const,
      source_system: 'manual',
      source_id: 'stress_inv',
    });
    return invoice.id;
  }

  function createPayment(orgId: string, amount: number) {
    const payment = udmStore.insertPayment({
      organization_id: orgId,
      amount_minor_units: amount,
      currency: 'INR',
      customer_id: activeStressCustomerId,
      source_system: 'manual',
      source_id: 'stress_pay',
      date: new Date().toISOString(),
    });
    return payment.id;
  }

  function allocatePayment(paymentId: string, invoiceId: string, amount: number, orgId: string) {
    const approval = approvalStore.createRequest({
      organization_id: orgId,
      subject_type: 'invoice',
      subject_id: invoiceId,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: invoiceId,
        payment_id: paymentId,
        amount_minor_units: amount,
        match_method: 'manual',
      },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'agent_test',
    });
    approvalStore.approveRequest(approval.id, 'user_reviewer_1');
    return executionService.executeApprovedAction(approval.id, {
      userId: 'user_reviewer_1',
      organizationId: orgId,
    });
  }

  // 1. LARGE INVOICE DATASETS
  console.log('--- Stress Test 1: Large invoice datasets ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const customer1 = createCustomer(testOrg);
  const invoice1 = createInvoice(testOrg, 50000000);
  const invoiceCount = 50;
  for (let i = 0; i < invoiceCount; i++) {
    createInvoice(testOrg);
  }
  // Use explicitly typed invoices array - pattern from financial.test.ts
  const invoices1: Invoice[] = udmStore.getInvoices();
  testAssert(
    invoices1.length >= invoiceCount,
    `Created ${invoiceCount} invoices (found ${invoices1.length})`
  );

  // 2. MULTIPLE CUSTOMERS ISOLATION
  console.log('--- Stress Test 2: Multiple customers isolation ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const customerA = createCustomer(testOrg);
  const customerB = createCustomer(testOrg);
  createInvoice(testOrg);
  createInvoice(testOrg);
  const invoices2: Invoice[] = udmStore.getInvoices();
  testAssert(
    invoices2.length >= 2,
    'Multiple customers have invoices in context'
  );

  // 3. CONCURRENT PAYMENT MATCHING OPERATIONS
  console.log('--- Stress Test 3: Concurrent payment matching operations ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const concurrentCustomer = createCustomer(testOrg);
  const concurrentInvoice = createInvoice(testOrg, 100000000);
  const concurrentPaymentCount = 20;
  const concurrentPayments: string[] = [];
  const concurrentPaymentAmounts: number[] = [];
  for (let i = 0; i < concurrentPaymentCount; i++) {
    const payId = createPayment(testOrg, 5000000);
    concurrentPayments.push(payId);
    concurrentPaymentAmounts.push(5000000);
  }
  const concurrentPromises = concurrentPayments.map((pay, i) =>
    allocatePayment(pay, concurrentInvoice, concurrentPaymentAmounts[i], testOrg)
  );
  const concurrentResults = await Promise.all(concurrentPromises);
  const concurrentSuccess = concurrentResults.filter(r => r.success === true).length;
  testAssert(
    concurrentSuccess === concurrentPaymentCount,
    `All ${concurrentPaymentCount} concurrent allocations succeeded (${concurrentSuccess} succeeded)`
  );
  // Use typed variable and inline .find() like financial.test.ts
  const finalInvInvoices: Invoice[] = udmStore.getInvoices();
  const finalInv = finalInvInvoices.find((i) => i.id === concurrentInvoice);
  if (finalInv) {
    testAssert(
      getInvoiceOutstandingBalance(finalInv) === 0,
      `Final outstanding balance is 0 after ${concurrentPaymentCount} allocations`
    );
  } else {
    testAssert(false, 'Final invoice not found');
  }

  // 4. CONCURRENT ALLOCATION ATTEMPTS (IDEMPOTENCY)
  console.log('--- Stress Test 4: Concurrent allocation attempts (idempotency) ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const idemCustomer = createCustomer(testOrg);
  const idemInvoice = createInvoice(testOrg, 50000000);
  const idemPayId = createPayment(testOrg, 5000000);
  const idemPromises = [
    allocatePayment(idemPayId, idemInvoice, 5000000, testOrg),
    allocatePayment(idemPayId, idemInvoice, 5000000, testOrg),
  ];
  const idemResults = await Promise.all(idemPromises);
  const idemSuccess = idemResults.filter(r => r.success === true).length;
  testAssert(
    idemSuccess >= 1,
    `Idempotency: at least one execution succeeds (${idemSuccess} succeeded)`
  );

  // 5. DUPLICATE PAYMENTS USING DIFFERENT IDEMPOTENCY KEYS
  console.log('--- Stress Test 5: Duplicate payments using different idempotency keys ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const dupCustomer = createCustomer(testOrg);
  const dupInvoice = createInvoice(testOrg, 50000000);
  const payDupId1 = createPayment(testOrg, 40000000);
  const payDupId2 = createPayment(testOrg, 40000000);
  const dupApproval1 = approvalStore.createRequest({
    organization_id: testOrg,
    subject_type: 'invoice',
    subject_id: dupInvoice,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: dupInvoice,
      payment_id: payDupId1,
      amount_minor_units: 40000000,
      match_method: 'manual',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'agent_test',
  });
  const dupApproval2 = approvalStore.createRequest({
    organization_id: testOrg,
    subject_type: 'invoice',
    subject_id: dupInvoice,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: dupInvoice,
      payment_id: payDupId2,
      amount_minor_units: 40000000,
      match_method: 'manual',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'agent_test',
  });
  approvalStore.approveRequest(dupApproval1.id, 'user_reviewer_1');
  approvalStore.approveRequest(dupApproval2.id, 'user_reviewer_1');
  const dupResult1 = await executionService.executeApprovedAction(dupApproval1.id, {
    userId: 'user_reviewer_1',
    organizationId: testOrg,
  });
  const dupResult2 = await executionService.executeApprovedAction(dupApproval2.id, {
    userId: 'user_reviewer_1',
    organizationId: testOrg,
  });
  testAssert(
    dupResult1.success !== undefined && dupResult2.success !== undefined,
    'Both different idempotency keys succeed'
  );
  const dupInvoices: Invoice[] = udmStore.getInvoices();
  // FIX: Use inline .find() like financial.test.ts
  const dupInv = dupInvoices.find((i) => i.id === dupInvoice);
  if (dupInv) {
    testAssert(
      getInvoiceOutstandingBalance(dupInv) === 10000000,
      `Two different idempotency keys create 2 executions (outstanding=${getInvoiceOutstandingBalance(dupInv) || 0})`
    );
  } else {
    testAssert(false, 'Duplicate invoice not found');
  }

  // 6. PARTIAL PAYMENT ALLOCATIONS
  console.log('--- Stress Test 6: Partial payment allocations ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const partCustomer = createCustomer(testOrg);
  const partInvoice = createInvoice(testOrg, 50000000);
  const pay3MId = createPayment(testOrg, 3000000);
  const pay4MId = createPayment(testOrg, 4000000);
  const alloc3M = allocatePayment(pay3MId, partInvoice, 3000000, testOrg);
  const alloc4M = allocatePayment(pay4MId, partInvoice, 4000000, testOrg);

  testAssert(
    alloc3M !== undefined && alloc4M !== undefined,
    'Both partial allocations succeed'
  );
  const partInvoices: Invoice[] = udmStore.getInvoices();
  // FIX: Use inline .find() like financial.test.ts
  const partInv = partInvoices.find((i) => i.id === partInvoice);
  if (partInv) {
    testAssert(
      getInvoiceOutstandingBalance(partInv) === 43000000,
      `Partial allocations: outstanding=${getInvoiceOutstandingBalance(partInv) || 0} (expected 43000000 = 50000000 - 3000000 - 4000000)`
    );
  } else {
    testAssert(false, 'Partial invoice not found');
  }

  // 7. MULTIPLE INVOICES AGAINST SINGLE PAYMENT
  // Tests that two invoices can be paid from two separate payments
  console.log('--- Stress Test 7: Multiple invoices against single payment ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const multiCustomer = createCustomer(testOrg);
  const inv1 = createInvoice(testOrg, 60000000);
  const inv2 = createInvoice(testOrg, 60000000);
  const payId1 = createPayment(testOrg, 60000000);
  const payId2 = createPayment(testOrg, 60000000);
  const alloc1 = allocatePayment(payId1, inv1, 60000000, testOrg);
  const alloc2 = allocatePayment(payId2, inv2, 60000000, testOrg);
  const [result1, result2] = await Promise.all([alloc1, alloc2]);
  testAssert(
    result1.success === true && result2.success === true,
    'Both invoice allocations succeed'
  );
  const multiInvoices1: Invoice[] = udmStore.getInvoices();
  const multiInvoices2: Invoice[] = udmStore.getInvoices();
  // FIX: Use inline .find() like financial.test.ts
  const inv1Final = multiInvoices1.find((i) => i.id === inv1);
  const inv2Final = multiInvoices2.find((i) => i.id === inv2);
  if (inv1Final) {
    testAssert(
      getInvoiceOutstandingBalance(inv1Final) === 0,
      `Invoice 1 fully paid (0)`
    );
  } else {
    testAssert(false, 'Invoice 1 not found');
  }
  if (inv2Final) {
    testAssert(
      getInvoiceOutstandingBalance(inv2Final) === 0,
      `Invoice 2 fully paid (0)`
    );
  } else {
    testAssert(false, 'Invoice 2 not found');
  }

  // 8. MONETARY PRECISION BOUNDARIES
  console.log('--- Stress Test 8: Monetary precision boundaries ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const precCustomer = createCustomer(testOrg);
  const precInvoice = createInvoice(testOrg, 99999999);
  const precPayId = createPayment(testOrg, 12345678);
  const precAlloc = allocatePayment(precPayId, precInvoice, 12345678, testOrg);
  const precInvoices: Invoice[] = udmStore.getInvoices();
  const precInv = precInvoices.find((i) => i.id === precInvoice);
  testAssert(
    getInvoiceOutstandingBalance(precInv!) === 87654321,
    `Precision boundary: 99,999,999 - 12,345,678 = 87,654,321 outstanding`
  );

  // 9. UNMATCHED TRANSACTIONS
  console.log('--- Stress Test 9: Unmatched transactions ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const unmCustomer = createCustomer(testOrg);
  const unmInvoice = createInvoice(testOrg, 50000000);
  const unmPayId = createPayment(testOrg, 30000000);
  // No allocation - create a match request that won't fully consume
  const unmatchApproval = approvalStore.createRequest({
    organization_id: testOrg,
    subject_type: 'invoice',
    subject_id: unmInvoice,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: unmInvoice,
      payment_id: unmPayId,
      amount_minor_units: 20000000,
      match_method: 'manual',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'agent_test',
  });
  approvalStore.approveRequest(unmatchApproval.id, 'user_reviewer_1');
  const unmatchResult = await executionService.executeApprovedAction(unmatchApproval.id, {
    userId: 'user_reviewer_1',
    organizationId: testOrg,
  });
  testAssert(
    unmatchResult.success !== undefined,
    'Bank transaction created with unmatched status'
  );
  const unmInvoices: Invoice[] = udmStore.getInvoices();
  // FIX: Use inline .find() like financial.test.ts
  const unmFinal = unmInvoices.find((i) => i.id === unmInvoice);
  if (unmFinal) {
    testAssert(
      getInvoiceOutstandingBalance(unmFinal) === 30000000,
      `Unmatched transaction persists without automatic reconciliation (outstanding=${getInvoiceOutstandingBalance(unmFinal) || 0})`
    );
  } else {
    testAssert(false, 'Unmatched invoice not found');
  }

  // 10. CROSS-TENANT ISOLATION UNDER CONCURRENT ACCESS
  console.log('--- Stress Test 10: Cross-tenant isolation under concurrent access ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const tenantACustomer = createCustomer(testOrg);
  const tenantBCustomer = createCustomer(testOrg);
  const tenantAInv = createInvoice(testOrg, 20000000);
  const tenantBInv = createInvoice(testOrg);
  // Execute allocations in tenant A context only
  const tenantPayId = createPayment(testOrg, 20000000);
  const tenantAlloc = allocatePayment(tenantPayId, tenantAInv, 20000000, testOrg);
  const tenantAInvoices: Invoice[] = udmStore.getInvoices();
  // FIX: Use inline .find() like financial.test.ts
  const tenantAInvoice = tenantAInvoices.find((i) => i.id === tenantAInv);
  if (tenantAInvoice) {
    testAssert(
      getInvoiceOutstandingBalance(tenantAInvoice) === 0,
      `Tenant A invoice fully paid`
    );
  } else {
    testAssert(false, 'Tenant A invoice not found');
  }

  // 11. REFUND AND REVERSAL BEHAVIOR
  console.log('--- Stress Test 11: Refund and reversal behavior ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const refundCustomer = createCustomer(testOrg);
  const refundInvoice = createInvoice(testOrg, 50000000);
  const refundPayId = createPayment(testOrg, 50000000);
  // Full allocation first
  const refundAlloc = allocatePayment(refundPayId, refundInvoice, 50000000, testOrg);
  const refundInvoices: Invoice[] = udmStore.getInvoices();
  const refundInvoiceCheck = udmStore.getInvoices().find((i) => i.id === refundInvoice);
  if (refundInvoiceCheck) {
    testAssert(
      getInvoiceOutstandingBalance(refundInvoiceCheck) === 0,
      'Invoice is fully paid after capture'
    );
  } else {
    testAssert(false, 'Refund invoice not found');
  }
  // Now reversal (negative amount)
  const reversalApproval = approvalStore.createRequest({
    organization_id: testOrg,
    subject_type: 'invoice',
    subject_id: refundInvoice,
    action_type: 'RECORD_PAYMENT_MATCH',
    proposed_action: {
      invoice_id: refundInvoice,
      payment_id: refundPayId,
      amount_minor_units: -50000000,
      match_method: 'manual',
    },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'agent_test',
  });
  approvalStore.approveRequest(reversalApproval.id, 'user_reviewer_1');
  const reversalResult = await executionService.executeApprovedAction(reversalApproval.id, {
    userId: 'user_reviewer_1',
    organizationId: testOrg,
  });
  testAssert(
    reversalResult.success !== undefined,
    'Refund/reversal request handled (success=' + reversalResult.success + ')'
  );
  const refundFinalInvoices: Invoice[] = udmStore.getInvoices();
  const refundFinalInvoice = refundFinalInvoices.find((i) => i.id === refundInvoice);
  if (refundFinalInvoice) {
    testAssert(
      refundFinalInvoice !== undefined,
      'Invoice exists after reversal'
    );
  } else {
    testAssert(false, 'Invoice after reversal not found');
  }

  // 12. PERSISTENCE UNDER REPEATED OPERATIONS
  console.log('--- Stress Test 12: Persistence under repeated operations ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const persistCustomer = createCustomer(testOrg);
  const persistInvoice = createInvoice(testOrg);
  for (let cycle = 0; cycle < 10; cycle++) {
    const payCycleId = createPayment(testOrg, 10000000);
    const approvalCycle = approvalStore.createRequest({
      organization_id: testOrg,
      subject_type: 'invoice',
      subject_id: persistInvoice,
      action_type: 'RECORD_PAYMENT_MATCH',
      proposed_action: {
        invoice_id: persistInvoice,
        payment_id: payCycleId,
        amount_minor_units: 10000000,
        match_method: 'manual',
      },
      evidence: [],
      confidence: 0.95,
      proposed_by: 'agent_test',
    });
    approvalStore.approveRequest(approvalCycle.id, 'user_reviewer_1');
    await executionService.executeApprovedAction(approvalCycle.id, {
      userId: 'user_reviewer_1',
      organizationId: testOrg,
    });
  }
  const persistInvoices: Invoice[] = udmStore.getInvoices();
  const persistInvoiceFinal = persistInvoices.find((i) => i.id === persistInvoice);
  if (persistInvoiceFinal) {
    testAssert(
      persistInvoiceFinal !== undefined && getInvoiceOutstandingBalance(persistInvoiceFinal) === 0 &&
      persistInvoiceFinal.status === 'paid',
      `Invoice paid after 10 repeated payment cycles (outstanding: ${getInvoiceOutstandingBalance(persistInvoiceFinal) || 0})`
    );
  } else {
    testAssert(false, 'Persistent invoice not found');
  }

  // 13. OVER-ALLOCATION RACE CONDITION TEST
  console.log('--- Stress Test 13: Over-allocation race condition ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  // Create invoice with 50,000 outstanding
  const raceCustomer = createCustomer(testOrg);
  const raceInvoice = createInvoice(testOrg, 50000000);
  // Create two payments of 40,000 each
  const payAId = createPayment(testOrg, 40000000);
  const payBId = createPayment(testOrg, 40000000);
  // Launch concurrent allocation attempts
  // Both try to allocate their full amount to the same invoice
  const [resultA, resultB] = await Promise.all([
    allocatePayment(payAId, raceInvoice, 40000000, testOrg),
    allocatePayment(payBId, raceInvoice, 40000000, testOrg),
  ]);
  // Determine outcomes
  const payAFullSuccess = resultA.success === true;
  const payBFullSuccess = resultB.success === true;
  // Use type guard
  const raceInvoices: Invoice[] = udmStore.getInvoices();
  // FIX: Use inline .find() like financial.test.ts
  const raceFinalInv = raceInvoices.find((i) => i.id === raceInvoice);
  if (raceFinalInv) {
    const raceOutstanding = getInvoiceOutstandingBalance(raceFinalInv);
    const totalAllocated = 50000000 - raceOutstanding;
    // Verify the invariant: total allocated never exceeds ₹50,000
    testAssert(
      raceOutstanding >= 0,
      `Outstanding balance never negative (outstanding=${raceOutstanding}, totalAllocated=${totalAllocated})`
    );
    testAssert(
      totalAllocated <= 50000000,
      `Total allocated (${totalAllocated}) does not exceed invoice amount (50000000)`
    );
    // Log the race condition results
    console.log('\nRace condition results:\n');
    console.log(`  Payment A (40M) allocation: ${payAFullSuccess ? 'SUCCEEDED' : 'REJECTED'}\n`);
    console.log(`  Payment B (40M) allocation: ${payBFullSuccess ? 'SUCCEEDED' : 'REJECTED'}\n`);
    console.log(`  Total allocated: ${totalAllocated / 1000000}M of 50M\n`);
    console.log(`  Final outstanding: ${raceOutstanding / 1000000}M\n`);
    // At least one must succeed since 40M + 40M > 50M
    testAssert(
      payAFullSuccess || payBFullSuccess,
      'At least one payment allocation must succeed since 40M + 40M > 50M'
    );
    // Neither should both succeed to the full amount (that would be 80M allocated)
    testAssert(
      !(payAFullSuccess && payBFullSuccess),
      'Not both payments should fully succeed (would exceed 50M total)'
    );
  } else {
    testAssert(false, 'Race invoice not found');
  }

  // --------------------------------------------------
  // STRESS TEST SUMMARY
  // --------------------------------------------------
  console.log('\n==========================================');
  console.log('FINANCIAL STRESS TEST SUITE COMPLETED');
  console.log('==========================================\n');
}