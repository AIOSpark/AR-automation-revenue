// AIOSpark Layer 31 Private Beta Metrics Tracker Automated Test Suite

import assert from 'node:assert';
import { betaMetricsStore, CASH_UNLOCKED_ATTRIBUTION_WINDOW_DAYS } from '../store';
import { udmStore } from '../../udm/store';
import { approvalStore } from '../../approvals/store';

export async function runBetaTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 31 PRIVATE BETA TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_beta_test';
  betaMetricsStore.clearAll();
  udmStore.clearAll();
  approvalStore.clearAll();
  udmStore.setTenantContext(testOrgId);

  // 1. SEED DATA & WEEK-OVER-WEEK SNAPSHOT AGGREGATION TEST
  betaMetricsStore.setPreBetaBaseline(testOrgId, 72.0); // Baseline CE index 72%

  const cust = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'tally',
    source_id: 'src_cust_beta',
    name: 'Apollo Tyres Ltd',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv1 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'tally',
    source_id: 'src_inv_beta_001',
    customer_id: cust.id,
    number: 'INV-BETA-001',
    amount_minor_units: 25000000, // ₹2,50,000
    tax_amount_minor_units: 4500000,
    currency: 'INR',
    issue_date: '2026-02-15',
    due_date: '2026-03-01',
    status: 'open',
  });

  const snap1 = betaMetricsStore.generateWeeklySnapshot(testOrgId, '2026-03-02');
  assert.strictEqual(snap1.invoices_processed_cumulative, 1, 'Cumulative invoices mismatch');
  assert.ok(snap1.collection_effectiveness_delta >= 0, 'CE delta should be >= 0');

  console.log('⚡ [PASS] 1. Weekly Snapshot Aggregation: Snapshot generated for beta org with correct cumulative and delta totals');

  // 2. HUMAN "CORRECTLY CLASSIFIED" TAGGING TEST
  const tag1 = betaMetricsStore.tagClassificationResult({
    organization_id: testOrgId,
    week_start_date: '2026-03-02',
    exception_id: 'exp_001',
    is_correct: true,
    tagged_by_user_id: 'user_beta_lead',
  });

  const tag2 = betaMetricsStore.tagClassificationResult({
    organization_id: testOrgId,
    week_start_date: '2026-03-02',
    exception_id: 'exp_002',
    is_correct: false, // AI Error
    notes: 'PO mismatch line number misidentified',
    tagged_by_user_id: 'user_beta_lead',
  });

  const snap2 = betaMetricsStore.generateWeeklySnapshot(testOrgId, '2026-03-02');
  assert.strictEqual(snap2.issues_reviewed_count, 2, 'Reviewed count mismatch');
  assert.strictEqual(snap2.issues_correctly_classified, 1, 'Correct count mismatch');
  assert.strictEqual(snap2.ai_error_count, 1, 'AI error count mismatch');

  console.log('⚡ [PASS] 2. Human Confirmation Tagging: Verified distinct persistence of human classification quality tags (1 correct, 1 AI error)');

  // 3. CASH-UNLOCKED ATTRIBUTION LOGIC TEST
  // Step A: Approve AI action on inv1 (Layer 18)
  const appReq = approvalStore.createRequest({
    organization_id: testOrgId,
    subject_type: 'invoice',
    subject_id: inv1.id,
    action_type: 'ALTER_INVOICE_VALUE',
    proposed_action: { invoice_id: inv1.id },
    evidence: [],
    confidence: 0.95,
    proposed_by: 'Receivables Analyst',
  });
  const approvedReq = approvalStore.approveRequest(appReq.id, 'user_approver');
  approvedReq.reviewed_at = '2026-03-03T10:00:00Z';

  // Step B: Mark inv1 as paid within 14-day window of approval
  inv1.status = 'paid';
  inv1.updated_at = new Date('2026-03-05').toISOString(); // 3 days after week start

  const cashAttribution = betaMetricsStore.calculateCashUnlocked(testOrgId, '2026-03-02');
  assert.strictEqual(cashAttribution.amountMinorUnits, 25000000, 'Cash unlocked amount mismatch (expected ₹2,50,000)');
  assert.strictEqual(cashAttribution.attributedInvoiceCount, 1, 'Attributed invoice count mismatch');

  // Step C: Payment OUTSIDE 14-day window or WITHOUT AI action
  const inv2 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'src_inv_unattributed',
    customer_id: cust.id,
    number: 'INV-UNATTRIBUTED',
    amount_minor_units: 50000000, // ₹5,00,000
    tax_amount_minor_units: 9000000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-02-01',
    status: 'paid',
  });
  inv2.updated_at = new Date('2026-03-05').toISOString();

  // Re-calculate: inv2 has NO matching approved AI action, so it MUST NOT be attributed
  const cashAttributionStrict = betaMetricsStore.calculateCashUnlocked(testOrgId, '2026-03-02');
  assert.strictEqual(cashAttributionStrict.amountMinorUnits, 25000000, 'Unattributed payment should NOT be included in cash unlocked');

  console.log('⚡ [PASS] 3. Cash-Unlocked Attribution Engine: Correctly attributed ₹2,50,000 payment to prior approved AI action within 14-day window and excluded non-AI payment');

  // 4. CHECK-IN LOG & ENGINEERING FEEDBACK PATHWAY TEST
  const checkIn = betaMetricsStore.recordCheckIn({
    organization_id: testOrgId,
    week_start_date: '2026-03-02',
    notes: 'Customer reported Tally sync date formatting error on invoice exports.',
    issues_raised: [
      {
        title: 'Tally export date parsing failure on dd/mm/yyyy',
        affected_layer: 'Layer 7 — CSV Importer',
      },
    ],
    logged_by_user_id: 'user_beta_lead',
  });

  assert.strictEqual(checkIn.issues_raised.length, 1, 'Issues raised count mismatch');
  assert.strictEqual(checkIn.issues_raised[0].converted_to_task, false, 'Initial issue should not be converted');

  // Convert issue to engineering task
  const conversion = betaMetricsStore.convertIssueToEngineeringTask(checkIn.id, checkIn.issues_raised[0].id);
  assert.strictEqual(conversion.task.affected_layer, 'Layer 7 — CSV Importer', 'Task affected layer mismatch');
  assert.strictEqual(conversion.checkInLog.issues_raised[0].converted_to_task, true, 'Issue should mark converted');

  console.log('⚡ [PASS] 4. Structured Check-In Log: Logged customer call feedback and converted issue to tracked Layer 7 engineering task');

  console.log('\n==========================================');
  console.log('ALL LAYER 31 PRIVATE BETA TESTS PASSED SUCCESSFULLY');
  console.log('==========================================\n');
}
