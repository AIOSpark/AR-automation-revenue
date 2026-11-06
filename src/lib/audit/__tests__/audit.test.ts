// AIOSpark Layer 26 Audit System Test Suite

import { auditStore } from '../store';
import { AuditService } from '../service';
import { udmStore } from '../../udm/store';
import { approvalStore } from '../../approvals/store';
import { policyEngine } from '../../agents/policy-engine';
import { AgentExecutor } from '../../agents/executor';
import { runInvestigationAgent } from '../../agents/investigation-agent';
import { tenantStore } from '../../tenant/store';
import { communicationStore } from '../../communication/store';

export async function runAuditTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 26 AUDIT SYSTEM TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_audit_test';
  udmStore.clearAll();
  udmStore.setTenantContext(testOrgId);
  approvalStore.clearAll();
  auditStore.clearAll();
  tenantStore.clearAll();
  policyEngine.clearRules();

  // 1. IMMUTABILITY ENFORCEMENT TEST: DB Trigger / Proxy rejection on UPDATE & DELETE
  const sampleLog = auditStore.record({
    organization_id: testOrgId,
    actor_user_id: 'usr_sec_10',
    actor_type: 'user',
    action_type: 'invoice.status_changed',
    subject_type: 'invoice',
    subject_id: 'inv_immut_001',
    before_state: { status: 'open' },
    after_state: { status: 'paid' },
    result: 'success',
  });

  // Attempt raw UPDATE on existing audit log row
  let updateFailedAsExpected = false;
  try {
    auditStore.rawUpdateRecordForTesting(sampleLog.id, { result: 'reverted' });
  } catch (err: any) {
    if (err.message.includes('IMMUTABILITY VIOLATION') || err.message.includes('UPDATE operation rejected')) {
      updateFailedAsExpected = true;
    }
  }
  if (!updateFailedAsExpected) {
    throw new Error('Immutability failure: Direct UPDATE operation on audit_log table did NOT raise an error!');
  }
  console.log('⚡ [PASS] 1a. Immutability Guardrail: Direct UPDATE attempt on audit_log row rejected by database-level proxy/trigger');

  // Attempt raw DELETE on existing audit log row
  let deleteFailedAsExpected = false;
  try {
    auditStore.rawDeleteRecordForTesting(sampleLog.id);
  } catch (err: any) {
    if (err.message.includes('IMMUTABILITY VIOLATION') || err.message.includes('DELETE operation rejected')) {
      deleteFailedAsExpected = true;
    }
  }
  if (!deleteFailedAsExpected) {
    throw new Error('Immutability failure: Direct DELETE operation on audit_log table did NOT raise an error!');
  }
  console.log('⚡ [PASS] 1b. Immutability Guardrail: Direct DELETE attempt on audit_log row rejected by database-level proxy/trigger');


  // 2. END-TO-END WORKFLOW AUDIT TRAIL TEST: Propose (Agent) -> Approve (User) -> Execute -> Confirm Audit Chain
  // Seed Customer & Invoice
  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_cust_audit',
    name: 'GothCorp Financial',
    credit_limit_minor_units: 500000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_audit',
    customer_id: cust.id,
    number: 'INV-AUDIT-999',
    amount_minor_units: 120000000,
    tax_amount_minor_units: 21600000,
    currency: 'INR',
    issue_date: '2026-02-01',
    due_date: '2026-03-01',
    status: 'open',
  });

  // Step A: Agent investigates and proposes high-risk action
  const agentRunRes = await runInvestigationAgent({
    invoiceId: inv.id,
    organizationId: testOrgId,
  });
  agentRunRes.data.category = 'PRICING_DISCREPANCY';

  const agentExecRes = await AgentExecutor.run('Investigation Agent', testOrgId, {}, async () => {
    return {
      data: agentRunRes.data,
      proposedAction: {
        targetEntity: 'invoice',
        targetId: inv.id,
        actionType: 'ISSUE_CREDIT_NOTE',
        payload: { amount: 15000000 },
      },
    };
  });

  // Confirm Agent proposal was logged into audit_log with ai_context and approval_context
  const pendingRequests = approvalStore.getRequests(testOrgId, 'pending');
  if (pendingRequests.length === 0) throw new Error('Agent action failed to route to approval request');
  const appReq = pendingRequests[0];

  const agentProposalAuditLogs = auditStore.query({
    organizationId: testOrgId,
    actionType: 'agent.proposed_issue_credit_note',
  });
  if (agentProposalAuditLogs.length === 0) {
    throw new Error('Missing audit_log entry for Agent proposed action');
  }
  const propLog = agentProposalAuditLogs[0];
  if (propLog.actor_type !== 'agent' || !propLog.ai_context || !propLog.approval_context) {
    throw new Error('Agent proposal audit log entry missing expected ai_context or approval_context');
  }
  console.log('⚡ [PASS] 2a. End-to-End Audit Trail: Agent proposal logged with complete AI evidence & confidence context');

  // Step B: Human Approver approves request
  const reviewerUserId = 'usr_fin_mgr_01';
  approvalStore.approveRequest(appReq.id, reviewerUserId);

  const approvalAuditLogs = auditStore.query({
    organizationId: testOrgId,
    actionType: 'invoice.issue_credit_note.approved',
  });
  if (approvalAuditLogs.length === 0) {
    throw new Error('Missing audit_log entry for human approval event');
  }
  const appLog = approvalAuditLogs[0];
  if (appLog.actor_user_id !== reviewerUserId || appLog.actor_type !== 'user') {
    throw new Error('Human approval audit log entry missing reviewer user ID or incorrect actor type');
  }
  console.log('⚡ [PASS] 2b. End-to-End Audit Trail: Human approval logged with exact reviewer identity and approval context');


  // 3. MULTI-DIMENSIONAL QUERY INTERFACES TEST: Per-Invoice, Per-Customer, Per-User
  // Trigger direct data modifications
  udmStore.updateInvoice(inv.id, { status: 'partially_paid' }, reviewerUserId);
  udmStore.updateCustomer(cust.id, { credit_limit_minor_units: 600000000 }, reviewerUserId);

  // Send message via Communication Engine
  communicationStore.logSentMessage({
    organization_id: testOrgId,
    customer_id: cust.id,
    invoice_id: inv.id,
    content_type: 'payment_reminder',
    channel: 'email',
    subject: 'Payment Reminder for INV-AUDIT-999',
    body: 'Dear GothCorp...',
    approval_request_id: appReq.id,
    status: 'sent',
  });

  // Query Invoice Audit Trail
  const invoiceAuditTrail = auditStore.getInvoiceAuditTrail(testOrgId, inv.id);
  if (invoiceAuditTrail.length < 3) {
    throw new Error(`Per-Invoice audit trail returned incomplete records: ${invoiceAuditTrail.length} found`);
  }
  console.log(`⚡ [PASS] 3a. Per-Invoice Audit Trail: ${invoiceAuditTrail.length} chronological audit entries retrieved for invoice ${inv.id}`);

  // Query Customer Audit Trail
  const customerAuditTrail = auditStore.getCustomerAuditTrail(testOrgId, cust.id, [inv.id]);
  if (customerAuditTrail.length < 4) {
    throw new Error(`Per-Customer audit trail returned incomplete records: ${customerAuditTrail.length} found`);
  }
  console.log(`⚡ [PASS] 3b. Per-Customer Audit Trail: ${customerAuditTrail.length} comprehensive entries retrieved for customer ${cust.id}`);

  // Query User Activity Trail
  const userActivityLogs = auditStore.getUserActivityLogs(testOrgId, reviewerUserId);
  if (userActivityLogs.length < 3) {
    throw new Error(`Per-User activity trail returned incomplete records: ${userActivityLogs.length} found`);
  }
  console.log(`⚡ [PASS] 3c. Per-User Activity View: ${userActivityLogs.length} audit logs retrieved for user ${reviewerUserId}`);


  // 4. EXPORT AUDIT TRAIL TEST (CSV & PDF Text)
  const csvExport = AuditService.exportToCSV(invoiceAuditTrail);
  if (!csvExport.includes('INV-AUDIT-999') || !csvExport.includes('usr_fin_mgr_01') || !csvExport.includes('Timestamp')) {
    throw new Error('Audit trail CSV export missing expected header or values');
  }
  console.log('⚡ [PASS] 4a. Audit Export (CSV): Formatted CSV report generated cleanly with sanitized fields');

  const pdfTextExport = AuditService.exportToPDFText(`Invoice ${inv.number}`, invoiceAuditTrail);
  if (!pdfTextExport.includes('AIOSPARK AUDIT TRAIL REPORT') || !pdfTextExport.includes('EVENT #1')) {
    throw new Error('Audit trail PDF text export missing expected structure');
  }
  console.log('⚡ [PASS] 4b. Audit Export (PDF): Formatted PDF text report generated cleanly for customer dispute package');


  // 5. TENANT ISOLATION (RLS) TEST
  const otherOrgId = 'org_other_tenant_audit';
  const crossOrgLogs = auditStore.query({
    organizationId: otherOrgId,
  });
  if (crossOrgLogs.length !== 0) {
    throw new Error('Tenant RLS leak: Cross-tenant audit_log query returned entries from another organization!');
  }
  console.log('⚡ [PASS] 5. Tenant RLS Isolation: audit_log query strictly isolated per organization context');

  console.log('\n==========================================');
  console.log('ALL LAYER 26 AUDIT SYSTEM TESTS PASSED SUCCESSFULLY');
  console.log('==========================================\n');
}
