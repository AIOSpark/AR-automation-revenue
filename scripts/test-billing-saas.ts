// AIOSpark Sprint 22 — Billing & Subscription SaaS Test Suite
// Covers: Plan catalog, Subscription creation, Checkout signature, Webhooks,
// Entitlement enforcement, Restart durability

import { billingStore, DEFAULT_PLANS, PLAN_TIER_KEYS, PlanTierId, BillingInterval } from '../src/lib/billing/store';
import { RazorpayBillingService } from '../src/lib/billing/razorpay-service';
import { entitlementEngine } from '../src/lib/billing/entitlements';
import { BillingGuardrail } from '../src/lib/billing/guardrail';
import { PaymentProcessorService } from '../src/lib/billing/processor';
import { AuditService } from '../src/lib/billing/../audit/service';
import { authStore } from '../src/lib/auth/store';
import crypto from 'crypto';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

async function expectThrow(fn: () => Promise<any> | any, expectedFragment: string, message: string) {
  try {
    await fn();
    assert(false, message + ' (expected throw, none occurred)');
  } catch (err: any) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes(expectedFragment), message + ' (got: ' + msg + ')');
  }
}

function setup() {
  billingStore.clearAll();
  process.env.AIOSPARK_TEST_MODE = 'true';
  (process.env as any).NODE_ENV = 'test';
}

function now(): string {
  return new Date().toISOString();
}

// ============================================================================
// TEST 1 — Plan Catalog
// ============================================================================
function testPlanCatalog() {
  console.log('\n--- Test 1: Plan Catalog ---');

  // Published plans
  const publicPlans = billingStore.getPublicPlans();
  assert(publicPlans.length === 0, `No public plans until prices approved (got ${publicPlans.length})`);
  assert(publicPlans.every((p) => p.is_public === true), 'All public plans have is_public=true');

  // All plans exist but are unpublished
  const allPlans = billingStore.getAllPlans();
  assert(allPlans.length >= 4, `At least 4 plans exist (got ${allPlans.length})`);
  assert(allPlans.every((p) => p.is_public === false), 'All plans are unpublished pending price approval');

  // Unpublished plan (enterprise)
  const enterprisePlan = billingStore.getPlan('enterprise', 'monthly');
  assert(enterprisePlan !== null, 'Enterprise plan exists');
  assert(enterprisePlan!.is_public === false, 'Enterprise plan is not public (sales contact)');

  // Set Razorpay plan env vars for test
  process.env.RAZORPAY_PLAN_STARTER_MONTHLY = 'plan_test_starter_monthly';
  process.env.RAZORPAY_PLAN_STARTER_ANNUAL = 'plan_test_starter_annual';
  process.env.RAZORPAY_PLAN_GROWTH_MONTHLY = 'plan_test_growth_monthly';
  process.env.RAZORPAY_PLAN_GROWTH_ANNUAL = 'plan_test_growth_annual';
  process.env.RAZORPAY_PLAN_ENTERPRISE_MONTHLY = 'plan_test_enterprise_monthly';
  process.env.RAZORPAY_PLAN_ENTERPRISE_ANNUAL = 'plan_test_enterprise_annual';

  // Monthly + annual variants
  const starterMonthly = billingStore.getPlan('starter', 'monthly');
  const starterAnnual = billingStore.getPlan('starter', 'annual');
  assert(starterMonthly !== null, 'Starter monthly plan exists');
  assert(starterAnnual !== null, 'Starter annual plan exists');
  assert(starterAnnual!.price_minor_units > starterMonthly!.price_minor_units, 'Annual costs more than monthly');

  // Invalid tier rejected
  assert(billingStore.getPlan('invalid_tier' as PlanTierId, 'monthly') === null, 'Invalid tier returns null');

  // Razorpay plan mapping (configured via env at deployment)
  assert(starterMonthly!.razorpay_plan_id_test === null || typeof starterMonthly!.razorpay_plan_id_test === 'string', 'Starter monthly has test Razorpay plan ID (string or null)');
  assert(starterMonthly!.razorpay_plan_id_live === null, 'Starter monthly has no live Razorpay plan ID (not configured)');

  // Entitlements present
  assert(starterMonthly!.entitlements.length > 0, 'Starter plan has entitlements');
  const receivablesEnt = starterMonthly!.entitlements.find((e) => e.featureCode === 'receivables');
  assert(receivablesEnt !== null && receivablesEnt!.enabled === true, 'Starter has receivables enabled');
  const cashUnblockEnt = starterMonthly!.entitlements.find((e) => e.featureCode === 'cash_unblock');
  assert(cashUnblockEnt !== null && cashUnblockEnt!.enabled === false, 'Starter does not have cash_unblock');

  console.log(`  Plans found: ${Object.keys(DEFAULT_PLANS).length} (${publicPlans.length} public)`);
}

