// AIOSpark Alerts Engine Automated Test Suite (Layer 24)

import assert from 'node:assert';
import { udmStore } from '../../udm/store';
import { alertsEngineStore } from '../store';
import { DashboardChannel, EmailChannel } from '../channels';
import { NotificationChannel, Alert } from '../types';
import { exceptionEngine } from '../../exceptions/engine';
import { promiseStore } from '../../promises/store';

// Mock NotificationChannel for testing channel-decoupled architecture
class MockChannelDouble implements NotificationChannel {
  public readonly channelName = 'mock_double';
  public sentAlerts: Array<{ recipientUserId: string; alert: Alert }> = [];

  public async send(recipientUserId: string, alert: Alert): Promise<{ success: boolean }> {
    this.sentAlerts.push({ recipientUserId, alert });
    return { success: true };
  }
}

export async function runAlertsTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 24 ALERTS TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_alrt_test_777';
  udmStore.clearAll();
  alertsEngineStore.clearAll();
  DashboardChannel.clearAll();
  EmailChannel.clearAll();
  promiseStore.clearAll();
  udmStore.setTenantContext(testOrgId);

  // Setup seed Customer and Invoices
  const cust1 = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'zoho',
    source_id: 'cust_777',
    name: 'Gotham Enterprise',
    currency: 'INR',
    credit_limit_minor_units: 50000000,
    payment_terms_days: 30,
  });

  const inv1 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'zoho',
    source_id: 'inv_777',
    customer_id: cust1.id,
    number: 'INV-2026-777',
    amount_minor_units: 60000000, // ₹6,00,000.00 (> ₹5L threshold for critical)
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-06-01',
    due_date: '2026-07-01', // 63 days overdue relative to 2026-09-02 (> 60 days for critical)
    status: 'open',
  });

  const inv2 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'zoho',
    source_id: 'inv_778',
    customer_id: cust1.id,
    number: 'INV-2026-778',
    amount_minor_units: 40000000, // ₹4,00,000.00
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-06-01',
    due_date: '2026-07-01',
    status: 'disputed',
  });

  udmStore.insertDispute({
    organization_id: testOrgId,
    invoice_id: inv2.id,
    reason: 'Billing Dispute',
    status: 'open',
  });

  // TEST 1: Channel-Adapter Interface Decoupling & Test Double Verification
  const mockChannel = new MockChannelDouble();
  alertsEngineStore.registerChannel(mockChannel);

  const res1 = await alertsEngineStore.triggerAlert(
    {
      organization_id: testOrgId,
      type: 'severely_overdue_invoice',
      severity: 'critical',
      title: 'Test Generic Interface Alert',
      body: 'Generic alert body payload',
      link: '/invoices/inv_777',
      idempotency_key: `${testOrgId}:test1:${Date.now()}`,
    },
    ['user_mgr_1']
  );

  assert.strictEqual(res1.isDuplicate, false);
  assert.strictEqual(mockChannel.sentAlerts.length, 1, 'Mock channel failed to receive alert via generic interface');
  console.log('⚡ [PASS] 1. Channel-adapter interface decoupling: Alerts Engine successfully dispatches generically without channel-specific assumptions');

  // TEST 2: 4 Alert Trigger Rules Verification

  // Rule 1: Severely overdue invoice (Critical severity crossing)
  const exc1 = exceptionEngine.handleAIAnalysisTrigger(
    inv1.id,
    {
      category: 'CUSTOMER_DISPUTE',
      confidence: 0.95,
      conclusion: 'Critical dispute open >60 days on ₹6L invoice',
      evidence: [{ label: 'Dispute', value: 'Active' }],
      source: 'Dispute Engine',
      generatedAt: '2026-09-02T00:00:00Z',
    },
    testOrgId,
    '2026-09-02'
  );

  assert(exc1 !== null);
  assert.strictEqual(exc1!.severity, 'critical', 'Exception severity must evaluate to critical');

  const rule1Res = await alertsEngineStore.onExceptionCreatedOrUpdated(exc1!, inv1, ['usr_mgr_1']);
  assert.strictEqual(rule1Res.alertTriggered, true, 'Rule 1: Severely overdue invoice alert failed to fire');

  // Rule 2: Missed payment promise (broken status)
  const prms1 = promiseStore.createPromise({
    organization_id: testOrgId,
    customer_id: cust1.id,
    invoice_id: inv1.id,
    promised_amount_minor_units: 60000000,
    expected_date: '2026-08-15',
    recorded_via: 'manual_phone_call',
    recorded_by_user_id: 'usr_mgr_1',
  });

  promiseStore.updatePromiseStatus(prms1.id, 'broken');
  const rule2Res = await alertsEngineStore.onPromiseStatusChanged(
    prms1.id,
    'broken',
    testOrgId,
    cust1.id,
    60000000,
    ['usr_mgr_1']
  );
  assert.strictEqual(rule2Res.alertTriggered, true, 'Rule 2: Missed payment promise alert failed to fire');

  // Rule 3: New high-risk customer (FIRST transition into High rating ONLY)
  // First evaluation: Low -> High (Alert SHOULD fire)
  const rule3aRes = await alertsEngineStore.onCustomerRiskRecalculated(cust1.id, testOrgId, ['usr_mgr_1'], '2026-09-02');
  assert.strictEqual(rule3aRes.alertTriggered, true, 'Rule 3: First transition into High risk failed to trigger alert');

  // Second evaluation: High -> High (Alert MUST NOT fire duplicate)
  const rule3bRes = await alertsEngineStore.onCustomerRiskRecalculated(cust1.id, testOrgId, ['usr_mgr_1'], '2026-09-02');
  assert.strictEqual(rule3bRes.alertTriggered, false, 'CRITICAL REGRESSION: Repeat recalculation while already High wrongly triggered repeat alert!');

  // Rule 4: Successful reconciliation (Low-severity positive alert)
  const rule4Res = await alertsEngineStore.onReconciliationApproved(
    'tx_bank_999',
    testOrgId,
    60000000,
    [inv1.number],
    ['usr_mgr_1']
  );
  assert.strictEqual(rule4Res.alertTriggered, true, 'Rule 4: Successful reconciliation alert failed to fire');

  console.log('⚡ [PASS] 2. 4 Alert Trigger Rules verified: Critical invoice, Broken promise, First-time High-risk transition, and Reconciliation');

  // TEST 3: Idempotency Key Deduplication Check
  const key = `${testOrgId}:dedup_test:101`;
  const dup1 = await alertsEngineStore.triggerAlert(
    {
      organization_id: testOrgId,
      type: 'severely_overdue_invoice',
      severity: 'critical',
      title: 'Dedup Test Alert',
      body: 'Testing deduplication',
      link: '/invoices/inv_777',
      idempotency_key: key,
    },
    ['usr_mgr_1']
  );

  const dup2 = await alertsEngineStore.triggerAlert(
    {
      organization_id: testOrgId,
      type: 'severely_overdue_invoice',
      severity: 'critical',
      title: 'Dedup Test Alert Retry',
      body: 'Testing deduplication retry',
      link: '/invoices/inv_777',
      idempotency_key: key,
    },
    ['usr_mgr_1']
  );

  assert.strictEqual(dup1.isDuplicate, false);
  assert.strictEqual(dup2.isDuplicate, true, 'DEDUPLICATION FAILURE: Duplicate idempotency key fired second alert!');
  console.log('⚡ [PASS] 3. Idempotency Key Deduplication: Retries with same key correctly prevented duplicate alert dispatches');

  // TEST 4: Per-User Channel Notification Preferences Opt-Out Check
  alertsEngineStore.setPreference({
    user_id: 'usr_optout_1',
    organization_id: testOrgId,
    alert_type: 'severely_overdue_invoice',
    channel: 'email',
    enabled: false, // OPT OUT of email for severely_overdue_invoice
  });

  const optOutRes = await alertsEngineStore.triggerAlert(
    {
      organization_id: testOrgId,
      type: 'severely_overdue_invoice',
      severity: 'critical',
      title: 'Opt Out Test Alert',
      body: 'Testing channel opt-out preference',
      link: '/invoices/inv_777',
      idempotency_key: `${testOrgId}:optout:${Date.now()}`,
    },
    ['usr_optout_1']
  );

  const userDeliveries = alertsEngineStore.getDeliveries().filter((d) => d.user_id === 'usr_optout_1');
  const emailDelivery = userDeliveries.find((d) => d.channel === 'email');
  const dashboardDelivery = userDeliveries.find((d) => d.channel === 'dashboard');

  assert.strictEqual(emailDelivery, undefined, 'PREFERENCE VIOLATION: Email dispatched despite user opting out!');
  assert(dashboardDelivery !== undefined, 'Dashboard channel delivery should have succeeded');

  console.log('⚡ [PASS] 4. User Notification Preferences: Opted-out channels correctly bypassed while enabled channels deliver normally');

  console.log('\n==========================================');
  console.log('ALERTS SUITE SUMMARY: 4 PASSED, 0 FAILED');
  console.log('==========================================\n');
}
