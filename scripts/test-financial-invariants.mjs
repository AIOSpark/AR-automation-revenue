// AIOSpark Sprint 22 Priority 1.2 — Financial Invariant Tests
// Independent expected-value verification of core financial invariants

import { udmStore } from '../src/lib/udm/store';
import { authStore } from '../src/lib/auth/store';
import { setOrganizationReportingCurrency } from '../src/lib/financial/currency';
import { auditStore } from '../src/lib/audit/store';
import { getInvoiceOutstandingBalance, getInvoiceSettlementBreakdown } from '../src/lib/dashboard/engine';

let passed = 0;
let failed = 0;
const TEST_ORG = 'org_invariant_test';

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function expectThrow(fn, expectedMessageFragment, message) {
  try {
    fn();
    assert(false, message + ' (expected throw, none occurred)');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(msg.includes(expectedMessageFragment), message + ' (got: ' + msg + ')');
  }
}

async function setup() {
  setOrganizationReportingCurrency(TEST_ORG, 'INR');
  if (!authStore.getOrganizationById(TEST_ORG)) {
    authStore.organizations.set(TEST_ORG, {
      id: TEST_ORG,
      name: 'Invariant Test Org',
      size: '50-200',
      industry: 'Fintech',
      created_by_user_id: 'user_invariant',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      currency: 'INR',
    });
  }
  udmStore.setTenantContext(TEST_ORG);
  udmStore.clearAll();
  auditStore.clearAll();
}

async function testInvariant1() {
  console.log('\n--- Invariant 1: Multiple payments against one invoice ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C1', name: 'C1', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV1', customer_id: cust.id, number: 'INV1', amount_minor_units: 10000000, currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  // Payment 1: ₹30,000
  const pay1 = udmStore.insertPayment({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'P1', customer_id: cust.id, amount_minor_units: 3000000, currency: 'INR', date: '2026-11-01' });
  udmStore.insertMatch({ organization_id: TEST_ORG, payment_id: pay1.id, invoice_id: inv.id, matched_amount_minor_units: 3000000, match_method: 'deterministic' });

  // Payment 2: ₹20,000
  const pay2 = udmStore.insertPayment({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'P2', customer_id: cust.id, amount_minor_units: 2000000, currency: 'INR', date: '2026-11-02' });
  udmStore.insertMatch({ organization_id: TEST_ORG, payment_id: pay2.id, invoice_id: inv.id, matched_amount_minor_units: 2000000, match_method: 'deterministic' });

  const outstanding = getInvoiceOutstandingBalance(inv);
  const breakdown = getInvoiceSettlementBreakdown(inv);

  assert(outstanding === 5000000, `Outstanding after 2 payments: ${outstanding} (expected 5,000,000)`);
  assert(breakdown.paidMatchedMinorUnits === 5000000, `Paid matched: ${breakdown.paidMatchedMinorUnits} (expected 5,000,000)`);
  assert(breakdown.creditAllocatedMinorUnits === 0, `Credit allocated: ${breakdown.creditAllocatedMinorUnits} (expected 0)`);
  assert(inv.amount_minor_units === 10000000, `Gross preserved: ${inv.amount_minor_units} (expected 10,000,000)`);

  // Invariant: Gross = Cash + Credit + Outstanding
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant: Gross = Cash + Credit + Outstanding');
}

async function testInvariant2() {
  console.log('\n--- Invariant 2: Multiple credit notes against one invoice ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C2', name: 'C2', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV2', customer_id: cust.id, number: 'INV2', amount_minor_units: 10000000, currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  const cn1 = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN1', customer_id: cust.id, amount_minor_units: 3000000, currency: 'INR', date: '2026-10-10', reason: 'CN1' });
  const cn2 = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN2', customer_id: cust.id, amount_minor_units: 2000000, currency: 'INR', date: '2026-10-11', reason: 'CN2' });

  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn1.id, invoice_id: inv.id, allocated_amount_minor_units: 3000000, reason: 'CN1 allocation', allocated_by: 'u1' });
  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn2.id, invoice_id: inv.id, allocated_amount_minor_units: 2000000, reason: 'CN2 allocation', allocated_by: 'u1' });

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 5000000, `Outstanding: ${breakdown.outstandingMinorUnits} (expected 5,000,000)`);
  assert(breakdown.creditAllocatedMinorUnits === 5000000, `Credit allocated: ${breakdown.creditAllocatedMinorUnits} (expected 5,000,000)`);
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant: Gross = Cash + Credit + Outstanding');
}

