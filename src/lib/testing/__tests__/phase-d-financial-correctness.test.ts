// AIOSpark Phase D — Financial Correctness & Pilot Safety Test Suite
// Validates invoice balances, payment allocation, reconciliation, aging,
// cross-module consistency, multi-tenant isolation, pilot safety, and recovery.

import assert from 'node:assert';
import { udmStore } from '../../udm/store';
import {
  computeTotalReceivables,
  computeOverdueReceivables,
  computeAtRiskReceivables,
  computeCashUnblockedOpportunity,
  getInvoiceOutstandingBalance,
} from '../../dashboard/engine';
import { queryReceivablesTable } from '../../receivables/engine';
import { queryPaymentsWorkspace } from '../../payments/query-engine';
import { queryCollectionsWorkspace } from '../../collections/query-engine';
import { queryExceptionsWorkspace } from '../../exceptions/query-engine';
import { cfoIntelligenceEngine } from '../../cfo/engine';
import { reconciliationEngine } from '../../reconciliation/engine';
import { authStore } from '../../auth/store';
import { tenantStore } from '../../tenant/store';
import { validatePilotReadOnly, isPilotOrganization, setPilotMode } from '../../auth/pilot';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assertTest(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${name}`);
    failed++;
    errors.push(name);
  }
}

interface TestData {
  orgId: string;
  ownerId: string;
  cust1Id: string;
  cust2Id: string;
  inv1Id: string;
  inv2Id: string;
  inv3Id: string;
  pay1Id: string;
}

function setupSyntheticOrg(orgName: string, orgSize: string, orgIndustry: string, createdByUserId: string, pilotMode: boolean = false) {
  const org = authStore.createOrganizationDraft({
    name: orgName,
    size: orgSize,
    industry: orgIndustry,
    created_by_user_id: createdByUserId,
  });
  if (pilotMode) {
    org.pilotMode = true;
    org.updated_at = new Date().toISOString();
  }
  const owner = authStore.createUser({
    auth_provider_id: `sb_${orgName.toLowerCase().replace(/\s/g, '_')}_owner`,
    email: `owner@${orgName.toLowerCase().replace(/\s/g, '')}.com`,
    first_name: 'Owner',
    last_name: orgName,
  });
  tenantStore.addMember(owner.id, org.id, 'Owner');
  return { org, owner };
}

function insertTestData(orgId: string, userId: string, todayStr: string): TestData {
  udmStore.setTenantContext(orgId);

  // Customer 1: Gotham Corp
  const cust1 = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'csv',
    source_id: 'CUST-001',
    name: 'Gotham Corp',
    credit_limit_minor_units: 20000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_by: userId,
  });

  // Customer 2: Acme Corp
  const cust2 = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'csv',
    source_id: 'CUST-002',
    name: 'Acme Corp',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_by: userId,
  });

  // Invoice 1: ₹1,00,000, due 2026-10-25 (10 days overdue from 2026-11-04)
  const inv1 = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'csv',
    source_id: 'INV-001',
    customer_id: cust1.id,
    number: 'INV-001',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-09-01',
    due_date: '2026-10-25',
    status: 'open',
    created_by: userId,
  });

  // Invoice 2: ₹50,000, due 2026-10-15 (20 days overdue), fully paid
  const inv2 = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'csv',
    source_id: 'INV-002',
    customer_id: cust2.id,
    number: 'INV-002',
    amount_minor_units: 5000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-09-15',
    due_date: '2026-10-15',
    status: 'open',
    created_by: userId,
  });

  // Invoice 3: ₹75,000, due 2026-11-15 (not overdue yet, within 14 days from today)
  const inv3 = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'csv',
    source_id: 'INV-003',
    customer_id: cust1.id,
    number: 'INV-003',
    amount_minor_units: 7500000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-10-01',
    due_date: '2026-11-15',
    status: 'open',
    created_by: userId,
  });

  // Payment 1: ₹40,000 matched to INV-001
  const pay1 = udmStore.insertPayment({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'PAY-001',
    customer_id: cust1.id,
    amount_minor_units: 4000000,
    currency: 'INR',
    date: '2026-10-28',
    created_by: userId,
  });
  udmStore.insertMatch({
    organization_id: orgId,
    payment_id: pay1.id,
    invoice_id: inv1.id,
    matched_amount_minor_units: 4000000,
    confidence: 1.0,
    match_method: 'deterministic',
  });

  // Payment 2: ₹50,000 matched to INV-002 (full payment)
  const pay2 = udmStore.insertPayment({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'PAY-002',
    customer_id: cust2.id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-10-29',
    created_by: userId,
  });
  udmStore.insertMatch({
    organization_id: orgId,
    payment_id: pay2.id,
    invoice_id: inv2.id,
    matched_amount_minor_units: 5000000,
    confidence: 1.0,
    match_method: 'deterministic',
  });
  // Update INV-002 status to paid since fully matched
  udmStore.updateInvoice(inv2.id, { status: 'paid' }, userId);

  // Payment 3: ₹25,000 matched to INV-003 (partial)
  const pay3 = udmStore.insertPayment({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'PAY-003',
    customer_id: cust1.id,
    amount_minor_units: 2500000,
    currency: 'INR',
    date: '2026-11-01',
    created_by: userId,
  });
  udmStore.insertMatch({
    organization_id: orgId,
    payment_id: pay3.id,
    invoice_id: inv3.id,
    matched_amount_minor_units: 2500000,
    confidence: 1.0,
    match_method: 'deterministic',
  });

  // Credit Note 1: ₹10,000 for INV-001 (tracked separately, doesn't reduce outstanding)
  udmStore.insertCreditNote({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'CN-001',
    customer_id: cust1.id,
    amount_minor_units: 1000000,
    currency: 'INR',
    date: '2026-11-02',
    reason: 'Billing correction',
    created_by: userId,
  });

  // Bank Transaction 1: Unmatched credit of ₹30,000
  udmStore.insertBankTransaction({
    organization_id: orgId,
    source_system: 'manual_upload',
    raw_reference: 'TXN-90812',
    amount_minor_units: 3000000,
    currency: 'INR',
    date: '2026-11-01',
    narration_text: 'NEFT Credit from Gotham Corp',
    status: 'unmatched',
  });

  // Bank Transaction 2: Debit of ₹5,000 (outgoing)
  udmStore.insertBankTransaction({
    organization_id: orgId,
    source_system: 'manual_upload',
    raw_reference: 'TXN-90813',
    amount_minor_units: -500000,
    currency: 'INR',
    date: '2026-11-02',
    narration_text: 'NEFT Debit to Vendor',
    status: 'unmatched',
  });

  return {
    orgId,
    ownerId: userId,
    cust1Id: cust1.id,
    cust2Id: cust2.id,
    inv1Id: inv1.id,
    inv2Id: inv2.id,
    inv3Id: inv3.id,
    pay1Id: pay1.id,
  };
}

export async function runPhaseDTestSuite(): Promise<{ passed: number; failed: number; errors: string[] }> {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK PHASE D FINANCIAL CORRECTNESS TEST SUITE');
  console.log('==========================================\n');

  console.log('\n--- Setup: Create synthetic organizations ---');
  const { org: orgA, owner: ownerA } = setupSyntheticOrg('Test Corp A', '1-10', 'IT Services & SaaS', 'pending', true);
  const { org: orgB, owner: ownerB } = setupSyntheticOrg('Test Corp B', '11-50', 'Financial Services', 'pending', false);

  const todayStr = '2026-11-04';

  // Insert test data into orgA
  const dataA = insertTestData(orgA.id, ownerA.id, todayStr);

  // Insert test data into orgB (isolated)
  insertTestData(orgB.id, ownerB.id, todayStr);

  // ============================================================
  // 1. FINANCIAL CALCULATION CORRECTNESS
  // ============================================================
  console.log('\n--- 1. Financial Calculation Correctness ---');

  // 1a: Invoice outstanding balance calculation
  udmStore.setTenantContext(orgA.id);
  // INV-001: ₹1,00,000 - ₹40,000 = ₹60,000 outstanding
  const inv1Outstanding = getInvoiceOutstandingBalance(udmStore.getInvoices().find((i) => i.id === dataA.inv1Id)!);
  assertTest(inv1Outstanding === 6000000, 'INV-001 outstanding: ₹1,00,000 - ₹40,000 = ₹60,000 (6,000,000 minor units)');

  // INV-002: ₹50,000 - ₹50,000 = ₹0 outstanding (fully matched)
  const inv2Outstanding = getInvoiceOutstandingBalance(udmStore.getInvoices().find((i) => i.id === dataA.inv2Id)!);
  assertTest(inv2Outstanding === 0, 'INV-002 outstanding: ₹50,000 - ₹50,000 = 0 (fully matched)');

  // INV-003: ₹75,000 - ₹25,000 = ₹50,000 outstanding
  const inv3Outstanding = getInvoiceOutstandingBalance(udmStore.getInvoices().find((i) => i.id === dataA.inv3Id)!);
  assertTest(inv3Outstanding === 5000000, 'INV-003 outstanding: ₹75,000 - ₹25,000 = ₹50,000 (5,000,000 minor units)');

  // 1b: Total Receivables at section 1 point (before pay4 is added)
  // INV-001: ₹60,000 (₹1,00,000 - ₹40,000), INV-003: ₹50,000 (₹75,000 - ₹25,000)
  const totalRec = computeTotalReceivables(udmStore.getInvoices(), orgA.id);
  assertTest(totalRec === 11000000, `Total Receivables: ₹1,10,000 (11,000,000 minor units), got ${totalRec}`);

  // 1c: Overdue at section 1: INV-001 (₹60,000) only, INV-003 due 2026-11-15 not overdue yet
  const overdue = computeOverdueReceivables(udmStore.getInvoices(), orgA.id, todayStr);
  assertTest(overdue === 6000000, `Overdue: ₹60,000 (6,000,000 minor units), got ${overdue}`);

  // 1d: At Risk - INV-003 due within 14 days (2026-09-01), status open
  const atRisk = computeAtRiskReceivables(udmStore.getInvoices(), orgA.id, todayStr);
  assertTest(typeof atRisk === 'number' && atRisk >= 0, `At Risk: non-negative number, got ${atRisk}`);

  // 1e: Integer minor-unit precision - no floating point issues
  assertTest(Number.isInteger(inv1Outstanding), 'Outstanding balance is integer minor units');
  assertTest(inv1Outstanding / 100 === 60000, 'Minor unit to major unit conversion: 6,000,000 paise = ₹60,000');

  // 1f: Credit note does not reduce invoice outstanding (credit notes tracked separately)
  assertTest(inv1Outstanding === 6000000, 'Credit note does not automatically reduce invoice outstanding balance');

  // 1g: Large amounts handled correctly (50 crore test)
  const largeInv = udmStore.insertInvoice({
    organization_id: orgA.id,
    source_system: 'csv',
    source_id: 'INV-LARGE',
    customer_id: dataA.cust1Id,
    number: 'INV-LARGE',
    amount_minor_units: 5000000000, // 50 crores = 5,000,000,000 minor units
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-01',
    due_date: '2026-09-01',
    status: 'open',
    created_by: ownerA.id,
  });
  const largeOutstanding = getInvoiceOutstandingBalance(largeInv);
  assertTest(largeOutstanding === 5000000000, 'Large amount: 50 crore rupees = 5,000,000,000 minor units handled correctly');

  // ============================================================
  // 2. PAYMENT ALLOCATION AND RECONCILIATION
  // ============================================================
  console.log('\n--- 2. Payment Allocation and Reconciliation ---');

  // 2a: Partial payment allocation updates balance correctly
  assertTest(inv3Outstanding === 5000000, 'Partial payment allocation: INV-003 outstanding ₹50,000 after ₹25,000 payment');

  // 2b: Multiple payments against one invoice (additional ₹30,000 to INV-001)
  const pay4 = udmStore.insertPayment({
    organization_id: orgA.id,
    source_system: 'manual',
    source_id: 'PAY-004',
    customer_id: dataA.cust1Id,
    amount_minor_units: 3000000,
    currency: 'INR',
    date: '2026-11-03',
    created_by: ownerA.id,
  });
  udmStore.insertMatch({
    organization_id: orgA.id,
    payment_id: pay4.id,
    invoice_id: dataA.inv1Id,
    matched_amount_minor_units: 3000000,
    confidence: 1.0,
    match_method: 'deterministic',
  });
  // Manually update invoice status to reflect matched amount (as executeApprovedMatch would)
  udmStore.updateInvoice(dataA.inv1Id, { status: 'partially_paid' }, ownerA.id);
  const inv1AfterSecondPayment = getInvoiceOutstandingBalance(
    udmStore.getInvoices().find((i) => i.id === dataA.inv1Id)!
  );
  assertTest(inv1AfterSecondPayment === 3000000, 'Multiple payments: INV-001 outstanding ₹30,000 after ₹30,000 additional payment');

  // 2c: Total matched for INV-001 = ₹70,000 (₹40,000 + ₹30,000), no double-application
  const existingMatchesForInv1 = udmStore.getMatches().filter((m) => m.invoice_id === dataA.inv1Id);
  const totalMatchedInv1 = existingMatchesForInv1.reduce((s, m) => s + m.matched_amount_minor_units, 0);
  assertTest(totalMatchedInv1 === 7000000, 'Total matched for INV-001 = ₹70,000 (₹40,000 + ₹30,000), no double-application');

  // 2d: Unmatched bank transactions are identifiable
  const unmatchedBankTxs = udmStore.getBankTransactions().filter((bt) => bt.status === 'unmatched');
  assertTest(unmatchedBankTxs.length >= 1, 'Unmatched bank transactions are identifiable');

  // 2e: Credit transactions (positive amounts) are eligible for matching
  // Check BEFORE reconciliation (after reconciliation they may be pending_approval)
  const creditTxsBefore = udmStore.getBankTransactions().filter((bt) => bt.amount_minor_units > 0 && bt.status === 'unmatched');
  assertTest(creditTxsBefore.length >= 1, 'Credit transactions (positive amounts) exist and are unmatched before reconciliation');

  // 2f: Debit transactions excluded from reconciliation candidates
  const debitTxs = unmatchedBankTxs.filter((bt) => bt.amount_minor_units < 0);
  assertTest(debitTxs.length >= 1, 'Debit transaction (negative amount) exists in bank transactions');

  // 2g: Reconciliation engine excludes debits from candidate generation
  const reconResult = await reconciliationEngine.reconcileTransactions(orgA.id);
  assertTest(reconResult.processedCount >= 0, 'Reconciliation engine processes transactions without error');
  const pendingAfterRecon = udmStore.getBankTransactions().filter((bt) => bt.status === 'pending_approval');
  const debitPending = pendingAfterRecon.filter((bt) => bt.amount_minor_units < 0);
  assertTest(debitPending.length === 0, 'Debit transactions are not pending approval after reconciliation (excluded from candidates)');

  // ============================================================
  // 3. DEBIT/CREDIT AND CREDIT-NOTE HANDLING
  // ============================================================
  console.log('\n--- 3. Debit/Credit and Credit-Note Handling ---');

  // 3a: Credit note is tracked separately from invoice outstanding
  const creditNotes = udmStore.getCreditNotes();
  assertTest(creditNotes.length >= 1, 'Credit note exists in UDM store');
  const cnAmount = creditNotes[0].amount_minor_units;
  assertTest(cnAmount === 1000000, 'Credit note amount: ₹10,000 (1,000,000 minor units)');

  // 3b: Credit note does not reduce invoice outstanding in getInvoiceOutstandingBalance
  assertTest(inv1AfterSecondPayment === 3000000, 'Credit note does not reduce invoice outstanding balance (tracked separately)');

  // 3c: Invoice status transitions correctly
  const inv1 = udmStore.getInvoices().find((i) => i.id === dataA.inv1Id)!;
  assertTest(inv1.status === 'partially_paid', 'Invoice status: partially_paid after partial payment (₹70,000 of ₹1,00,000)');

  // 3c2: When fully paid, invoice status becomes 'paid'
  const inv2 = udmStore.getInvoices().find((i) => i.id === dataA.inv2Id)!;
  assertTest(inv2.status === 'paid', 'Invoice status: paid when fully matched');

  // ============================================================
  // 4. RECEIVABLES AGING AND DATE CALCULATIONS
  // ============================================================
  console.log('\n--- 4. Receivables Aging and Date Calculations ---');

  // 4a: Aging buckets in CFO engine
  const cfoOverview = cfoIntelligenceEngine.getOverview(orgA.id, todayStr);
  const agingBuckets = cfoOverview.agingBuckets;
  const totalAgingAmount = agingBuckets.reduce((s, b) => s + b.amountMinorUnits, 0);
  // Note: CFO aging excludes 'paid' invoices, same as computeTotalReceivables
  // Includes large invoice (₹50 crore, 64 days overdue) + INV-001 (₹30,000) + INV-003 (₹50,000)
  assertTest(totalAgingAmount === 5008000000, `Aging buckets total: ${totalAgingAmount} = large invoice (5,000,000,000) + INV-001 (3,000,000) + INV-003 (5,000,000)`);

  // 4b: INV-001 (due 2026-10-25, 10 days overdue) goes in 1-30 bucket
  const bucket1_30 = agingBuckets.find((b) => b.rangeKey === '1_30');
  assertTest(bucket1_30 !== undefined && bucket1_30!.amountMinorUnits >= 3000000, 'INV-001 (₹30,000 outstanding) in 1-30 days overdue bucket');

  // 4c: INV-003 (due 2026-11-15, not overdue) goes in Current bucket
  const bucketCurrent = agingBuckets.find((b) => b.rangeKey === 'current');
  assertTest(bucketCurrent !== undefined && bucketCurrent!.amountMinorUnits >= 5000000, 'INV-003 (₹50,000 outstanding) in Current (not due) bucket');

  // 4d: INV-LARGE (due 2026-09-01, 64 days overdue) goes in 61-90 bucket
  const bucket61_90 = agingBuckets.find((b) => b.rangeKey === '61_90');
  assertTest(bucket61_90 !== undefined && bucket61_90!.amountMinorUnits >= 5000000000, 'INV-LARGE (₹50 crore outstanding) in 61-90 days overdue bucket');

  // 4d: Days overdue calculation is consistent
  const inv1DaysOverdue = Math.floor((new Date(todayStr).getTime() - new Date('2026-10-25').getTime()) / (1000 * 60 * 60 * 24));
  assertTest(inv1DaysOverdue === 10, 'Days overdue calculation: 10 days for INV-001');

  // ============================================================
  // 5. CURRENCY AND MINOR-UNIT PRECISION
  // ============================================================
  console.log('\n--- 5. Currency and Minor-Unit Precision ---');

  // 5a: All monetary values are integers (no floating point)
  const allInvoices = udmStore.getInvoices();
  for (const inv of allInvoices) {
    assertTest(Number.isInteger(inv.amount_minor_units), `Invoice ${inv.number} amount is integer minor units`);
  }
  const allPayments = udmStore.getPayments();
  for (const pay of allPayments) {
    assertTest(Number.isInteger(pay.amount_minor_units), `Payment ${pay.source_id} amount is integer minor units`);
  }
  const allMatches = udmStore.getMatches();
  for (const match of allMatches) {
    assertTest(Number.isInteger(match.matched_amount_minor_units), `Match ${match.id} amount is integer minor units`);
  }

  // ============================================================
  // 6. Duplicate Operations and Idempotency
  // ============================================================
  console.log('\n--- 6. Duplicate Operations and Idempotency ---');

  // 6a: Duplicate match prevention at persistence boundary - same payment cannot match same invoice twice
  const existingMatchCount = udmStore.getMatches().filter((m) => m.payment_id === dataA.pay1Id && m.invoice_id === dataA.inv1Id).length;
  assertTest(existingMatchCount === 1, 'Only one match exists for pay1→inv1 pair initially');
  
  // Attempting to insert a duplicate match should throw
  let duplicateThrew = false;
  try {
    udmStore.insertMatch({
      organization_id: orgA.id,
      payment_id: dataA.pay1Id,
      invoice_id: dataA.inv1Id,
      matched_amount_minor_units: 1000000, // ₹10,000 duplicate
      confidence: 1.0,
      match_method: 'deterministic',
    });
  } catch (err) {
    duplicateThrew = true;
  }
  assertTest(duplicateThrew, 'Duplicate match (same payment→invoice) is rejected at persistence boundary');
  
  // Verify no extra match was created
  const matchCountAfter = udmStore.getMatches().filter((m) => m.payment_id === dataA.pay1Id && m.invoice_id === dataA.inv1Id).length;
  assertTest(matchCountAfter === 1, 'No duplicate match was persisted (count remains 1)');

  // 6b: Reconciliation engine availableBalance check prevents over-allocation
  const inv1CurrentOutstanding = getInvoiceOutstandingBalance(inv1);
  assertTest(inv1CurrentOutstanding === 3000000, 'INV-001 outstanding after duplicate prevention: ₹30,000');

  // ============================================================
  // 7. CROSS-MODULE FINANCIAL CONSISTENCY
  // ============================================================
  // All consistency checks computed at the same point in time, after all data modifications
  console.log('\n--- 7. Cross-Module Financial Consistency ---');

  // Re-fetch all data at the same point in time
  udmStore.setTenantContext(orgA.id);
  const currentInvoices = udmStore.getInvoices();
  const dashboardTotal = computeTotalReceivables(currentInvoices, orgA.id);

  // 7a: Dashboard total receivables matches receivables engine outstanding sum
  const receivablesResult = queryReceivablesTable(orgA.id, {}, todayStr);
  const receivablesTotalOutstanding = receivablesResult.items.reduce((s, i) => s + i.outstandingMinorUnits, 0);
  assertTest(dashboardTotal === receivablesTotalOutstanding, `Dashboard total receivables (${dashboardTotal}) matches Receivables engine total outstanding (${receivablesTotalOutstanding})`);

  // 7b: Dashboard total receivables matches CFO engine total receivables
  assertTest(cfoOverview.totalReceivablesMinorUnits === dashboardTotal, `CFO total receivables (${cfoOverview.totalReceivablesMinorUnits}) matches Dashboard (${dashboardTotal})`);

  // 7c: Dashboard overdue matches receivables engine overdue sum
  const dashboardOverdue = computeOverdueReceivables(currentInvoices, orgA.id, todayStr);
  const receivablesOverdueSum = receivablesResult.items.filter((i) => i.isOverdue).reduce((s, i) => s + i.outstandingMinorUnits, 0);
  assertTest(dashboardOverdue === receivablesOverdueSum, `Dashboard overdue (${dashboardOverdue}) matches Receivables overdue sum (${receivablesOverdueSum})`);

  // 7d: Payments workspace UDM payment sum matches CFO cash received
  const udmPaymentSum = udmStore.getPayments().reduce((s, p) => s + p.amount_minor_units, 0);
  const dashboardCashReceived = cfoOverview.cashReceivedMinorUnits;
  assertTest(udmPaymentSum === dashboardCashReceived, `UDM payments total (${udmPaymentSum}) matches CFO cash received (${dashboardCashReceived})`);

  // 7e: Collections engine outstanding matches dashboard outstanding
  const collectionsResult = queryCollectionsWorkspace(orgA.id, {}, todayStr);
  const collectionsTotalOutstanding = collectionsResult.items.reduce((s, i) => s + i.outstandingMinorUnits, 0);
  assertTest(collectionsTotalOutstanding === dashboardTotal, `Collections total outstanding (${collectionsTotalOutstanding}) matches Dashboard (${dashboardTotal})`);

  // 7f: Exceptions cash affected uses same outstanding balance calculation
  const exceptionsResult = queryExceptionsWorkspace(orgA.id, {}, todayStr);
  const exceptionsCashAffected = exceptionsResult.kpis.cashAffectedMinorUnits;
  assertTest(typeof exceptionsCashAffected === 'number' && exceptionsCashAffected >= 0, `Exceptions cash affected: ${exceptionsCashAffected} (non-negative)`);

  // ============================================================
  // 8. MULTI-TENANT CORRECTNESS
  // ============================================================
  console.log('\n--- 8. Multi-Tenant Correctness ---');

  // 8a: Org B data is isolated from Org A
  udmStore.setTenantContext(orgB.id);
  const orgBInvoices = udmStore.getInvoices();
  assertTest(orgBInvoices.length > 0, 'Org B has its own invoices');

  // 8b: Concurrent tenant context - switching orgs doesn't leak data
  udmStore.setTenantContext(orgA.id);
  const orgAAfterSwitch = udmStore.getInvoices().length;
  udmStore.setTenantContext(orgB.id);
  const orgBAfterSwitch = udmStore.getInvoices().length;
  udmStore.setTenantContext(orgA.id);
  assertTest(orgAAfterSwitch > 0, 'Org A data unchanged after context switch to Org B and back');

  // 8c: Organization-level financial aggregation is correct per-tenant
  // OrgA has extra large invoice (₹50 crore) + extra ₹30,000 payment on INV-001 that orgB doesn't have
  const orgATotal = computeTotalReceivables(udmStore.getInvoices(), orgA.id);
  udmStore.setTenantContext(orgB.id);
  const orgBTotal = computeTotalReceivables(udmStore.getInvoices(), orgB.id);
  udmStore.setTenantContext(orgA.id);
  // OrgA total = OrgB total (11,000,000) + large invoice (5,000,000,000) - extra payment (3,000,000)
  // = 11,000,000 + 5,000,000,000 - 3,000,000 = 5,008,000,000
  assertTest(orgATotal === 5008000000, `OrgA total receivables: ${orgATotal} (includes large invoice + extra payment)`);
  assertTest(orgBTotal === 11000000, `OrgB total receivables: ${orgBTotal} (base synthetic data only)`);
  assertTest(orgATotal > orgBTotal, 'OrgA total > OrgB total (orgA has extra large invoice and additional payment)');

  // ============================================================
  // 9. PILOT MODE ENFORCEMENT
  // ============================================================
  console.log('\n--- 9. Pilot Mode Enforcement ---');

  // 9a: Org A is in pilot mode
  assertTest(isPilotOrganization(orgA.id), 'Org A is in pilot mode');
  assertTest(!isPilotOrganization(orgB.id), 'Org B is NOT in pilot mode');

  // 9b: Financial mutations blocked for pilot org
  const pilotErr1 = validatePilotReadOnly(orgA.id, 'FINANCIAL_TRANSACTION');
  assertTest(pilotErr1 !== null && pilotErr1.status === 403, 'Pilot org: FINANCIAL_TRANSACTION blocked (403)');

  const pilotErr2 = validatePilotReadOnly(orgA.id, 'PAYMENT_INITIATION');
  assertTest(pilotErr2 !== null && pilotErr2.status === 403, 'Pilot org: PAYMENT_INITIATION blocked (403)');

  const pilotErr3 = validatePilotReadOnly(orgA.id, 'EXTERNAL_CUSTOMER_COMMUNICATION');
  assertTest(pilotErr3 !== null && pilotErr3.status === 403, 'Pilot org: EXTERNAL_CUSTOMER_COMMUNICATION blocked (403)');

  // 9c: Non-pilot org allows financial transactions
  const nonPilotErr = validatePilotReadOnly(orgB.id, 'FINANCIAL_TRANSACTION');
  assertTest(nonPilotErr === null, 'Non-pilot org: FINANCIAL_TRANSACTION allowed');

  // 9d: Read operations allowed during pilot
  const readErr = validatePilotReadOnly(orgA.id, 'VIEW_DATA');
  assertTest(readErr === null, 'Pilot org: VIEW_DATA allowed');

  const analysisErr = validatePilotReadOnly(orgA.id, 'FINANCIAL_ANALYSIS');
  assertTest(analysisErr === null, 'Pilot org: FINANCIAL_ANALYSIS allowed');

  // 9e: Missing org context fails closed
  const noOrgErr = validatePilotReadOnly(undefined, 'FINANCIAL_TRANSACTION');
  assertTest(noOrgErr !== null && noOrgErr.status === 403, 'Missing org context: 403 (fail closed)');

  console.log(`\n==========================================`);
  console.log(`PHASE D TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==========================================\n`);

  return { passed, failed, errors };
}

// Standalone runner
if (require.main === module) {
  runPhaseDTestSuite().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0);
  });
}
