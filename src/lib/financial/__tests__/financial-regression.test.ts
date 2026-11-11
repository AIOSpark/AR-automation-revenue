// AIOSpark Financial Regression — Intelligence vs Authoritative Settlement
// Verifies every intelligence module reconciles with the authoritative invoice
// settlement engine: Gross − Cash Payments − Allocated Credit Notes =
// Net Outstanding. Credit notes are never treated as cash received.
import { udmStore } from '../../udm/store';
import { authStore } from '../../auth/store';
import { NextBestActionEngine } from '../../intelligence/next-best-action-engine';
import { CashUnblockSimulatorEngine } from '../../intelligence/cash-unblock-simulator';
import { buildCausalChain } from '../../intelligence/advanced-engine';
import { cfoIntelligenceEngine } from '../../cfo/engine';
import { queryReceivablesTable } from '../../receivables/engine';

export async function runFinancialRegressionTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK FINANCIAL REGRESSION TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;
  function t(cond: boolean, name: string, extra = '') {
    if (cond) {
      passed++;
      console.log(`  ✅ ${name}`);
    } else {
      failed++;
      console.error(`  ❌ ${name} ${extra}`);
    }
  }

  const org = authStore.createOrganizationDraft({
    name: 'Regression Org', size: '11-50 employees', industry: 'Fintech', created_by_user_id: 'user_reg',
  });
  const orgId = org.id;
  udmStore.setTenantContext(orgId);

  const cust = udmStore.insertCustomer({
    organization_id: orgId, source_system: 'manual', source_id: 'cust_r1', name: 'Reg Customer',
    credit_limit_minor_units: 50000000, currency: 'INR', payment_terms_days: 30,
  });

  const assertOutstanding = (label: string, invoice: any, expected: number) => {
    const actual = udmStore.computeInvoiceOutstanding(invoice);
    t(actual === expected, `${label}: authoritative outstanding=₹${expected / 1000000}L`, `got ₹${actual / 1000000}L`);
    return actual;
  };

  const assertAllModules = (label: string, invoice: any, expected: number) => {
    assertOutstanding(label, invoice, expected);

    const nba = NextBestActionEngine.evaluateCase(invoice.id, orgId, 'Finance Manager')!;
    t(nba.remainingExposureMinorUnits === expected, `NBA: remainingExposure=₹${expected / 1000000}L`);

    const sim = CashUnblockSimulatorEngine.simulate({ invoiceId: invoice.id, orgId })!;
    t(sim.actualOutstandingMinorUnits === expected, `CashUnblock: actualOutstanding=₹${expected / 1000000}L`);

    const chain = buildCausalChain(invoice.id, orgId)!;
    t(chain.cashImpactMinorUnits === expected, `CausalGraph: cashImpact=₹${expected / 1000000}L`);

    const cfo = cfoIntelligenceEngine.getOverview(orgId);
    t(cfo.totalReceivablesMinorUnits === expected, `CFO: totalReceivables=₹${expected / 1000000}L`);
  };

  // Scenario A: no payments / no credits → outstanding = gross ₹1,00,000
  const GROSS = 10000000;
  const invA = udmStore.insertInvoice({
    organization_id: orgId, source_system: 'manual', source_id: 'inv_r1', customer_id: cust.id,
    number: 'INV-R1', amount_minor_units: GROSS, currency: 'INR',
    issue_date: '2026-01-01', due_date: '2026-12-31', status: 'open', tax_amount_minor_units: 0,
  });
  assertAllModules('A: no payments/credits', invA, GROSS);

  // Scenario B: cash payment ₹40,000 → outstanding ₹60,000
  const pay = udmStore.insertPayment({
    organization_id: orgId, source_system: 'manual', source_id: 'pay_r1', customer_id: cust.id,
    amount_minor_units: 4000000, currency: 'INR', date: '2026-02-01',
  });
  udmStore.insertMatch({
    organization_id: orgId, payment_id: pay.id, invoice_id: invA.id, matched_amount_minor_units: 4000000,
  });
  assertAllModules('B: ₹40,000 payment', invA, 6000000);

  // Scenario C: credit note ₹30,000 allocated on top of payment → outstanding ₹30,000
  const cn = udmStore.insertCreditNote({
    organization_id: orgId, source_system: 'manual', source_id: 'cn_r1', customer_id: cust.id,
    invoice_id: invA.id, amount_minor_units: 3000000, currency: 'INR', date: '2026-02-15', reason: 'Adjustment',
  });
  const cnAlloc = udmStore.insertCreditAllocation({
    organization_id: orgId, credit_note_id: cn.id, invoice_id: invA.id,
    allocated_amount_minor_units: 3000000, reason: 'Allocate credit', allocated_by: 'user_reg',
  });
  assertAllModules('C: payment ₹40,000 + credit ₹30,000', invA, 3000000);

  // Scenario D: reverse credit → back to ₹60,000
  udmStore.reverseCreditAllocation(cnAlloc.id, 'test reversal', 'user_reg');
  assertAllModules('D: credit reversed', invA, 6000000);

  // Scenario E: fresh invoice + full credit note ₹1,00,000 → fully settled
  const invE = udmStore.insertInvoice({
    organization_id: orgId, source_system: 'manual', source_id: 'inv_r2', customer_id: cust.id,
    number: 'INV-R2', amount_minor_units: GROSS, currency: 'INR',
    issue_date: '2026-02-01', due_date: '2026-12-31', status: 'open', tax_amount_minor_units: 0,
  });
  const cn2 = udmStore.insertCreditNote({
    organization_id: orgId, source_system: 'manual', source_id: 'cn_r2', customer_id: cust.id,
    invoice_id: invE.id, amount_minor_units: GROSS, currency: 'INR', date: '2026-02-20', reason: 'Full settlement',
  });
  udmStore.insertCreditAllocation({
    organization_id: orgId, credit_note_id: cn2.id, invoice_id: invE.id,
    allocated_amount_minor_units: GROSS, reason: 'Full settlement', allocated_by: 'user_reg',
  });
  // invE fully settled → its outstanding is 0; CFO totalReceivables = invA's 6,000,000 + invE's 0
  assertOutstanding('E: fully settled by credit note', invE, 0);
  const cfoE=cfoIntelligenceEngine.getOverview(orgId);
  t(cfoE.totalReceivablesMinorUnits===6000000, 'CFO: totalReceivables=₹60,000 (invA) + ₹0 (invE fully settled)', `got ₹${cfoE.totalReceivablesMinorUnits/1000000}L`);

  console.log(`\nFINANCIAL REGRESSION: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');
}
runFinancialRegressionTestSuite().then(() => process.exit(0)).catch((e) => { console.error('FATAL', e); process.exit(1); });