async function testInvariant3() {
  console.log('\n--- Invariant 3: One credit note allocated across multiple invoices ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C3', name: 'C3', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv1 = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV3A', customer_id: cust.id, number: 'INV3A', amount_minor_units: 5000000, currency: 'INR', tax_amount_minor_units: 900000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });
  const inv2 = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV3B', customer_id: cust.id, number: 'INV3B', amount_minor_units: 5000000, currency: 'INR', tax_amount_minor_units: 900000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  const cn = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN3', customer_id: cust.id, amount_minor_units: 6000000, currency: 'INR', date: '2026-10-10', reason: 'CN3 split' });

  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv1.id, allocated_amount_minor_units: 3000000, reason: 'Split to inv1', allocated_by: 'u1' });
  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv2.id, allocated_amount_minor_units: 3000000, reason: 'Split to inv2', allocated_by: 'u1' });

  const cnBalance = udmStore.getCreditNoteBalance(cn.id);
  assert(cnBalance.allocatedMinorUnits === 6000000, `CN allocated: ${cnBalance.allocatedMinorUnits} (expected 6,000,000)`);
  assert(cnBalance.availableMinorUnits === 0, `CN available: ${cnBalance.availableMinorUnits} (expected 0)`);

  const b1 = getInvoiceSettlementBreakdown(inv1);
  const b2 = getInvoiceSettlementBreakdown(inv2);
  assert(b1.outstandingMinorUnits === 2000000, `Inv1 outstanding: ${b1.outstandingMinorUnits} (expected 2,000,000)`);
  assert(b2.outstandingMinorUnits === 2000000, `Inv2 outstanding: ${b2.outstandingMinorUnits} (expected 2,000,000)`);
  assert(inv1.amount_minor_units === b1.paidMatchedMinorUnits + b1.creditAllocatedMinorUnits + b1.outstandingMinorUnits, 'Invariant 1 holds');
  assert(inv2.amount_minor_units === b2.paidMatchedMinorUnits + b2.creditAllocatedMinorUnits + b2.outstandingMinorUnits, 'Invariant 2 holds');
}

async function testInvariant4() {
  console.log('\n--- Invariant 4: Payment and credit settlement together ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C4', name: 'C4', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV4', customer_id: cust.id, number: 'INV4', amount_minor_units: 10000000, currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  const cn = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN4', customer_id: cust.id, amount_minor_units: 4000000, currency: 'INR', date: '2026-10-10', reason: 'CN4' });
  const pay = udmStore.insertPayment({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'P4', customer_id: cust.id, amount_minor_units: 6000000, currency: 'INR', date: '2026-11-01' });

  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id, allocated_amount_minor_units: 4000000, reason: 'Full credit', allocated_by: 'u1' });
  udmStore.insertMatch({ organization_id: TEST_ORG, payment_id: pay.id, invoice_id: inv.id, matched_amount_minor_units: 6000000, match_method: 'deterministic' });

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 0, `Outstanding: ${breakdown.outstandingMinorUnits} (expected 0)`);
  assert(breakdown.paidMatchedMinorUnits === 6000000, `Cash paid: ${breakdown.paidMatchedMinorUnits} (expected 6,000,000)`);
  assert(breakdown.creditAllocatedMinorUnits === 4000000, `Credit: ${breakdown.creditAllocatedMinorUnits} (expected 4,000,000)`);
  assert(breakdown.isFullySettled, 'Is fully settled');
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant holds');
  // Settlement type should be mixed (cash + credit)
  assert(inv.settlementType === 'mixed_settled', `Settlement type: ${inv.settlementType} (expected mixed_settled)`);
}