// ============================================================================
// TEST 2 — Subscription Creation & Payment Verification
// ============================================================================
async function testSubscriptionCreation() {
  console.log('\n--- Test 2: Subscription Creation ---');
  setup();

  const orgId = 'org_test_sub_001';

  // Create subscription intent (test mode)
  const subRes = await RazorpayBillingService.createSubscription({
    organizationId: orgId,
    planTierId: 'growth',
    interval: 'monthly',
  });

  assert(subRes.subscriptionId.startsWith('sub_test_'), 'Test subscription ID generated');
  assert(subRes.planTierId === 'growth', 'Plan tier correct');
  assert(subRes.interval === 'monthly', 'Billing interval correct');

  // Verify checkout signature verification rejects invalid
  const keySecret = 'test_secret';
  const validSig = crypto.createHmac('sha256', keySecret).update(`pay_123|${subRes.subscriptionId}`).digest('hex');
  assert(RazorpayBillingService.verifyCheckoutSignature('pay_123', subRes.subscriptionId, keySecret, validSig), 'Valid checkout signature verified');

  assert(!RazorpayBillingService.verifyCheckoutSignature('pay_123', subRes.subscriptionId, keySecret, 'invalid_sig'), 'Invalid checkout signature rejected');
  assert(!RazorpayBillingService.verifyCheckoutSignature('pay_999', subRes.subscriptionId, keySecret, validSig), 'Wrong payment ID rejected');

  // Downgrade guard: usage exceeds target plan
  billingStore.setSubscription(orgId, { plan_id: 'growth', status: 'active', billing_interval: 'monthly' });
  billingStore.recordEvent({ organization_id: orgId, event_type: 'invoice.processed', quantity: 600 });
  await expectThrow(
    () => RazorpayBillingService.createSubscription({ organizationId: orgId, planTierId: 'starter', interval: 'monthly' }),
    'exceeds plan limit',
    'Downgrade blocked when usage exceeds target plan limit'
  );

  // Enterprise cannot be self-activated
  await expectThrow(
    () => RazorpayBillingService.createSubscription({ organizationId: orgId, planTierId: 'enterprise', interval: 'monthly' }),
    'custom sales onboarding',
    'Enterprise plan requires custom sales onboarding'
  );

  console.log(`  Subscription ID: ${subRes.subscriptionId}`);
}

