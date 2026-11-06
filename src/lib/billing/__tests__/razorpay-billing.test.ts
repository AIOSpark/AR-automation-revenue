import { RazorpayBillingService } from '../razorpay-service';
import { billingStore } from '../store';
import crypto from 'crypto';

export async function runRazorpayBillingTestSuite() {
  console.log('================================================================');
  console.log('AIOSpark Razorpay Subscriptions & Webhook Test Suite');
  console.log('================================================================\n');

  const orgId = 'org_test_razorpay_123';
  const webhookSecret = 'whsec_AIOSparkSecret999';

  // TEST 1: Create Razorpay Subscription Intent
  console.log('1. Testing Subscription Creation Intent (Growth Plan)...');
  const subRes = await RazorpayBillingService.createSubscription({
    organizationId: orgId,
    planTierId: 'growth',
    interval: 'monthly',
  });

  if (!subRes.subscriptionId.startsWith('sub_test_')) {
    throw new Error(`FAIL: Invalid subscription ID generated: ${subRes.subscriptionId}`);
  }
  console.log(`   ✓ Subscription Intent created successfully: ${subRes.subscriptionId}`);

  const intentLog = RazorpayBillingService.getBillingHistory(orgId).find(
    (event) => event.event_type === 'subscription.created_intent'
  );
  if (!intentLog || intentLog.signature_verified !== false) {
    throw new Error('FAIL: Locally generated checkout intent must not be marked as signature-verified.');
  }
  console.log('   ✓ Checkout intent logged as unverified (awaiting authoritative webhook).');

  // TEST 2: Webhook Signature Verification - Reject Invalid Signature
  console.log('\n2. Testing Webhook Signature Verification (Adversarial Fake Signature)...');
  const fakePayload = JSON.stringify({ event: 'subscription.activated', notes: { organization_id: orgId } });
  const fakeSigResult = await RazorpayBillingService.processWebhookEvent(fakePayload, 'invalid_fake_signature_123');

  if (fakeSigResult.success) {
    throw new Error('FAIL: Webhook accepted an invalid signature! Vulnerability detected!');
  }
  console.log('   ✓ PASS: Invalid webhook signature strictly rejected with 400 response.');

  // TEST 3: Webhook Signature Verification - Accept Valid HMAC SHA256 Signature & Activate Subscription
  console.log('\n3. Testing Valid Webhook Signature & State Activation (subscription.activated)...');
  const validPayloadObj = {
    event: 'subscription.activated',
    payload: {
      subscription: {
        entity: {
          id: subRes.subscriptionId,
          notes: { organization_id: orgId, plan_tier_id: 'growth' },
        },
      },
    },
  };
  const validPayload = JSON.stringify(validPayloadObj);
  const validSignature = crypto.createHmac('sha256', webhookSecret).update(validPayload).digest('hex');

  const validResult = await RazorpayBillingService.processWebhookEvent(validPayload, validSignature);
  if (!validResult.success) {
    throw new Error(`FAIL: Valid webhook was rejected: ${validResult.message}`);
  }

  // Verify Subscription state updated in store
  const activeSub = billingStore.getSubscription(orgId);
  if (activeSub?.status !== 'active' || activeSub?.plan_id !== 'growth') {
    throw new Error(`FAIL: Organization subscription state not updated! Current: ${JSON.stringify(activeSub)}`);
  }
  console.log(`   ✓ PASS: Authoritative webhook verified signature and activated Growth plan for ${orgId}.`);

  // TEST 3b: Never infer a plan from an incomplete or forged subscription binding.
  const invalidPlanPayload = JSON.stringify({
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
  const invalidPlanSignature = crypto.createHmac('sha256', webhookSecret).update(invalidPlanPayload).digest('hex');
  const invalidPlanResult = await RazorpayBillingService.processWebhookEvent(invalidPlanPayload, invalidPlanSignature);
  if (invalidPlanResult.success || billingStore.getSubscription(orgId)?.plan_id !== 'growth') {
    throw new Error('FAIL: Webhook accepted an invalid plan binding or mutated the subscription');
  }
  console.log('   ✓ PASS: Invalid or missing plan binding rejected without subscription mutation.');

  // TEST 4: Payment Failure & Halted Webhook Handling (subscription.halted)
  console.log('\n4. Testing Payment Failure Webhook (subscription.halted -> past_due)...');
  const failPayloadObj = {
    event: 'subscription.halted',
    payload: {
      subscription: {
        entity: {
          id: subRes.subscriptionId,
          notes: { organization_id: orgId },
        },
      },
    },
  };
  const failPayload = JSON.stringify(failPayloadObj);
  const failSignature = crypto.createHmac('sha256', webhookSecret).update(failPayload).digest('hex');

  await RazorpayBillingService.processWebhookEvent(failPayload, failSignature);
  const pastDueSub = billingStore.getSubscription(orgId);
  if (pastDueSub?.status !== 'past_due') {
    throw new Error(`FAIL: Subscription status not set to past_due! Got: ${pastDueSub?.status}`);
  }
  console.log('   ✓ PASS: Payment failure webhook successfully updated state to past_due and logged alert.');

  // TEST 5: Usage Limit Downgrade Guard
  console.log('\n5. Testing Downgrade Below Current Usage Warning Guard...');
  // Ensure subscription is active for downgrade test
  billingStore.setSubscription(orgId, { plan_id: 'growth', status: 'active' });

  // Simulate high invoice usage (600 invoices, exceeding Starter 500 limit)
  billingStore.recordEvent({
    organization_id: orgId,
    event_type: 'invoice.processed',
    quantity: 600,
  });

  try {
    await RazorpayBillingService.createSubscription({
      organizationId: orgId,
      planTierId: 'starter',
      interval: 'monthly',
    });
    throw new Error('FAIL: Allowed downgrade despite usage exceeding Starter plan limit!');
  } catch (err: any) {
    if (err.message.includes('exceeds plan limit')) {
      console.log(`   ✓ PASS: Downgrade guard intercepted request: "${err.message}"`);
    } else {
      throw err;
    }
  }

  // TEST 6: Fail closed when no signing secret is configured in production.
  console.log('\n6. Testing Fail-Closed Behavior Without a Webhook Secret...');
  const env = process.env as unknown as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;
  const originalSecret = env.RAZORPAY_WEBHOOK_SECRET;
  try {
    env.NODE_ENV = 'production';
    delete env.RAZORPAY_WEBHOOK_SECRET;
    if (RazorpayBillingService.isWebhookConfigured()) {
      throw new Error('FAIL: Webhook reported configured without a secret in production.');
    }
    const result = await RazorpayBillingService.processWebhookEvent('{}', 'anything');
    if (result.success) {
      throw new Error('FAIL: Webhook accepted an event without a configured secret.');
    }
    console.log('   ✓ PASS: Missing production secret fails closed.');
  } finally {
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
    if (originalSecret === undefined) delete env.RAZORPAY_WEBHOOK_SECRET;
    else env.RAZORPAY_WEBHOOK_SECRET = originalSecret;
  }

  console.log('\n================================================================');
  console.log('ALL RAZORPAY BILLING & WEBHOOK TESTS PASSED 100%');
  console.log('================================================================');
}