async function testInvariant5() {
  console.log('\n--- Invariant 5: Partial payment plus overdue status ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C5', name: 'C5', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV5', customer_id: cust.id, number: 'INV5', amount_minor_units: 10000000, currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-09-01', due_date: '2026-09-30', status: 'open' });

  const pay = udmStore.insertPayment({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'P5', customer_id: cust.id, amount_minor_units: 3000000, currency: 'INR', date: '2026-10-01' });
  udmStore.insertMatch({ organization_id: TEST_ORG, payment_id: pay.id, invoice_id: inv.id, matched_amount_minor_units: 3000000, match_method: 'deterministic' });

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 7000000, `Outstanding: ${breakdown.outstandingMinorUnits} (expected 7,000,000)`);
  assert(breakdown.paidMatchedMinorUnits === 3000000, `Cash paid: ${breakdown.paidMatchedMinorUnits} (expected 3,000,000)`);
  assert(inv.status === 'partially_paid', `Status: ${inv.status} (expected partially_paid)`);
  assert(inv.settlementType === 'cash_paid', `Settlement type: ${inv.settlementType} (expected cash_paid)`);

  // Overdue check: due_date 2026-09-30, today 2026-11-05 → overdue
  const { computeOverdueReceivables } = await import('../src/lib/dashboard/engine');
  const invoices = udmStore.getInvoices();
  const overdue = computeOverdueReceivables(invoices, TEST_ORG, '2026-11-05');
  assert(overdue === 7000000, `Overdue receivables: ${overdue} (expected 7,000,000 for partially paid overdue)`);
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant holds');
}

async function testInvariant6() {
  console.log('\n--- Invariant 6: Partial credit plus overdue status ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C6', name: 'C6', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV6', customer_id: cust.id, number: 'INV6', amount_minor_units: 10000000, currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-09-01', due_date: '2026-09-30', status: 'open' });

  const cn = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN6', customer_id: cust.id, amount_minor_units: 3000000, currency: 'INR', date: '2026-10-10', reason: 'CN6' });
  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id, allocated_amount_minor_units: 3000000, reason: 'Partial credit', allocated_by: 'u1' });

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 7000000, `Outstanding: ${breakdown.outstandingMinorUnits} (expected 7,000,000)`);
  assert(breakdown.creditAllocatedMinorUnits === 3000000, `Credit: ${breakdown.creditAllocatedMinorUnits} (expected 3,000,000)`);
  assert(breakdown.paidMatchedMinorUnits === 0, `Cash paid: ${breakdown.paidMatchedMinorUnits} (expected 0)`);
  assert(inv.status === 'partially_paid', `Status: ${inv.status} (expected partially_paid)`);
  assert(inv.settlementType === 'credit_settled', `Settlement type: ${inv.settlementType} (expected credit_settled)`);

  // Overdue: due_date 2026-09-30, today 2026-11-05 → overdue
  const { computeOverdueReceivables } = await import('../src/lib/dashboard/engine');
  const invoices = udmStore.getInvoices();
  const overdue = computeOverdueReceivables(invoices, TEST_ORG, '2026-11-05');
  assert(overdue === 7000000, `Overdue receivables: ${overdue} (expected 7,000,000 for partially credited overdue)`);
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant holds');
}

async function testInvariant7() {
  console.log('\n--- Invariant 7: Full credit settlement without cash received ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C7', name: 'C7', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV7', customer_id: cust.id, number: 'INV7', amount_minor_units: 5000000, currency: 'INR', tax_amount_minor_units: 900000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  const cn = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN7', customer_id: cust.id, amount_minor_units: 5000000, currency: 'INR', date: '2026-10-10', reason: 'CN7 full' });
  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id, allocated_amount_minor_units: 5000000, reason: 'Full credit settlement', allocated_by: 'u1' });

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 0, `Outstanding: ${breakdown.outstandingMinorUnits} (expected 0)`);
  assert(breakdown.paidMatchedMinorUnits === 0, `Cash paid: ${breakdown.paidMatchedMinorUnits} (expected 0 - NO CASH RECEIVED)`);
  assert(breakdown.creditAllocatedMinorUnits === 5000000, `Credit: ${breakdown.creditAllocatedMinorUnits} (expected 5,000,000)`);
  assert(breakdown.isFullySettled, 'Is fully settled');
  // Status is 'paid' but settlementType distinguishes credit-only
  assert(inv.status === 'paid', `Status: ${inv.status} (expected paid)`);
  assert(inv.settlementType === 'credit_settled', `Settlement type: ${inv.settlementType} (expected credit_settled - NOT cash_paid)`);
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant holds');
}