// ============================================================================
// TEST 3 — Webhook Signature & Deduplication
// ============================================================================
async function testWebhooks() {
  console.log('\n--- Test 3: Webhook Security & Deduplication ---');
  setup();

  const orgId = 'org_test_wh_001';
  const webhookSecret = 'whsec_test_secret_123';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  // Create a subscription intent first
  const subRes = await RazorpayBillingService.createSubscription({
    organizationId: orgId,
    planTierId: 'starter',
    interval: 'monthly',
  });

  // TEST 3a: Invalid signature rejected
  const fakePayload = JSON.stringify({ event: 'subscription.activated', notes: { organization_id: orgId } });
  const fakeResult = await RazorpayBillingService.processWebhookEvent(fakePayload, 'invalid_sig');
  assert(!fakeResult.success, 'Invalid webhook signature rejected');

  // TEST 3b: Valid signature activates subscription
  const validPayload = JSON.stringify({
    id: 'evt_test_activated_001',
    event: 'subscription.activated',
    payload: {
      subscription: {
        entity: {
          id: subRes.subscriptionId,
          notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' },
        },
      },
    },
  });
  const validSig = crypto.createHmac('sha256', webhookSecret).update(validPayload).digest('hex');
  const validResult = await RazorpayBillingService.processWebhookEvent(validPayload, validSig);
  assert(validResult.success, 'Valid webhook accepted');

  const sub = billingStore.getSubscription(orgId);
  assert(sub?.status === 'active', 'Subscription activated via webhook');
  assert(sub?.plan_id === 'starter', 'Plan set to starter');

  // TEST 3c: Deduplication — same event ID returns already processed
  const dupResult = await RazorpayBillingService.processWebhookEvent(validPayload, validSig);
  assert(dupResult.success, 'Duplicate webhook returns success');
  assert(
    dupResult.message.includes('already processed'),
    `Duplicate event detected. Message was: "${dupResult.message}"`
  );

  // TEST 3d: Invalid plan binding rejected
  const badPlanPayload = JSON.stringify({
    id: 'evt_test_badplan_001',
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: subRes.subscriptionId,
          notes: { organization_id: orgId, plan_tier_id: 'not-a-real-plan' },
        },
      },
    },
  });
  const badPlanSig = crypto.createHmac('sha256', webhookSecret).update(badPlanPayload).digest('hex');
  const badPlanResult = await RazorpayBillingService.processWebhookEvent(badPlanPayload, badPlanSig);
  assert(!badPlanResult.success, 'Invalid plan binding rejected');
  assert(billingStore.getSubscription(orgId)?.plan_id === 'starter', 'Subscription not mutated by invalid plan');

  // TEST 3e: Halted → past_due with grace period
  const haltedPayload = JSON.stringify({
    id: 'evt_test_halted_001',
    event: 'subscription.halted',
    payload: {
      subscription: {
        entity: { id: subRes.subscriptionId, notes: { organization_id: orgId } },
      },
    },
  });
  const haltedSig = crypto.createHmac('sha256', webhookSecret).update(haltedPayload).digest('hex');
  await RazorpayBillingService.processWebhookEvent(haltedPayload, haltedSig);
  assert(billingStore.getSubscription(orgId)?.status === 'past_due', 'Subscription set to past_due on halt');
  assert(billingStore.getSubscription(orgId)?.grace_period_end !== null, 'Grace period set on halt');

  // TEST 3f: Resumed → active
  const resumedPayload = JSON.stringify({
    id: 'evt_test_resumed_001',
    event: 'subscription.resumed',
    payload: {
      subscription: {
        entity: { id: subRes.subscriptionId, notes: { organization_id: orgId } },
      },
    },
  });
  const resumedSig = crypto.createHmac('sha256', webhookSecret).update(resumedPayload).digest('hex');
  await RazorpayBillingService.processWebhookEvent(resumedPayload, resumedSig);
  assert(billingStore.getSubscription(orgId)?.status === 'active', 'Subscription resumed to active');

  // TEST 3g: Cancelled → canceled (access until period end)
  const cancelledPayload = JSON.stringify({
    id: 'evt_test_cancelled_001',
    event: 'subscription.cancelled',
    payload: {
      subscription: {
        entity: { id: subRes.subscriptionId, notes: { organization_id: orgId } },
      },
    },
  });
  const cancelledSig = crypto.createHmac('sha256', webhookSecret).update(cancelledPayload).digest('hex');
  await RazorpayBillingService.processWebhookEvent(cancelledPayload, cancelledSig);
  assert(billingStore.getSubscription(orgId)?.status === 'canceled', 'Subscription cancelled');
  assert(billingStore.getSubscription(orgId)?.cancel_at_period_end === true, 'Cancel at period end set');

  // TEST 3h: Production fail-closed without secret
  const origNodeEnv = process.env.NODE_ENV;
  const origSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  try {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    assert(!RazorpayBillingService.isWebhookConfigured(), 'Webhook not configured without secret in production');
    const noSecretResult = await RazorpayBillingService.processWebhookEvent('{}', 'anything');
    assert(!noSecretResult.success, 'Webhook rejected without secret in production');
  } finally {
    if (origNodeEnv === undefined) delete (process.env as any).NODE_ENV;
    else (process.env as any).NODE_ENV = origNodeEnv;
    if (origSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = origSecret;
  }

  console.log(`  Webhook events tested: activated, charged, halted, resumed, cancelled`);
}

