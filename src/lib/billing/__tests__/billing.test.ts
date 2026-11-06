// AIOSpark Layer 27 Billing System Automated Test Suite

import assert from 'node:assert';
import { billingStore, DEFAULT_PLANS } from '../store';
import { PaymentProcessorService } from '../processor';
import { BillingGuardrail } from '../guardrail';
import { udmStore } from '../../udm/store';
import { AgentExecutor } from '../../agents/executor';
import { analyzeInvoice } from '../../intelligence/reasoning-engine';
import { integrationsStore } from '../../adapters/store';

export async function runBillingTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 27 BILLING TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_billing_test';
  billingStore.clearAll();
  udmStore.clearAll();
  udmStore.setTenantContext(testOrgId);

  // 1. BROAD USAGE EVENT ACCRUAL TEST
  // Import customer & invoices
  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_cust_bill',
    name: 'Reliance Retail',
    credit_limit_minor_units: 500000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  for (let i = 1; i <= 5; i++) {
    udmStore.insertInvoice({
      organization_id: testOrgId,
      source_system: 'manual',
      source_id: `src_inv_bill_${i}`,
      customer_id: cust.id,
      number: `INV-BILL-00${i}`,
      amount_minor_units: 10000000,
      tax_amount_minor_units: 1800000,
      currency: 'INR',
      issue_date: '2026-02-01',
      due_date: '2026-03-01',
      status: 'open',
    });
  }

  // Run AI reasoning task & Agent execution
  await analyzeInvoice(udmStore.getInvoices()[0].id, testOrgId);

  await AgentExecutor.run('Receivables Analyst', testOrgId, {}, async () => {
    return { data: { analysis: 'OK' } };
  });

  // Connect integration
  integrationsStore.saveIntegration({
    organization_id: testOrgId,
    adapter_type: 'zoho',
    rawConfig: { authtoken: 'sec_zoho_123' },
  });

  // Rollup Summary Check
  const summary = billingStore.getUsageSummary(testOrgId);
  assert.strictEqual(summary.invoices_processed, 5, 'Invoice processed count mismatch');
  assert.strictEqual(summary.customers_tracked, 1, 'Customer tracked count mismatch');
  assert.strictEqual(summary.ai_tasks_executed, 1, 'AI tasks count mismatch');
  assert.strictEqual(summary.agent_executions, 1, 'Agent executions count mismatch');
  assert.strictEqual(summary.integrations_connected, 1, 'Integrations connected count mismatch');

  console.log('⚡ [PASS] 1. Broad Usage Instrumentation: Accrued events correctly across invoice import, AI tasks, agents & ERP connectors');


  // 2. SUBSCRIPTION LIFECYCLE & PRORATED PLAN CHANGE TEST (SANDBOX)
  const subRes = await PaymentProcessorService.createSubscription({
    organization_id: testOrgId,
    plan_id: 'starter',
    customer_email: 'finance@relianceretail.com',
  });
  assert.strictEqual(subRes.subscription.plan_id, 'starter', 'Failed to create starter subscription');

  // Handle Webhook payment charged
  const chargedSub = await PaymentProcessorService.handleWebhookEvent({
    event: 'subscription.charged',
    payload: {
      subscription: {
        id: subRes.subscription.razorpay_subscription_id!,
        organization_id: testOrgId,
        plan_id: 'starter',
      },
    },
  });
  assert.strictEqual(chargedSub.status, 'active', 'Subscription status did not set to active');

  // Self-service upgrades must never activate without a paid checkout.
  await assert.rejects(
    () => PaymentProcessorService.changePlan(testOrgId, 'growth'),
    /paid Razorpay checkout/i,
    'Plan upgrades must require a paid Razorpay checkout'
  );
  await assert.rejects(
    () => PaymentProcessorService.changePlan(testOrgId, 'enterprise'),
    /Enterprise plans require custom sales onboarding/i,
    'Enterprise plans must not be self-activated'
  );

  // Paid upgrade is activated only by the verified webhook.
  const upgradeRes = await PaymentProcessorService.handleWebhookEvent({
    event: 'subscription.charged',
    payload: {
      subscription: {
        id: subRes.subscription.razorpay_subscription_id!,
        organization_id: testOrgId,
        plan_id: 'growth',
      },
    },
  });
  assert.strictEqual(upgradeRes.plan_id, 'growth', 'Webhook failed to activate the paid Growth plan');
  assert.strictEqual(upgradeRes.status, 'active', 'Webhook activation did not set active status');
  console.log('⚡ [PASS] 2. Subscription Lifecycle: upgrades require a paid checkout and activate only via verified webhook');


  // 3. GST-COMPLIANT TAX INVOICE GENERATION TEST (INDIA GO-TO-MARKET)
  const gstInvoiceIntraState = PaymentProcessorService.generateGSTInvoice({
    organization_id: testOrgId,
    customer_gstin: '27AAAAA0000A1Z5',
    customer_legal_name: 'Reliance Retail Ltd',
    customer_state_code: '27', // Intra-state (Maharashtra)
    plan_id: 'growth',
  });

  assert.ok(gstInvoiceIntraState.place_of_supply.includes('27'), 'Place of supply should contain state code 27');
  assert.strictEqual(gstInvoiceIntraState.cgst_minor_units, Math.round(gstInvoiceIntraState.subtotal_minor_units * 0.09), 'CGST 9% calculation mismatch');
  assert.strictEqual(gstInvoiceIntraState.sgst_minor_units, Math.round(gstInvoiceIntraState.subtotal_minor_units * 0.09), 'SGST 9% calculation mismatch');
  assert.strictEqual(gstInvoiceIntraState.igst_minor_units, 0, 'Intra-state IGST should be 0');

  const gstInvoiceInterState = PaymentProcessorService.generateGSTInvoice({
    organization_id: testOrgId,
    customer_gstin: '07AAAAA0000A1Z5',
    customer_legal_name: 'Delhi Retail Pvt Ltd',
    customer_state_code: '07', // Inter-state (Delhi)
    plan_id: 'growth',
  });

  assert.strictEqual(gstInvoiceInterState.igst_minor_units, Math.round(gstInvoiceInterState.subtotal_minor_units * 0.18), 'IGST 18% calculation mismatch');
  assert.strictEqual(gstInvoiceInterState.cgst_minor_units, 0, 'Inter-state CGST should be 0');
  console.log('⚡ [PASS] 3. Tax Compliance: GST-compliant invoice generator verified for Intra-state (CGST+SGST) and Inter-state (IGST) split');


  // 4. USAGE LIMIT WARNING & GUARDRAIL ENFORCEMENT TEST
  // Seed events to hit 92% of Starter plan invoice limit (460 / 500)
  billingStore.setSubscription(testOrgId, { plan_id: 'starter' });
  billingStore.recordEvent({
    organization_id: testOrgId,
    event_type: 'invoice.processed',
    quantity: 455, // Total 5 + 455 = 460
  });

  const warningCheck = BillingGuardrail.checkLimitStatus(testOrgId);
  assert.strictEqual(warningCheck.isApproachingInvoiceLimit, true, 'Failed to trigger 90% warning status');
  assert.strictEqual(warningCheck.enforcementAction, 'warning', 'Enforcement action should be warning');

  // Push over limit (total 505 / 500)
  billingStore.recordEvent({
    organization_id: testOrgId,
    event_type: 'invoice.processed',
    quantity: 45,
  });

  const softLimitCheck = BillingGuardrail.checkLimitStatus(testOrgId);
  assert.strictEqual(softLimitCheck.isInvoiceLimitExceeded, true, 'Failed to detect limit exceeded state');
  assert.strictEqual(softLimitCheck.enforcementAction, 'grace_period', 'Soft limit grace period policy failed to activate');

  // Downgrades must enforce every target-plan quota, not only the invoice quota.
  billingStore.setSubscription(testOrgId, { plan_id: 'growth' });
  await assert.rejects(
    () => PaymentProcessorService.changePlan(testOrgId, 'starter'),
    /current usage exceeds the target plan limits.*invoices 505\/500/i,
    'Plan downgrade should be blocked when current usage exceeds the target plan'
  );
  console.log('⚡ [PASS] 4. Soft Limit Guardrail: 90% quota warning UI trigger and 100% quota grace period policy verified');

  console.log('\n==========================================');
  console.log('ALL LAYER 27 BILLING TESTS PASSED SUCCESSFULLY');
  console.log('==========================================\n');
}
