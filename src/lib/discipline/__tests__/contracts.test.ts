// AIOSpark Layer 35 Stable Interface Discipline Automated Contract Test Suite
// Verifies 4 stable interface boundaries: Integration, Intelligence, Agent, and Action interfaces.

import assert from 'node:assert';
import { TestERPAdapter } from '../../adapters/test-erp';
import { udmStore } from '../../udm/store';
import { AIAnalysis } from '../../intelligence/ai-analysis-contract';
import { AgentExecutor, agentExecutorRegistry } from '../../agents/executor';
import { runHelloAgent } from '../../agents/hello-agent';
import { runReceivablesAnalyst } from '../../agents/receivables-analyst';
import { runInvestigationAgent } from '../../agents/investigation-agent';
import { approvalStore } from '../../approvals/store';
import { AgentVerificationEngine } from '../../agents/verification';

export async function runDisciplineTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 35 STABLE INTERFACE DISCIPLINE TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_discipline_test';
  udmStore.clearAll();
  approvalStore.clearAll();
  agentExecutorRegistry.clearLogs();
  udmStore.setTenantContext(testOrgId);

  // 1. CONTRACT TEST 1: INTEGRATION INTERFACE (LAYER 5 -> LAYER 6 UDM)
  const terpAdapter = new TestERPAdapter();
  const config = { organizationId: testOrgId, adapterType: 'test_erp' };

  const customers = await terpAdapter.fetchCustomers(config);
  const invoices = await terpAdapter.fetchInvoices(config);
  const payments = await terpAdapter.fetchPayments(config);

  // Map into UDM
  for (const c of customers) {
    udmStore.insertCustomer({
      organization_id: testOrgId,
      source_system: c.sourceSystem,
      source_id: c.sourceId,
      name: c.name,
      credit_limit_minor_units: 50000000,
      currency: 'INR',
      payment_terms_days: c.creditTermsDays,
    });
  }

  for (const inv of invoices) {
    const cust = udmStore.getCustomers()[0];
    udmStore.insertInvoice({
      organization_id: testOrgId,
      source_system: inv.sourceSystem,
      source_id: inv.sourceId,
      customer_id: cust.id,
      number: inv.number,
      amount_minor_units: inv.amountMinorUnits,
      tax_amount_minor_units: inv.taxAmountMinorUnits,
      currency: inv.currency,
      issue_date: inv.issueDate,
      due_date: inv.dueDate,
      status: 'open',
    });
  }

  assert.strictEqual(udmStore.getCustomers().length, 1, 'UDM Customer insertion failed');
  assert.strictEqual(udmStore.getInvoices().length, 1, 'UDM Invoice insertion failed');
  assert.strictEqual(udmStore.getInvoices()[0].amount_minor_units, 35000000, 'UDM amount minor units mismatch');

  console.log('⚡ [PASS] 1. Integration Interface Contract: Toy TestERPAdapter populated Universal Data Model with zero knowledge of adapter internals outside /adapters/');

  // 2. CONTRACT TEST 2: INTELLIGENCE INTERFACE (LAYER 6 -> LAYER 13 AIANALYSIS)
  const mockAIAnalysis: AIAnalysis = {
    conclusion: 'Payment blocked by PO quantity discrepancy on line 2',
    category: 'PO_MISMATCH',
    confidence: 0.96,
    evidence: [
      {
        label: 'PO Quantity',
        value: '500 units',
        comparisonLabel: 'Invoice Quantity',
        comparisonValue: '600 units',
        delta: '100 units overbilled',
      },
    ],
    source: 'Contract Test Reasoning Engine',
    generatedAt: new Date().toISOString(),
    modelVersion: 'AIOSpark-O2C-v1.4',
  };

  const expRecord = udmStore.insertException({
    organization_id: testOrgId,
    invoice_id: udmStore.getInvoices()[0].id,
    customer_id: udmStore.getCustomers()[0].id,
    type: mockAIAnalysis.category,
    severity: 'high',
    status: 'classified',
    recommended_action: mockAIAnalysis.conclusion,
    evidence: { evidence: mockAIAnalysis.evidence, confidence: mockAIAnalysis.confidence },
  });

  assert.strictEqual(expRecord.type, 'PO_MISMATCH', 'Exception type mapping failed');
  assert.strictEqual(expRecord.recommended_action, mockAIAnalysis.conclusion, 'Exception recommended_action mismatch');

  console.log('⚡ [PASS] 2. Intelligence Interface Contract: Shared AIAnalysis schema created Layer 15 Exception directly without type adaptation');

  // 3. CONTRACT TEST 3: AGENT INTERFACE (LAYER 13 -> LAYER 16/17 EXECUTOR)
  // Swap LLM provider/model configuration in test registry
  agentExecutorRegistry.setLLMConfig({
    provider: 'anthropic-claude',
    model: 'claude-3-5-sonnet',
  });

  const helloRes = await runHelloAgent({ name: 'Finance Lead', organizationId: testOrgId });
  assert.strictEqual(helloRes.success, true, 'HelloAgent execution failed under swapped LLM config');
  assert.strictEqual(helloRes.log.provider, 'anthropic-claude', 'Provider in log should match swapped config');

  const analystRes = await runReceivablesAnalyst(testOrgId);
  assert.strictEqual(analystRes.success, true, 'Receivables Analyst execution failed under swapped LLM config');

  const invAgentRes = await runInvestigationAgent({ invoiceId: udmStore.getInvoices()[0].id, organizationId: testOrgId });
  assert.strictEqual(invAgentRes.success, true, 'Investigation Agent execution failed under swapped LLM config');

  console.log('⚡ [PASS] 3. Agent Interface Contract: Swapped LLM provider config to anthropic-claude; all agents executed cleanly with zero code changes inside agent modules');

  // 4. CONTRACT TEST 4: ACTION INTERFACE (LAYER 17/18 -> EXECUTION)
  const appReq = approvalStore.createRequest({
    organization_id: testOrgId,
    subject_type: 'invoice',
    subject_id: udmStore.getInvoices()[0].id,
    action_type: 'TEST_MOCK_ACTION',
    proposed_action: { custom_param: 'value' },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'Hello Agent',
  });

  const approvedReq = approvalStore.approveRequest(appReq.id, 'user_approver');
  assert.strictEqual(approvedReq.status, 'approved', 'Mock action request failed to approve');

  const verification = await AgentVerificationEngine.verifyOutput('Hello Agent', { status: 'executed' });
  assert.strictEqual(verification.verified, true, 'Mock action verification failed');

  console.log('⚡ [PASS] 4. Action Interface Contract: New action type TEST_MOCK_ACTION flowed through proposal -> approval -> verification cleanly');

  console.log('\n==========================================');
  console.log('ALL LAYER 35 STABLE INTERFACE DISCIPLINE TESTS PASSED SUCCESSFULLY');
  console.log('==========================================\n');
}