async function testInvariant8() {
  console.log('\n--- Invariant 8: Reversed allocations restore gross invariant ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C8', name: 'C8', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV8', customer_id: cust.id, number: 'INV8', amount_minor_units: 10000000, currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  const cn = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN8', customer_id: cust.id, amount_minor_units: 4000000, currency: 'INR', date: '2026-10-10', reason: 'CN8' });
  const alloc = udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id, allocated_amount_minor_units: 4000000, reason: 'Full credit', allocated_by: 'u1' });

  // Reverse it
  udmStore.reverseCreditAllocation(alloc.id, 'Test reversal', 'u1');

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 10000000, `Outstanding after reversal: ${breakdown.outstandingMinorUnits} (expected 10,000,000)`);
  assert(breakdown.creditAllocatedMinorUnits === 0, `Credit after reversal: ${breakdown.creditAllocatedMinorUnits} (expected 0)`);
  assert(breakdown.paidMatchedMinorUnits === 0, `Cash after reversal: ${breakdown.paidMatchedMinorUnits} (expected 0)`);
  assert(inv.status === 'open', `Status after reversal: ${inv.status} (expected open)`);
  assert(inv.amount_minor_units === 10000000, `Gross preserved after reversal: ${inv.amount_minor_units}`);
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant holds after reversal');

  // Verify audit trail
  const logs = auditStore.query({ organizationId: TEST_ORG, actionType: 'credit_note.allocation_reversed' });
  assert(logs.length >= 1, 'Audit trail records reversal');
}

async function testInvariant9() {
  console.log('\n--- Invariant 9: Invalid currency combinations rejected ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C9', name: 'C9', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });

  // Try to insert invoice with wrong currency
  expectThrow(() => udmStore.insertInvoice({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV9', customer_id: cust.id, number: 'INV9',
    amount_minor_units: 1000000, currency: 'EUR', tax_amount_minor_units: 180000,
    issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open',
  }), 'does not match organization reporting currency', 'EUR invoice in INR org rejected');

  // Try credit note with wrong currency
  const inv9 = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV9B', customer_id: cust.id, number: 'INV9B', amount_minor_units: 1000000, currency: 'INR', tax_amount_minor_units: 180000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });
  expectThrow(() => udmStore.insertCreditNote({
    organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN9', customer_id: cust.id, amount_minor_units: 1000000, currency: 'EUR', date: '2026-10-10', reason: 'CN9',
  }), 'does not match organization reporting currency', 'EUR credit note in INR org rejected');
}

async function testInvariant10() {
  console.log('\n--- Invariant 10: Legacy records with missing currency ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C10', name: 'C10', credit_limit_minor_units: 100000000, currency: '', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV10', customer_id: cust.id, number: 'INV10', amount_minor_units: 5000000, currency: '', tax_amount_minor_units: 900000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  // Missing currency should be treated as matching reporting currency (permissive for legacy)
  assert(inv.currency === '', 'Legacy invoice with empty currency accepted');
  // Should be included in receivables since empty currency matches reporting currency
  const { computeTotalReceivables } = await import('../src/lib/dashboard/engine');
  const invoices = udmStore.getInvoices();
  const total = computeTotalReceivables(invoices, TEST_ORG);
  assert(total === 5000000, `Legacy invoice included in receivables: ${total} (expected 5,000,000)`);
}

async function testInvariant11() {
  console.log('\n--- Invariant 11: Safe integer boundaries ---');
  await setup();
  // Large but safe amount
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C11', name: 'C11', credit_limit_minor_units: 100000000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV11', customer_id: cust.id, number: 'INV11', amount_minor_units: 50000000000, currency: 'INR', tax_amount_minor_units: 9000000000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });
  assert(inv.amount_minor_units === 50000000000, `Large safe integer amount: ${inv.amount_minor_units}`);

  const cn = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN11', customer_id: cust.id, amount_minor_units: 10000000000, currency: 'INR', date: '2026-10-10', reason: 'CN11' });
  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id, allocated_amount_minor_units: 10000000000, reason: 'Large allocation', allocated_by: 'u1' });

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 40000000000, `Large outstanding: ${breakdown.outstandingMinorUnits} (expected 40,000,000,000)`);
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant holds at scale');
}

