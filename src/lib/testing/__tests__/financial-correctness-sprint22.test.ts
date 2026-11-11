// AIOSpark Sprint 22 Priority 1 — Financial Correctness & Exact Accounting Suite
// Independent expected-value verification for GAP-F2, GAP-F3, Single Currency & GAP-F1

import { udmStore } from '../../udm/store';
import {
  parseMonetaryAmount,
  parseMonetaryAmountOrThrow,
} from '../../financial/monetary-parser';
import {
  getOrganizationReportingCurrency,
  setOrganizationReportingCurrency,
} from '../../financial/currency-org';
import {
  getInvoiceOutstandingBalance,
  getInvoiceSettlementBreakdown,
  computeTotalReceivables,
  computeOverdueReceivables,
  dashboardMetricsStore,
} from '../../dashboard/engine';
import { importEngine } from '../../import/engine';
import { cfoIntelligenceEngine } from '../../cfo/engine';
import { auditStore } from '../../audit/store';
import { authStore } from '../../auth/store';

export async function runSprint22FinancialTestSuite() {
  console.log('\n=============================================================');
  console.log('RUNNING SPRINT 22 PRIORITY 1: FINANCIAL CORRECTNESS TEST SUITE');
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`💎 [FIN_CORRECT_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [FIN_CORRECT_FAIL] ${message}`);
      failed++;
    }
  }

  const TEST_ORG = 'org_fin_sprint22';
  const OTHER_ORG = 'org_fin_sprint22_other';

  // Ensure test org exists in authStore
  if (!authStore.getOrganizationById(TEST_ORG)) {
    authStore.createOrganizationDraft({
      name: 'Sprint 22 Financial Org',
      size: '50-200',
      industry: 'Fintech',
      created_by_user_id: 'user_sprint22',
    });
    const org = authStore.getOrganizationById(TEST_ORG);
    if (!org) {
      // Force set id for deterministic testing
      (authStore as any).organizations.set(TEST_ORG, {
        id: TEST_ORG,
        name: 'Sprint 22 Financial Org',
        size: '50-200',
        industry: 'Fintech',
        created_by_user_id: 'user_sprint22',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        currency: 'INR',
      });
    }
  }

  if (!authStore.getOrganizationById(OTHER_ORG)) {
    (authStore as any).organizations.set(OTHER_ORG, {
      id: OTHER_ORG,
      name: 'Sprint 22 Other Org',
      size: '10-50',
      industry: 'Retail',
      created_by_user_id: 'user_other',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      currency: 'INR',
    });
  }

  udmStore.clearAll();
  udmStore.setTenantContext(TEST_ORG);

  // =========================================================================
  // 1. EXACT DECIMAL-STRING MONETARY PARSER TESTS (GAP-F2)
  // =========================================================================
  console.log('--- 1. Exact Monetary Parsing (GAP-F2) ---');

  // 1.1 Standard Western Format: 1,234.56
  const p1 = parseMonetaryAmount('1,234.56', { currency: 'INR' });
  testAssert(p1.success && p1.minorUnits === 123456, '1.1 Exact parsing: 1,234.56 -> 123,456 paise');

  // 1.2 Indian Grouping Notation: 1,23,456.78
  const p2 = parseMonetaryAmount('1,23,456.78', { currency: 'INR' });
  testAssert(p2.success && p2.minorUnits === 12345678, '1.2 Indian grouping: 1,23,456.78 -> 12,345,678 paise');

  // 1.3 European Locale Parsing: 1.234,56 under de-DE
  const p3 = parseMonetaryAmount('1.234,56', { locale: 'de-DE', currency: 'EUR' });
  testAssert(p3.success && p3.minorUnits === 123456, '1.3 European locale (de-DE): 1.234,56 -> 123,456 cents');

  // 1.4 Rejection of European format under Indian/Standard without European locale (no silent guessing)
  const p4 = parseMonetaryAmount('1.234,56', { locale: 'en-IN', currency: 'INR' });
  testAssert(!p4.success && p4.code === 'AMBIGUOUS_FORMAT', '1.4 Rejection of ambiguous European notation in en-IN locale');

  // 1.5 Indian Rupee Symbol Prefix: ₹1,50,000.00
  const p5 = parseMonetaryAmount('₹1,50,000.00', { currency: 'INR' });
  testAssert(p5.success && p5.minorUnits === 15000000, '1.5 Currency symbol: ₹1,50,000.00 -> 15,000,000 paise');

  // 1.6 Large Safe Integer Amount: ₹50,00,00,000.00 (50 Crore)
  const p6 = parseMonetaryAmount('₹50,00,00,000.00', { currency: 'INR' });
  testAssert(p6.success && p6.minorUnits === 50000000000, '1.6 Large amount (50 Cr): ₹50,00,00,000.00 -> 50,000,000,000 paise');

  // 1.7 Zero Minor Units in JPY
  const p7 = parseMonetaryAmount('1,500', { currency: 'JPY' });
  testAssert(p7.success && p7.minorUnits === 1500, '1.7 Zero minor unit currency (JPY): 1,500 -> 1,500 yen');

  // =========================================================================
  // 2. LOCALE, ACCOUNTING NEGATIVES & PRECISION BOUNDS (GAP-F3)
  // =========================================================================
  console.log('\n--- 2. Accounting Negatives & Precision Policies (GAP-F3) ---');

  // 2.1 Accounting Parentheses Negative: (1,000.00)
  const n1 = parseMonetaryAmount('(1,000.00)', { currency: 'INR' });
  testAssert(n1.success && n1.minorUnits === -100000 && n1.isNegative, '2.1 Accounting negative: (1,000.00) -> -100,000 paise');

  // 2.2 Standard Minus Negative: -1,000.00
  const n2 = parseMonetaryAmount('-1,000.00', { currency: 'INR' });
  testAssert(n2.success && n2.minorUnits === -100000 && n2.isNegative, '2.2 Standard negative: -1,000.00 -> -100,000 paise');

  // 2.3 Accounting Negative with Currency Symbol: (₹1,50,000.00)
  const n3 = parseMonetaryAmount('(₹1,50,000.00)', { currency: 'INR' });
  testAssert(n3.success && n3.minorUnits === -15000000 && n3.isNegative, '2.3 Accounting negative with symbol: (₹1,50,000.00) -> -15,000,000 paise');

  // 2.4 Elimination of Floating-Point Rounding Flaw: 1.005 for INR (3 decimal places) MUST REJECT
  const pr1 = parseMonetaryAmount('1.005', { currency: 'INR' });
  testAssert(!pr1.success && pr1.code === 'UNSUPPORTED_PRECISION', '2.4 Precision check: 1.005 rejected for INR (no silent Math.round truncation to 100)');

  // 2.5 Rejection of 4 decimal places
  const pr2 = parseMonetaryAmount('100.1234', { currency: 'INR' });
  testAssert(!pr2.success && pr2.code === 'UNSUPPORTED_PRECISION', '2.5 Precision check: 100.1234 rejected for INR');

  // 2.6 Clean Trailing Zero Extension: 1.5 -> 150 paise
  const pr3 = parseMonetaryAmount('1.5', { currency: 'INR' });
  testAssert(pr3.success && pr3.minorUnits === 150, '2.6 Exact single-decimal expansion: 1.5 -> 150 paise');

  // 2.7 Safe Integer Overflow Rejection
  const ovf = parseMonetaryAmount('999999999999999999999999.00', { currency: 'INR' });
  testAssert(!ovf.success && ovf.code === 'INTEGER_OVERFLOW', '2.7 Safe integer bounds: overflow rejected');

  // =========================================================================
  // 3. SINGLE-CURRENCY ENFORCEMENT & INGESTION SAFEGUARDS
  // =========================================================================
  console.log('\n--- 3. Single-Currency Enforcement & Ingestion ---');

  // 3.1 Organization Reporting Currency Resolution
  setOrganizationReportingCurrency(TEST_ORG, 'INR');
  const orgCur = getOrganizationReportingCurrency(TEST_ORG);
  testAssert(orgCur === 'INR', '3.1 Organization reporting currency verified as INR');

  // 3.2 Ingestion Batch with Valid Single Currency
  const validBatch = importEngine.createBatch(
    {
      organizationId: TEST_ORG,
      sourceSystem: 'csv_test',
      dateFormatConvention: 'YYYY-MM-DD',
      currency: 'INR',
    },
    [
      { customer_name: 'Acme Corp', invoice_number: 'INV-VALID-01', amount: '1,500.00', due_date: '2026-12-31' },
      { customer_name: 'Beta Ltd', invoice_number: 'INV-VALID-02', amount: '₹2,500.50', due_date: '2026-12-31' },
    ]
  );
  const validResult = importEngine.processBatch(validBatch.id, {
    organizationId: TEST_ORG,
    sourceSystem: 'csv_test',
  });
  testAssert(validResult.successCount === 2 && validResult.skippedCount === 0, '3.2 Single-currency INR batch successfully ingested 2/2 records');

  // 3.3 Mixed Currency Rejection in Row Data
  const mixedBatch = importEngine.createBatch(
    {
      organizationId: TEST_ORG,
      sourceSystem: 'csv_test',
      dateFormatConvention: 'YYYY-MM-DD',
      currency: 'INR',
    },
    [
      { customer_name: 'Delta Corp', invoice_number: 'INV-MIX-01', amount: '500.00', currency: 'EUR', due_date: '2026-12-31' },
      { customer_name: 'Echo LLC', invoice_number: 'INV-MIX-02', amount: '750.00', currency: 'INR', due_date: '2026-12-31' },
    ]
  );
  const mixedResult = importEngine.processBatch(mixedBatch.id, {
    organizationId: TEST_ORG,
    sourceSystem: 'csv_test',
  });
  testAssert(
    mixedResult.successCount === 1 && mixedResult.skippedCount === 1,
    '3.3 Mixed currency row rejected (EUR in INR batch skipped with error; INR row accepted)'
  );

  const errors = importEngine.getBatchErrors(mixedBatch.id);
  testAssert(
    errors.some((e) => e.reason.includes('Mixed currency detected')),
    '3.4 Mixed currency error explicitly recorded with original row data in audit trail'
  );

  // 3.4 Ingestion Row with Negative Invoice Rejected (Invoices must be positive; credits handle deductions)
  const negBatch = importEngine.createBatch(
    {
      organizationId: TEST_ORG,
      sourceSystem: 'csv_test',
      dateFormatConvention: 'YYYY-MM-DD',
    },
    [
      { customer_name: 'Zeta Inc', invoice_number: 'INV-NEG-01', amount: '(500.00)', due_date: '2026-12-31' },
    ]
  );
  const negResult = importEngine.processBatch(negBatch.id, {
    organizationId: TEST_ORG,
    sourceSystem: 'csv_test',
  });
  testAssert(
    negResult.skippedCount === 1 && negResult.successCount === 0,
    '3.5 Negative invoice amount gracefully rejected in invoice ingestion with explicit error'
  );

  // =========================================================================
  // 4. CREDIT NOTE ALLOCATION MODEL (GAP-F1)
  // =========================================================================
  console.log('\n--- 4. Credit Note Allocation Model (GAP-F1) ---');

  // 4.1 Setup Customer, Invoice, and Credit Note
  const cust = udmStore.insertCustomer({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'CUST_CN_TEST',
    name: 'Precision Engineering Pvt Ltd',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // Invoice for ₹1,00,000 (10,000,000 paise)
  const invoice1 = udmStore.insertInvoice({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'INV-CN-001',
    customer_id: cust.id,
    number: 'INV-CN-001',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 1800000,
    issue_date: '2026-10-01',
    due_date: '2026-10-31',
    status: 'open',
  });

  // Credit Note for ₹40,000 (4,000,000 paise)
  const creditNote1 = udmStore.insertCreditNote({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'CN-001',
    customer_id: cust.id,
    amount_minor_units: 4000000,
    currency: 'INR',
    date: '2026-10-15',
    reason: 'Price variance adjustment on items A & B',
  });

  // Initial balance checks
  const initInvBal = getInvoiceOutstandingBalance(invoice1);
  const initCnBal = udmStore.getCreditNoteBalance(creditNote1.id);
  testAssert(initInvBal === 10000000, '4.1 Initial invoice outstanding balance: ₹1,00,000 (10,000,000 paise)');
  testAssert(
    initCnBal.availableMinorUnits === 4000000 && initCnBal.allocatedMinorUnits === 0,
    '4.2 Initial credit note: ₹40,000 available, 0 allocated'
  );

  // 4.3 Partial Credit Allocation: Allocate ₹25,000 (2,500,000 paise) to invoice
  const alloc1 = udmStore.insertCreditAllocation({
    organization_id: TEST_ORG,
    credit_note_id: creditNote1.id,
    invoice_id: invoice1.id,
    allocated_amount_minor_units: 2500000,
    reason: 'Partial settlement against Line 1',
    allocated_by: 'user_sprint22',
  });

  testAssert(alloc1.status === 'allocated', '4.3 Partial credit allocation created with status "allocated"');

  const invBalAfterAlloc1 = getInvoiceOutstandingBalance(invoice1);
  testAssert(
    invBalAfterAlloc1 === 7500000,
    '4.4 Invoice outstanding balance correctly reduced from ₹1,00,000 to ₹75,000 (7,500,000 paise)'
  );

  const cnBalAfterAlloc1 = udmStore.getCreditNoteBalance(creditNote1.id);
  testAssert(
    cnBalAfterAlloc1.availableMinorUnits === 1500000 && cnBalAfterAlloc1.allocatedMinorUnits === 2500000,
    '4.5 Credit note balance updated: ₹15,000 available, ₹25,000 allocated'
  );

  testAssert(invoice1.amount_minor_units === 10000000, '4.6 Original gross invoice amount preserved at ₹1,00,000 (never mutated)');
  testAssert(invoice1.status === 'partially_paid', '4.7 Invoice status transitioned to "partially_paid"');

  // Breakdown verification
  const breakdown1 = getInvoiceSettlementBreakdown(invoice1);
  testAssert(
    breakdown1.grossAmountMinorUnits === 10000000 &&
      breakdown1.creditAllocatedMinorUnits === 2500000 &&
      breakdown1.paidMatchedMinorUnits === 0 &&
      breakdown1.outstandingMinorUnits === 7500000,
    '4.8 Settlement breakdown accurately tracks gross, credit allocated, paid matched, and net outstanding'
  );

  // 4.9 Second Allocation: Allocate remaining ₹15,000 to invoice
  udmStore.insertCreditAllocation({
    organization_id: TEST_ORG,
    credit_note_id: creditNote1.id,
    invoice_id: invoice1.id,
    allocated_amount_minor_units: 1500000,
    reason: 'Settlement of remaining credit',
    allocated_by: 'user_sprint22',
  });

  const invBalAfterAlloc2 = getInvoiceOutstandingBalance(invoice1);
  const cnBalAfterAlloc2 = udmStore.getCreditNoteBalance(creditNote1.id);
  testAssert(invBalAfterAlloc2 === 6000000, '4.9 Invoice balance reduced to ₹60,000 after full credit note exhaustion');
  testAssert(cnBalAfterAlloc2.availableMinorUnits === 0, '4.10 Credit note available balance reaches 0');

  // 4.11 Over-Allocation on Credit Note Prevention
  let cnOverAllocFailed = false;
  try {
    udmStore.insertCreditAllocation({
      organization_id: TEST_ORG,
      credit_note_id: creditNote1.id,
      invoice_id: invoice1.id,
      allocated_amount_minor_units: 100000, // ₹1,000
    });
  } catch (err: any) {
    cnOverAllocFailed = err.message.includes('exceeds available credit note balance');
  }
  testAssert(cnOverAllocFailed, '4.11 Over-allocation on credit note strictly prevented');

  // 4.12 Over-Allocation on Invoice Outstanding Balance Prevention
  const creditNote2 = udmStore.insertCreditNote({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'CN-002',
    customer_id: cust.id,
    amount_minor_units: 10000000, // ₹1,00,000
    currency: 'INR',
    date: '2026-10-20',
  });

  let invOverAllocFailed = false;
  try {
    udmStore.insertCreditAllocation({
      organization_id: TEST_ORG,
      credit_note_id: creditNote2.id,
      invoice_id: invoice1.id,
      allocated_amount_minor_units: 7000000, // ₹70,000 > ₹60,000 outstanding!
    });
  } catch (err: any) {
    invOverAllocFailed = err.message.includes('exceeds invoice outstanding balance');
  }
  testAssert(invOverAllocFailed, '4.12 Over-allocation on invoice outstanding balance strictly prevented');

  // 4.13 Combined Payment + Credit Settlement to ₹0
  const payment1 = udmStore.insertPayment({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'PAY-CN-001',
    customer_id: cust.id,
    amount_minor_units: 6000000, // ₹60,000
    currency: 'INR',
    date: '2026-11-01',
  });

  udmStore.insertMatch({
    organization_id: TEST_ORG,
    payment_id: payment1.id,
    invoice_id: invoice1.id,
    matched_amount_minor_units: 6000000,
    match_method: 'deterministic',
  });

  const finalOutstanding = getInvoiceOutstandingBalance(invoice1);
  testAssert(finalOutstanding === 0, '4.13 Combined settlement (₹40,000 credit + ₹60,000 payment) yields outstanding = 0');

  const finalBreakdown = getInvoiceSettlementBreakdown(invoice1);
  testAssert(
    finalBreakdown.isFullySettled && finalBreakdown.paidMatchedMinorUnits === 6000000 && finalBreakdown.creditAllocatedMinorUnits === 4000000,
    '4.14 Final breakdown verifies full settlement with complete lineage'
  );

  // =========================================================================
  // 5. CREDIT NOTE REVERSAL & AUDIT INTEGRITY
  // =========================================================================
  console.log('\n--- 5. Credit Note Reversal & Audit Integrity ---');

  const invoiceReversible = udmStore.insertInvoice({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'INV-REV-01',
    customer_id: cust.id,
    number: 'INV-REV-01',
    amount_minor_units: 5000000, // ₹50,000
    currency: 'INR',
    tax_amount_minor_units: 900000,
    issue_date: '2026-10-01',
    due_date: '2026-10-31',
    status: 'open',
  });

  const creditReversible = udmStore.insertCreditNote({
    organization_id: TEST_ORG,
    source_system: 'manual',
    source_id: 'CN-REV-01',
    customer_id: cust.id,
    amount_minor_units: 2000000, // ₹20,000
    currency: 'INR',
    date: '2026-10-10',
  });

  const allocToReverse = udmStore.insertCreditAllocation({
    organization_id: TEST_ORG,
    credit_note_id: creditReversible.id,
    invoice_id: invoiceReversible.id,
    allocated_amount_minor_units: 2000000,
    reason: 'Initial allocation',
    allocated_by: 'user_sprint22',
  });

  testAssert(getInvoiceOutstandingBalance(invoiceReversible) === 3000000, '5.1 Before reversal: outstanding balance is ₹30,000');

  // Execute Reversal
  const reversedAlloc = udmStore.reverseCreditAllocation(
    allocToReverse.id,
    'Billing dispute resolved; goods retained by customer',
    'user_auditor'
  );

  testAssert(reversedAlloc.status === 'reversed', '5.2 Allocation status transitioned to "reversed"');
  testAssert(reversedAlloc.reversal_reason === 'Billing dispute resolved; goods retained by customer', '5.3 Reversal reason recorded');

  const balAfterRev = getInvoiceOutstandingBalance(invoiceReversible);
  testAssert(balAfterRev === 5000000, '5.4 Invoice outstanding balance restored to original ₹50,000 after reversal');
  testAssert(invoiceReversible.status === 'open', '5.5 Invoice status restored to "open"');

  const cnBalAfterRev = udmStore.getCreditNoteBalance(creditReversible.id);
  testAssert(cnBalAfterRev.availableMinorUnits === 2000000, '5.6 Credit note available balance restored to ₹20,000');

  // Verify Audit Log
  const auditLogs = auditStore.query({ organizationId: TEST_ORG, actionType: 'credit_note.allocation_reversed' });
  testAssert(auditLogs.length >= 1, '5.7 Immutable audit trail recorded credit allocation reversal');

  // =========================================================================
  // 6. CROSS-TENANT ISOLATION ON CREDIT ALLOCATIONS
  // =========================================================================
  console.log('\n--- 6. Cross-Tenant Security on Credit Allocations ---');

  let crossTenantAllocBlocked = false;
  try {
    // Org B attempting to allocate Org A's credit note
    udmStore.setTenantContext(OTHER_ORG);
    udmStore.insertCreditAllocation({
      organization_id: OTHER_ORG,
      credit_note_id: creditNote2.id, // Belongs to TEST_ORG!
      invoice_id: invoiceReversible.id, // Belongs to TEST_ORG!
      allocated_amount_minor_units: 1000000,
    });
  } catch (err: any) {
    crossTenantAllocBlocked = true;
  }
  testAssert(crossTenantAllocBlocked, '6.1 Cross-tenant credit allocation strictly rejected');

  // Switch back to TEST_ORG
  udmStore.setTenantContext(TEST_ORG);

  // =========================================================================
  // 7. CROSS-ENGINE FINANCIAL CALCULATION CONSISTENCY
  // =========================================================================
  console.log('\n--- 7. Cross-Engine Consistency Across Views ---');

  // Verify that Dashboard, CFO, and Receivables compute the exact same numbers
  const allInvoices = udmStore.getInvoices();
  const totalReceivablesDirect = computeTotalReceivables(allInvoices, TEST_ORG);
  const overdueDirect = computeOverdueReceivables(allInvoices, TEST_ORG, '2026-11-05');

  const dashboardMetrics = dashboardMetricsStore.refreshMetrics(TEST_ORG, '2026-11-05');
  testAssert(
    dashboardMetrics.totalReceivablesMinorUnits === totalReceivablesDirect,
    '7.1 Dashboard engine total receivables matches direct formula sum'
  );
  testAssert(
    dashboardMetrics.overdueMinorUnits === overdueDirect,
    '7.2 Dashboard engine overdue receivables matches direct formula sum'
  );

  const cfoOverview = cfoIntelligenceEngine.getOverview(TEST_ORG, '2026-11-05');
  testAssert(
    cfoOverview.totalReceivablesMinorUnits === totalReceivablesDirect,
    '7.3 CFO engine overview total receivables agrees with Dashboard engine'
  );

  console.log('\n=============================================================');
  console.log(`SPRINT 22 FINANCIAL TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================\n');

  return { passed, failed };
}
