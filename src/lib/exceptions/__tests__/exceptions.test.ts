// AIOSpark Layer 15 Exception Engine Test Suite

import { exceptionEngine } from '../engine';
import { udmStore } from '../../udm/store';

export async function runExceptionEngineTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 15 EXCEPTION ENGINE TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`⚡ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  udmStore.clearAll();
  const orgId = 'org-exception-test-15';
  const today = '2026-09-01';
  udmStore.setTenantContext(orgId);

  // 1. Severity Determination Rules Test Matrix
  const cust = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'CUST_EXC_15',
    name: 'Logistics India',
    credit_limit_minor_units: 0,
    currency: 'INR',
    payment_terms_days: 30,
    owner_user_id: 'user_assigned_owner_1',
  });

  // Critical Severity Invoice (Amount >= ₹5,00,000, Overdue >= 60d, Dispute)
  const invCritical = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_CRITICAL',
    customer_id: cust.id,
    number: 'INV-CRITICAL',
    amount_minor_units: 60000000, // ₹6,00,000.00
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-06-01',
    due_date: '2026-06-30', // 63 days overdue
    status: 'disputed',
  });

  const sevCritical = exceptionEngine.calculateSeverity(invCritical, 'CUSTOMER_DISPUTE', orgId, today);
  assert(sevCritical === 'critical', '1a. Severity Rules - Invoice amount >= ₹5L & 63d overdue dispute evaluates to CRITICAL');

  // High Severity Invoice (Amount >= ₹1,00,000, Overdue >= 30d)
  const invHigh = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_HIGH',
    customer_id: cust.id,
    number: 'INV-HIGH',
    amount_minor_units: 15000000, // ₹1,50,000.00
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-07-01',
    due_date: '2026-07-31', // 32 days overdue
    status: 'open',
  });

  const sevHigh = exceptionEngine.calculateSeverity(invHigh, 'PO_MISMATCH', orgId, today);
  assert(sevHigh === 'high', '1b. Severity Rules - Invoice amount >= ₹1L & 32d overdue evaluates to HIGH');

  // 2. Owner Assignment Resolution
  const ownerAssigned = exceptionEngine.determineOwner(cust, 'CUSTOMER_DISPUTE', orgId);
  assert(ownerAssigned === 'user_assigned_owner_1', '2a. Owner Assignment - Customer assigned owner took priority');

  const ownerFallback = exceptionEngine.determineOwner(null, 'CUSTOMER_DISPUTE', orgId);
  assert(ownerFallback === 'role_assigned_finance_manager', '2b. Owner Assignment - Category-to-role mapping fell back to Finance Manager role');

  const ownerUnassigned = exceptionEngine.determineOwner(null, 'UNKNOWN', orgId);
  assert(ownerUnassigned === null, '2c. Owner Assignment - Unmapped category resolved cleanly to null (Unassigned)');

  // 3. State Machine Transition Rules
  const exc = udmStore.insertException({
    organization_id: orgId,
    customer_id: cust.id,
    invoice_id: invCritical.id,
    type: 'CUSTOMER_DISPUTE',
    severity: 'critical',
    status: 'detected',
  });

  const transitioned = exceptionEngine.transitionException(exc.id, 'classified', orgId);
  assert(transitioned.status === 'classified', '3a. State Machine - Valid transition detected -> classified succeeded');

  let invalidTransitionFailed = false;
  try {
    exceptionEngine.transitionException(exc.id, 'executed', orgId); // Invalid direct jump
  } catch (err: any) {
    invalidTransitionFailed = true;
  }
  assert(invalidTransitionFailed, '3b. State Machine - Invalid transition classified -> executed rejected with error');

  // 4. Duplicate Prevention Test
  const mockAnalysis = {
    conclusion: 'PO quantity mismatch on line 2',
    category: 'PO_MISMATCH',
    confidence: 0.95,
    evidence: [],
    source: 'test',
    generatedAt: new Date().toISOString(),
  };

  const firstTrigger = exceptionEngine.handleAIAnalysisTrigger(invHigh.id, mockAnalysis, orgId, today);
  const secondTrigger = exceptionEngine.handleAIAnalysisTrigger(invHigh.id, mockAnalysis, orgId, today);

  assert(
    firstTrigger !== null && secondTrigger !== null && firstTrigger.id === secondTrigger.id,
    '4a. Duplicate Prevention - Second AI trigger updated existing exception record instead of creating duplicate'
  );

  console.log('\n==========================================');
  console.log(`EXCEPTION ENGINE SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
