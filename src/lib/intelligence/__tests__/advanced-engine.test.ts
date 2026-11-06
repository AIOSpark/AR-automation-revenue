// AIOSpark Advanced Intelligence Layer Test Suite (Prompt 17)

import { udmStore } from '../../udm/store';
import {
  buildCausalChain,
  simulateCashUnblockScenario,
  getCashTrapMap,
  evaluatePaymentProbability,
  actionOutcomeStore,
} from '../advanced-engine';

export async function runAdvancedIntelligenceTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING PROMPT 17 ADVANCED INTELLIGENCE SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`🧠 [ADV_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [ADV_FAIL] ${message}`);
      failed++;
    }
  }

  const testOrg = 'org_advanced_test';
  udmStore.setTenantContext(testOrg);

  // Setup mock data
  const cust = udmStore.insertCustomer({
    organization_id: testOrg,
    name: 'Advanced Corp',
    source_system: 'manual',
    source_id: 'cust_adv_1',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv = udmStore.insertInvoice({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'inv_adv_1',
    customer_id: cust.id,
    number: 'INV-ADV-101',
    amount_minor_units: 184000000, // ₹18.4 Lakhs
    tax_amount_minor_units: 33120000,
    currency: 'INR',
    issue_date: '2026-08-01',
    due_date: '2026-10-01',
    status: 'open',
    po_reference: 'PO-99001',
  });

  udmStore.insertException({
    organization_id: testOrg,
    invoice_id: inv.id,
    customer_id: cust.id,
    type: 'PO_MISMATCH',
    severity: 'high',
    status: 'detected',
    evidence: { description: 'Invoice quantity differs from approved PO line item' },
    recommended_action: 'Reconcile PO line items with procurement',
  });

  // 1. Causal Graph Test
  const chain = buildCausalChain(inv.id, testOrg);
  testAssert(chain !== null, 'Feature 1: O2C Causal Graph built successfully');
  testAssert(chain?.cashImpactMinorUnits === 184000000, 'Feature 1: Cash impact mapped accurately (₹18.4L)');
  testAssert(chain?.blockerCategory === 'PO_MISMATCH', 'Feature 1: Root cause blocker identified as PO_MISMATCH');

  // 2. Cash Unblock Simulator Test
  const sim = simulateCashUnblockScenario(testOrg, inv.id);
  testAssert(sim !== null, 'Feature 2: Cash Unblock Simulator returned a result');
  if (sim) {
    testAssert(sim.isSimulatedEstimate === true, 'Feature 2: Cash Unblock Simulator output strictly tagged as estimate');
    testAssert(sim.potentialUnblockedMinorUnits === 239200000, 'Feature 2: Simulator calculated exact unblock opportunity (₹18.4L exception + ₹5.52L reminder = ₹23.92L total)');
  }

  // 3. Cash Trap Map Test
  const trapMap = getCashTrapMap(testOrg);
  testAssert(trapMap.length > 0, 'Feature 3: Cash Trap Map generated category buckets');
  testAssert(trapMap[0].categoryTitle === 'PO MISMATCH', 'Feature 3: Highest impact trap category identified');

  // 4. Payment Probability Engine Test
  // Use reference date 2026-10-31 (30 days after due_date 2026-10-01)
  // so daysOverdue = 30, which is NOT > 30, keeping riskLevel at AT_RISK
  const prob = evaluatePaymentProbability(inv.id, testOrg, '2026-10-31');
  testAssert(prob.isAIOSparkEstimate === true, 'Feature 4: Probability output labeled as AIOSpark Estimate');
  testAssert(prob.riskLevel === 'AT_RISK', 'Feature 4: Risk level evaluated as AT_RISK due to open exception');
  testAssert(prob.reasons.length > 0, 'Feature 4: Risk score fully explainable with evidence list');

  // Boundary tests for risk level thresholds
  const prob0Days = evaluatePaymentProbability(inv.id, testOrg, '2026-10-01'); // 0 days overdue
  testAssert(prob0Days.riskLevel === 'AT_RISK', 'Feature 4: 0 days overdue -> AT_RISK (exceptions present)');

  const prob1Day = evaluatePaymentProbability(inv.id, testOrg, '2026-10-02'); // 1 day overdue
  testAssert(prob1Day.riskLevel === 'AT_RISK', 'Feature 4: 1 day overdue -> AT_RISK (exceptions present)');

  const prob30Days = evaluatePaymentProbability(inv.id, testOrg, '2026-10-31'); // 30 days overdue
  testAssert(prob30Days.riskLevel === 'AT_RISK', 'Feature 4: 30 days overdue -> AT_RISK (exceptions present)');

  const prob31Days = evaluatePaymentProbability(inv.id, testOrg, '2026-11-01'); // 31 days overdue
  testAssert(prob31Days.riskLevel === 'HIGH_RISK', 'Feature 4: 31 days overdue -> HIGH_RISK (exceeds 30-day threshold)');

  const prob61Days = evaluatePaymentProbability(inv.id, testOrg, '2026-12-01'); // 61 days overdue
  testAssert(prob61Days.riskLevel === 'CRITICAL', 'Feature 4: 61 days overdue -> CRITICAL (exceeds 60-day threshold)');

  // 5. Action Outcome Loop Test
  const outcome = actionOutcomeStore.recordOutcome({
    organizationId: testOrg,
    invoiceId: inv.id,
    recommendation: 'Reconcile PO line items',
    humanDecision: 'APPROVED',
    actionTaken: 'Sent revised line items to AP',
    outcomeStatus: 'SUCCESS',
    cashUnblockedMinorUnits: 184000000,
  });

  testAssert(outcome.outcomeStatus === 'SUCCESS', 'Feature 11: Action outcome loop recorded successful unblock event');
  const storedOutcomes = actionOutcomeStore.getOutcomes(testOrg);
  testAssert(storedOutcomes.length === 1, 'Feature 12: Decision Memory persisted historical outcome record');

  console.log('\n==========================================');
  console.log(`ADVANCED INTELLIGENCE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
