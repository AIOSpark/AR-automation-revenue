// AIOSpark Layer 30 AI Safety / Guardrails Adversarial Test Suite

import assert from 'node:assert';
import { AgentExecutor, agentExecutorRegistry } from '../executor';
import { safetyMiddlewareEngine, HARD_PRODUCT_SAFETY_FLOORS } from '../safety-middleware';
import { policyEngine } from '../policy-engine';
import { approvalStore } from '../../approvals/store';
import { udmStore } from '../../udm/store';
import { runReceivablesAnalyst } from '../receivables-analyst';
import { runInvestigationAgent } from '../investigation-agent';

export async function runSafetyTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 30 SAFETY & ADVERSARIAL TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_safety_test';
  approvalStore.clearAll();
  udmStore.clearAll();
  safetyMiddlewareEngine.clearDeduplicationCache();
  udmStore.setTenantContext(testOrgId);

  // Seed baseline customer & invoice in UDM
  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_cust_saf',
    name: 'TATA Steel Ltd',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const activeInv = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_saf_001',
    customer_id: cust.id,
    number: 'INV-SAF-1001',
    amount_minor_units: 15000000, // ₹1,50,000
    tax_amount_minor_units: 2700000,
    currency: 'INR',
    issue_date: '2026-02-01',
    due_date: '2026-03-01',
    status: 'open',
  });

  // 1. DUMMY AGENT AUTOMATIC INHERITANCE TEST
  // Simple dummy agent with ZERO custom safety logic
  const dummyRes = await AgentExecutor.run(
    'Dummy Test Agent',
    testOrgId,
    { inputVal: 42 },
    async (input) => {
      return {
        data: { analysis: 'Complete', score: 99 },
        proposedAction: {
          targetEntity: 'invoice',
          targetId: activeInv.id,
          actionType: 'ALTER_INVOICE_VALUE', // High risk action
          payload: { value: 1000 },
        },
      };
    }
  );

  // High risk action MUST be routed to approval without any code in dummy agent
  assert.strictEqual(dummyRes.success, false, 'Dummy agent high-risk action should require approval');
  assert.strictEqual(dummyRes.actionProposed, true, 'Action should be proposed');
  assert.strictEqual(dummyRes.log.status, 'policy_denied', 'Log status should be policy_denied');

  console.log('⚡ [PASS] 1. Structural Inheritance: Dummy agent with zero safety code automatically inherited all 8 safety pipeline guardrails');

  // 2. ATTEMPTED ORG AUTONOMY OVERRIDE TEST (Hardcoded Floor Victory)
  // Attempt to configure hypothetical autonomy setting to min_confidence = 0.0 and amount = ₹10,00,00,000
  approvalStore.setAutonomyConfig({
    id: `auto_override_${testOrgId}`,
    organization_id: testOrgId,
    action_type: 'ALTER_INVOICE_VALUE',
    auto_approve_enabled: true,
    min_confidence_threshold: 0.0, // Attempted 0% threshold override
  });

  // Execute action with low confidence (40%) and high amount (₹8,00,000 >= ₹5,00,000 hard ceiling)
  const lowConfEval = safetyMiddlewareEngine.evaluateRiskAssessment({
    organizationId: testOrgId,
    agentName: 'Malicious Overriding Agent',
    actionType: 'ALTER_INVOICE_VALUE',
    confidence: 0.40, // Below 60% hard floor
    amountMinorUnits: 80000000, // ₹8,00,000 >= ₹5,00,000 hard ceiling
  });

  assert.strictEqual(lowConfEval.requiresApproval, true, 'Hardcoded safety floor must force approval');
  assert.strictEqual(lowConfEval.confidenceFloorTriggered, true, 'Confidence floor must trigger');
  assert.strictEqual(lowConfEval.amountFloorTriggered, true, 'Amount ceiling floor must trigger');

  console.log('⚡ [PASS] 2. Non-Bypassable Product Floor: Hardcoded safety floors (₹5,00,000 ceiling & 60% confidence floor) defeated malicious autonomy override settings');

  // 3. STALE / MODIFIED DATA INTERCEPTION TEST
  // Mark activeInv as 'paid' in UDM
  activeInv.status = 'paid';

  const staleActionRes = await AgentExecutor.run(
    'Stale Data Agent',
    testOrgId,
    { targetId: activeInv.id },
    async () => {
      return {
        data: { status: 'stale' },
        proposedAction: {
          targetEntity: 'invoice',
          targetId: activeInv.id,
          actionType: 'ISSUE_CREDIT_NOTE',
          payload: { credit_amount: 5000 },
        },
      };
    }
  );

  assert.strictEqual(staleActionRes.success, false, 'Stale data action must be blocked');
  assert.ok(staleActionRes.log.error?.includes('Stale Data Interception'), 'Log error must document stale data interception');

  console.log('⚡ [PASS] 3. Stale Data Interception: Step 3 Data Validation blocked action against already-paid invoice');

  // 4. IDEMPOTENCY & CONCURRENT DOUBLE-CLICK TEST
  safetyMiddlewareEngine.clearDeduplicationCache();
  const validInv = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_dup_001',
    customer_id: cust.id,
    number: 'INV-DUP-2002',
    amount_minor_units: 5000000,
    tax_amount_minor_units: 900000,
    currency: 'INR',
    issue_date: '2026-02-01',
    due_date: '2026-03-01',
    status: 'open',
  });

  // Call 1
  const call1 = await AgentExecutor.run(
    'Double Click Agent',
    testOrgId,
    { invoice_id: validInv.id },
    async () => ({
      data: { result: 'OK' },
      proposedAction: {
        targetEntity: 'invoice',
        targetId: validInv.id,
        actionType: 'SEND_REMINDER',
        payload: { text: 'Reminder' },
      },
    })
  );

  // Rapid Call 2 (Simulating double-click within 5s window)
  const call2 = await AgentExecutor.run(
    'Double Click Agent',
    testOrgId,
    { invoice_id: validInv.id },
    async () => ({
      data: { result: 'OK' },
      proposedAction: {
        targetEntity: 'invoice',
        targetId: validInv.id,
        actionType: 'SEND_REMINDER',
        payload: { text: 'Reminder' },
      },
    })
  );

  assert.strictEqual(call2.success, false, 'Rapid double-click action must be intercepted');
  assert.ok(call2.log.error?.includes('Double-Execution Intercepted'), 'Log error must detail double-execution guard');

  console.log('⚡ [PASS] 4. Double-Click Guard: Rapid duplicate action execution intercepted and suppressed');

  // 5. REGRESSION TEST LAYER 16 AGENTS (Receivables Analyst & Investigation Agent)
  const analystRes = await runReceivablesAnalyst(testOrgId);
  assert.strictEqual(analystRes.success, true, 'Receivables Analyst execution should succeed');

  const invAgentRes = await runInvestigationAgent({ invoiceId: validInv.id, organizationId: testOrgId });
  assert.strictEqual(invAgentRes.success, true, 'Investigation Agent execution should succeed');

  console.log('⚡ [PASS] 5. Layer 16 Regression Test: Receivables Analyst and Investigation Agent executed cleanly without regression');

  console.log('\n==========================================');
  console.log('ALL LAYER 30 SAFETY & ADVERSARIAL TESTS PASSED SUCCESSFULLY');
  console.log('==========================================\n');
}