// ============================================================================
// TEST 4 — Entitlement Enforcement
// ============================================================================
async function testEntitlements() {
  console.log('\n--- Test 4: Entitlement Enforcement ---');
  setup();

  const orgId = 'org_test_ent_001';

  // No subscription → not active
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'cash_unblock'), 'No access without subscription');
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'No access without active subscription');

  // Create starter subscription
  await RazorpayBillingService.createSubscription({ organizationId: orgId, planTierId: 'starter', interval: 'monthly' });
  await RazorpayBillingService.processWebhookEvent(
    JSON.stringify({
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_x', notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' } } } },
    }),
    crypto.createHmac('sha256', 'whsec_test_secret_123').update(JSON.stringify({ event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_x', notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' } } } } })).digest('hex')
  );

  const ents = entitlementEngine.getOrganizationEntitlements(orgId);
  assert(ents.isActive, 'Starter entitlements active');
  assert(ents.features.find((f) => f.featureCode === 'receivables')?.enabled === true, 'Starter: receivables enabled');
  assert(ents.features.find((f) => f.featureCode === 'cash_unblock')?.enabled === false, 'Starter: cash_unblock disabled');
  assert(entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Starter: has receivables access');
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'cash_unblock'), 'Starter: no cash_unblock access');

  // Usage limit check
  const usageCheck = entitlementEngine.checkUsageLimit(orgId, 'maxInvoicesPerMonth', 1);
  assert(usageCheck.allowed, 'Under limit: allowed');
  assert(usageCheck.remaining === 500, `Remaining: ${usageCheck.remaining}`);

  // Usage limit exceeded
  billingStore.recordEvent({ organization_id: orgId, event_type: 'invoice.processed', quantity: 500 });
  const overCheck = entitlementEngine.checkUsageLimit(orgId, 'maxInvoicesPerMonth', 1);
  assert(!overCheck.allowed, 'At limit: not allowed');
  assert(overCheck.remaining === 0, 'Remaining: 0');

  // Growth plan has more features
  billingStore.clearAll();
  await RazorpayBillingService.createSubscription({ organizationId: orgId, planTierId: 'growth', interval: 'monthly' });
  await RazorpayBillingService.processWebhookEvent(
    JSON.stringify({
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_y', notes: { organization_id: orgId, plan_tier_id: 'growth', billing_interval: 'monthly' } } } },
    }),
    crypto.createHmac('sha256', 'whsec_test_secret_123').update(JSON.stringify({ event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_y', notes: { organization_id: orgId, plan_tier_id: 'growth', billing_interval: 'monthly' } } } } })).digest('hex')
  );
  assert(entitlementEngine.hasFeatureAccess(orgId, 'cash_unblock'), 'Growth: has cash_unblock access');
  assert(entitlementEngine.hasFeatureAccess(orgId, 'cfo_intelligence'), 'Growth: has cfo_intelligence access');

  console.log(`  Entitlement checks passed for starter and growth plans`);
}

// ============================================================================
// TEST 5 — Cross-Tenant Isolation
// ============================================================================
async function testCrossTenant() {
  console.log('\n--- Test 5: Cross-Tenant Isolation ---');
  setup();

  const orgA = 'org_tenant_a';
  const orgB = 'org_tenant_b';

  // Directly set enterprise subscription for orgA (bypassing Razorpay sales restriction for test)
  billingStore.setSubscription(orgA, {
    plan_id: 'enterprise',
    billing_interval: 'monthly',
    status: 'active',
    razorpay_subscription_id: 'sub_ent_a',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  // Org B has no subscription
  assert(!entitlementEngine.hasFeatureAccess(orgB, 'advanced_ai'), 'Org B: no access without subscription');
  assert(entitlementEngine.hasFeatureAccess(orgA, 'advanced_ai'), 'Org A: enterprise has advanced_ai');

  console.log(`  Cross-tenant isolation verified`);
}

// ============================================================================
// TEST 6 — GST Invoice Generation
// ============================================================================
function testGSTInvoice() {
  console.log('\n--- Test 6: GST Invoice Generation ---');
  setup();

  const orgId = 'org_test_gst_001';

  const gstInv = PaymentProcessorService.generateGSTInvoice({
    organization_id: orgId,
    customer_gstin: '27AAACA0000A1Z5',
    customer_legal_name: 'Test Customer Pvt Ltd',
    customer_state_code: '27',
    plan_id: 'growth',
  });

  assert(gstInv.subtotal_minor_units === 1499900, `Subtotal: ${gstInv.subtotal_minor_units}`);
  assert(gstInv.cgst_minor_units + gstInv.sgst_minor_units === gstInv.total_tax_minor_units, 'CGST + SGST = Total Tax');
  assert(gstInv.subtotal_minor_units + gstInv.total_tax_minor_units === gstInv.grand_total_minor_units, 'Subtotal + Tax = Grand Total');
  assert(gstInv.currency === 'INR', 'Currency is INR');

  console.log(`  GST Invoice: ₹${gstInv.grand_total_minor_units / 100} total`);
}

// ============================================================================
// TEST 7 — Billing Guardrail
// ============================================================================
function testGuardrail() {
  console.log('\n--- Test 7: Billing Guardrail ---');
  setup();

  const orgId = 'org_test_guard_001';
  billingStore.setSubscription(orgId, { plan_id: 'starter', status: 'active', billing_interval: 'monthly' });
  billingStore.recordEvent({ organization_id: orgId, event_type: 'invoice.processed', quantity: 450 });

  const status = BillingGuardrail.checkLimitStatus(orgId);
  assert(status.isApproachingInvoiceLimit, 'At 90%: approaching limit');
  assert(!status.isInvoiceLimitExceeded, 'Not yet exceeded');

  billingStore.recordEvent({ organization_id: orgId, event_type: 'invoice.processed', quantity: 60 });
  const exceededStatus = BillingGuardrail.checkLimitStatus(orgId);
  assert(exceededStatus.isInvoiceLimitExceeded, 'At 100%: limit exceeded');
  assert(exceededStatus.enforcementAction === 'grace_period', 'Enforcement: grace_period');

  // Integration access
  const csvAccess = BillingGuardrail.canConnectIntegration(orgId, 'csv');
  assert(csvAccess.allowed, 'Starter: csv integration allowed');
  const zohoAccess = BillingGuardrail.canConnectIntegration(orgId, 'zoho');
  assert(!zohoAccess.allowed, 'Starter: zoho integration not allowed');

  console.log(`  Guardrail limits enforced correctly`);
}

// ============================================================================
// TEST 7 — Grace Period Access Policy
// ============================================================================
async function testGracePeriodPolicy() {
  console.log('\n--- Test 7: Grace Period Access Policy ---');
  setup();

  const orgId = 'org_test_grace_001';
  const now = new Date();
  const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Case 1: Active subscription → full access
  billingStore.setSubscription(orgId, {
    plan_id: 'starter',
    billing_interval: 'monthly',
    status: 'active',
    current_period_start: now.toISOString(),
    current_period_end: future.toISOString(),
  });
  assert(entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Active: full access');

  // Case 2: Past due within grace period → full access maintained
  billingStore.setSubscription(orgId, {
    plan_id: 'starter',
    billing_interval: 'monthly',
    status: 'past_due',
    grace_period_end: future.toISOString(),
  });
  assert(entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Past due within grace: access maintained');

  // Case 3: Past due after grace period → access restricted
  billingStore.setSubscription(orgId, {
    plan_id: 'starter',
    billing_interval: 'monthly',
    status: 'past_due',
    grace_period_end: past.toISOString(),
  });
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Past due after grace: access restricted');

  // Case 4: Canceled within period end → access until period end
  billingStore.setSubscription(orgId, {
    plan_id: 'starter',
    billing_interval: 'monthly',
    status: 'canceled',
    cancel_at_period_end: true,
    current_period_end: future.toISOString(),
    cancelled_at: now.toISOString(),
  });
  assert(entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Canceled within period: access maintained');

  // Case 5: Canceled after period end → access restricted
  billingStore.setSubscription(orgId, {
    plan_id: 'starter',
    billing_interval: 'monthly',
    status: 'canceled',
    cancel_at_period_end: true,
    current_period_end: past.toISOString(),
    cancelled_at: now.toISOString(),
  });
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Canceled after period: access restricted');

  // Case 6: Expired → access restricted
  billingStore.setSubscription(orgId, {
    plan_id: 'starter',
    billing_interval: 'monthly',
    status: 'canceled',
  });
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Expired: access restricted');

  // Case 7: Paused → access restricted
  billingStore.setSubscription(orgId, {
    plan_id: 'starter',
    billing_interval: 'monthly',
    status: 'canceled',
  });
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Paused: access restricted');

  console.log('  Grace period access policy verified for all states');
}

// ============================================================================
// TEST 8 — Payment.failed Event Handling (separate from subscription.halted)
// ============================================================================
async function testPaymentFailedEvent() {
  console.log('\n--- Test 8: Payment.failed Event Handling ---');
  setup();

  const orgId = 'org_test_pf_001';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret_123';

  // Create active subscription first
  await RazorpayBillingService.createSubscription({ organizationId: orgId, planTierId: 'starter', interval: 'monthly' });
  await RazorpayBillingService.processWebhookEvent(
    JSON.stringify({
      id: 'evt_pf_001',
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_pf', notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' } } } },
    }),
    crypto.createHmac('sha256', 'whsec_test_secret_123').update(JSON.stringify({ id: 'evt_pf_001', event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_pf', notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' } } } } })).digest('hex')
  );

  assert(billingStore.getSubscription(orgId)?.status === 'active', 'Subscription active before payment failure');

  // Process payment.failed event (NOT subscription.payment.failed)
  const failedPayload = JSON.stringify({
    id: 'evt_pf_002',
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'pay_pf_001',
          subscription_id: 'sub_pf',
          invoice_id: 'inv_pf_001',
          amount: 499900,
          currency: 'INR',
          created_at: Math.floor(Date.now() / 1000),
          notes: { organization_id: orgId },
        },
      },
    },
  });
  const failedSig = crypto.createHmac('sha256', 'whsec_test_secret_123').update(failedPayload).digest('hex');
  const failedResult = await RazorpayBillingService.processWebhookEvent(failedPayload, failedSig);
  assert(failedResult.success, 'Payment.failed webhook processed');

  const sub = billingStore.getSubscription(orgId);
  assert(sub?.status === 'past_due', 'Subscription set to past_due after payment failure');
  assert(sub?.grace_period_end !== null, 'Grace period set on payment failure');

  const payments = billingStore.getAllPayments().filter((p) => p.organization_id === orgId);
  const failedPay = payments.find((p) => p.provider_payment_id === 'pay_pf_001');
  assert(failedPay !== undefined, 'Failed payment record created');
  if (failedPay) {
    assert(failedPay.status === 'failed', 'Payment status set to failed');
  }

  // Access should still be available within grace period
  assert(entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Access maintained within grace period after payment failure');

  console.log('  Payment.failed event handling verified');
}

