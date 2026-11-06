// AIOSpark Human Approval System Test Suite (Layer 18)

import { udmStore } from '../../udm/store';
import { approvalStore } from '../store';
import { policyEngine, MANDATORY_APPROVAL_HIGH_RISK_ACTIONS } from '../../agents/policy-engine';
import { AgentExecutor } from '../../agents/executor';
import { runInvestigationAgent } from '../../agents/investigation-agent';
import { can } from '../../tenant/permissions';
import { exceptionEngine } from '../../exceptions/engine';

export async function runApprovalTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 18 HUMAN APPROVAL TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_appr_test';
  udmStore.clearAll();
  udmStore.setTenantContext(testOrgId);
  approvalStore.clearAll();
  policyEngine.clearRules();

  // Seed test invoice
  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_cust_appr',
    name: 'Wayne Enterprises',
    credit_limit_minor_units: 900000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_appr',
    customer_id: cust.id,
    number: 'INV-APPR-303',
    amount_minor_units: 80000000,
    tax_amount_minor_units: 14400000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  // 1. Bypass Prevention Test: High-risk action MUST land in approval_requests, cannot execute directly
  const bypassAttemptResult = await AgentExecutor.run('Bypass Test Agent', testOrgId, {}, async () => {
    return {
      data: { status: 'OK' },
      proposedAction: {
        targetEntity: 'invoice',
        targetId: inv.id,
        actionType: 'ISSUE_CREDIT_NOTE', // High-risk action
        payload: { amount: 5000000 },
      },
    };
  });

  if (bypassAttemptResult.success) {
    throw new Error('Direct execution of high-risk action succeeded! Policy Engine bypass vulnerability detected.');
  }

  const pendingRequests = approvalStore.getRequests(testOrgId, 'pending');
  if (pendingRequests.length !== 1 || pendingRequests[0].action_type !== 'ISSUE_CREDIT_NOTE') {
    throw new Error('High-risk action failed to auto-route to approval_requests');
  }
  console.log('⚡ [PASS] 1. Unbypassable Policy Guardrail: Direct high-risk agent execution blocked and routed to approval_requests');

  // 2. Full End-to-End Recommend-to-Execute Loop Test
  const invAgentResult = await runInvestigationAgent({
    invoiceId: inv.id,
    organizationId: testOrgId,
  });

  invAgentResult.data.category = 'PO_MISMATCH';

  // Simulate exception trigger creation
  const excRecord = exceptionEngine.handleAIAnalysisTrigger(inv.id, invAgentResult.data, testOrgId);
  if (!excRecord) throw new Error('Failed to create exception record');

  // Propose high risk action on exception
  const actionRes = await AgentExecutor.run('Investigation Agent', testOrgId, {}, async () => {
    return {
      data: invAgentResult.data,
      proposedAction: {
        targetEntity: 'exception',
        targetId: excRecord.id,
        actionType: 'RECLASSIFY_INVOICE',
        payload: { exception_id: excRecord.id, category: 'PO_MISMATCH' },
      },
    };
  });

  const appReqs = approvalStore.getRequests(testOrgId, 'pending');
  const targetReq = appReqs.find((r) => r.action_type === 'RECLASSIFY_INVOICE');
  if (!targetReq) throw new Error('Failed to find approval request for RECLASSIFY_INVOICE');

  // Approve request as Finance Manager
  const approvedReq = approvalStore.approveRequest(targetReq.id, 'usr_mgr_99');
  if (approvedReq.status !== 'approved') throw new Error('Failed to approve request');

  const logs = approvalStore.getLogs(targetReq.id);
  const createdLog = logs.find((l) => l.event_type === 'created');
  const approvedLog = logs.find((l) => l.event_type === 'approved');

  if (!createdLog || !approvedLog) throw new Error('Missing append-only audit trail logs');
  console.log('⚡ [PASS] 2. End-to-End recommend-to-execute loop succeeded with append-only approval_log entries');

  // 3. Modify & Approve Delta Storage Test
  const modifyTestReq = approvalStore.createRequest({
    organization_id: testOrgId,
    subject_type: 'invoice',
    subject_id: inv.id,
    action_type: 'ALTER_INVOICE_VALUE',
    proposed_action: { original_amount: 80000000, recommended_action: 'Reduce value by ₹50,000' },
    evidence: [],
    confidence: 0.88,
    proposed_by: 'Receivables Analyst',
  });

  const modifiedPayload = { recommended_action: 'Reduce value by ₹20,000 instead' };
  const modifiedReq = approvalStore.modifyAndApproveRequest(modifyTestReq.id, 'usr_mgr_99', modifiedPayload);

  if (modifiedReq.status !== 'approved') throw new Error('Modify & approve failed');
  if (!modifiedReq.modification || modifiedReq.modification.recommended_action !== modifiedPayload.recommended_action) {
    throw new Error('Modified payload was not stored cleanly on approval request');
  }

  const modLogs = approvalStore.getLogs(modifyTestReq.id);
  const modLogEntry = modLogs.find((l) => l.event_type === 'modified');
  if (!modLogEntry || !modLogEntry.details.original || !modLogEntry.details.modified) {
    throw new Error('Audit trail failed to preserve original vs modified delta');
  }
  console.log('⚡ [PASS] 3. Modify & Approve preserved original proposed values and human correction delta in audit log');

  // 4. RBAC Permission Gate Test
  const canMgrApprove = can('Finance Manager', 'approve', 'approvals');
  const canOwnerApprove = can('Owner', 'approve', 'approvals');
  const canExecApprove = can('Finance Executive', 'approve', 'approvals');
  const canViewerApprove = can('Viewer', 'approve', 'approvals');

  if (!canMgrApprove || !canOwnerApprove) throw new Error('RBAC matrix failed: Finance Manager or Owner should be able to approve');
  if (canExecApprove || canViewerApprove) throw new Error('RBAC matrix failed: Finance Executive or Viewer MUST NOT be able to approve');
  console.log('⚡ [PASS] 4. RBAC Permission Matrix strictly enforced: Finance Manager/Owner permitted, Exec/Viewer denied');

  // 5. Graduated Autonomy Floor Guarantee Test
  approvalStore.setAutonomyConfig({
    id: `cfg_${testOrgId}_high_risk`,
    organization_id: testOrgId,
    action_type: 'ALTER_INVOICE_VALUE',
    auto_approve_enabled: true, // Turn on graduated autonomy in config
    min_confidence_threshold: 0.80,
  });

  // Attempt high risk action even with auto_approve_enabled = true
  const highRiskFloorCheck = policyEngine.checkPolicy(testOrgId, 'Test Agent', 'ALTER_INVOICE_VALUE', {
    confidence: 0.99,
  });

  if (highRiskFloorCheck.allowed || !highRiskFloorCheck.requiresApproval) {
    throw new Error('Hardcoded approval floor breached by graduated autonomy config!');
  }
  console.log('⚡ [PASS] 5. Hardcoded High-Risk Approval Floor held firm against graduated autonomy config override');

  console.log('\n==========================================');
  console.log('HUMAN APPROVAL SUITE SUMMARY: 5 PASSED, 0 FAILED');
  console.log('==========================================\n');
}