async function testInvariant12() {
  console.log('\n--- Invariant 12: Concurrent payment and credit allocations ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C12', name: 'C12', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV12', customer_id: cust.id, number: 'INV12', amount_minor_units: 10000000, currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  const cn = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN12', customer_id: cust.id, amount_minor_units: 4000000, currency: 'INR', date: '2026-10-10', reason: 'CN12' });
  const pay = udmStore.insertPayment({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'P12', customer_id: cust.id, amount_minor_units: 4000000, currency: 'INR', date: '2026-11-01' });

  // Try concurrent: credit allocation of 8M (would exceed outstanding of 10M combined with payment)
  // First, allocate credit of 4M
  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id, allocated_amount_minor_units: 4000000, reason: 'Credit 4M', allocated_by: 'u1' });
  // Then match payment of 6M (should work: outstanding is 6M after credit)
  udmStore.insertMatch({ organization_id: TEST_ORG, payment_id: pay.id, invoice_id: inv.id, matched_amount_minor_units: 6000000, match_method: 'deterministic' });

  const breakdown = getInvoiceSettlementBreakdown(inv);
  assert(breakdown.outstandingMinorUnits === 0, `Outstanding after concurrent: ${breakdown.outstandingMinorUnits} (expected 0)`);
  assert(breakdown.paidMatchedMinorUnits === 6000000, `Cash: ${breakdown.paidMatchedMinorUnits} (expected 6,000,000)`);
  assert(breakdown.creditAllocatedMinorUnits === 4000000, `Credit: ${breakdown.creditAllocatedMinorUnits} (expected 4,000,000)`);
  assert(inv.amount_minor_units === breakdown.paidMatchedMinorUnits + breakdown.creditAllocatedMinorUnits + breakdown.outstandingMinorUnits, 'Invariant holds');

  // Try to add another allocation (should fail - invoice already settled)
  let overAllocFailed = false;
  try {
    udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id, allocated_amount_minor_units: 100000, reason: 'Extra', allocated_by: 'u1' });
  } catch (err) {
    overAllocFailed = true;
  }
  assert(overAllocFailed, 'Over-allocation on fully settled invoice rejected');
}

async function testInvariant13() {
  console.log('\n--- Invariant 13: Gross invoice amount immutability ---');
  await setup();
  const cust = udmStore.insertCustomer({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'C13', name: 'C13', credit_limit_minor_units: 100000000, currency: 'INR', payment_terms_days: 30 });
  const inv = udmStore.insertInvoice({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'INV13', customer_id: cust.id, number: 'INV13', amount_minor_units: 10000000, currency: 'INR', tax_amount_minor_units: 1800000, issue_date: '2026-10-01', due_date: '2026-10-31', status: 'open' });

  const grossBefore = inv.amount_minor_units;

  const cn = udmStore.insertCreditNote({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'CN13', customer_id: cust.id, amount_minor_units: 4000000, currency: 'INR', date: '2026-10-10', reason: 'CN13' });
  udmStore.insertCreditAllocation({ organization_id: TEST_ORG, credit_note_id: cn.id, invoice_id: inv.id, allocated_amount_minor_units: 4000000, reason: 'Partial', allocated_by: 'u1' });

  assert(inv.amount_minor_units === grossBefore, `Gross amount unchanged after allocation: ${inv.amount_minor_units} (expected ${grossBefore})`);

  const pay = udmStore.insertPayment({ organization_id: TEST_ORG, source_system: 'manual', source_id: 'P13', customer_id: cust.id, amount_minor_units: 6000000, currency: 'INR', date: '2026-11-01' });
  udmStore.insertMatch({ organization_id: TEST_ORG, payment_id: pay.id, invoice_id: inv.id, matched_amount_minor_units: 6000000, match_method: 'deterministic' });

  assert(inv.amount_minor_units === grossBefore, `Gross amount unchanged after payment: ${inv.amount_minor_units} (expected ${grossBefore})`);

  // Reverse the credit allocation
  const allocs = udmStore.getCreditAllocations({ status: 'allocated', invoice_id: inv.id });
  if (allocs.length > 0) {
    udmStore.reverseCreditAllocation(allocs[0].id, 'Reversal test', 'u1');
  }

  assert(inv.amount_minor_units === grossBefore, `Gross amount unchanged after reversal: ${inv.amount_minor_units} (expected ${grossBefore})`);
}

async function main() {
  console.log('========================================');
  console.log('FINANCIAL INVARIANT TESTS (Sprint 22 P1.2)');
  console.log('========================================\n');

  await setup();

  await testInvariant1();
  await testInvariant2();
  await testInvariant3();
  await testInvariant4();
  await testInvariant5();
  await testInvariant6();
  await testInvariant7();
  await testInvariant8();
  await testInvariant9();
  await testInvariant10();
  await testInvariant11();
  await testInvariant12();
  await testInvariant13();

  console.log(`\n========================================`);
  console.log(`INVARIANT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
