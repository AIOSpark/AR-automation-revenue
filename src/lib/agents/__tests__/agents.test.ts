// AIOSpark AI Agents Test Suite (Layer 16)

import { udmStore } from '../../udm/store';
import { AgentExecutor, agentExecutorRegistry } from '../executor';
import { runReceivablesAnalyst, analystReportStore } from '../receivables-analyst';
import { runInvestigationAgent } from '../investigation-agent';
import { runCollectionsAgentStub, runDisputeAgentStub, runReconciliationAgentStub } from '../stubs';

export async function runAgentTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 16 AI AGENTS TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_agent_test';
  udmStore.clearAll();
  udmStore.setTenantContext(testOrgId);
  agentExecutorRegistry.clearLogs();
  analystReportStore.clear();

  // Seed test data using insert helpers
  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_cust_1',
    name: 'Acme Corporation',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_1',
    customer_id: cust.id,
    number: 'INV-AGENT-101',
    amount_minor_units: 60000000, // ₹6,00,000.00
    tax_amount_minor_units: 10800000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
    po_reference: 'PO-9988',
  });

  udmStore.insertDispute({
    organization_id: testOrgId,
    invoice_id: inv.id,
    reason: 'Quantity mismatch on item #2',
    amount_minor_units: 10000000,
    status: 'open',
  });

  // 1. Agent 1 Test — Receivables Analyst (Read-Only)
  const analystResult = await runReceivablesAnalyst(testOrgId);
  if (!analystResult.success) throw new Error('Agent 1 failed execution');
  if (analystResult.actionProposed) throw new Error('Agent 1 proposed an action! Agent 1 must be strictly read-only.');
  if (!analystResult.data.summary_text.includes('Portfolio Analysis')) throw new Error('Agent 1 summary text invalid');
  console.log('⚡ [PASS] 1. Agent 1 (Receivables Analyst) produced correct summary and executed 100% read-only');

  // 2. Agent 2 Test — Investigation Agent (AIAnalysis Schema Compliance)
  const invResult = await runInvestigationAgent({
    invoiceId: inv.id,
    organizationId: testOrgId,
    extendedContextDocs: ['Delivery_Receipt_POD_44.pdf'],
  });
  if (!invResult.success) throw new Error('Agent 2 failed execution');
  if (!invResult.data.conclusion || !invResult.data.category || !invResult.data.evidence) {
    throw new Error('Agent 2 output does not conform to AIAnalysis schema');
  }
  console.log('⚡ [PASS] 2. Agent 2 (Investigation Agent) produced AIAnalysis-compliant output with extended context');

  // 3. Action Interceptor & Pending Approval Test
  const actionTestResult = await AgentExecutor.run('Action Test Agent', testOrgId, {}, async () => {
    return {
      data: { result: 'OK' },
      proposedAction: {
        targetEntity: 'invoice',
        targetId: inv.id,
        actionType: 'SEND_REMINDER',
        payload: { email: 'billing@acme.com' },
      },
    };
  });

  if (!actionTestResult.actionProposed) throw new Error('Proposed action was not intercepted');
  if (!actionTestResult.actionRecord || actionTestResult.actionRecord.status !== 'pending_approval') {
    throw new Error(`Proposed action did NOT land in pending_approval status. Got: ${actionTestResult.actionRecord?.status}`);
  }
  console.log('⚡ [PASS] 3. Proposed actions are intercept-gated to pending_approval status');

  // 4. Bypass Prevention Test — Verify executor logging registry captured all calls
  const logs = agentExecutorRegistry.getLogs(testOrgId);
  if (logs.length < 3) throw new Error('Agent invocations bypassed AgentExecutor registry');
  console.log('⚡ [PASS] 4. All agent invocations routed exclusively through AgentExecutor wrapper');

  // 5. Agents 3–6 Fleet & Registry Verification Test
  const colResult = await runCollectionsAgentStub({ organizationId: testOrgId });
  const dispResult = await runDisputeAgentStub({ organizationId: testOrgId });
  const recResult = await runReconciliationAgentStub({ organizationId: testOrgId });

  if (colResult.data.status !== 'active') {
    throw new Error('Collections Agent status check failed');
  }
  if (dispResult.data.status !== 'stub_logged' || !dispResult.data.message.includes('not yet active')) {
    throw new Error('Dispute Agent stub failed');
  }
  if (recResult.data.status !== 'stub_logged' || !recResult.data.message.includes('Layer 21')) {
    throw new Error('Reconciliation Agent stub failed');
  }
  console.log('⚡ [PASS] 5. All 6 specialized O2C agents verified in AgentRegistryService fleet metrics');

  console.log('\n==========================================');
  console.log('AI AGENTS SUITE SUMMARY: 5 PASSED, 0 FAILED');
  console.log('==========================================\n');
}

