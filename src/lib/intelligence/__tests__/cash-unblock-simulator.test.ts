// AIOSpark Cash Unblock Simulator Engine Test Suite (Step 08)

import { CashUnblockSimulatorEngine } from '../cash-unblock-simulator';
import { udmStore } from '../../udm/store';
import { promiseStore } from '../../promises/store';

export async function runCashUnblockSimulatorTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING STEP 08 CASH UNBLOCK SIMULATOR SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`⚡ [SIM_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [SIM_FAIL] ${message}`);
      failed++;
    }
  }

  const orgId = 'org_sim_test';
  udmStore.clearAll();
  promiseStore.clearAll();
  udmStore.setTenantContext(orgId);

  // Setup Test Customer & Invoice
  const cust = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'cust_sim_1',
    name: 'ABC Industries',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'inv_sim_1',
    customer_id: cust.id,
    number: 'INV-1048',
    amount_minor_units: 18400000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
    po_reference: 'PO-8291',
  });

  udmStore.insertException({
    organization_id: orgId,
    invoice_id: inv.id,
    customer_id: cust.id,
    type: 'PURCHASE_ORDER_MISMATCH',
    severity: 'high',
    status: 'detected',
    evidence: { description: 'Invoice quantity exceeds PO quantity' },
  });

  // TEST 1: Baseline & Scenario Generation
  const result = CashUnblockSimulatorEngine.simulate({ invoiceId: inv.id, orgId });
  assert(result !== null, 'Test 1: Simulation generated successfully');

  if (result) {
    assert(result.isReadOnly === true, 'Test 1: Simulation is strictly read-only');
    assert(result.actualOutstandingMinorUnits === 18400000, 'Test 1: Baseline actual outstanding is ₹18.4L');
    assert(result.actualPrimaryBlocker.toLowerCase().includes('po') || result.actualPrimaryBlocker.toLowerCase().includes('purchase'), 'Test 1: Primary blocker identified as PO Mismatch');

    // Scenario A (Recommended) vs Scenario B (Alternative)
    assert(result.scenarios.length >= 2, 'Test 1: At least 2 scenarios generated for comparison');
    const scenA = result.scenarios[0];
    const scenB = result.scenarios[1];

    assert(scenA.isRecommended === true, 'Test 1: Scenario A is marked recommended');
    assert(scenA.potentiallyUnblockedMinorUnits === 18400000, 'Test 1: Scenario A unblocks full ₹18.4L exposure');
    assert(scenB.isRecommended === false, 'Test 1: Scenario B is marked alternative (not recommended)');
    assert(Boolean(scenB.whyNotPreferredReason && (scenB.whyNotPreferredReason.toLowerCase().includes('internal blocker') || scenB.whyNotPreferredReason.toLowerCase().includes('internal'))), 'Test 1: Scenario B explains why customer chasing is non-preferred');

    // Read-only safety verification: UDM database must remain completely unchanged
    const invAfter = udmStore.getInvoices().find(i => i.id === inv.id);
    assert(invAfter?.status === 'open', 'Test 1 Read-Only Safety: Database invoice status remained OPEN (no mutation)');
  }

  // TEST 2: Data Conflict Detection (Bank payment unallocated)
  const p = udmStore.insertPayment({
    organization_id: orgId,
    source_system: 'bank',
    source_id: inv.number,
    reference: inv.number,
    customer_id: cust.id,
    amount_minor_units: 18400000,
    currency: 'INR',
    date: '2026-09-01',
  });

  const resultConflict = CashUnblockSimulatorEngine.simulate({ invoiceId: inv.id, orgId });
  assert(resultConflict !== null, 'Test 2: Simulation evaluated conflict case');
  if (resultConflict) {
    assert(resultConflict.hasDataConflict === true, 'Test 2: Data conflict detected when unallocated bank payment exists');
    assert(Boolean(resultConflict.dataConflictNote?.toLowerCase().includes('bank ledger')), 'Test 2: Conflict note highlights bank ledger mismatch');
  }

  console.log(`\n==========================================`);
  console.log(`STEP 08 SIMULATOR SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================\n`);

  return { passed, failed };
}
