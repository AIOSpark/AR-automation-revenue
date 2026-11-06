// standalone race condition test - over-allocation under concurrent execution
import { udmStore } from '../src/lib/udm/store.js';
import { getInvoiceOutstandingBalance } from '../src/lib/dashboard/engine.js';
import { executionService } from '../src/lib/execution/service.js';
import { executionStore } from '../src/lib/execution/store.js';
import { approvalStore } from '../src/lib/approvals/store.js';

async function createCustomer(orgId) {
  const customer = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'race_cust',
    name: 'Race Test Customer',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
  });
  return customer.id;
}

function createInvoice(customerId, orgId, amount) {
  const invoice = udmStore.insertInvoice({
    organization_id: orgId,
    customer_id: customerId,
    amount_minor_units: amount,
    status: 'open',
    source_system: 'manual',
    source_id: 'race_inv',
    currency: 'INR',
  });
  return invoice.id;
}

function createPayment(amount, orgId) {
  const payment = udmStore.insertPayment({
    organization_id: orgId,
    amount_minor_units: amount,
    source_system: 'manual',
    source_id: 'race_pay',
    currency: 'INR',
  });
  return payment.id;
}

function allocatePayment(paymentId, invoiceId, amount, orgId) {
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

async function main() {
  console.log('=== Over-Allocation Race Condition Test ===\n');
  
  // Clear stores
  udmStore.clearAll();
  udmStore.setTenantContext('org_stress_test');
  executionStore.clearAll();
  approvalStore.clearAll();
  
  // Create invoice with 50,000 outstanding
  const raceCustomer = await createCustomer('org_stress_test');
  const raceInvoice = createInvoice(raceCustomer, 'org_stress_test', 50000000);
  
  // Create two payments of 40,000 each
  const payA = createPayment(40000000, 'org_stress_test');
  const payB = createPayment(40000000, 'org_stress_test');
  
  // Launch concurrent allocation attempts
  const [resultA, resultB] = await Promise.all([
    allocatePayment(payA.id, raceInvoice, payA.amount_minor_units, 'org_stress_test'),
    allocatePayment(payB.id, raceInvoice, payB.amount_minor_units, 'org_stress_test'),
  ]);
  
  // Determine outcomes
  const payAFullSuccess = resultA === undefined;
  const payBFullSuccess = resultB === undefined;
  
  // Check final state
  const raceFinalInv = udmStore.getInvoices().find(i => i.id === raceInvoice);
  const raceOutstanding = getInvoiceOutstandingBalance(raceFinalInv);
  const totalAllocated = 50000000 - raceOutstanding;
  
  console.log('Race condition results:');
  console.log(`  Payment A (40M) allocation: ${payAFullSuccess ? 'SUCCEEDED' : 'REJECTED'}`);
  console.log(`  Payment B (40M) allocation: ${payBFullSuccess ? 'SUCCEEDED' : 'REJECTED'}`);
  console.log(`  Total allocated: ${totalAllocated / 1000000}M of 50M`);
  console.log(`  Final outstanding: ${raceOutstanding / 1000000}M`);
  console.log();
  
  // Verify invariants
  let pass = true;
  
  if (raceOutstanding < 0) {
    console.log('FAIL: Outstanding balance is negative!');
    pass = false;
  }
  
  if (totalAllocated > 50000000) {
    console.log('FAIL: Total allocated exceeds invoice amount!');
    pass = false;
  }
  
  if (payAFullSuccess && payBFullSuccess) {
    console.log('FAIL: Both payments fully succeeded (80M allocated > 50M)!');
    pass = false;
  }
  
  if (payAFullSuccess || payBFullSuccess) {
    console.log('PASS: At least one payment succeeded (as expected since 40M + 40M > 50M)');
  } else {
    console.log('INFO: Neither payment fully succeeded (both rejected, perhaps both partial)');
  }
  
  console.log(`\n${pass ? 'INVARIANT PASSED' : 'INVARIANT FAILED'}: Total allocated never exceeds ₹50,000`);
}

main().catch(console.error);
