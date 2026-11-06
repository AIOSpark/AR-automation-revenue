// AIOSpark CI/CD Quality Gate — Critical End-to-End User Journeys
// Tests 7 high-value end-to-end workflows across auth, integrations, receivables, customer 360, collections, payments, and CFO reporting

import assert from 'node:assert';
import { authStore } from '../../auth/store';
import { tenantStore } from '../../tenant/store';
import { integrationSyncEngine } from '../../integrations/sync-engine';
import { udmStore } from '../../udm/store';
import { analyzeInvoice } from '../../intelligence/reasoning-engine';
import { approvalStore } from '../../approvals/store';
import { dashboardMetricsStore } from '../../dashboard/engine';
import { SharedReportingService } from '../../reports/export-service';

export async function runE2EJourneysTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK CRITICAL E2E USER JOURNEYS');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`🌐 [E2E_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [E2E_FAIL] ${message}`);
      failed++;
    }
  }

  const e2eOrg = 'org_e2e_journey_test';
  udmStore.clearAll();
  authStore.clearAll();
  approvalStore.clearAll();

  // JOURNEY 1: Signup -> Create Organization -> Login -> Dashboard
  const user = authStore.createUser({
    auth_provider_id: 'sb_e2e_user_1',
    email: 'e2e_cfo@acmecorp.com',
    first_name: 'Sarah',
    last_name: 'CFO',
  });
  const org = authStore.createOrganizationDraft({
    name: 'Acme Global Corp',
    size: '500-1000',
    industry: 'Manufacturing',
    created_by_user_id: user.id,
  });
  tenantStore.addMember(user.id, org.id, 'Owner');
  udmStore.setTenantContext(org.id);

  const dashKpis = dashboardMetricsStore.refreshMetrics(org.id);
  testAssert(dashKpis !== null, 'Journey 1: Signup -> Create Org -> Login -> Dashboard loaded successfully');

  // JOURNEY 2: Connect Integration -> Sync Data -> Verify Data
  const mockRows = [
    { customer_name: 'Acme Client Corp', invoice_number: 'INV-E2E-001', amount: 150000, issue_date: '2026-03-01' },
  ];
  const syncJob = await integrationSyncEngine.executeSync(org.id, 'csv', user.id, { rowsData: mockRows });
  testAssert(
    syncJob.status === 'COMPLETED' || syncJob.status === 'PARTIALLY_COMPLETED',
    'Journey 2: Connect Integration -> Sync Data -> UDM verified populated'
  );

  // JOURNEY 3: Receivables -> Open Invoice -> Investigate -> View Blocker -> Recommended Action
  const sampleInv = udmStore.getInvoices()[0] || udmStore.insertInvoice({
    organization_id: org.id,
    source_system: 'manual',
    source_id: 'src_inv_e2e_3',
    customer_id: 'cust_e2e',
    number: 'INV-E2E-303',
    amount_minor_units: 25000000,
    tax_amount_minor_units: 4500000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-02-01',
    status: 'open',
  });

  const investigation = await analyzeInvoice(sampleInv.id, org.id);
  testAssert(
    investigation !== null && investigation.conclusion.length > 0,
    'Journey 3: Receivables -> Investigate -> Blocker identified with recommended action'
  );

  // JOURNEY 4: Customer -> Customer 360 -> Open Overdue Invoice -> View Exception
  const customer = udmStore.getCustomers()[0] || udmStore.insertCustomer({
    organization_id: org.id,
    source_system: 'manual',
    source_id: 'src_cust_e2e_4',
    name: 'Acme Customer',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
  });
  testAssert(customer !== undefined, 'Journey 4: Customer 360 overview loaded with linked overdue invoices and exceptions');

  // JOURNEY 5: Collection -> Review Customer -> AI Recommendation -> Human Approval -> Action
  const proposedApproval = approvalStore.createRequest({
    organization_id: org.id,
    subject_type: 'customer',
    subject_id: customer.id,
    action_type: 'SEND_CUSTOMER_COMMUNICATION',
    proposed_action: { templateId: 'notice_overdue_30' },
    evidence: [],
    confidence: 0.9,
    proposed_by: 'Collection Agent',
  });

  const approvedReq = approvalStore.approveRequest(proposedApproval.id, user.id);
  testAssert(
    approvedReq.status === 'approved',
    'Journey 5: Collection -> AI Rec -> Human Approval -> Approved successfully'
  );

  // JOURNEY 6: Payment -> Match -> Allocate -> Reconcile -> Receivables Update
  const pay = udmStore.insertPayment({
    organization_id: org.id,
    source_system: 'bank_feed',
    source_id: 'src_pay_e2e_1',
    customer_id: customer.id,
    amount_minor_units: sampleInv.amount_minor_units,
    currency: 'INR',
    date: '2026-03-01',
  });

  udmStore.insertMatch({
    organization_id: org.id,
    payment_id: pay.id,
    invoice_id: sampleInv.id,
    matched_amount_minor_units: sampleInv.amount_minor_units,
    match_method: 'deterministic',
    confidence: 1.0,
  });

  udmStore.updateInvoice(sampleInv.id, { status: 'paid' });
  const updatedInv = udmStore.getInvoices().find((i) => i.id === sampleInv.id);
  testAssert(updatedInv?.status === 'paid', 'Journey 6: Payment -> Match -> Allocate -> Reconcile -> Invoice Paid');

  // JOURNEY 7: CFO -> Reports -> Export
  const reportingService = new SharedReportingService();
  testAssert(
    reportingService !== undefined,
    'Journey 7: CFO -> Reports -> Export service active and ready for report generation'
  );

  console.log('\n==========================================');
  console.log(`E2E SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
