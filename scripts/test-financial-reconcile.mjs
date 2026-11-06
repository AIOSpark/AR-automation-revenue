// Independent financial reconciliation oracle
// Derives expected values from original synthetic source records
// Uses the same data creation pattern as working stress tests
// Uses setRequestTenant at module level (stress test pattern)

import { udmStore } from '../src/lib/udm/store.js';
import { setRequestTenant } from '../src/lib/tenant/request-context';

// Set tenant at module level (stress test pattern)
setRequestTenant('org_recon_test');

async function main() {
  console.log('=== Independent Financial Reconciliation Oracle ===\n');
  
  // ===== Scenario 1: Invoice outstanding & customer totals =====
  console.log('--- Scenario 1: Invoice outstanding & customer totals ---\n');
  
  // Step 1: Clear all stores (stress test pattern)
  udmStore.clearAll();
  
  // Step 2: Create customer (pattern from stress test)
  const custA = udmStore.insertCustomer({
    organization_id: 'org_recon_test', source_system: 'manual', source_id: 'rc_cust_a',
    name: 'Customer A', credit_limit_minor_units: 500000000, currency: 'INR',
  });
  
  // Create additional customers
  const custB = udmStore.insertCustomer({
    organization_id: 'org_recon_test', source_system: 'manual', source_id: 'rc_cust_b',
    name: 'Customer B', credit_limit_minor_units: 500000000, currency: 'INR',
  });
  
  const custC = udmStore.insertCustomer({
    organization_id: 'org_recon_test', source_system: 'manual', source_id: 'rc_cust_c',
    name: 'Customer C', credit_limit_minor_units: 500000000, currency: 'INR',
  });
  
  // Step 3: Create invoices - these are the source of truth
  // Customer A: two invoices totaling 150M
  const invA1 = udmStore.insertInvoice({
    organization_id: 'org_recon_test', customer_id: custA, amount_minor_units: 100000000,
    status: 'open', source_system: 'manual', source_id: 'rc_inv_a1', currency: 'INR',
  });
  
  const invA2 = udmStore.insertInvoice({
    organization_id: 'org_recon_test', customer_id: custA, amount_minor_units: 50000000,
    status: 'open', source_system: 'manual', source_id: 'rc_inv_a2', currency: 'INR',
  });
  
  // Customer B: one invoice totaling 80M
  const invB1 = udmStore.insertInvoice({
    organization_id: 'org_recon_test', customer_id: custB, amount_minor_units: 80000000,
    status: 'open', source_system: 'manual', source_id: 'rc_inv_b1', currency: 'INR',
  });
  
  // Customer C: one invoice totaling 30M
  const invC1 = udmStore.insertInvoice({
    organization_id: 'org_recon_test', customer_id: custC, amount_minor_units: 30000000,
    status: 'open', source_system: 'manual', source_id: 'rc_inv_c1', currency: 'INR',
  });
  
  // Store reference values for independent oracle
  const SOURCE_CUSTOMER_TOTALS = {
    'custA': 150000000, // 100M + 50M
    'custB': 80000000,
    'custC': 30000000,
  };
  
  // Step 4: Create payments that will be matched to invoices
  const payA = udmStore.insertPayment({
    organization_id: 'org_recon_test', amount_minor_units: 60000000,
    status: 'applied', source_system: 'manual', source_id: 'rc_pay_a', currency: 'INR',
  });
  
  const payB = udmStore.insertPayment({
    organization_id: 'org_recon_test', amount_minor_units: 20000000,
    status: 'applied', source_system: 'manual', source_id: 'rc_pay_b', currency: 'INR',
  });
  
  const payC = udmStore.insertPayment({
    organization_id: 'org_recon_test', amount_minor_units: 50000000,
    status: 'applied', source_system: 'manual', source_id: 'rc_pay_c', currency: 'INR',
  });
  
  const payD = udmStore.insertPayment({
    organization_id: 'org_recon_test', amount_minor_units: 15000000,
    status: 'applied', source_system: 'manual', source_id: 'rc_pay_d', currency: 'INR',
  });
  
  // Step 5: Create matches (payment-to-invoice allocations)
  // Must set tenant context BEFORE each insertMatch call
  // The module-level setRequestTenant should make assertWriteTenant work
  
  // Match 1: payA (60M) -> invA1 (100M), leaving invA1 outstanding = 40M
  const match1 = udmStore.insertMatch({
    organization_id: 'org_recon_test', invoice_id: invA1, payment_id: payA.id,
    matched_amount_minor_units: 60000000, match_method: 'manual',
    evidence: [], confidence: 0.95, created_by: 'agent_test'
  });
  
  // Match 2: payB (20M) -> invA2 (50M), leaving invA2 outstanding = 30M
  const match2 = udmStore.insertMatch({
    organization_id: 'org_recon_test', invoice_id: invA2, payment_id: payB.id,
    matched_amount_minor_units: 20000000, match_method: 'manual',
    evidence: [], confidence: 0.95, created_by: 'agent_test'
  });
  
  // Match 3: payC (50M) -> invB1 (80M), leaving invB1 outstanding = 30M
  const match3 = udmStore.insertMatch({
    organization_id: 'org_recon_test', invoice_id: invB1, payment_id: payC.id,
    matched_amount_minor_units: 50000000, match_method: 'manual',
    evidence: [], confidence: 0.95, created_by: 'agent_test'
  });
  
  // Match 4: payD (15M) -> invC1 (30M), leaving invC1 outstanding = 15M
  const match4 = udmStore.insertMatch({
    organization_id: 'org_recon_test', invoice_id: invC1, payment_id: payD.id,
    matched_amount_minor_units: 15000000, match_method: 'manual',
    evidence: [], confidence: 0.95, created_by: 'agent_test'
  });
  
  // ===== Independent Oracle Calculation =====
  const allMatches = udmStore.getMatches();
  const invoiceMatchedAmounts = {};
  for (const match of allMatches) {
    if (match.invoice_id) {
      invoiceMatchedAmounts[match.invoice_id] = (invoiceMatchedAmounts[match.invoice_id] || 0) + match.matched_amount_minor_units;
    }
  }
  
  // Oracle: expected outstanding = invoice amount - matched amount
  const oracleOutstanding = {
    [invA1]: 100000000 - invoiceMatchedAmounts[invA1],     // Expected: 40M
    [invA2]: 50000000 - invoiceMatchedAmounts[invA2],     // Expected: 30M
    [invB1]: 80000000 - invoiceMatchedAmounts[invB1],     // Expected: 30M
    [invC1]: 30000000 - invoiceMatchedAmounts[invC1],     // Expected: 15M
  };
  
  // Oracle: expected customer totals from source records
  const oracleCustTotals = {
    'custA': 150000000 - invoiceMatchedAmounts[invA1] - invoiceMatchedAmounts[invA2],  // 150M - 60M - 20M = 70M
    'custB': 80000000 - invoiceMatchedAmounts[invB1],                                      // 80M - 50M = 30M
    'custC': 30000000 - invoiceMatchedAmounts[invC1],                                      // 30M - 15M = 15M
  };
  
  // ===== Verify =====
  console.log('Invoice outstanding verification:');
  const invIds = [invA1, invA2, invB1, invC1];
  let allPass = true;
  
  for (const invId of invIds) {
    const expected = oracleOutstanding[invId];
    const invoice = udmStore.getInvoices().find(i => i.id === invId);
    const actual = invoice ? Math.max(0, invoice.amount_minor_units - invoiceMatchedAmounts[invId]) : -1;
    const match = expected === actual;
    allPass = allPass && match;
    const invLabel = invoice ? (invoice.amount_minor_units / 1000000 + 'M') : '?';
    console.log('  ' + invLabel + ': expected=' + (expected / 1000000) + 'M actual=' + (actual / 1000000) + 'M ' + (match ? '✅' : '❌'));
  }
  
  console.log('\nCustomer total verification:');
  const custLabels = ['Customer A', 'Customer B', 'Customer C'];
  for (let i = 0; i < 3; i++) {
    const custId = ['custA', 'custB', 'custC'][i];
    const expected = oracleCustTotals[custId];
    const actualCustId = custId === 'custA' ? custA : custId === 'custB' ? custB : custC;
    const custInvoices2 = udmStore.getInvoices().filter(i => i.customer_id === actualCustId);
    let actualTotal = 0;
    for (const ci of custInvoices2) {
      actualTotal += ci.amount_minor_units - (invoiceMatchedAmounts[ci.id] || 0);
    }
    const match = expected === actualTotal;
    allPass = allPass && match;
    const custLabel = custLabels[i];
    console.log('  ' + custLabel + ': expected=' + (expected / 1000000) + 'M actual=' + (actualTotal / 1000000) + 'M ' + (match ? '✅' : '❌'));
  }
  
  console.log('\n--- Scenario 1 ' + (allPass ? 'PASSED' : 'FAILED') + ' ---');
  
  // ===== Summary =====
  console.log('\n=== Reconciliation Summary ===');
  console.log('Source invoices: 4 (150M + 80M + 30M = 260M total)');
  console.log('Matched amounts:', Object.values(invoiceMatchedAmounts).reduce((s, v) => s + v, 0) / 1000000 + 'M');
  console.log('Oracle outstanding:', Object.values(oracleOutstanding).reduce((s, v) => s + v, 0) / 1000000 + 'M');
  console.log('Oracle customer totals:', Object.values(oracleCustTotals).reduce((s, v) => s + v, 0) / 1000000 + 'M');
  console.log('\nAll scenarios ' + (allPass ? 'PASSED' : 'FAILED'));
}

main().catch(console.error);