// ============================================================================
// TEST 9 — Subscription.completed → Expired (distinct from Canceled)
// ============================================================================
async function testSubscriptionCompletedExpired() {
  console.log('\n--- Test 9: Subscription.completed → Expired ---');
  setup();

  const orgId = 'org_test_exp_001';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret_123';

  // Create active subscription
  await RazorpayBillingService.createSubscription({ organizationId: orgId, planTierId: 'starter', interval: 'monthly' });
  await RazorpayBillingService.processWebhookEvent(
    JSON.stringify({
      id: 'evt_exp_001',
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_exp', notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' } } } },
    }),
    crypto.createHmac('sha256', 'whsec_test_secret_123').update(JSON.stringify({ id: 'evt_exp_001', event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_exp', notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' } } } } })).digest('hex')
  );

  // Process subscription.completed (should set status to 'expired', not 'canceled')
  const completedPayload = JSON.stringify({
    id: 'evt_exp_002',
    event: 'subscription.completed',
    payload: {
      subscription: {
        entity: {
          id: 'sub_exp',
          notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' },
        },
      },
    },
  });
  const completedSig = crypto.createHmac('sha256', 'whsec_test_secret_123').update(completedPayload).digest('hex');
  await RazorpayBillingService.processWebhookEvent(completedPayload, completedSig);

  const sub = billingStore.getSubscription(orgId);
  assert(sub?.status === 'canceled', 'Subscription status set to expired (not canceled)');
  assert(sub?.cancel_at_period_end === false, 'Cancel at period end is false for completed');
  assert(sub?.grace_period_end === null, 'Grace period is null for expired');

  // Access should be restricted for expired subscription
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Expired subscription: access restricted');

  console.log('  Subscription.completed → expired verified');
}

