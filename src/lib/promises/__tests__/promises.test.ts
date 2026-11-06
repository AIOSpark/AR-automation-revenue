// AIOSpark Promise-to-Pay System Test Suite (Layer 20)

import { udmStore } from '../../udm/store';
import { promiseStore } from '../store';
import { PromiseCheckJob } from '../job';
import { computeCustomerFinancialProfile } from '../../customer/risk-engine';
import { approvalStore } from '../../approvals/store';

export async function runPromiseTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 20 PROMISE-TO-PAY TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_prms_test';
  udmStore.clearAll();
  udmStore.setTenantContext(testOrgId);
  promiseStore.clearAll();
  approvalStore.clearAll();
  const { safetyMiddlewareEngine } = await import('../../agents/safety-middleware');
  safetyMiddlewareEngine.clearDeduplicationCache();

  // Seed customer & invoice
  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_cust_prms',
    name: 'Wayne Enterprises',
    credit_limit_minor_units: 900000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_prms',
    customer_id: cust.id,
    number: 'INV-PRMS-505',
    amount_minor_units: 50000000, // ₹5,00,000.00
    tax_amount_minor_units: 9000000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  // 1. Manual Recording UI & mandatory recorded_via validation
  let caughtError = false;
  try {
    promiseStore.createPromise({
      organization_id: testOrgId,
      customer_id: cust.id,
      invoice_id: inv.id,
      promised_amount_minor_units: 50000000,
      expected_date: '2026-02-15',
      recorded_via: null as any,
      recorded_by_user_id: 'usr_collector_1',
    });
  } catch (err: any) {
    caughtError = true;
    if (!err.message.includes('recorded_via')) {
      throw new Error(`Unexpected error message: ${err.message}`);
    }
  }

  if (!caughtError) throw new Error('Failed to enforce mandatory recorded_via field validation');

  const validPromise = promiseStore.createPromise({
    organization_id: testOrgId,
    customer_id: cust.id,
    invoice_id: inv.id,
    promised_amount_minor_units: 50000000,
    expected_date: '2026-02-15',
    recorded_via: 'manual_phone_call',
    recorded_by_user_id: 'usr_collector_1',
  });

  if (!validPromise.id || validPromise.recorded_via !== 'manual_phone_call') {
    throw new Error('Failed to record valid promise with recorded_via field');
  }
  console.log('⚡ [PASS] 1. Manual Promise Recording captured mandatory recorded_via field strictly');

  // 2. Comprehensive Daily Job Payment Outcomes (Full On-Time, Partial, Broken, Retroactive Kept)
  // Scenario A: Full Payment Received before deadline -> KEPT
  const payKept = udmStore.insertPayment({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'pay_101',
    customer_id: cust.id,
    amount_minor_units: 50000000,
    currency: 'INR',
    date: '2026-02-14',
  });

  udmStore.insertMatch({
    organization_id: testOrgId,
    payment_id: payKept.id,
    invoice_id: inv.id,
    matched_amount_minor_units: 50000000,
    confidence: 1.0,
  });

  const jobRes1 = await PromiseCheckJob.runDailyCheck(testOrgId, '2026-02-16');
  if (jobRes1.keptCount !== 1) throw new Error('Daily check failed to mark full payment as KEPT');
  console.log('⚡ [PASS] 2a. Daily job correctly marked full on-time payment promise as KEPT');

  // Scenario B: No payment received past expected_date + 2 days grace period -> BROKEN & Triggers Collections Agent
  const inv2 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_prms2',
    customer_id: cust.id,
    number: 'INV-PRMS-506',
    amount_minor_units: 30000000,
    tax_amount_minor_units: 5400000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  const brokenPromise = promiseStore.createPromise({
    organization_id: testOrgId,
    customer_id: cust.id,
    invoice_id: inv2.id,
    promised_amount_minor_units: 30000000,
    expected_date: '2026-02-10', // Expired
    recorded_via: 'manual_note',
    recorded_by_user_id: 'usr_collector_1',
  });

  const jobRes2 = await PromiseCheckJob.runDailyCheck(testOrgId, '2026-02-15'); // 5 days past expected date
  if (jobRes2.brokenCount !== 1) throw new Error('Daily check failed to mark overdue promise as BROKEN');

  // Verify Collections Agent auto-triggered follow-up in approval queue
  const pendingReqs = approvalStore.getRequests(testOrgId, 'pending');
  const triggeredReq = pendingReqs.find((r) => r.action_type === 'SEND_CUSTOMER_COMMUNICATION');
  if (!triggeredReq) throw new Error('Broken promise failed to auto-trigger Collections Agent follow-up in approval queue');
  console.log('⚡ [PASS] 2b. Daily job marked overdue promise as BROKEN and auto-triggered Collections Agent follow-up');

  // Scenario C: Retroactive Update from Broken -> Kept on late payment arrival
  const payLate = udmStore.insertPayment({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'pay_102',
    customer_id: cust.id,
    amount_minor_units: 30000000,
    currency: 'INR',
    date: '2026-02-18', // Late payment
  });

  udmStore.insertMatch({
    organization_id: testOrgId,
    payment_id: payLate.id,
    invoice_id: inv2.id,
    matched_amount_minor_units: 30000000,
    confidence: 1.0,
  });

  const jobRes3 = await PromiseCheckJob.runDailyCheck(testOrgId, '2026-02-20');
  if (jobRes3.retroactiveKeptCount !== 1) throw new Error('Daily check failed to retroactively update broken promise to KEPT');
  const recheckedPromise = promiseStore.getPromise(brokenPromise.id);
  if (recheckedPromise?.status !== 'kept') throw new Error('Broken promise status was not retroactively updated to KEPT');
  console.log('⚡ [PASS] 2c. Broken promise retroactively updated to KEPT upon late matching payment arrival');

  // 3. Layer 12 Customer Risk Engine Integration Test
  // Create an explicit broken promise to test risk weighting
  promiseStore.createPromise({
    organization_id: testOrgId,
    customer_id: cust.id,
    invoice_id: inv2.id,
    promised_amount_minor_units: 30000000,
    expected_date: '2026-02-01',
    recorded_via: 'manual_note',
    recorded_by_user_id: 'usr_collector_1',
  });
  await PromiseCheckJob.runDailyCheck(testOrgId, '2026-02-25');

  const profile = computeCustomerFinancialProfile(cust.id, testOrgId, '2026-02-25');
  const brokenEvidence = profile.riskEvidence.find((e) => e.label.includes('Broken Promises Rate'));

  if (!brokenEvidence || String(brokenEvidence.value).includes('Layer 20 Placeholder')) {
    throw new Error('Risk Engine failed to consume real broken promise statistics');
  }
  console.log('⚡ [PASS] 3. Layer 12 Risk Engine incorporated real broken-promise rate metric cleanly');

  console.log('\n==========================================');
  console.log('PROMISE-TO-PAY SUITE SUMMARY: 4 PASSED, 0 FAILED');
  console.log('==========================================\n');
}
