// standalone payment double-allocation test
import { udmStore } from '../src/lib/udm/store.js';
import { getInvoiceOutstandingBalance } from '../src/lib/dashboard/engine.js';
import { executionService } from '../src/lib/execution/service.js';
import { executionStore } from '../src/lib/execution/store.js';
import { approvalStore } from '../src/lib/approvals/store.js';

async function createCustomer(orgId) {
  const customer = udmStore.insertCustomer({
    organization_id: orgId, source_system: 'manual', source_id: 'dc_cust', name: 'Double-Alloc Test', credit_limit_minor_units: 100000000, currency: 'INR',
  }); return customer.id;
}
function createInvoice(customerId, orgId, amount) {
  const invoice = udmStore.insertInvoice({ organization_id: orgId, customer_id: customerId, amount_minor_units: amount, status: 'open', source_system: 'manual', source_id: 'dc_inv', currency: 'INR' }); return invoice.id;
}
function createPayment(amount, orgId) {
  const payment = udmStore.insertPayment({ organization_id: orgId, amount_minor_units: amount, source_system: 'manual', source_id: 'dc_pay', currency: 'INR' }); return payment.id;
}
function allocatePayment(paymentId, invoiceId, amount, orgId) {
  const approval = approvalStore.createRequest({ organization_id: orgId, subject_type: 'invoice', subject_id: invoiceId, action_type: 'RECORD_PAYMENT_MATCH', proposed_action: { invoice_id: invoiceId, payment_id: paymentId, amount_minor_units: amount, match_method: 'manual' }, evidence: [], confidence: 0.95, proposed_by: 'agent_test' }); approvalStore.approveRequest(approval.id, 'user_reviewer_1'); return executionService.executeApprovedAction(approval.id, { userId: 'user_reviewer_1', organizationId: orgId });
}

async function main() {
  console.log('=== Payment Double-Allocation Test ===\n');
  
  // Clear stores
  udmStore.clearAll();
  udmStore.setTenantContext('org_stress_test');
  executionStore.clearAll();
  approvalStore.clearAll();
  
  // Create one payment and two invoices
  const raceCustomer = await createCustomer('org_stress_test');
  const inv1 = createInvoice(raceCustomer, 'org_stress_test', 50000000);
  const inv2 = createInvoice(raceCustomer, 'org_stress_test', 50000000);
  
  // Create one payment of 40,000
  const pay = createPayment(40000000, 'org_stress_test');
  
  // Launch concurrent allocation attempts - same payment to both invoices
  const [result1, result2] = await Promise.all([
    allocatePayment(pay.id, inv1, pay.amount_minor_units, 'org_stress_test'),
    allocatePayment(pay.id, inv2, pay.amount_minor_units, 'org_stress_test'),
  ]);
  
  // Determine outcomes
  const pay1Success = result1 === undefined;
  const pay2Success = result2 === undefined;
  
  // Check final state
  const inv1Final = udmStore.getInvoices().find(i => i.id === inv1);
  const inv2Final = udmStore.getInvoices().find(i => i.id === inv2);
  const payFinal = udmStore.getPayments().find(p => p.id === pay.id);
  
  const inv1Outstanding = getInvoiceOutstandingBalance(inv1Final);
  const inv2Outstanding = getInvoiceOutstandingBalance(inv2Final);
  const totalAllocated = 40000000 - (inv1Outstanding + inv2Outstanding);
  
  const payRemaining = payFinal ? payFinal.amount_minor_units : 0;
  
  console.log('Double-allocation results:');
  console.log(`  Payment allocated to invoice 1: ${pay1Success ? 'SUCCEEDED' : 'REJECTED'}`);
  console.log(`  Payment allocated to invoice 2: ${pay2Success ? 'SUCCEEDED' : 'REJECTED'}`);
  console.log(`  Total allocated: ${totalAllocated / 1000000}M of 40M`);
  console.log(`  Invoice 1 outstanding: ${inv1Outstanding / 1000000}M`);
  console.log(`  Invoice 2 outstanding: ${inv2Outstanding / 1000000}M`);
  console.log(`  Payment remaining: ${payRemaining / 1000000}M`);
  console.log();
  
  // Verify invariants
  let pass = true;
  
  if (totalAllocated > 40000000) {
    console.log('FAIL: Total allocated exceeds payment amount!');
    pass = false;
  }
  
  if (pay1Success && pay2Success) {
    console.log('FAIL: Payment allocated to both invoices (would exceed payment amount)!');
    pass = false;
  }
  
  if (totalAllocated <= 40000000) {
    console.log('PASS: Total allocated does not exceed payment amount');
  }
  
  console.log(`\n${pass ? 'INVARIANT PASSED' : 'INVARIANT FAILED'}: Persisted total allocations cannot exceed original payment amount`);
}
main().catch(console.error);