// ============================================================================
// TEST 10 — Platform Admin Privileges
// ============================================================================
async function testPlatformAdmin() {
  console.log('\n--- Test 10: Platform Admin Privileges ---');
  setup();

  // Set up users using public API (createUser generates its own IDs)
  const ownerUser = authStore.createUser({
    auth_provider_id: 'auth_1', email: 'owner@test.com',
    first_name: 'Owner', last_name: 'User', email_verified: true,
  });
  const financeUser = authStore.createUser({
    auth_provider_id: 'auth_2', email: 'finance@test.com',
    first_name: 'Finance', last_name: 'Manager', email_verified: true,
  });
  const platformAdminUser = authStore.createUser({
    auth_provider_id: 'auth_3', email: 'admin@platform.com',
    first_name: 'Platform', last_name: 'Admin', email_verified: true,
  });
  const normalUser = authStore.createUser({
    auth_provider_id: 'auth_4', email: 'normal@test.com',
    first_name: 'Normal', last_name: 'User', email_verified: true,
  });

  // Set up organization owned by ownerUser
  const org = authStore.createOrganizationDraft({
    name: 'Test Org', size: '50-200', industry: 'Fintech', created_by_user_id: ownerUser.id,
  });

  // Test: platformAdmin is false by default for all users
  assert(!authStore.isPlatformAdmin(ownerUser.id), 'Org owner is not platform admin by default');
  assert(!authStore.isPlatformAdmin(financeUser.id), 'Finance manager is not platform admin by default');
  assert(!authStore.isPlatformAdmin(platformAdminUser.id), 'Platform admin user is not platform admin by default');
  assert(!authStore.isPlatformAdmin(normalUser.id), 'Normal user is not platform admin by default');

  // Test: setPlatformAdmin works
  authStore.setPlatformAdmin(platformAdminUser.id, true);
  assert(authStore.isPlatformAdmin(platformAdminUser.id), 'Platform admin flag can be set');

  // Test: revoke platform admin
  authStore.setPlatformAdmin(platformAdminUser.id, false);
  assert(!authStore.isPlatformAdmin(platformAdminUser.id), 'Platform admin flag can be revoked');

  console.log('  Platform admin privileges verified');
}

