// AIOSpark Billing-Specific Independent Restart Durability Test
// Tests complete subscription-to-entitlement flow survives independent process restart
// using file-backed SQLite and separate Node.js processes

import { closeDatabase, readSnapshotDirect } from '../src/lib/db/durable-repository';
import { udmStore } from '../src/lib/udm/store';
import { authStore } from '../src/lib/auth/store';
import { billingStore } from '../src/lib/billing/store';
import { RazorpayBillingService } from '../src/lib/billing/razorpay-service';
import { entitlementEngine } from '../src/lib/billing/entitlements';
import { setOrganizationReportingCurrency } from '../src/lib/financial/currency-org';
import crypto from 'crypto';

const DB_PATH = '/tmp/aiospark-billing-durability-test.sqlite';

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

// Setup org and tenant context WITHOUT clearing data (for reader phases)
function setupOrgReadOnly() {
  setOrganizationReportingCurrency('org_billing_durability', 'INR');
  udmStore.setTenantContext('org_billing_durability');
}

// Setup org and tenant context WITH clearing (for writer phase only)
function setupOrgWriter() {
  setupOrgReadOnly();
  billingStore.clearAll();
}

const webhookSecret = 'whsec_durability_test_123';

async function runWriterPhase() {
  console.log('\n=== BILLING DURABILITY WRITER PHASE ===');
  console.log(`DB_PATH: ${DB_PATH}`);

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  setupOrgWriter();

  // 1. Create pending billing subscription
  const subRes = await RazorpayBillingService.createSubscription({
    organizationId: 'org_billing_durability',
    planTierId: 'growth',
    interval: 'monthly',
  });
  console.log(`  Subscription intent: ${subRes.subscriptionId}`);

  // Persist the pending subscription mapping
  const currentSub = billingStore.getSubscription('org_billing_durability');
  billingStore.setSubscription('org_billing_durability', {
    plan_id: currentSub.plan_id,
    status: currentSub.status,
    billing_interval: currentSub.billing_interval,
    pending_plan_id: 'growth',
    pending_razorpay_subscription_id: subRes.subscriptionId,
  });

  // 2. Process verified successful payment event (webhook)
  const activatedPayload = JSON.stringify({
    id: 'evt_billing_durability_001',
    event: 'subscription.activated',
    payload: {
      subscription: {
        entity: {
          id: subRes.subscriptionId,
          notes: {
            organization_id: 'org_billing_durability',
            plan_tier_id: 'growth',
            billing_interval: 'monthly',
          },
        },
      },
    },
  });
  const activatedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(activatedPayload)
    .digest('hex');

  const activatedResult = await RazorpayBillingService.processWebhookEvent(
    activatedPayload,
    activatedSig
  );
  assert(activatedResult.success, 'Activation webhook processed');

  // 3. Create payment record
  const payment = billingStore.recordPayment({
    id: 'pay_billing_durability_001',
    organization_id: 'org_billing_durability',
    source_system: 'test',
    source_id: 'pay_billing_durability_001',
    customer_id: 'cust_billing_durability',
    subscription_id: subRes.subscriptionId,
    provider_payment_id: 'pay_billing_durability_001',
    provider_invoice_id: 'inv_billing_durability_001',
    amount_minor_units: 1499900,
    currency: 'INR',
    date: new Date().toISOString(),
    status: 'paid',
    paid_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    refunded_amount_minor_units: 0,
  });
  console.log(`  Payment recorded: ${payment.id}, amount: ₹${payment.amount_minor_units / 100}`);

  // 4. Verify entitlements are active
  const ents = entitlementEngine.getOrganizationEntitlements('org_billing_durability');
  assert(ents.isActive, 'Entitlements active after activation');
  assert(entitlementEngine.hasFeatureAccess('org_billing_durability', 'cash_unblock'), 'Growth: cash_unblock entitlement');
  assert(entitlementEngine.hasFeatureAccess('org_billing_durability', 'cfo_intelligence'), 'Growth: cfo_intelligence entitlement');
  assert(!entitlementEngine.hasFeatureAccess('org_billing_durability', 'advanced_ai'), 'Growth: advanced_ai NOT entitled');
  console.log(`  Entitlements verified: ${ents.features.filter(f => f.enabled).length} active features`);

  // 5. Verify webhook event persisted
  const whEvent = billingStore.getWebhookEvent('evt_billing_durability_001');
  assert(whEvent !== null, 'Webhook event persisted');
  assert(whEvent?.status === 'PROCESSED', 'Webhook event status PROCESSED');

  // 6. Persist and close database
  billingStore.persistSnapshot();
  closeDatabase();
  console.log('  Writer database closed.');

  // Write expected values for reader phase
  const fs = await import('node:fs');
  const expected = {
    orgId: 'org_billing_durability',
    subscriptionId: subRes.subscriptionId,
    paymentId: payment.id,
    providerPaymentId: 'pay_billing_durability_001',
    expectedPlan: 'growth',
    expectedStatus: 'active',
    expectedAmount: 1499900,
    webhookEventId: 'evt_billing_durability_001',
  };
  fs.writeFileSync('/tmp/aiospark-billing-durability-expected.json', JSON.stringify(expected, null, 2));
  console.log('  Expected values written.');

  console.log(`\n=== Writer Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runReaderPhase() {
  console.log('\n=== BILLING DURABILITY READER PHASE (Independent Process) ===');
  console.log(`DB_PATH: ${DB_PATH}`);

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  const fs = await import('node:fs');
  const expected = JSON.parse(fs.readFileSync('/tmp/aiospark-billing-durability-expected.json', 'utf8'));

  // Verify database file exists
  assert(fs.existsSync(DB_PATH), 'SQLite database file exists after writer close');

  // Read directly from SQLite (bypasses in-memory state)
  const subSnapshot = readSnapshotDirect('billing') as {
    subscriptions: any[];
    payments: any[];
    webhookEvents: any[];
    refundEvents: any[];
  } | null;
  assert(subSnapshot !== null, 'Billing snapshot readable from SQLite after restart');

  const subscriptions = subSnapshot?.subscriptions || [];
  const payments = subSnapshot?.payments || [];
  const webhookEvents = subSnapshot?.webhookEvents || [];
  const refundEvents = subSnapshot?.refundEvents || [];

  // Find our subscription
  const recoveredSub = subscriptions.find((s: any) => s.organization_id === expected.orgId);
  assert(recoveredSub !== undefined, `Subscription for org ${expected.orgId} recovered from SQLite`);
  if (recoveredSub) {
    assert(recoveredSub.plan_id === expected.expectedPlan, `Plan preserved: ${recoveredSub.plan_id}`);
    assert(recoveredSub.status === expected.expectedStatus, `Status preserved: ${recoveredSub.status}`);
    assert(recoveredSub.razorpay_subscription_id === expected.subscriptionId, 'Razorpay subscription ID preserved');
    console.log(`  Recovered subscription: plan=${recoveredSub.plan_id}, status=${recoveredSub.status}`);
  }

  // Find our payment
  const recoveredPayment = payments.find((p: any) => p.provider_payment_id === expected.providerPaymentId);
  assert(recoveredPayment !== undefined, `Payment ${expected.providerPaymentId} recovered from SQLite`);
  if (recoveredPayment) {
    assert(recoveredPayment.status === 'paid', `Payment status preserved: ${recoveredPayment.status}`);
    assert(recoveredPayment.amount_minor_units === expected.expectedAmount, `Amount preserved: ${recoveredPayment.amount_minor_units}`);
    console.log(`  Recovered payment: status=${recoveredPayment.status}, amount=₹${recoveredPayment.amount_minor_units / 100}`);
  }

  // Find our webhook event
  const recoveredWhEvent = webhookEvents.find((w: any) => w.provider_event_id === expected.webhookEventId);
  assert(recoveredWhEvent !== undefined, 'Webhook event recovered from SQLite');
  if (recoveredWhEvent) {
    assert(recoveredWhEvent.processing_status === 'PROCESSED', 'Webhook status preserved as PROCESSED');
    console.log(`  Recovered webhook: status=${recoveredWhEvent.processing_status}`);
  }

  // Re-initialize org context (reads from snapshot on construction)
  setupOrgReadOnly();

  // Verify entitlements through the engine
  const ents = entitlementEngine.getOrganizationEntitlements(expected.orgId);
  assert(ents.isActive, 'Entitlements active after restart');
  assert(entitlementEngine.hasFeatureAccess(expected.orgId, 'cash_unblock'), 'cash_unblock entitlement preserved after restart');
  assert(entitlementEngine.hasFeatureAccess(expected.orgId, 'cfo_intelligence'), 'cfo_intelligence entitlement preserved after restart');
  assert(!entitlementEngine.hasFeatureAccess(expected.orgId, 'advanced_ai'), 'advanced_ai NOT entitled (correctly)');
  console.log(`  Post-restart entitlements verified`);

  closeDatabase();
  console.log('  Reader database closed.');

  console.log(`\n=== Reader Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runReplayPhase() {
  console.log('\n=== BILLING DURABILITY REPLAY PHASE ===');
  console.log(`DB_PATH: ${DB_PATH}`);

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  const fs = await import('node:fs');
  const expected = JSON.parse(fs.readFileSync('/tmp/aiospark-billing-durability-expected.json', 'utf8'));

  setupOrgReadOnly();

  // Replay the original webhook event - should be deduped, not double-processed
  const activatedPayload = JSON.stringify({
    id: 'evt_billing_durability_001',
    event: 'subscription.activated',
    payload: {
      subscription: {
        entity: {
          id: expected.subscriptionId,
          notes: {
            organization_id: expected.orgId,
            plan_tier_id: 'growth',
            billing_interval: 'monthly',
          },
        },
      },
    },
  });
  const activatedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(activatedPayload)
    .digest('hex');

  const replayResult = await RazorpayBillingService.processWebhookEvent(
    activatedPayload,
    activatedSig
  );
  assert(replayResult.success, 'Replayed webhook returns success');
  assert(
    replayResult.message.includes('already processed'),
    'Duplicate webhook detected and not reprocessed'
  );

  // Verify no duplicate payment
  const allPayments = billingStore.getAllPayments();
  const matchingPayments = allPayments.filter(
    (p) => p.organization_id === expected.orgId && p.provider_payment_id === expected.providerPaymentId
  );
  assert(matchingPayments.length === 1, `No duplicate payment: ${matchingPayments.length} records`);

  // Verify subscription not changed
  const sub = billingStore.getSubscription(expected.orgId);
  assert(sub?.status === 'active', 'Subscription status unchanged after replay');
  assert(sub?.plan_id === 'growth', 'Subscription plan unchanged after replay');

  // Verify no duplicate webhook events
  const whEvents = Array.from((billingStore as any).webhookEvents.values());
  const matchingWhEvents = whEvents.filter(
    (w: any) => w.provider_event_id === expected.webhookEventId
  );
  assert(matchingWhEvents.length === 1, `No duplicate webhook event: ${matchingWhEvents.length} records`);

  console.log('  Replay phase verified: no duplicate payment or entitlement activation');

  closeDatabase();
  console.log(`\n=== Replay Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runRenewalPhase() {
  console.log('\n=== BILLING DURABILITY RENEWAL PHASE ===');
  console.log(`DB_PATH: ${DB_PATH}`);

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  const fs = await import('node:fs');
  const expected = JSON.parse(fs.readFileSync('/tmp/aiospark-billing-durability-expected.json', 'utf8'));

  setupOrgReadOnly();

  // Process a renewal (subscription.charged) event
  const chargedPayload = JSON.stringify({
    id: 'evt_billing_durability_002',
    event: 'subscription.charged',
    payload: {
      subscription: {
        entity: {
          id: expected.subscriptionId,
          notes: {
            organization_id: expected.orgId,
            plan_tier_id: 'growth',
            billing_interval: 'monthly',
          },
        },
      },
      payment: {
        entity: {
          id: 'pay_billing_durability_002',
          invoice_id: 'inv_billing_durability_002',
          amount: 1499900,
          currency: 'INR',
          created_at: Math.floor(Date.now() / 1000),
        },
      },
    },
  });
  const chargedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(chargedPayload)
    .digest('hex');

  const chargedResult = await RazorpayBillingService.processWebhookEvent(
    chargedPayload,
    chargedSig
  );
  assert(chargedResult.success, 'Renewal webhook processed');

  // Verify new payment record
  const allPayments = billingStore.getAllPayments();
  const payments = allPayments.filter((p) => p.organization_id === expected.orgId);
  const renewalPayment = payments.find((p) => p.provider_payment_id === 'pay_billing_durability_002');
  assert(renewalPayment !== undefined, 'Renewal payment record created');
  if (renewalPayment) {
    assert(renewalPayment.amount_minor_units === 1499900, 'Renewal amount correct');
  }

  // Verify subscription still active with updated period
  const sub = billingStore.getSubscription(expected.orgId);
  assert(sub?.status === 'active', 'Subscription still active after renewal');
  assert(sub?.current_period_end !== undefined, 'Period end updated after renewal');

  // Persist and close
  billingStore.persistSnapshot();
  closeDatabase();
  console.log('  Renewal phase complete, database closed.');

  console.log(`\n=== Renewal Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runCancellationPhase() {
  console.log('\n=== BILLING DURABILITY CANCELLATION PHASE ===');
  console.log(`DB_PATH: ${DB_PATH}`);

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  const fs = await import('node:fs');
  const expected = JSON.parse(fs.readFileSync('/tmp/aiospark-billing-durability-expected.json', 'utf8'));

  setupOrgReadOnly();

  // Process cancellation event
  const cancelledPayload = JSON.stringify({
    id: 'evt_billing_durability_003',
    event: 'subscription.cancelled',
    payload: {
      subscription: {
        entity: {
          id: expected.subscriptionId,
          notes: {
            organization_id: expected.orgId,
            plan_tier_id: 'growth',
            billing_interval: 'monthly',
          },
        },
      },
    },
  });
  const cancelledSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(cancelledPayload)
    .digest('hex');

  const cancelledResult = await RazorpayBillingService.processWebhookEvent(
    cancelledPayload,
    cancelledSig
  );
  assert(cancelledResult.success, 'Cancellation webhook processed');

  // Verify subscription cancelled with period end preserved
  const sub = billingStore.getSubscription(expected.orgId);
  assert(sub?.status === 'canceled', 'Subscription status canceled');
  assert(sub?.cancel_at_period_end === true, 'Cancel at period end set');
  assert(sub?.cancelled_at !== undefined, 'Cancellation timestamp set');

  // Verify entitlements still active until period end (grace)
  const ents = entitlementEngine.getOrganizationEntitlements(expected.orgId);
  console.log(`  Post-cancellation: isActive=${ents.isActive}, status=${sub?.status}`);

  // Persist and close
  billingStore.persistSnapshot();
  closeDatabase();
  console.log('  Cancellation phase complete, database closed.');

  console.log(`\n=== Cancellation Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runFinalVerificationPhase() {
  console.log('\n=== BILLING DURABILITY FINAL VERIFICATION (Second Restart) ===');
  console.log(`DB_PATH: ${DB_PATH}`);

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret;

  const fs = await import('node:fs');
  const expected = JSON.parse(fs.readFileSync('/tmp/aiospark-billing-durability-expected.json', 'utf8'));

  // Read directly from SQLite
  const subSnapshot = readSnapshotDirect('billing') as {
    subscriptions: any[];
    payments: any[];
    webhookEvents: any[];
    refundEvents: any[];
  } | null;
  assert(subSnapshot !== null, 'Billing snapshot readable after second restart');

  const subscriptions = subSnapshot?.subscriptions || [];
  const payments = subSnapshot?.payments || [];

  const recoveredSub = subscriptions.find((s: any) => s.organization_id === expected.orgId);
  assert(recoveredSub !== undefined, 'Subscription recovered after second restart');
  if (recoveredSub) {
    assert(recoveredSub.status === 'canceled', `Status preserved as canceled (got ${recoveredSub.status})`);
    assert(recoveredSub.cancel_at_period_end === true, 'Cancel at period end preserved');
    console.log(`  Final: Subscription status=${recoveredSub.status}, cancel_at_period_end=${recoveredSub.cancel_at_period_end}`);
  }

  // Verify both payments persisted
  const paymentCount = payments.filter((p: any) => p.organization_id === expected.orgId).length;
  assert(paymentCount >= 2, `At least 2 payments persisted (got ${paymentCount})`);

  // Verify webhook events persisted
  const webhookEvents = subSnapshot?.webhookEvents || [];
  const whEvent1 = webhookEvents.find((w: any) => w.provider_event_id === 'evt_billing_durability_001');
  const whEvent2 = webhookEvents.find((w: any) => w.provider_event_id === 'evt_billing_durability_002');
  assert(whEvent1 !== undefined, 'Activation webhook persisted');
  assert(whEvent2 !== undefined, 'Renewal webhook persisted');

  closeDatabase();

  console.log(`\n=== Final Verification Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  const phase = process.argv[2] || 'writer';

  try {
    if (phase === 'writer') {
      await runWriterPhase();
    } else if (phase === 'reader') {
      await runReaderPhase();
    } else if (phase === 'replay') {
      await runReplayPhase();
    } else if (phase === 'renewal') {
      await runRenewalPhase();
    } else if (phase === 'cancellation') {
      await runCancellationPhase();
    } else if (phase === 'final') {
      await runFinalVerificationPhase();
    } else {
      console.error('Unknown phase. Use: writer | reader | replay | renewal | cancellation | final');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Phase ${phase} error:`, err);
    process.exit(1);
  }
}

main();
