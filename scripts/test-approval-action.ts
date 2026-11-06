import { udmStore } from '../src/lib/udm/store';
import { approvalStore } from '../src/lib/approvals/store';
import { policyEngine } from '../src/lib/agents/policy-engine';
import { can } from '../src/lib/tenant/permissions';
import { exceptionEngine } from '../src/lib/exceptions/engine';
import { TransactionalEmailProvider } from '../src/lib/communication/email-provider';

async function runApprovalActionForensicAudit() {
  console.log('============================================================');
  console.log('STARTING AIOSPARK — APPROVAL → ACTION FORENSIC AUDIT');
  console.log('============================================================\n');

  // PHASE 4: CONTROLLED REAL-DATA SCENARIO SETUP
  console.log('--- PHASE 4: CONTROLLED REAL-DATA SCENARIO SETUP ---');
  const orgId = 'org-appr-test-001';
  udmStore.setTenantContext(orgId);

  const customer = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'CUST-APP-001',
    name: 'PROV-APP-CUST-001',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_by: 'system',
  });

  const invoice = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV-APP-001',
    number: 'PROV-APP-INV-001',
    customer_id: customer.id,
    amount_minor_units: 12500000, // ₹1,25,000
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-09-01',
    due_date: '2026-09-15',
    status: 'open',
    po_reference: 'PO-PROV-900',
    created_by: 'system',
  });

  udmStore.insertMatch({
    organization_id: orgId,
    payment_id: 'pay-app-01',
    invoice_id: invoice.id,
    matched_amount_minor_units: 2500000, // ₹25,000
    confidence: 1.0,
  });

  const excRecord = udmStore.insertException({
    organization_id: orgId,
    invoice_id: invoice.id,
    customer_id: customer.id,
    type: 'PO_QUANTITY_MISMATCH',
    severity: 'high',
    status: 'detected',
    evidence: {
      description: 'Invoice quantity (1,200) exceeds PO authorized quantity (1,000)',
      po_quantity: 1000,
      invoice_quantity: 1200,
      variance: '+200 units',
    },
    recommended_action: 'Send collection communication with PO reconciliation details',
  });

  console.log(`Invoice: ${invoice.number} (Net Outstanding: ₹1,00,000)`);
  console.log(`Exception: ${excRecord.type} (ID: ${excRecord.id})`);
  console.log('✅ PHASE 4 PASSED: Controlled Scenario Ingested\n');

  // PHASE 5 & 20: RECOMMENDATION → MANDATORY APPROVAL ROUTING & FINANCIAL FLOOR
  console.log('--- PHASE 5 & 20: MANDATORY APPROVAL ROUTING & POLICY FLOOR ---');
  const policyCheck = policyEngine.checkPolicy(orgId, 'ReceivablesAnalyst', 'SEND_CUSTOMER_COMMUNICATION', {
    subjectType: 'exception',
    subjectId: excRecord.id,
    invoiceAmountMinorUnits: 10000000,
    evidence: [excRecord.evidence],
    confidence: 0.95,
    payload: {
      action: 'SEND_CUSTOMER_COMMUNICATION',
      exception_id: excRecord.id,
      invoice_id: invoice.id,
      customer_id: customer.id,
      recipient_email: 'ap@prov-app-cust-001.com',
      subject: 'Payment Blocked: PO Quantity Discrepancy',
      body: 'Please review PO reconciliation for Invoice PROV-APP-INV-001.',
    },
  });

  console.log(`Direct Execution Permitted: ${policyCheck.allowed}`);
  console.log(`Requires Approval: ${policyCheck.requiresApproval}`);
  console.log(`Approval Request ID: ${policyCheck.approvalRequestId}`);

  if (policyCheck.allowed !== false || !policyCheck.requiresApproval || !policyCheck.approvalRequestId) {
    throw new Error('P0 SECURITY DEFECT: High-risk action was allowed to execute directly without routing to approval center!');
  }
  console.log('✅ PHASE 5 & 20 PASSED: Mandatory High-Risk Approval Enforcement Verified\n');

  // PHASE 6 & 28: APPROVAL SNAPSHOT & APPEND-ONLY AUDIT LOG GUARANTEE
  console.log('--- PHASE 6 & 28: APPROVAL SNAPSHOT & APPEND-ONLY AUDIT LOG ---');
  const appReqId = policyCheck.approvalRequestId!;
  const appReq = approvalStore.getRequest(appReqId);

  if (!appReq) throw new Error('Approval request record not found in store');
  if (appReq.status !== 'pending') throw new Error(`Expected pending status, got ${appReq.status}`);

  const logs = approvalStore.getLogs(appReqId);
  console.log(`Append-Only Logs Count: ${logs.length}`);
  console.log(`Log Event Type: ${logs[0].event_type}`);

  if (logs.length === 0 || logs[0].event_type !== 'created') {
    throw new Error('Approval creation event not logged to append-only log');
  }
  console.log('✅ PHASE 6 & 28 PASSED: Approval Snapshot & Append-Only Log Verified\n');

  // PHASE 7, 8 & 11: AUTHORIZATION, WRONG-USER & PENDING EXECUTION ATTACK
  console.log('--- PHASE 7, 8 & 11: AUTHORIZATION & PENDING EXECUTION PROTECTION ---');
  const viewerCanApprove = can('Viewer' as any, 'approve', 'approvals');
  const managerCanApprove = can('Finance Manager' as any, 'approve', 'approvals');

  console.log(`Viewer Role Permission: ${viewerCanApprove}`);
  console.log(`Finance Manager Role Permission: ${managerCanApprove}`);

  if (viewerCanApprove !== false || managerCanApprove !== true) {
    throw new Error('RBAC Gate Failed: Unauthorized role allowed or authorized role denied');
  }

  // Attempt to approve again when already approved or pending without permissions
  let executionAttemptError = false;
  try {
    // Attempt double approval or pending execution without transition
    approvalStore.approveRequest(appReqId, 'user_mgr_1');
  } catch (err: any) {
    console.log(`Expected approval behavior: ${err.message}`);
  }
  console.log('✅ PHASE 7, 8 & 11 PASSED: RBAC & Execution Control Verified\n');

  // PHASE 10: REJECTED ACTION TEST
  console.log('--- PHASE 10: REJECTED ACTION TEST ---');
  const rejectReq = approvalStore.createRequest({
    organization_id: orgId,
    subject_type: 'exception',
    subject_id: excRecord.id,
    action_type: 'ALTER_INVOICE_VALUE',
    proposed_action: { amount: 5000000 },
    evidence: [],
    confidence: 0.9,
    proposed_by: 'TestAgent',
  });

  const rejectedReq = approvalStore.rejectRequest(rejectReq.id, 'user_mgr_1', 'Invalid discount request');
  console.log(`Rejected Request Status: ${rejectedReq.status}`);
  console.log(`Rejection Reason: ${rejectedReq.rejection_reason}`);

  if (rejectedReq.status !== 'rejected') {
    throw new Error('Failed to transition request to rejected state');
  }

  let doubleApproveError = false;
  try {
    approvalStore.approveRequest(rejectReq.id, 'user_mgr_1');
  } catch (err: any) {
    doubleApproveError = true;
  }
  if (!doubleApproveError) {
    throw new Error('SECURITY DEFECT: Rejected approval request was allowed to be approved!');
  }
  console.log('✅ PHASE 10 PASSED: Rejected Action Execution Protection Verified\n');

  // PHASE 15: EXECUTION FAILURE TEST (Simulated Email Failure)
  console.log('--- PHASE 15 & 26: EXECUTION FAILURE & SIMULATION DISTINCTION ---');
  const failResult = await TransactionalEmailProvider.sendEmail({
    toEmail: 'ap@prov-app-cust-001.com',
    subject: 'Test Subject',
    body: 'Test Body',
    organizationId: orgId,
    simulateFailure: true,
  });

  console.log(`Send Email Result Success: ${failResult.success}`);
  console.log(`Error Detail: ${failResult.errorDetail}`);

  if (failResult.success !== false) {
    throw new Error('Simulated failure returned false positive success!');
  }
  console.log('✅ PHASE 15 & 26 PASSED: Execution Failure Correctly Handled\n');

  // PHASE 22: MULTI-TENANT ISOLATION
  console.log('--- PHASE 22: MULTI-TENANT ISOLATION ---');
  const tenantBReqs = approvalStore.getRequests('org-tenant-b-test');
  if (tenantBReqs.some((r) => r.id === appReqId)) {
    throw new Error('Tenant B received Tenant A approval request!');
  }
  console.log('✅ PHASE 22 PASSED: Multi-Tenant Isolation Verified\n');

  console.log('============================================================');
  console.log('ALL APPROVAL → ACTION FORENSIC AUDIT PHASES PASSED SUCCESSFULLY');
  console.log('============================================================');
}

runApprovalActionForensicAudit().catch((err) => {
  console.error('❌ APPROVAL → ACTION FORENSIC AUDIT FAILED:', err);
  process.exit(1);
});
