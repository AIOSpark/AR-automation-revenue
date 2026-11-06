// AIOSpark Layer 13 AI Reasoning Engine Curated Scenario Test Suite

import {
  analyzeInvoice,
  buildReasoningContext,
  calculateReasoningConfidence,
  getSafeFallbackAnalysis,
  CURRENT_MODEL_PROMPT_VERSION,
} from '../reasoning-engine';
import { udmStore } from '../../udm/store';
import { dataQualityStore } from '../../quality/engine';

export async function runReasoningEngineTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 13 REASONING ENGINE TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`🧠 [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`🚨 [FAIL] ${testName}`);
      failed++;
    }
  }

  udmStore.clearAll();
  dataQualityStore.clearAll();

  const orgId = 'org-reasoning-test-13';
  udmStore.setTenantContext(orgId);

  // Seed Customer
  const cust = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'CUST_REASON_13',
    name: 'Apex Global',
    credit_limit_minor_units: 0,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // Scenario 1: PO Quantity Mismatch
  const invPoMismatch = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_PO_MISMATCH_99',
    customer_id: cust.id,
    number: 'INV-PO-MISMATCH-99',
    amount_minor_units: 12000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
    po_reference: 'PO-MISMATCH-441',
  });

  // Scenario 2: Active Dispute
  const invDispute = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_DISPUTE_88',
    customer_id: cust.id,
    number: 'INV-DISPUTE-88',
    amount_minor_units: 8000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-05',
    due_date: '2026-09-05',
    status: 'disputed',
  });
  udmStore.insertDispute({
    organization_id: orgId,
    invoice_id: invDispute.id,
    reason: 'Damaged goods on shipment B',
    status: 'open',
  });

  // Scenario 3: Layer 8 Data Quality Flag
  const invDq = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_DQ_77',
    customer_id: cust.id,
    number: 'INV-DQ-77',
    amount_minor_units: 5000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-10',
    due_date: '2026-09-10',
    status: 'open',
  });
  dataQualityStore.addFlag({
    organizationId: orgId,
    recordType: 'invoice',
    recordId: invDq.id,
    flagType: 'tax_discrepancy',
    severity: 'warning',
    message: 'Tax calculation mismatch on line 2',
  });

  // Scenario 4: Clean Normal Payment Cycle
  const invClean = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_CLEAN_11',
    customer_id: cust.id,
    number: 'INV-CLEAN-11',
    amount_minor_units: 3000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-20',
    due_date: '2026-09-20',
    status: 'open',
  });

  // 1. Narrow Context Builder Isolation Test
  const contextPo = buildReasoningContext(invPoMismatch.id, orgId);
  assert(
    contextPo !== null && contextPo.poReference === 'PO-MISMATCH-441' && contextPo.recentPayments.length === 0,
    '1a. Context Builder - Narrow purpose-built context slice assembled correctly'
  );

  // 2. Scenario 1 Analysis: PO Quantity Variance
  const analysisPo = await analyzeInvoice(invPoMismatch.id, orgId);
  assert(
    analysisPo.category === 'PO_MISMATCH' &&
      analysisPo.confidence > 0.9 &&
      analysisPo.evidence.length === 2 &&
      analysisPo.modelVersion === CURRENT_MODEL_PROMPT_VERSION,
    '2a. PO Mismatch Scenario - Produced high-confidence structured evidence with model version tag'
  );

  // 3. Scenario 2 Analysis: Active Dispute
  const analysisDispute = await analyzeInvoice(invDispute.id, orgId);
  assert(
    analysisDispute.category === 'CUSTOMER_DISPUTE' &&
      analysisDispute.conclusion.includes('Damaged goods on shipment B'),
    '3a. Active Dispute Scenario - Identified dispute reason correctly in conclusion'
  );

  // 4. Scenario 3 Analysis: Layer 8 Data Quality Confidence Cap (Deterministic Reduction)
  const analysisDq = await analyzeInvoice(invDq.id, orgId);
  assert(
    analysisDq.confidence <= 0.5,
    '4a. Deterministic Confidence Reduction - Data Quality Flag capped confidence to <= 0.50'
  );

  // 5. Scenario 4 Analysis: Clean Invoice
  const analysisClean = await analyzeInvoice(invClean.id, orgId);
  assert(
    analysisClean.category === 'NORMAL_CYCLE',
    '5a. Clean Invoice Scenario - Identified normal credit terms processing'
  );

  // 6. Non-Crashing Fallback Execution Test
  const fallbackResult = getSafeFallbackAnalysis('Test Error Simulation');
  assert(
    fallbackResult.category === 'UNKNOWN' &&
      fallbackResult.confidence === 0 &&
      fallbackResult.evidence.length === 0,
    '6a. Error Fallback Protection - Non-crashing safe default produced for UI "Needs Investigation" state'
  );

  console.log('\n==========================================');
  console.log(`REASONING ENGINE SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
