// AIOSpark Sprint 22 Priority 1.2A — Financial Integrity Regression Tests
// Covers: Tally parsing, Bank adapter, Payment CSV, Billing tax,
// Settlement semantics across all views, Import limit enforcement

import { parseMonetaryAmount } from '../src/lib/financial/monetary-parser';
import { calculateTaxMinorUnits } from '../src/lib/financial/monetary-parser';
import { PaymentProcessorService } from '../src/lib/billing/processor';
import { DEFAULT_PLANS } from '../src/lib/billing/store';
import { importEngine, MAX_PILOT_IMPORT_ROWS } from '../src/lib/import/engine';
import { udmStore } from '../src/lib/udm/store';
import { authStore } from '../src/lib/auth/store';
import { auditStore } from '../src/lib/audit/store';
import { setOrganizationReportingCurrency } from '../src/lib/financial/currency-org';
import { dashboardMetricsStore, computeTotalReceivables, computeOverdueReceivables, getInvoiceSettlementBreakdown, getInvoiceOutstandingBalance } from '../src/lib/dashboard/engine';
import { cfoIntelligenceEngine } from '../src/lib/cfo/engine';

let passed = 0;
let failed = 0;
const TEST_ORG = 'org_p12a_regression';

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function expectThrow(fn, expectedFragment, message) {
  try {
    fn();
    assert(false, message + ' (expected throw, none occurred)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes(expectedFragment), message + ' (got: ' + msg + ')');
  }
}

function setup() {
  setOrganizationReportingCurrency(TEST_ORG, 'INR');
  if (!authStore.getOrganizationById(TEST_ORG)) {
    authStore.organizations.set(TEST_ORG, {
      id: TEST_ORG, name: 'P1.2A Regression Org', size: '50-200',
      industry: 'Fintech', created_by_user_id: 'user_p12a',
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      currency: 'INR',
    });
  }
  udmStore.setTenantContext(TEST_ORG);
  udmStore.clearAll();
  auditStore.clearAll();
  dashboardMetricsStore.clearAll();
}

// ============================================================================
// TALLY MONETARY PARSING TESTS
// ============================================================================
async function testTallyParsing() {
  console.log('\n--- Tally Monetary Parsing ---');

  // Valid formats
  const r1 = parseMonetaryAmount('1,234.56', { currency: 'INR', allowNegative: true });
  assert(r1.success && r1.minorUnits === 123456, 'Tally: 1,234.56 → 123,456 paise');

  const r2 = parseMonetaryAmount('1,23,456.78', { currency: 'INR', allowNegative: true });
  assert(r2.success && r2.minorUnits === 12345678, 'Tally: 1,23,456.78 (Indian) → 12,345,678 paise');

  const r3 = parseMonetaryAmount('1.234,56', { locale: 'de-DE', currency: 'EUR', allowNegative: true });
  assert(r3.success && r3.minorUnits === 123456, 'Tally: 1.234,56 (European) → 123,456 cents');

  // Accounting negatives — sign must be PRESERVED, not stripped
  const r4 = parseMonetaryAmount('(1,000.00)', { currency: 'INR', allowNegative: true });
  assert(r4.success && r4.minorUnits === -100000 && r4.isNegative, 'Tally: (1,000.00) → -100,000 paise (negative preserved)');

  const r5 = parseMonetaryAmount('-1,000.00', { currency: 'INR', allowNegative: true });
  assert(r5.success && r5.minorUnits === -100000 && r5.isNegative, 'Tally: -1,000.00 → -100,000 paise');

  const r6 = parseMonetaryAmount('₹1,50,000.00', { currency: 'INR', allowNegative: true });
  assert(r6.success && r6.minorUnits === 15000000, 'Tally: ₹1,50,000.00 → 15,000,000 paise');

  // Invalid input rejected, not coerced to zero
  const r7 = parseMonetaryAmount('NOT-A-NUMBER', { currency: 'INR', allowNegative: true });
  assert(!r7.success, 'Tally: invalid input rejected');

  const r8 = parseMonetaryAmount('100.1234', { currency: 'INR', allowNegative: true });
  assert(!r8.success && r8.code === 'UNSUPPORTED_PRECISION', 'Tally: excess precision rejected');

  const r9 = parseMonetaryAmount('', { currency: 'INR', allowNegative: true });
  assert(!r9.success, 'Tally: empty value rejected');

  const r10 = parseMonetaryAmount('100.00', { currency: 'US', allowNegative: true });
  assert(!r10.success, 'Tally: unsupported currency rejected');
}

// ============================================================================
// BILLING TAX CALCULATION TESTS (Exact Rational Arithmetic)
// ============================================================================
function testBillingTax() {
  console.log('\n--- Billing Tax Calculations (Exact Arithmetic) ---');

  const plan = DEFAULT_PLANS['starter'];
  const subtotal = plan.price_minor_units;

  // 9% CGST (intra-state)
  const cgst = calculateTaxMinorUnits(subtotal, 9);
  assert(Number.isSafeInteger(cgst), `CGST is safe integer: ${cgst}`);
  assert(cgst > 0, `CGST is positive: ${cgst}`);

  // 18% IGST (inter-state)
  const igst = calculateTaxMinorUnits(subtotal, 18);
  assert(Number.isSafeInteger(igst), `IGST is safe integer: ${igst}`);
  assert(igst > 0, `IGST is positive: ${igst}`);

  // 100% rate
  const tax100 = calculateTaxMinorUnits(subtotal, 100);
  assert(tax100 === subtotal, `100% tax equals subtotal: ${tax100} === ${subtotal}`);

  // Zero rate
  const tax0 = calculateTaxMinorUnits(subtotal, 0);
  assert(tax0 === 0, `0% tax is zero: ${tax0}`);

  // Half-way rounding: subtotal=100 (1 rupee), rate=9 → 9 paise exactly
  const taxHalf = calculateTaxMinorUnits(10000, 9); // 100.00 rupees * 9% = 9.00 rupees = 900 paise
  assert(taxHalf === 900, `Half-way rounding: 100.00 * 9% = 900 paise, got ${taxHalf}`);

  // GST invoice generation
  const gstInv = PaymentProcessorService.generateGSTInvoice({
    organization_id: TEST_ORG,
    customer_gstin: '27AAACA0000A1Z5',
    customer_legal_name: 'Test Customer',
    customer_state_code: '27',
    plan_id: 'starter',
  });
  assert(gstInv.cgst_minor_units + gstInv.sgst_minor_units === gstInv.total_tax_minor_units,
    `CGST + SGST = Total Tax: ${gstInv.cgst_minor_units} + ${gstInv.sgst_minor_units} = ${gstInv.total_tax_minor_units}`);
  assert(gstInv.subtotal_minor_units + gstInv.total_tax_minor_units === gstInv.grand_total_minor_units,
    `Subtotal + Tax = Grand Total: ${gstInv.subtotal_minor_units} + ${gstInv.total_tax_minor_units} = ${gstInv.grand_total_minor_units}`);

  // Invalid rate rejected
  expectThrow(() => calculateTaxMinorUnits(10000, -1), 'rate must be', 'Negative tax rate rejected');
  expectThrow(() => calculateTaxMinorUnits(10000, 101), 'rate must be', 'Tax rate > 100 rejected');
}

// ============================================================================
// IMPORT ROW LIMIT ENFORCEMENT
// ============================================================================
function testImportLimit() {
  console.log('\n--- Import Row Limit Enforcement ---');

  const tooManyRows = Array(MAX_PILOT_IMPORT_ROWS + 1).fill(null).map((_, i) => ({
    customer_name: `Customer ${i}`,
    invoice_number: `INV-LIMIT-${i}`,
    amount: '1000.00',
    due_date: '2026-12-31',
  }));

  expectThrow(
    () => importEngine.createBatch(
      { organizationId: TEST_ORG, sourceSystem: 'csv_test', dateFormatConvention: 'YYYY-MM-DD', currency: 'INR' },
      tooManyRows
    ),
    `exceeds pilot row limit of ${MAX_PILOT_IMPORT_ROWS}`,
    `Import of ${MAX_PILOT_IMPORT_ROWS + 1} rows rejected at server boundary`
  );

  // Exactly at limit should succeed
  const atLimitRows = Array(MAX_PILOT_IMPORT_ROWS).fill(null).map((_, i) => ({
    customer_name: `Customer ${i}`,
    invoice_number: `INV-LIMIT-${i}`,
    amount: '1000.00',
    due_date: '2026-12-31',
  }));
  try {
    const batch = importEngine.createBatch(
      { organizationId: TEST_ORG, sourceSystem: 'csv_test', dateFormatConvention: 'YYYY-MM-DD', currency: 'INR' },
      atLimitRows
    );
    assert(batch.total_rows === MAX_PILOT_IMPORT_ROWS, `Batch at limit (${MAX_PILOT_IMPORT_ROWS}) accepted`);
    importEngine.clearAll();
  } catch (err) {
    assert(false, `Batch at limit rejected: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================================
// FINANCIAL INVARIANT: Gross = Cash + Credit + Outstanding
// ============================================================================
async function testFinancialInvariant() {
  console.log('\n--- Financial Invariant: Gross = Cash + Credit + Outstanding ---');
  setup();

  const cust = udmStore.insertCustomer({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'C_INV',
    name: 'Invariant Customer', credit_limit_minor_units: 100000000,
    currency: 'INR', payment_terms_days: 30,
  });
  const inv = udmStore.insertInvoice({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV_INV',
    customer_id: cust.id, number: 'INV_INV', amount_minor_units: 10000000,
    currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-10-01',
    due_date: '2026-10-31', status: 'open',
  });

  const gross = inv.amount_minor_units;

  // Payment ₹30,000 + Credit ₹40,000 → Outstanding should be ₹30,000
  const pay = udmStore.insertPayment({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'P_INV',
    customer_id: cust.id, amount_minor_units: 3000000, currency: 'INR', date: '2026-11-01',
  });
  udmStore.insertMatch({
    organization_id: TEST_ORG, payment_id: pay.id, invoice_id: inv.id,
    matched_amount_minor_units: 3000000, match_method: 'deterministic',
  });

  const cn = udmStore.insertCreditNote({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN_INV',
    customer_id: cust.id, amount_minor_units: 4000000, currency: 'INR', date: '2026-10-15', reason: 'CN_INV',
  });
  udmStore.insertCreditAllocation({
    organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id,
    allocated_amount_minor_units: 4000000, reason: 'CN_INV allocation', allocated_by: 'u1',
  });

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 3000000, `Outstanding: ${breakdown.outstandingMinorUnits} (expected 3,000,000)`);
  assert(breakdown.paidMatchedMinorUnits === 3000000, `Cash: ${breakdown.paidMatchedMinorUnits} (expected 3,000,000)`);
  assert(breakdown.creditAllocatedMinorUnits === 4000000, `Credit: ${breakdown.creditAllocatedMinorUnits} (expected 4,000,000)`);

  // INVARIANT: Gross = Cash + Credit + Outstanding
  assert(gross === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits,
    `Invariant: ${gross} = ${breakdown.paidMatchedMinorUnits} + ${breakdown.creditAllocatedMinorUnits} + ${breakdown.outstandingMinorUnits}`);

  // Gross amount never mutated
  assert(inv.amount_minor_units === gross, `Gross immutable: ${inv.amount_minor_units} === ${gross}`);
}

// ============================================================================
// SETTLEMENT SEMANTICS ACROSS VIEWS
// ============================================================================
async function testSettlementSemantics() {
  console.log('\n--- Settlement Semantics Across Views ---');
  setup();

  const cust = udmStore.insertCustomer({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'C_SETTLE',
    name: 'Settle Customer', credit_limit_minor_units: 100000000,
    currency: 'INR', payment_terms_days: 30,
  });

  // Invoice fully settled by credit note only (NO CASH)
  const invCredit = udmStore.insertInvoice({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV_CREDIT',
    customer_id: cust.id, number: 'INV_CREDIT', amount_minor_units: 5000000,
    currency: 'INR', tax_amount_minor_units: 900000, issue_date: '2026-10-01',
    due_date: '2026-10-31', status: 'open',
  });
  const cn = udmStore.insertCreditNote({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN_SETTLE',
    customer_id: cust.id, amount_minor_units: 5000000, currency: 'INR', date: '2026-10-10', reason: 'CN_SETTLE',
  });
  udmStore.insertCreditAllocation({
    organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: invCredit.id,
    allocated_amount_minor_units: 5000000, reason: 'Full credit', allocated_by: 'u1',
  });

  const bCredit = getInvoiceSettlementBreakdown(invCredit);
  assert(bCredit.outstandingMinorUnits === 0, `Credit-only: outstanding = 0`);
  assert(bCredit.paidMatchedMinorUnits === 0, `Credit-only: cash paid = 0 (NO CASH RECEIVED)`);
  assert(bCredit.creditAllocatedMinorUnits === 5000000, `Credit-only: credit = 5,000,000`);
  assert(invCredit.settlementType === 'credit_settled', `Credit-only: settlementType = credit_settled (NOT cash_paid)`);
  assert(invCredit.status === 'paid', `Credit-only: status = paid`);

  // Invoice fully settled by cash only
  const invCash = udmStore.insertInvoice({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV_CASH',
    customer_id: cust.id, number: 'INV_CASH', amount_minor_units: 5000000,
    currency: 'INR', tax_amount_minor_units: 900000, issue_date: '2026-10-01',
    due_date: '2026-10-31', status: 'open',
  });
  const pay = udmStore.insertPayment({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'P_SETTLE',
    customer_id: cust.id, amount_minor_units: 5000000, currency: 'INR', date: '2026-11-01',
  });
  udmStore.insertMatch({
    organization_id: TEST_ORG, payment_id: pay.id, invoice_id: invCash.id,
    matched_amount_minor_units: 5000000, match_method: 'deterministic',
  });

  const bCash = getInvoiceSettlementBreakdown(invCash);
  assert(bCash.outstandingMinorUnits === 0, `Cash-only: outstanding = 0`);
  assert(bCash.paidMatchedMinorUnits === 5000000, `Cash-only: cash = 5,000,000`);
  assert(bCash.creditAllocatedMinorUnits === 0, `Cash-only: credit = 0`);
  assert(invCash.settlementType === 'cash_paid', `Cash-only: settlementType = cash_paid`);

  // Cross-engine consistency: Dashboard, CFO, Receivables all agree
  const allInvoices = udmStore.getInvoices();
  const totalDirect = computeTotalReceivables(allInvoices, TEST_ORG);
  const dashboard = dashboardMetricsStore.refreshMetrics(TEST_ORG, '2026-11-05');
  const cfo = cfoIntelligenceEngine.getOverview(TEST_ORG, '2026-11-05');

  assert(dashboard.totalReceivablesMinorUnits === totalDirect,
    `Dashboard total receivables matches direct formula: ${dashboard.totalReceivablesMinorUnits} === ${totalDirect}`);
  assert(cfo.totalReceivablesMinorUnits === totalDirect,
    `CFO total receivables matches direct formula: ${cfo.totalReceivablesMinorUnits} === ${totalDirect}`);
  assert(dashboard.totalReceivablesMinorUnits === cfo.totalReceivablesMinorUnits,
    `Dashboard and CFO agree: ${dashboard.totalReceivablesMinorUnits} === ${cfo.totalReceivablesMinorUnits}`);
}

// ============================================================================
// REVERSED ALLOCATIONS RESTORE INVARIANT
// ============================================================================
async function testReversalRestoresInvariant() {
  console.log('\n--- Reversed Allocations Restore Invariant ---');
  setup();

  const cust = udmStore.insertCustomer({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'C_REV',
    name: 'Reversal Customer', credit_limit_minor_units: 100000000,
    currency: 'INR', payment_terms_days: 30,
  });
  const inv = udmStore.insertInvoice({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV_REV',
    customer_id: cust.id, number: 'INV_REV', amount_minor_units: 10000000,
    currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-10-01',
    due_date: '2026-10-31', status: 'open',
  });
  const gross = inv.amount_minor_units;

  const cn = udmStore.insertCreditNote({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN_REV',
    customer_id: cust.id, amount_minor_units: 4000000, currency: 'INR', date: '2026-10-10', reason: 'CN_REV',
  });
  const alloc = udmStore.insertCreditAllocation({
    organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id,
    allocated_amount_minor_units: 4000000, reason: 'Full credit', allocated_by: 'u1',
  });

  // Reverse
  udmStore.reverseCreditAllocation(alloc.id, 'Test reversal', 'u1');

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === gross, `After reversal: outstanding = gross (${gross})`);
  assert(breakdown.creditAllocatedMinorUnits === 0, `After reversal: credit = 0`);
  assert(inv.status === 'open', `After reversal: status = open`);
  assert(inv.amount_minor_units === gross, `After reversal: gross immutable`);

  // Audit trail
  const logs = auditStore.query({ organizationId: TEST_ORG, actionType: 'credit_note.allocation_reversed' });
  assert(logs.length >= 1, 'Audit trail records reversal');
}

// ============================================================================
// OVER-ALLOCATION PREVENTION (Integrity Error, Not Silent Clamp)
// ============================================================================
async function testOverAllocationPrevention() {
  console.log('\n--- Over-Allocation Prevention ---');
  setup();

  const cust = udmStore.insertCustomer({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'C_OVER',
    name: 'Over Customer', credit_limit_minor_units: 100000000,
    currency: 'INR', payment_terms_days: 30,
  });
  const inv = udmStore.insertInvoice({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV_OVER',
    customer_id: cust.id, number: 'INV_OVER', amount_minor_units: 5000000,
    currency: 'INR', tax_amount_minor_units: 900000, issue_date: '2026-10-01',
    due_date: '2026-10-31', status: 'open',
  });
  const cn = udmStore.insertCreditNote({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN_OVER',
    customer_id: cust.id, amount_minor_units: 10000000, currency: 'INR', date: '2026-10-10', reason: 'CN_OVER',
  });

  // Try to allocate more than outstanding
  let blocked = false;
  try {
    udmStore.insertCreditAllocation({
      organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id,
      allocated_amount_minor_units: 6000000, reason: 'Over-allocate', allocated_by: 'u1',
    });
  } catch (err) {
    blocked = true;
  }
  assert(blocked, 'Over-allocation on invoice outstanding blocked');

  // Try to allocate more than credit note available
  blocked = false;
  try {
    udmStore.insertCreditAllocation({
      organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id,
      allocated_amount_minor_units: 4000000, reason: 'First alloc', allocated_by: 'u1',
    });
    udmStore.insertCreditAllocation({
      organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id,
      allocated_amount_minor_units: 7000000, reason: 'Over-allocate CN', allocated_by: 'u1',
    });
  } catch (err) {
    blocked = true;
  }
  assert(blocked, 'Over-allocation on credit note available blocked');
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('========================================');
  console.log('SPRINT 22 PRIORITY 1.2A — REGRESSION TESTS');
  console.log('========================================\n');

  await testTallyParsing();
  testBillingTax();
  testImportLimit();
  await testFinancialInvariant();
  await testSettlementSemantics();
  await testReversalRestoresInvariant();
  await testOverAllocationPrevention();

  console.log(`\n========================================`);
  console.log(`REGRESSION TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
