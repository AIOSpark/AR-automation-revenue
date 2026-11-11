// AIOSpark Credit Note Allocation Restart Durability Test
// Tests credit-note allocation persistence across process restart using file-backed SQLite

import { closeDatabase, readSnapshotDirect } from '../src/lib/db/durable-repository';
import { udmStore } from '../src/lib/udm/store';
import { authStore } from '../src/lib/auth/store';
import { auditStore } from '../src/lib/audit/store';
import { setOrganizationReportingCurrency } from '../src/lib/financial/currency-org';

const DB_PATH = '/tmp/aiospark-credit-durability-test.sqlite';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ ${message}`);
    failed++;
  }
}

function ensureOrg() {
  setOrganizationReportingCurrency('org_credit_durability', 'INR');
  if (!authStore.getOrganizationById('org_credit_durability')) {
    authStore.organizations.set('org_credit_durability', {
      id: 'org_credit_durability',
      name: 'Credit Durability Org',
      size: '50-200',
      industry: 'Fintech',
      created_by_user_id: 'user_credit_durability',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      currency: 'INR',
    });
  }
}

async function runWriterPhase() {
  console.log('\n=== CREDIT ALLOCATION WRITER PHASE ===');
  console.log(`DB_PATH: ${DB_PATH}`);

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';

  ensureOrg();
  udmStore.setTenantContext('org_credit_durability');
  udmStore.clearAll();

  // 1. Create customer
  const cust = udmStore.insertCustomer({
    organization_id: 'org_credit_durability',
    source_system: 'manual',
    source_id: 'CUST_CREDIT_DUR',
    name: 'Credit Durability Customer',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
  });
  console.log(`  Customer: ${cust.id}`);

  // 2. Create invoice for ₹1,00,000 (10,000,000 paise)
  const invoice = udmStore.insertInvoice({
    organization_id: 'org_credit_durability',
    source_system: 'manual',
    source_id: 'INV-CREDIT-DUR-001',
    customer_id: cust.id,
    number: 'INV-CREDIT-DUR-001',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 1800000,
    issue_date: '2026-10-01',
    due_date: '2026-10-31',
    status: 'open',
  });
  console.log(`  Invoice: ${invoice.id}, amount: ₹1,00,000`);

  // 3. Create credit note for ₹40,000 (4,000,000 paise)
  const creditNote = udmStore.insertCreditNote({
    organization_id: 'org_credit_durability',
    source_system: 'manual',
    source_id: 'CN-DUR-001',
    customer_id: cust.id,
    amount_minor_units: 4000000,
    currency: 'INR',
    date: '2026-10-15',
    reason: 'Durability test credit note',
  });
  console.log(`  Credit Note: ${creditNote.id}, amount: ₹40,000`);

  // 4. Allocate ₹25,000 (2,500,000 paise) from credit note to invoice
  const allocation = udmStore.insertCreditAllocation({
    organization_id: 'org_credit_durability',
    credit_note_id: creditNote.id,
    invoice_id: invoice.id,
    allocated_amount_minor_units: 2500000,
    reason: 'Durability test partial allocation',
    allocated_by: 'user_credit_durability',
  });
  console.log(`  Allocation: ${allocation.id}, amount: ₹25,000`);

  // 5. Confirm balances
  const { getInvoiceOutstandingBalance } = await import('../src/lib/dashboard/engine');
  const outstanding = getInvoiceOutstandingBalance(invoice);
  const cnBalance = udmStore.getCreditNoteBalance(creditNote.id);

  console.log(`  Invoice outstanding after allocation: ${outstanding} paise (expected 7,500,000)`);
  console.log(`  Credit note available: ${cnBalance.availableMinorUnits} paise (expected 1,500,000)`);
  console.log(`  Credit note allocated: ${cnBalance.allocatedMinorUnits} paise (expected 2,500,000)`);

  assert(outstanding === 7500000, `Invoice outstanding = ${outstanding} (expected 7,500,000)`);
  assert(cnBalance.availableMinorUnits === 1500000, `Credit note available = ${cnBalance.availableMinorUnits} (expected 1,500,000)`);
  assert(cnBalance.allocatedMinorUnits === 2500000, `Credit note allocated = ${cnBalance.allocatedMinorUnits} (expected 2,500,000)`);

  // Persist snapshot explicitly
  udmStore.persistSnapshot();

  // Close database
  closeDatabase();
  console.log('  Writer database closed.');

  // Write expected values to a file for the reader process
  const fs = await import('node:fs');
  const expected = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    invoiceAmount: invoice.amount_minor_units,
    expectedOutstanding: 7500000,
    creditNoteId: creditNote.id,
    creditNoteAmount: creditNote.amount_minor_units,
    expectedAvailable: 1500000,
    expectedAllocated: 2500000,
    allocationId: allocation.id,
    customerId: cust.id,
    orgId: 'org_credit_durability',
  };

  fs.writeFileSync('/tmp/aiospark-credit-durability-expected.json', JSON.stringify(expected, null, 2));
  console.log('  Expected values written to /tmp/aiospark-credit-durability-expected.json');

  console.log(`\n=== Writer Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runReaderPhase() {
  console.log('\n=== CREDIT ALLOCATION READER PHASE (Independent Process) ===');
  console.log(`DB_PATH: ${DB_PATH}`);

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';

  const fs = await import('node:fs');
  const expected = JSON.parse(fs.readFileSync('/tmp/aiospark-credit-durability-expected.json', 'utf8'));

  // Verify the database file exists
  const dbExists = fs.existsSync(DB_PATH);
  assert(dbExists, 'SQLite database file exists after writer close');

  // Read directly from SQLite (bypasses in-memory state)
  const udmSnapshot = readSnapshotDirect('udm');
  assert(udmSnapshot !== null, 'UDM snapshot readable from SQLite after restart');

  const invoices = udmSnapshot.invoices || [];
  const creditNotes = udmSnapshot.creditNotes || [];
  const creditAllocations = udmSnapshot.creditAllocations || [];

  // Find our invoice
  const recoveredInvoice = invoices.find((inv) => inv.id === expected.invoiceId);
  assert(recoveredInvoice !== undefined, `Invoice ${expected.invoiceId} recovered from SQLite`);
  if (recoveredInvoice) {
    assert(recoveredInvoice.amount_minor_units === expected.invoiceAmount, 'Invoice gross amount preserved after restart');
    assert(recoveredInvoice.organization_id === expected.orgId, 'Invoice org_id preserved after restart');
    console.log(`  Recovered invoice: ${recoveredInvoice.number}, status: ${recoveredInvoice.status}`);
  }

  // Find our credit note
  const recoveredCreditNote = creditNotes.find((cn) => cn.id === expected.creditNoteId);
  assert(recoveredCreditNote !== undefined, `Credit note ${expected.creditNoteId} recovered from SQLite`);
  if (recoveredCreditNote) {
    assert(recoveredCreditNote.amount_minor_units === expected.creditNoteAmount, 'Credit note amount preserved after restart');
    console.log(`  Recovered credit note: ${recoveredCreditNote.source_id}, amount: ₹${recoveredCreditNote.amount_minor_units / 100}`);
  }

  // Find our allocation
  const recoveredAllocation = creditAllocations.find((a) => a.id === expected.allocationId);
  assert(recoveredAllocation !== undefined, `Credit allocation ${expected.allocationId} recovered from SQLite`);
  if (recoveredAllocation) {
    assert(recoveredAllocation.status === 'allocated', 'Allocation status preserved as allocated after restart');
    assert(recoveredAllocation.allocated_amount_minor_units === 2500000, 'Allocation amount preserved after restart');
    console.log(`  Recovered allocation: ₹${recoveredAllocation.allocated_amount_minor_units / 100}, status: ${recoveredAllocation.status}`);
  }

  // Recalculate balances independently
  const matchingAllocations = creditAllocations.filter(
    (a) => a.invoice_id === expected.invoiceId && a.status === 'allocated'
  );
  const recoveredCreditSum = matchingAllocations.reduce((sum, a) => sum + a.allocated_amount_minor_units, 0);
  assert(recoveredCreditSum === expected.expectedAllocated, `Recovered credit sum: ${recoveredCreditSum} (expected ${expected.expectedAllocated})`);

  const recalculatedOutstanding = expected.invoiceAmount - recoveredCreditSum;
  assert(recalculatedOutstanding === expected.expectedOutstanding, `Recalculated outstanding: ${recalculatedOutstanding} (expected ${expected.expectedOutstanding})`);

  const recoveredCnAllocations = creditAllocations.filter(
    (a) => a.credit_note_id === expected.creditNoteId && a.status === 'allocated'
  );
  const recoveredCnAllocated = recoveredCnAllocations.reduce((sum, a) => sum + a.allocated_amount_minor_units, 0);
  const recoveredCnAvailable = expected.creditNoteAmount - recoveredCnAllocated;

  assert(recoveredCnAvailable === expected.expectedAvailable, `Recovered credit note available: ${recoveredCnAvailable} (expected ${expected.expectedAvailable})`);
  assert(recoveredCnAllocated === expected.expectedAllocated, `Recovered credit note allocated: ${recoveredCnAllocated} (expected ${expected.expectedAllocated})`);

  console.log(`  Independent recalculation: Invoice outstanding = ₹${recalculatedOutstanding / 100}, Credit note available = ₹${recoveredCnAvailable / 100}`);

  closeDatabase();
  console.log('  Reader database closed.');

  console.log(`\n=== Reader Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runReversalPhase() {
  console.log('\n=== CREDIT ALLOCATION REVERSAL PHASE ===');

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';

  ensureOrg();
  udmStore.setTenantContext('org_credit_durability');

  const fs = await import('node:fs');
  const expected = JSON.parse(fs.readFileSync('/tmp/aiospark-credit-durability-expected.json', 'utf8'));

  // Find the allocation
  const allAllocs = udmStore.getCreditAllocations();
  const allocation = allAllocs.find((a) => a.id === expected.allocationId);
  assert(allocation !== undefined, `Found allocation ${expected.allocationId} in memory store`);
  assert(allocation.status === 'allocated', 'Allocation status is allocated before reversal');

  // Reverse the allocation
  const reversed = udmStore.reverseCreditAllocation(
    allocation.id,
    'Durability test reversal after restart recovery',
    'user_credit_durability'
  );

  assert(reversed.status === 'reversed', 'Allocation status reversed');
  assert(reversed.reversal_reason === 'Durability test reversal after restart recovery', 'Reversal reason recorded');

  // Verify invoice balance restored
  const { getInvoiceOutstandingBalance } = await import('../src/lib/dashboard/engine');
  const recoveredInvoices = udmStore.getInvoices();
  const recoveredInv = recoveredInvoices.find((inv) => inv.id === expected.invoiceId);
  assert(recoveredInv !== undefined, 'Invoice found after reversal');
  if (recoveredInv) {
    const outstandingAfterRev = getInvoiceOutstandingBalance(recoveredInv);
    assert(outstandingAfterRev === 10000000, `Invoice outstanding restored to ₹1,00,000 after reversal (got ${outstandingAfterRev})`);
    assert(recoveredInv.status === 'open', `Invoice status restored to 'open' after reversal (got ${recoveredInv.status})`);
    console.log(`  After reversal: Invoice outstanding = ₹${outstandingAfterRev / 100}, status = ${recoveredInv.status}`);
  }

  // Verify credit note balance restored
  const cnBalanceAfterRev = udmStore.getCreditNoteBalance(expected.creditNoteId);
  assert(cnBalanceAfterRev.availableMinorUnits === 4000000, `Credit note available restored to ₹40,000 (got ${cnBalanceAfterRev.availableMinorUnits})`);
  assert(cnBalanceAfterRev.allocatedMinorUnits === 0, `Credit note allocated = 0 after reversal (got ${cnBalanceAfterRev.allocatedMinorUnits})`);
  console.log(`  After reversal: Credit note available = ₹${cnBalanceAfterRev.availableMinorUnits / 100}, allocated = ₹${cnBalanceAfterRev.allocatedMinorUnits / 100}`);

  // Verify audit trail
  const auditLogs = auditStore.query({
    organizationId: 'org_credit_durability',
    actionType: 'credit_note.allocation_reversed',
  });
  assert(auditLogs.length >= 1, 'Audit trail recorded credit allocation reversal after restart');
  if (auditLogs.length >= 1) {
    const reversalLog = auditLogs[auditLogs.length - 1];
    assert(reversalLog.after_state.status === 'reversed', 'Audit log records reversal status');
    console.log(`  Audit log: ${reversalLog.action_type} at ${reversalLog.created_at}`);
  }

  // Persist and close
  udmStore.persistSnapshot();
  closeDatabase();
  console.log('  Reversal phase complete, database closed.');

  console.log(`\n=== Reversal Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function runFinalVerificationPhase() {
  console.log('\n=== FINAL VERIFICATION PHASE (Second Restart) ===');

  process.env.AIOSPARK_DB_PATH = DB_PATH;
  process.env.AIOSPARK_TEST_MODE = 'false';

  const udmSnapshot = readSnapshotDirect('udm');
  assert(udmSnapshot !== null, 'UDM snapshot readable after second restart');

  const creditAllocations = udmSnapshot.creditAllocations || [];
  const reversedAlloc = creditAllocations.find((a) => a.status === 'reversed');
  assert(reversedAlloc !== undefined, 'Reversed allocation persisted in SQLite after second restart');
  if (reversedAlloc) {
    assert(reversedAlloc.reversal_reason === 'Durability test reversal after restart recovery', 'Reversal reason persisted');
    console.log(`  Reversed allocation found in SQLite: reason = "${reversedAlloc.reversal_reason}"`);
  }

  const invoices = udmSnapshot.invoices || [];
  const invByNumber = invoices.find((inv) => inv.number === 'INV-CREDIT-DUR-001');
  assert(invByNumber !== undefined, 'Invoice found by number after second restart');
  if (invByNumber) {
    assert(invByNumber.status === 'open', `Invoice status is 'open' after full cycle (got ${invByNumber.status})`);
    console.log(`  Invoice ${invByNumber.number}: status = ${invByNumber.status}, amount = ₹${invByNumber.amount_minor_units / 100}`);
  }

  const creditNotes = udmSnapshot.creditNotes || [];
  const cn = creditNotes.find((c) => c.source_id === 'CN-DUR-001');
  assert(cn !== undefined, 'Credit note found after second restart');
  if (cn) {
    console.log(`  Credit note ${cn.source_id}: amount = ₹${cn.amount_minor_units / 100}`);
  }

  closeDatabase();

  console.log(`\n=== Final Verification Phase: ${passed} PASSED, ${failed} FAILED ===`);
  process.exit(failed > 0 ? 1 : 0);
}

async function main() {
  const phase = process.argv[2] || 'writer';

  try {
    if (phase === 'writer') {
      await runWriterPhase();
    } else if (phase === 'reader') {
      await runReaderPhase();
    } else if (phase === 'reversal') {
      await runReversalPhase();
    } else if (phase === 'final') {
      await runFinalVerificationPhase();
    } else {
      console.error('Unknown phase. Use: writer | reader | reversal | final');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Phase ${phase} error:`, err);
    process.exit(1);
  }
}

main();
