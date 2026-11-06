// AIOSpark Agent Orchestration Test Suite (Layer 17)

import { udmStore } from '../../udm/store';
import { AgentExecutor, agentExecutorRegistry } from '../executor';
import { policyEngine } from '../policy-engine';
import { TaskPlanner } from '../task-planner';
import { AgentVerificationEngine } from '../verification';
import { runReceivablesAnalyst, analystReportStore } from '../receivables-analyst';
import { runInvestigationAgent } from '../investigation-agent';

export async function runOrchestrationTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 17 AGENT ORCHESTRATION TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_orch_test';
  udmStore.clearAll();
  udmStore.setTenantContext(testOrgId);
  agentExecutorRegistry.clearLogs();
  policyEngine.clearRules();
  policyEngine.resetRateLimitCounters();

  // Seed test data
  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_cust_orch',
    name: 'Stark Industries',
    credit_limit_minor_units: 500000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_orch',
    customer_id: cust.id,
    number: 'INV-ORCH-202',
    amount_minor_units: 75000000,
    tax_amount_minor_units: 13500000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  // 1. Task Planner Router Test
  const routeResult = TaskPlanner.routeTrigger({
    type: 'EXCEPTION_CREATED',
    organizationId: testOrgId,
    payload: { invoiceId: inv.id },
  });
  if (routeResult.targetAgent !== 'Investigation Agent') {
    throw new Error(`TaskPlanner failed to route EXCEPTION_CREATED. Got: ${routeResult.targetAgent}`);
  }
  console.log('⚡ [PASS] 1. TaskPlanner routed trigger event to target agent correctly');

  // 2. Policy-Based Denial Test (Subscription & Action Denial)
  policyEngine.setPolicyRule({
    id: 'test_deny_rule',
    organizationId: testOrgId,
    agentName: 'Action Test Agent',
    allowedActions: ['ALLOWED_ACTION'], // BLOCKED_ACTION not allowed
    maxActionsPerWindow: 10,
    windowSeconds: 60,
    activeSubscriptionRequired: true,
  });

  const deniedResult = await AgentExecutor.run('Action Test Agent', testOrgId, {}, async () => {
    return {
      data: { status: 'OK' },
      proposedAction: {
        targetEntity: 'invoice',
        targetId: inv.id,
        actionType: 'BLOCKED_ACTION',
        payload: {},
      },
    };
  });

  if (deniedResult.success) throw new Error('Policy Engine failed to block disallowed action');
  if (deniedResult.log.status !== 'policy_denied' || !deniedResult.log.error?.includes('not permitted')) {
    throw new Error(`Policy denial log mismatch. Got: ${deniedResult.log.status}`);
  }
  console.log('⚡ [PASS] 2. Policy Engine blocked prohibited action type before execution with clear log');

  // 3. Subscription Status Denial Test
  const subDeniedResult = await AgentExecutor.run(
    'Action Test Agent',
    testOrgId,
    {},
    async () => {
      return {
        data: { status: 'OK' },
        proposedAction: {
          targetEntity: 'invoice',
          targetId: inv.id,
          actionType: 'ALLOWED_ACTION',
          payload: {},
        },
      };
    },
    { policyContext: { subscriptionStatus: 'suspended' } }
  );

  if (subDeniedResult.success || subDeniedResult.log.status !== 'policy_denied') {
    throw new Error('Policy Engine failed to block action for suspended subscription');
  }
  console.log('⚡ [PASS] 3. Policy Engine enforced active subscription check');

  // 4. LLM Provider Swappability Test
  agentExecutorRegistry.setLLMConfig({
    provider: 'anthropic-claude',
    model: 'claude-3-5-sonnet',
  });

  const analystRes = await runReceivablesAnalyst(testOrgId);
  const invRes = await runInvestigationAgent({ invoiceId: inv.id, organizationId: testOrgId });

  if (!analystRes.success || !invRes.success) throw new Error('Agents failed when LLM provider was swapped');
  if (analystRes.log.provider !== 'anthropic-claude' || invRes.log.provider !== 'anthropic-claude') {
    throw new Error('LLM Provider encapsulation failed to reflect new provider');
  }
  console.log('⚡ [PASS] 4. LLM Provider swapped seamlessly (Gemini -> Claude) with zero agent code changes');

  // Reset provider back
  agentExecutorRegistry.setLLMConfig({
    provider: 'google-gemini',
    model: 'gemini-1.5-pro',
  });

  // 5. Timeout Handling Test
  const timeoutResult = await AgentExecutor.run(
    'Timeout Test Agent',
    testOrgId,
    {},
    async () => {
      await new Promise((r) => setTimeout(r, 600)); // Sleep longer than timeout
      return { data: { res: 'late' } };
    },
    { timeoutMs: 150 }
  );

  if (timeoutResult.success || timeoutResult.log.status !== 'timeout') {
    throw new Error(`Timeout handling failed. Expected status 'timeout', got '${timeoutResult.log.status}'`);
  }
  console.log('⚡ [PASS] 5. AgentExecutor gracefully timed out long-running call without hanging system');

  // 6. Verification Engine Test
  const verificationRes = await AgentVerificationEngine.verifyOutput('Receivables Analyst', { badData: true });
  if (verificationRes.verified) throw new Error('VerificationEngine failed to flag malformed report output');
  console.log('⚡ [PASS] 6. Verification Engine correctly flagged malformed output distinct from execution failure');

  console.log('\n==========================================');
  console.log('ORCHESTRATION SUITE SUMMARY: 6 PASSED, 0 FAILED');
  console.log('==========================================\n');
}