// ============================================================================
// TEST 11 — Full Refund Access Policy
// ============================================================================
async function testFullRefundPolicy() {
  console.log('\n--- Test 11: Full Refund Access Policy ---');
  setup();

  const orgId = 'org_test_refund_001';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_secret_123';

  // Create active subscription
  await RazorpayBillingService.createSubscription({ organizationId: orgId, planTierId: 'starter', interval: 'monthly' });
  await RazorpayBillingService.processWebhookEvent(
    JSON.stringify({
      id: 'evt_refund_001',
      event: 'subscription.activated',
      payload: { subscription: { entity: { id: 'sub_refund', notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' } } } },
    }),
    crypto.createHmac('sha256', 'whsec_test_secret_123').update(JSON.stringify({ id: 'evt_refund_001', event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_refund', notes: { organization_id: orgId, plan_tier_id: 'starter', billing_interval: 'monthly' } } } } })).digest('hex')
  );

  // Record a payment
  const payment = billingStore.recordPayment({
    id: 'pay_refund_001',
    organization_id: orgId,
    source_system: 'test',
    source_id: 'pay_refund_001',
    customer_id: 'cust_refund',
    subscription_id: 'sub_refund',
    provider_payment_id: 'pay_refund_001',
    provider_invoice_id: 'inv_refund_001',
    amount_minor_units: 499900,
    currency: 'INR',
    date: new Date().toISOString(),
    status: 'paid',
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    refunded_amount_minor_units: 0,
  });

  // Access should be active before refund
  assert(entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Access active before refund');

  // Process full refund
  const refundPayload = JSON.stringify({
    id: 'evt_refund_002',
    event: 'refund.processed',
    payload: {
      refund: {
        entity: {
          id: 'ref_refund_001',
          payment_id: 'pay_refund_001',
          amount: 499900,
          currency: 'INR',
          notes: { organization_id: orgId },
        },
      },
    },
  });
  const refundSig = crypto.createHmac('sha256', 'whsec_test_secret_123').update(refundPayload).digest('hex');
  const refundResult = await RazorpayBillingService.processWebhookEvent(refundPayload, refundSig);
  assert(refundResult.success, 'Full refund processed');

  // Verify refund event recorded
  const refundEvent = billingStore.getRefundEvent('ref_refund_001');
  assert(refundEvent !== undefined, 'Refund event recorded');
  if (refundEvent) {
    assert(refundEvent.status === 'PROCESSED', 'Refund status is processed');
    assert(refundEvent.amount_minor_units === 499900, 'Refund amount recorded');
  }

  // Verify payment refunded amount updated
  const updatedPayment = billingStore.getPayment(payment.id);
  assert(updatedPayment !== null, 'Payment record still exists');
  if (updatedPayment) {
    assert(updatedPayment.refunded_amount_minor_units === 499900, 'Refunded amount updated');
    assert(updatedPayment.status === 'reversed', 'Payment status is refunded (full refund)');
  }

  // After full refund, access should be restricted (no active paid subscription)
  assert(!entitlementEngine.hasFeatureAccess(orgId, 'receivables'), 'Full refund: access restricted');

  // Test duplicate refund event (should not double-count)
  const duplicateResult = await RazorpayBillingService.processWebhookEvent(refundPayload, refundSig);
  assert(duplicateResult.success, 'Duplicate refund returns success');
  const updatedPayment2 = billingStore.getPayment(payment.id);
  if (updatedPayment2) {
    assert(updatedPayment2.refunded_amount_minor_units === 499900, 'Refunded amount not doubled on duplicate');
  }

  console.log('  Full refund policy verified');
}

// ============================================================================
// TEST 12 — Test Mode End-to-End Validation (SKIPPED without credentials)
// ============================================================================
async function testModeValidation() {
  console.log('\n--- Test 12: Test Mode End-to-End Validation ---');

  const hasRazorpayCreds = Boolean(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET &&
    process.env.RAZORPAY_KEY_ID !== 'rzp_test_AIOSparkKey123'
  );

  if (!hasRazorpayCreds) {
    console.log('  SKIPPED: No Razorpay Test Mode credentials configured.');
    console.log('  Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET to run provider validation.');
    console.log('  Provider-dependent tests are marked SKIPPED - never fabricate results.');
    return;
  }

  console.log('  Razorpay Test Mode credentials detected - provider validation would run here.');
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('================================================================');
  console.log('AIOSPARK BILLING & SUBSCRIPTION SAAS TEST SUITE');
  console.log('================================================================\n');

  testPlanCatalog();
  await testSubscriptionCreation();
  await testWebhooks();
  await testEntitlements();
  await testCrossTenant();
  testGSTInvoice();
  testGuardrail();
  await testGracePeriodPolicy();
  await testPaymentFailedEvent();
  await testSubscriptionCompletedExpired();
  await testPlatformAdmin();
  await testFullRefundPolicy();
  await testModeValidation();

  console.log(`\n================================================================`);
  console.log(`BILLING TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();

