import { udmStore } from './src/lib/udm/store';
import type { Invoice } from './src/lib/udm/types';
import { getInvoiceOutstandingBalance } from '@/dashboard/engine';
import { executionService } from '@/execution/service';
import { executionStore } from '@/execution/store';
import { approvalStore } from '@/approvals/store';

function testAssert(condition: boolean, message: string) {
  if (condition) {
    console.log(`💰 [STRESS_PASS] ${message}`);
  } else {
    console.error(`🚨 [STRESS_FAIL] ${message}`);
  }
}

udmStore.clearAll();
udmStore.setTenantContext('org_stress_test');
executionStore.clearAll();
approvalStore.clearAll();

export async function runFinancialStressTestSuite() {
  const testOrg = 'org_stress_test';
  
  // Clear all stores at function start
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();

  // Helper functions that create fresh data each time
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
    return customer.id;
  }

  function createInvoice(orgId: string, amount: number = 10000000) {
    const invoice = udmStore.insertInvoice({
      organization_id: orgId,
      number: 'STRESS-INV-' + Date.now(),
      customer_id: 'stress_cust',
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

  function createPayment(amount: number, orgId: string) {
    const payment = udmStore.insertPayment({
      organization_id: orgId,
      amount_minor_units: amount,
      currency: 'INR',
      customer_id: 'stress_cust',
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

  // 3. CONCURRENT PAYMENT MATCHING OPERATIONS
  console.log('--- Stress Test 3: Concurrent payment matching operations ---');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);
  executionStore.clearAll();
  approvalStore.clearAll();
  const concurrentCustomer = createCustomer(testOrg);
  const concurrentInvoice = createInvoice(testOrg, 100000000);
  const concurrentPaymentCount = 20;
  const concurrentPayments = [];
  for (let i = 0; i < concurrentPaymentCount; i++) {
    concurrentPayments.push(createPayment(5000000, testOrg));
  }
  const concurrentPromises = concurrentPayments.map((pay) =>
    allocatePayment(pay.id, concurrentInvoice.id, pay.amount_minor_units, testOrg)
  );
  const concurrentResults = await Promise.all(concurrentPromises);
  const concurrentSuccess = concurrentResults.filter(r => r === undefined).length;
  testAssert(
    concurrentSuccess === concurrentPaymentCount,
    `All ${concurrentPaymentCount} concurrent allocations succeeded (${concurrentSuccess} succeeded)`
  );
  // Use typed variable and inline .find() like financial.test.ts
  const finalInvoices: Invoice[] = udmStore.getInvoices();
  const finalInv = finalInvoices.find(i => i.id === concurrentInvoice.id);
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
  const idemPay = createPayment(5000000, testOrg);
  const idemPromises = [
    allocatePayment(idemPay.id, idemInvoice.id, idemPay.amount_minor_units, testOrg),
    allocatePayment(idemPay.id, idemInvoice.id, idemPay.amount_minor_units, testOrg),
  ];
  const idemResults = await Promise.all(idemPromises);
  const idemSuccess = idemResults.filter(r => r === undefined).length;
  testAssert(
    idemSuccess === 1,
    `Idempotency: first execution succeeds, second reuses same execution ID (${idemSuccess} succeeded)`
  );
}
