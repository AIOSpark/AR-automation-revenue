import { udmStore } from './src/lib/udm/store';
import type { Invoice } from './src/lib/udm/types';
import { getInvoiceOutstandingBalance } from '@/dashboard/engine';
import { executionService } from '@/execution/service';
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

const testOrg = 'org_stress_test';
const tenantA = 'org_tenant_a';
const tenantB = 'org_tenant_b';

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

// Test 1: simple invoice creation
const customer1 = createCustomer(testOrg);
const invoice1 = createInvoice(testOrg, 50000000);
const invoices = udmStore.getInvoices();
const found = invoices.find(i => i.id === invoice1);
if (found) {
  const balance = getInvoiceOutstandingBalance(found);
  testAssert(balance === 0, `Invoice outstanding is 0`);
}
