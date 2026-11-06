// AIOSpark CFO Intelligence & Cross-View Consistency Test Suite (Layer 22)

import assert from 'node:assert';
import { udmStore } from '../../udm/store';
import { dashboardMetricsStore, computeCashUnblockedOpportunity } from '../../dashboard/engine';
import { cfoIntelligenceEngine, CATEGORY_EASE_OF_RESOLUTION_FACTORS } from '../engine';
import { exceptionEngine } from '../../exceptions/engine';
import { PAYMENT_DELAY_CATEGORIES } from '../../taxonomy/definitions';

export async function runCFOTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 22 CFO INTELLIGENCE TEST SUITE');
  console.log('==========================================\n');

  const testOrgId = 'org_cfo_test_999';
  udmStore.clearAll();
  dashboardMetricsStore.clearAll();
  udmStore.setTenantContext(testOrgId);

  // Setup seed Customer and Invoices
  const cust1 = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'zoho',
    source_id: 'cust_apex_999',
    name: 'Apex Global Logistics',
    currency: 'INR',
    credit_limit_minor_units: 10000000,
    payment_terms_days: 30,
  });

  const invPO = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'zoho',
    source_id: 'inv_po_1',
    customer_id: cust1.id,
    number: 'INV-2026-PO1',
    amount_minor_units: 5000000, // ₹50,000.00
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
  });

  const invDisp = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'zoho',
    source_id: 'inv_disp_1',
    customer_id: cust1.id,
    number: 'INV-2026-DISP1',
    amount_minor_units: 10000000, // ₹1,00,000.00
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'disputed',
  });

  const invErr = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'zoho',
    source_id: 'inv_err_1',
    customer_id: cust1.id,
    number: 'INV-2026-ERR1',
    amount_minor_units: 2000000, // ₹20,000.00
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
  });

  // Create real Exception Engine records linked to invoices
  const exc1 = exceptionEngine.handleAIAnalysisTrigger(
    invPO.id,
    {
      category: 'PO_MISMATCH',
      confidence: 0.90,
      conclusion: 'Request PO amendment from buyer AP team',
      evidence: [{ label: 'PO Diff', value: '10 units extra billed' }],
      source: 'PO comparison engine',
      generatedAt: new Date().toISOString(),
      modelVersion: 'v2.1',
    },
    testOrgId
  );

  const exc2 = exceptionEngine.handleAIAnalysisTrigger(
    invDisp.id,
    {
      category: 'CUSTOMER_DISPUTE',
      confidence: 0.95,
      conclusion: 'Issue credit note for discount delta',
      evidence: [{ label: 'Dispute Note', value: '5% discount not applied' }],
      source: 'Dispute classifier',
      generatedAt: new Date().toISOString(),
      modelVersion: 'v2.1',
    },
    testOrgId
  );

  const exc3 = exceptionEngine.handleAIAnalysisTrigger(
    invErr.id,
    {
      category: 'INVOICE_ERROR',
      confidence: 0.80,
      conclusion: 'Re-issue corrected invoice to buyer',
      evidence: [{ label: 'GST Rate', value: 'Applied 18% instead of 12%' }],
      source: 'Tax Engine',
      generatedAt: new Date().toISOString(),
      modelVersion: 'v2.1',
    },
    testOrgId
  );

  // TEST 1: Mandatory Cross-View Consistency Test (Layer 9 Dashboard vs CFO Intelligence)
  const dashboardMetrics = dashboardMetricsStore.refreshMetrics(testOrgId);
  const cfoOverview = cfoIntelligenceEngine.getOverview(testOrgId);

  // Assert Total Receivables byte-identical equality
  assert.strictEqual(
    dashboardMetrics.totalReceivablesMinorUnits,
    cfoOverview.totalReceivablesMinorUnits,
    'CROSS-VIEW CONSISTENCY FAILURE: Total Receivables mismatch between Layer 9 Dashboard and Layer 22 CFO View!'
  );
  assert.strictEqual(cfoOverview.totalReceivablesMinorUnits, 17000000, 'Total Receivables should equal ₹1,70,000.00 (17,000,000 minor units)');

  // Assert Actionable Blockers (Cash Unblocked Opportunity) byte-identical equality
  assert.strictEqual(
    dashboardMetrics.cashUnblockedOpportunityMinorUnits,
    cfoOverview.actionableBlockersMinorUnits,
    'CROSS-VIEW CONSISTENCY FAILURE: Cash Unblocked Opportunity mismatch between Layer 9 Dashboard and Layer 22 CFO View!'
  );
  assert.strictEqual(cfoOverview.actionableBlockersMinorUnits, 17000000, 'Actionable blockers sum should equal ₹1,70,000.00');

  // Assert Category Breakdown sums to 100% of Actionable Blockers total
  const breakdownSum = cfoOverview.categoryBreakdown.reduce((sum, item) => sum + item.amountMinorUnits, 0);
  assert.strictEqual(
    breakdownSum,
    cfoOverview.actionableBlockersMinorUnits,
    'Category breakdown sum does not equal 100% of actionable blockers total!'
  );

  const percentageSum = cfoOverview.categoryBreakdown.reduce((sum, item) => sum + item.percentageOfActionableTotal, 0);
  assert(Math.abs(percentageSum - 100.0) < 0.1, `Category breakdown percentages must sum to 100% (got ${percentageSum}%)`);

  console.log('⚡ [PASS] 1. MANDATORY CROSS-VIEW CONSISTENCY: Layer 9 Dashboard and CFO View produce 100% byte-identical numbers');

  // TEST 2: Category Breakdown Taxonomy Compliance (Layer 14 exact enum check)
  for (const item of cfoOverview.categoryBreakdown) {
    assert(
      PAYMENT_DELAY_CATEGORIES.includes(item.category),
      `Taxonomy Violation: Category '${item.category}' is not in locked 11-value taxonomy`
    );
  }
  console.log('⚡ [PASS] 2. Category Breakdown strictly uses Layer 14 exact taxonomy enums');

  // TEST 3: Top 10 Actionable Actions Ranking & Manual Verification
  // Formula: rank_score = outstanding_amount * confidence * ease_of_resolution_factor
  // invDisp (CUSTOMER_DISPUTE): 10,000,000 * 0.95 * 0.40 = 3,800,000
  // invPO (PO_MISMATCH): 5,000,000 * 0.90 * 0.85 = 3,825,000  --> RANK #1!
  // invErr (INVOICE_ERROR): 2,000,000 * 0.80 * 0.95 = 1,520,000 --> RANK #3!

  const top1 = cfoOverview.topActions[0];
  const top2 = cfoOverview.topActions[1];
  const top3 = cfoOverview.topActions[2];

  assert.strictEqual(top1.invoiceNumber, invPO.number, 'Rank #1 invoice mismatch');
  assert.strictEqual(top1.rankScore, 3825000, 'Rank #1 score mismatch');
  assert.strictEqual(top1.easeOfResolutionFactor, CATEGORY_EASE_OF_RESOLUTION_FACTORS.PO_MISMATCH);

  assert.strictEqual(top2.invoiceNumber, invDisp.number, 'Rank #2 invoice mismatch');
  assert.strictEqual(top2.rankScore, 3800000, 'Rank #2 score mismatch');

  assert.strictEqual(top3.invoiceNumber, invErr.number, 'Rank #3 invoice mismatch');
  assert.strictEqual(top3.rankScore, 1520000, 'Rank #3 score mismatch');

  console.log('⚡ [PASS] 3. Top 10 Actions Ranking formula (amount × confidence × ease_factor) matches manual calculation exactly');

  // TEST 4: "Why this rank" Explanation Transparency Check
  assert(top1.rankingExplanation.formula.includes('rank_score'), 'Ranking explanation missing formula');
  assert(top1.rankingExplanation.rationale.includes('PO_MISMATCH'), 'Ranking explanation rationale missing category');
  assert.strictEqual(top1.rankingExplanation.outstandingAmount, 5000000);
  assert.strictEqual(top1.rankingExplanation.confidenceScore, 0.90);
  assert.strictEqual(top1.rankingExplanation.easeOfResolutionFactor, 0.85);

  console.log('⚡ [PASS] 4. Explainable Ranking: "Why this rank" metadata completely unmasks score calculation factors');

  console.log('\n==========================================');
  console.log('CFO INTELLIGENCE SUITE SUMMARY: 4 PASSED, 0 FAILED');
  console.log('==========================================\n');
}
