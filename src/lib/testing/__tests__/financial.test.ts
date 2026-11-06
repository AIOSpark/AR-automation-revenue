// AIOSpark CI/CD Quality Gate — Financial Correctness & Golden Test Suite
// Covers deterministic financial calculations, payment allocation, reconciliation, receivables, and O2C consistency

import assert from 'node:assert';
import { udmStore } from '../../udm/store';
import { getInvoiceOutstandingBalance } from '../../dashboard/engine';
import { reconciliationEngine } from '../../reconciliation/engine';
import { dashboardMetricsStore } from '../../dashboard/engine';
import { cfoIntelligenceEngine } from '../../cfo/engine';
import { queryReceivablesTable } from '../../receivables/engine';

export async function runFinancialTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING FINANCIAL CORRECTNESS & GOLDEN SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, message: string) {
    if (condition) {
      console.log(`💰 [FIN_PASS] ${message}`);
      passed++;
    } else {
      console.error(`🚨 [FIN_FAIL] ${message}`);
      failed++;
    }
  }

  const testOrg = 'org_financial_ci_test';
  udmStore.clearAll();
  udmStore.setTenantContext(testOrg);

  function allocatePayment(paymentId: string, invoiceId: string, amountMinorUnits: number) {
    // orgId derived from active context set earlier via udmStore.setTenantContext(testOrg)
    const inv = udmStore.getInvoices().find((i) => i.id === invoiceId);
    if (!inv) throw new Error(`Invoice not found: ${invoiceId}`);
    const currentOutstanding = getInvoiceOutstandingBalance(inv);
    if (amountMinorUnits > currentOutstanding) {
      throw new Error(`Allocation ${amountMinorUnits} exceeds outstanding balance ${currentOutstanding}`);
    }

    udmStore.insertMatch({
      organization_id: testOrg,
      payment_id: paymentId,
      invoice_id: invoiceId,
      matched_amount_minor_units: amountMinorUnits,
      match_method: 'deterministic',
      confidence: 1.0,
    });

    const newOutstanding = getInvoiceOutstandingBalance(inv);
    if (newOutstanding <= 0) {
      udmStore.updateInvoice(invoiceId, { status: 'paid' });
    }
  }

  const customer = udmStore.insertCustomer({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_cust_fin_1',
    name: 'Tata Consultancy Services',
    credit_limit_minor_units: 100000000,
    currency: 'INR',
    payment_terms_days: 30,
    risk_score: 90,
  });

  // --------------------------------------------------
  // 1. FINANCIAL GOLDEN TESTS (Deterministic Arithmetic)
  // --------------------------------------------------
  // Scenario 1: Invoice ₹100,000, Payment ₹40,000 -> Outstanding ₹60,000
  const inv1 = udmStore.insertInvoice({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_inv_fin_1',
    customer_id: customer.id,
    number: 'INV-GOLDEN-101',
    amount_minor_units: 10000000, // ₹100,000 in paise
    tax_amount_minor_units: 1800000,
    currency: 'INR',
    issue_date: '2026-01-01',
    due_date: '2026-01-31',
    status: 'open',
  });

  const pay1 = udmStore.insertPayment({
    organization_id: testOrg,
    source_system: 'bank_feed',
    source_id: 'src_pay_fin_1',
    customer_id: customer.id,
    amount_minor_units: 4000000, // ₹40,000
    currency: 'INR',
    date: '2026-01-15',
  });

  // Allocate pay1 against inv1
  allocatePayment(pay1.id, inv1.id, 4000000);
  const bal1 = getInvoiceOutstandingBalance(inv1);
  testAssert(
    bal1 === 6000000,
    `Golden Test 1: ₹100,000 - ₹40,000 = ₹60,000 outstanding (Got ₹${bal1 / 100})`
  );

  // Scenario 2: Full payment ₹60,000 remaining on inv1 -> Outstanding ₹0, status paid
  const pay2 = udmStore.insertPayment({
    organization_id: testOrg,
    source_system: 'bank_feed',
    source_id: 'src_pay_fin_2',
    customer_id: customer.id,
    amount_minor_units: 6000000, // ₹60,000
    currency: 'INR',
    date: '2026-01-20',
  });

  allocatePayment(pay2.id, inv1.id, 6000000);
  const bal1Final = getInvoiceOutstandingBalance(inv1);
  const updatedInv1 = udmStore.getInvoices().find((i) => i.id === inv1.id);
  testAssert(
    bal1Final === 0 && updatedInv1?.status === 'paid',
    'Golden Test 2: Full payment resulting in ₹0 outstanding updates invoice status to paid'
  );

  // Scenario 3: Invoice ₹100,000, Payment ₹30,000 + Payment ₹20,000 -> Outstanding ₹50,000
  const inv2 = udmStore.insertInvoice({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_inv_fin_2',
    customer_id: customer.id,
    number: 'INV-GOLDEN-102',
    amount_minor_units: 10000000, // ₹100,000
    tax_amount_minor_units: 1800000,
    currency: 'INR',
    issue_date: '2026-02-01',
    due_date: '2026-03-01',
    status: 'open',
  });

  const pay3 = udmStore.insertPayment({
    organization_id: testOrg,
    source_system: 'bank_feed',
    source_id: 'src_pay_fin_3',
    customer_id: customer.id,
    amount_minor_units: 3000000,
    currency: 'INR',
    date: '2026-02-05',
  });

  const pay4 = udmStore.insertPayment({
    organization_id: testOrg,
    source_system: 'bank_feed',
    source_id: 'src_pay_fin_4',
    customer_id: customer.id,
    amount_minor_units: 2000000,
    currency: 'INR',
    date: '2026-02-10',
  });

  allocatePayment(pay3.id, inv2.id, 3000000);
  allocatePayment(pay4.id, inv2.id, 2000000);
  const bal2 = getInvoiceOutstandingBalance(inv2);
  testAssert(
    bal2 === 5000000,
    `Golden Test 3: ₹100,000 - ₹30,000 - ₹20,000 = ₹50,000 outstanding (Got ₹${bal2 / 100})`
  );

  // --------------------------------------------------
  // 2. PAYMENT ALLOCATION & RECONCILIATION EDGE CASES
  // --------------------------------------------------
  // Overpayment attempt validation
  let overpayThrew = false;
  try {
    allocatePayment(pay4.id, inv2.id, 99000000);
  } catch (err: any) {
    overpayThrew = true;
  }
  testAssert(
    overpayThrew,
    'Payment Allocation: Allocation exceeding outstanding balance throws validation error'
  );

  // Reconciliation workflow validation
  const bankTx = udmStore.insertBankTransaction({
    organization_id: testOrg,
    source_system: 'bank_feed',
    raw_reference: 'NEFT-RECON-FIN-100',
    amount_minor_units: 5000000, // ₹50,000 exact match for inv2 remaining balance
    currency: 'INR',
    date: '2026-02-12',
    narration_text: 'TCS NEFT INV-GOLDEN-102',
    status: 'unmatched',
  });

  const matchCandidate = reconciliationEngine.runDeterministicPass(bankTx, udmStore.getInvoices(), testOrg);
  testAssert(
    matchCandidate !== null && matchCandidate.matchedInvoiceIds.includes(inv2.id),
    'Reconciliation: Bank transaction matched to expected invoice by reference and exact amount'
  );
  testAssert(
    bankTx.status === 'unmatched',
    'Reconciliation Safety: Matching candidate does NOT automatically reconcile bank transaction until approved'
  );

  // --------------------------------------------------
  // 3. CROSS-MODULE METRIC CONSISTENCY (Dashboard == CFO == Receivables)
  // --------------------------------------------------
  dashboardMetricsStore.clearAll();
  const dashKpis = dashboardMetricsStore.refreshMetrics(testOrg);
  const cfoOverview = cfoIntelligenceEngine.getOverview(testOrg);
  const receivablesData = queryReceivablesTable(testOrg, {}, '2026-09-01');
  const tableTotal = receivablesData.items.reduce((sum, i) => sum + i.outstandingMinorUnits, 0);

  testAssert(
    dashKpis.totalReceivablesMinorUnits === cfoOverview.totalReceivablesMinorUnits &&
      dashKpis.totalReceivablesMinorUnits === tableTotal,
    'Cross-Module Consistency: Total Receivables is 100% consistent across Dashboard, CFO View, and Receivables Table'
  );

  // --------------------------------------------------
  // 4. END-TO-END O2C CONSISTENCY LOOP
  // --------------------------------------------------
  // Create invoice -> Receivables increase -> Record payment -> Outstanding decrease -> Allocate -> Update
  const initialRec = dashboardMetricsStore.refreshMetrics(testOrg).totalReceivablesMinorUnits;
  const o2cInv = udmStore.insertInvoice({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_inv_o2c_1',
    customer_id: customer.id,
    number: 'INV-O2C-200',
    amount_minor_units: 15000000, // ₹150,000
    tax_amount_minor_units: 2700000,
    currency: 'INR',
    issue_date: '2026-03-01',
    due_date: '2026-03-31',
    status: 'open',
  });

  const postInvRec = dashboardMetricsStore.refreshMetrics(testOrg).totalReceivablesMinorUnits;
  testAssert(
    postInvRec === initialRec + 15000000,
    'O2C Loop: Creating invoice immediately increases Total Receivables by invoice amount'
  );

  const o2cPay = udmStore.insertPayment({
    organization_id: testOrg,
    source_system: 'bank_feed',
    source_id: 'src_pay_o2c_1',
    customer_id: customer.id,
    amount_minor_units: 15000000,
    currency: 'INR',
    date: '2026-03-15',
  });

  allocatePayment(o2cPay.id, o2cInv.id, 15000000);
  const postPayRec = dashboardMetricsStore.refreshMetrics(testOrg).totalReceivablesMinorUnits;
  testAssert(
    postPayRec === initialRec,
    'O2C Loop: Allocating full payment reduces Total Receivables back to baseline balance'
  );

  console.log('\n==========================================');
  console.log(`FINANCIAL SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}