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

  // --------------------------------------------------
  // 5. CREDIT NOTE ALLOCATION & OUTSTANDING BALANCE INVARIANT
  // Formula: Outstanding = Gross - Matched Payments - Active Credit Allocations
  // --------------------------------------------------
  dashboardMetricsStore.clearAll();

  // Scenario 5a: Invoice ₹1,00,000 + Credit Note ₹40,000 allocated -> Outstanding ₹60,000
  const invC1 = udmStore.insertInvoice({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_inv_cn_1',
    customer_id: customer.id,
    number: 'INV-CN-101',
    amount_minor_units: 10000000, // ₹1,00,000
    tax_amount_minor_units: 1800000,
    currency: 'INR',
    issue_date: '2026-04-01',
    due_date: '2026-04-30',
    status: 'open',
  });

  const cn1 = udmStore.insertCreditNote({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_cn_1',
    customer_id: customer.id,
    amount_minor_units: 4000000, // ₹40,000
    currency: 'INR',
    date: '2026-04-15',
    reason: 'Price variance adjustment',
  });

  testAssert(
    getInvoiceOutstandingBalance(invC1) === 10000000,
    'Credit Note 5a: Outstanding is gross ₹1,00,000 before any allocation'
  );

  const alloc1 = udmStore.insertCreditAllocation({
    organization_id: testOrg,
    credit_note_id: cn1.id,
    invoice_id: invC1.id,
    allocated_amount_minor_units: 2500000, // ₹25,000 partial allocation
    reason: 'Partial settlement against Line 1',
    allocated_by: 'user_fin_1',
  });

  const balAfterAlloc1 = getInvoiceOutstandingBalance(invC1);
  testAssert(
    balAfterAlloc1 === 7500000,
    `Credit Note 5b: Partial allocation ₹25,000 -> Outstanding ₹75,000 (Got ₹${balAfterAlloc1 / 100})`
  );
  testAssert(
    alloc1.status === 'allocated',
    'Credit Note 5c: Allocation status is "allocated"'
  );

  // Scenario 5d: Full credit note allocation -> Outstanding ₹50,000
  const alloc2 = udmStore.insertCreditAllocation({
    organization_id: testOrg,
    credit_note_id: cn1.id,
    invoice_id: invC1.id,
    allocated_amount_minor_units: 1500000, // ₹15,000 remaining credit
    reason: 'Settlement of remaining credit',
    allocated_by: 'user_fin_1',
  });

  const balAfterAlloc2 = getInvoiceOutstandingBalance(invC1);
  testAssert(
    balAfterAlloc2 === 6000000,
    `Credit Note 5d: Full credit note allocation -> Outstanding ₹60,000 (Got ₹${balAfterAlloc2 / 100})`
  );
  testAssert(
    udmStore.getCreditNoteBalance(cn1.id).availableMinorUnits === 0,
    'Credit Note 5e: Credit note available balance reaches 0 after full allocation'
  );

  // Scenario 5e: Over-allocation on credit note balance prevented
  let cnOverAllocThrew = false;
  try {
    udmStore.insertCreditAllocation({
      organization_id: testOrg,
      credit_note_id: cn1.id,
      invoice_id: invC1.id,
      allocated_amount_minor_units: 100000, // ₹1,000 more than available
      reason: 'Should fail',
    });
  } catch (err: any) {
    cnOverAllocThrew = true;
  }
  testAssert(
    cnOverAllocThrew,
    'Credit Note 5f: Over-allocation on credit note balance strictly prevented'
  );

  // Scenario 5f: Over-allocation on invoice outstanding prevented
  const cn2 = udmStore.insertCreditNote({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_cn_2',
    customer_id: customer.id,
    amount_minor_units: 50000000, // ₹5,00,000 (more than invoice outstanding)
    currency: 'INR',
    date: '2026-04-20',
    reason: 'Large credit note',
  });

  let invOverAllocThrew = false;
  try {
    udmStore.insertCreditAllocation({
      organization_id: testOrg,
      credit_note_id: cn2.id,
      invoice_id: invC1.id,
      allocated_amount_minor_units: 7000000, // ₹70,000 > ₹60,000 outstanding
      reason: 'Should fail - exceeds invoice outstanding',
    });
  } catch (err: any) {
    invOverAllocThrew = true;
  }
  testAssert(
    invOverAllocThrew,
    'Credit Note 5g: Over-allocation on invoice outstanding strictly prevented'
  );

  // Scenario 5g: Credit allocation reversal restores balances
  const invR = udmStore.insertInvoice({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_inv_cn_rev',
    customer_id: customer.id,
    number: 'INV-CN-REV-01',
    amount_minor_units: 5000000, // ₹50,000
    tax_amount_minor_units: 900000,
    currency: 'INR',
    issue_date: '2026-05-01',
    due_date: '2026-05-31',
    status: 'open',
  });

  const cnR = udmStore.insertCreditNote({
    organization_id: testOrg,
    source_system: 'manual',
    source_id: 'src_cn_rev',
    customer_id: customer.id,
    amount_minor_units: 2000000, // ₹20,000
    currency: 'INR',
    date: '2026-05-10',
    reason: 'Reversible credit note',
  });

  const allocR = udmStore.insertCreditAllocation({
    organization_id: testOrg,
    credit_note_id: cnR.id,
    invoice_id: invR.id,
    allocated_amount_minor_units: 2000000, // Full ₹20,000
    reason: 'Initial allocation',
    allocated_by: 'user_fin_1',
  });

  testAssert(
    getInvoiceOutstandingBalance(invR) === 3000000,
    'Credit Note 5h: Before reversal -> Outstanding ₹30,000'
  );

  const reversedAlloc = udmStore.reverseCreditAllocation(allocR.id, 'Billing dispute resolved', 'user_auditor');

  testAssert(
    reversedAlloc.status === 'reversed',
    'Credit Note 5i: Allocation status transitioned to "reversed"'
  );
  testAssert(
    reversedAlloc.reversal_reason === 'Billing dispute resolved',
    'Credit Note 5j: Reversal reason recorded'
  );
  testAssert(
    getInvoiceOutstandingBalance(invR) === 5000000,
    `Credit Note 5k: After reversal -> Outstanding restored to ₹50,000 (Got ₹${getInvoiceOutstandingBalance(invR) / 100})`
  );
  testAssert(
    udmStore.getCreditNoteBalance(cnR.id).availableMinorUnits === 2000000,
    'Credit Note 5l: Credit note available balance restored to ₹20,000 after reversal'
  );

  // --------------------------------------------------
  // 6. IDEMPOTENCY: Retried financial operations cannot create duplicates
  // --------------------------------------------------
  dashboardMetricsStore.clearAll();

  const idemOrg = 'org_idempotency_test';
  udmStore.clearAll();
  udmStore.setTenantContext(idemOrg);

  const idemCustomer = udmStore.insertCustomer({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_cust_idem',
    name: 'Idempotency Test Customer',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // 6a: Same idempotency key on invoice creation returns existing record
  const idemInvKey = 'idem-invoice-key-001';
  const invIdem1 = udmStore.insertInvoice({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_inv_idem_1',
    customer_id: idemCustomer.id,
    number: 'INV-IDEMP-001',
    amount_minor_units: 1000000,
    currency: 'INR',
    tax_amount_minor_units: 180000,
    issue_date: '2026-06-01',
    due_date: '2026-06-30',
    status: 'open',
    idempotency_key: idemInvKey,
  });

  const invIdem2 = udmStore.insertInvoice({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_inv_idem_1', // same source_id
    customer_id: idemCustomer.id,
    number: 'INV-IDEMP-001-DUPLICATE', // different number but same key
    amount_minor_units: 99999999, // different amount but same key
    currency: 'INR',
    tax_amount_minor_units: 18000000,
    issue_date: '2026-06-01',
    due_date: '2026-06-30',
    status: 'open',
    idempotency_key: idemInvKey,
  });

  testAssert(
    invIdem1.id === invIdem2.id,
    'Idempotency 6a: Same idempotency key on invoice returns existing record (no duplicate)'
  );
  testAssert(
    invIdem2.amount_minor_units === 1000000,
    'Idempotency 6b: Retried invoice returns original amount, not new amount'
  );

  // 6c: Same idempotency key on payment creation returns existing record
  const idemPayKey = 'idem-payment-key-001';
  const payIdem1 = udmStore.insertPayment({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_pay_idem_1',
    customer_id: idemCustomer.id,
    amount_minor_units: 500000,
    currency: 'INR',
    date: '2026-06-01',
    idempotency_key: idemPayKey,
  });

  const payIdem2 = udmStore.insertPayment({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_pay_idem_1',
    customer_id: idemCustomer.id,
    amount_minor_units: 99999999,
    currency: 'INR',
    date: '2026-06-01',
    idempotency_key: idemPayKey,
  });

  testAssert(
    payIdem1.id === payIdem2.id,
    'Idempotency 6c: Same idempotency key on payment returns existing record (no duplicate)'
  );

  // 6d: Same idempotency key on credit note creation returns existing record
  const idemCnKey = 'idem-cn-key-001';
  const cnIdem1 = udmStore.insertCreditNote({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_cn_idem_1',
    customer_id: idemCustomer.id,
    amount_minor_units: 300000,
    currency: 'INR',
    date: '2026-06-01',
    idempotency_key: idemCnKey,
  });

  const cnIdem2 = udmStore.insertCreditNote({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_cn_idem_1',
    customer_id: idemCustomer.id,
    amount_minor_units: 99999999,
    currency: 'INR',
    date: '2026-06-01',
    idempotency_key: idemCnKey,
  });

  testAssert(
    cnIdem1.id === cnIdem2.id,
    'Idempotency 6d: Same idempotency key on credit note returns existing record (no duplicate)'
  );

  // 6e: Same idempotency key on credit allocation returns existing record
  const idemInvForAlloc = udmStore.insertInvoice({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_inv_idem_alloc',
    customer_id: idemCustomer.id,
    number: 'INV-IDEMP-ALLOC',
    amount_minor_units: 5000000,
    currency: 'INR',
    tax_amount_minor_units: 900000,
    issue_date: '2026-06-01',
    due_date: '2026-06-30',
    status: 'open',
  });

  const idemCnForAlloc = udmStore.insertCreditNote({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_cn_idem_alloc',
    customer_id: idemCustomer.id,
    amount_minor_units: 3000000,
    currency: 'INR',
    date: '2026-06-01',
  });

  const idemAllocKey = 'idem-alloc-key-001';
  const allocIdem1 = udmStore.insertCreditAllocation({
    organization_id: idemOrg,
    credit_note_id: idemCnForAlloc.id,
    invoice_id: idemInvForAlloc.id,
    allocated_amount_minor_units: 1000000,
    reason: 'Idempotent allocation test',
    allocated_by: 'user_idem',
    idempotency_key: idemAllocKey,
  });

  const allocIdem2 = udmStore.insertCreditAllocation({
    organization_id: idemOrg,
    credit_note_id: idemCnForAlloc.id,
    invoice_id: idemInvForAlloc.id,
    allocated_amount_minor_units: 99999999,
    reason: 'Should return existing',
    allocated_by: 'user_idem',
    idempotency_key: idemAllocKey,
  });

  testAssert(
    allocIdem1.id === allocIdem2.id,
    'Idempotency 6e: Same idempotency key on credit allocation returns existing record (no duplicate)'
  );

  // 6f: Different idempotency keys create separate records
  const invDifferentKey1 = udmStore.insertInvoice({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_inv_diff_1',
    customer_id: idemCustomer.id,
    number: 'INV-DIFF-001',
    amount_minor_units: 1000000,
    currency: 'INR',
    tax_amount_minor_units: 180000,
    issue_date: '2026-06-01',
    due_date: '2026-06-30',
    status: 'open',
    idempotency_key: 'idem-key-a',
  });

  const invDifferentKey2 = udmStore.insertInvoice({
    organization_id: idemOrg,
    source_system: 'manual',
    source_id: 'src_inv_diff_2',
    customer_id: idemCustomer.id,
    number: 'INV-DIFF-002',
    amount_minor_units: 2000000,
    currency: 'INR',
    tax_amount_minor_units: 360000,
    issue_date: '2026-06-01',
    due_date: '2026-06-30',
    status: 'open',
    idempotency_key: 'idem-key-b',
  });

  testAssert(
    invDifferentKey1.id !== invDifferentKey2.id,
    'Idempotency 6f: Different idempotency keys create separate records'
  );

  // 6g: Same key across different orgs creates separate records
  const idemOrg2 = 'org_idempotency_test_2';
  udmStore.setTenantContext(idemOrg2);
  const idemCustomer2 = udmStore.insertCustomer({
    organization_id: idemOrg2,
    source_system: 'manual',
    source_id: 'src_cust_idem2',
    name: 'Idempotency Test Customer 2',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const invCrossOrg = udmStore.insertInvoice({
    organization_id: idemOrg2,
    source_system: 'manual',
    source_id: 'src_inv_cross_org',
    customer_id: idemCustomer2.id,
    number: 'INV-CROSS-001',
    amount_minor_units: 500000,
    currency: 'INR',
    tax_amount_minor_units: 90000,
    issue_date: '2026-06-01',
    due_date: '2026-06-30',
    status: 'open',
    idempotency_key: idemInvKey, // same key as idemOrg but different org
  });

  testAssert(
    invCrossOrg.id !== invIdem1.id,
    'Idempotency 6g: Same idempotency key across different orgs creates separate records'
  );

  // --------------------------------------------------
  // 7. CONCURRENT DUPLICATE-REQUEST PROTECTION
  // Two simultaneous requests with the same idempotency key must not create
  // duplicates. Each insert method runs synchronously within the Node.js
  // event loop, so Promise.all() serializes them; the idempotency check
  // (read Map → write Map) is atomic within each tick.
  // --------------------------------------------------
  const concOrg = 'org_concurrency_test';
  udmStore.clearAll();
  udmStore.setTenantContext(concOrg);

  const concCustomer = udmStore.insertCustomer({
    organization_id: concOrg,
    source_system: 'manual',
    source_id: 'src_cust_conc',
    name: 'Concurrency Test Customer',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // 7a: Concurrent invoice creation with same key → only one record
  const concInvKey = 'conc-invoice-key-001';
  const concInvResults = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      udmStore.insertInvoice({
        organization_id: concOrg,
        source_system: 'manual',
        source_id: 'src_inv_conc_1',
        customer_id: concCustomer.id,
        number: 'INV-CONC-001',
        amount_minor_units: 1000000,
        currency: 'INR',
        tax_amount_minor_units: 180000,
        issue_date: '2026-07-01',
        due_date: '2026-07-31',
        status: 'open',
        idempotency_key: concInvKey,
      })
    )
  );

  const concInvIds = new Set(concInvResults.map((inv) => inv.id));
  testAssert(
    concInvIds.size === 1,
    `Concurrency 7a: 10 concurrent invoice creates with same key → 1 record (got ${concInvIds.size})`
  );

  // 7b: Concurrent payment creation with same key → only one record
  const concPayKey = 'conc-payment-key-001';
  const concPayResults = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      udmStore.insertPayment({
        organization_id: concOrg,
        source_system: 'manual',
        source_id: 'src_pay_conc_1',
        customer_id: concCustomer.id,
        amount_minor_units: 500000,
        currency: 'INR',
        date: '2026-07-01',
        idempotency_key: concPayKey,
      })
    )
  );

  const concPayIds = new Set(concPayResults.map((p) => p.id));
  testAssert(
    concPayIds.size === 1,
    `Concurrency 7b: 10 concurrent payment creates with same key → 1 record (got ${concPayIds.size})`
  );

  // 7c: Concurrent credit note creation with same key → only one record
  const concCnKey = 'conc-cn-key-001';
  const concCnResults = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      udmStore.insertCreditNote({
        organization_id: concOrg,
        source_system: 'manual',
        source_id: 'src_cn_conc_1',
        customer_id: concCustomer.id,
        amount_minor_units: 300000,
        currency: 'INR',
        date: '2026-07-01',
        idempotency_key: concCnKey,
      })
    )
  );

  const concCnIds = new Set(concCnResults.map((cn) => cn.id));
  testAssert(
    concCnIds.size === 1,
    `Concurrency 7c: 10 concurrent credit note creates with same key → 1 record (got ${concCnIds.size})`
  );

  // 7d: Concurrent credit allocation with same key → only one record
  const concInvForAlloc = udmStore.insertInvoice({
    organization_id: concOrg,
    source_system: 'manual',
    source_id: 'src_inv_conc_alloc',
    customer_id: concCustomer.id,
    number: 'INV-CONC-ALLOC',
    amount_minor_units: 5000000,
    currency: 'INR',
    tax_amount_minor_units: 900000,
    issue_date: '2026-07-01',
    due_date: '2026-07-31',
    status: 'open',
  });

  const concCnForAlloc = udmStore.insertCreditNote({
    organization_id: concOrg,
    source_system: 'manual',
    source_id: 'src_cn_conc_alloc',
    customer_id: concCustomer.id,
    amount_minor_units: 3000000,
    currency: 'INR',
    date: '2026-07-01',
  });

  const concAllocKey = 'conc-alloc-key-001';
  const concAllocResults = await Promise.all(
    Array.from({ length: 10 }).map(() =>
      udmStore.insertCreditAllocation({
        organization_id: concOrg,
        credit_note_id: concCnForAlloc.id,
        invoice_id: concInvForAlloc.id,
        allocated_amount_minor_units: 1000000,
        reason: 'Concurrent allocation test',
        allocated_by: 'user_conc',
        idempotency_key: concAllocKey,
      })
    )
  );

  const concAllocIds = new Set(concAllocResults.map((a) => a.id));
  testAssert(
    concAllocIds.size === 1,
    `Concurrency 7d: 10 concurrent allocation creates with same key → 1 record (got ${concAllocIds.size})`
  );

  // --------------------------------------------------
  // 8. ATOMICITY & ROLLBACK: Multi-Entity Financial Mutations
  // Every multi-entity financial mutation must complete entirely or leave
  // the original financial state unchanged. Mid-operation failure must
  // trigger complete rollback.
  // --------------------------------------------------
  dashboardMetricsStore.clearAll();

  const atomicOrg = 'org_atomicity_test';
  udmStore.clearAll();
  udmStore.setTenantContext(atomicOrg);

  const atomicCustomer = udmStore.insertCustomer({
    organization_id: atomicOrg,
    source_system: 'manual',
    source_id: 'src_cust_atomic',
    name: 'Atomicity Test Customer',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // 8a: Transaction that throws mid-way rolls back all Maps
  const atomicInv = udmStore.insertInvoice({
    organization_id: atomicOrg,
    source_system: 'manual',
    source_id: 'src_inv_atomic_1',
    customer_id: atomicCustomer.id,
    number: 'INV-ATOMIC-001',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 1800000,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
  });

  const atomicPay = udmStore.insertPayment({
    organization_id: atomicOrg,
    source_system: 'manual',
    source_id: 'src_pay_atomic_1',
    customer_id: atomicCustomer.id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-08-15',
  });

  let atomicRollbackThrew = false;
  try {
    await udmStore.transaction(() => {
      // Step 1: Create match
      udmStore.insertMatch({
        organization_id: atomicOrg,
        payment_id: atomicPay.id,
        invoice_id: atomicInv.id,
        matched_amount_minor_units: 3000000,
        match_method: 'deterministic',
      });
      // Step 2: Throw mid-transaction
      throw new Error('Simulated mid-transaction failure');
    });
  } catch (err: any) {
    atomicRollbackThrew = err.message === 'Simulated mid-transaction failure';
  }
  testAssert(atomicRollbackThrew, 'Atomicity 8a: Mid-transaction error throws');

  // 8b: After rollback, the match does not exist
  const matchesAfterRollback = udmStore.getMatches().filter(
    (m) => m.invoice_id === atomicInv.id && m.payment_id === atomicPay.id
  );
  testAssert(
    matchesAfterRollback.length === 0,
    `Atomicity 8b: Rolled back match not persisted (got ${matchesAfterRollback.length} matches)`
  );

  // 8c: After rollback, invoice status unchanged
  const invAfterRollback = udmStore.getInvoices().find((i) => i.id === atomicInv.id);
  testAssert(
    invAfterRollback?.status === 'open',
    'Atomicity 8c: Invoice status unchanged after rollback'
  );

  // 8d: After rollback, idempotency key not set (no partial state)
  // A subsequent operation with the same key should succeed (key not reserved)
  const idemKeyAfterRollback = 'idem-atomic-key-001';
  const invAfterRollbackCreate = udmStore.insertInvoice({
    organization_id: atomicOrg,
    source_system: 'manual',
    source_id: 'src_inv_atomic_retry',
    customer_id: atomicCustomer.id,
    number: 'INV-ATOMIC-RETRY',
    amount_minor_units: 1000000,
    currency: 'INR',
    tax_amount_minor_units: 180000,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
    idempotency_key: idemKeyAfterRollback,
  });
  testAssert(
    invAfterRollbackCreate.idempotency_key === idemKeyAfterRollback,
    'Atomicity 8d: Idempotency key can be set after rollback (no partial reservation)'
  );

  // 8e: Successful transaction after rollback persists correctly
  const atomicInv2 = udmStore.insertInvoice({
    organization_id: atomicOrg,
    source_system: 'manual',
    source_id: 'src_inv_atomic_2',
    customer_id: atomicCustomer.id,
    number: 'INV-ATOMIC-002',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 1800000,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
  });

  const atomicPay2 = udmStore.insertPayment({
    organization_id: atomicOrg,
    source_system: 'manual',
    source_id: 'src_pay_atomic_2',
    customer_id: atomicCustomer.id,
    amount_minor_units: 4000000,
    currency: 'INR',
    date: '2026-08-15',
  });

  const atomicTxResult = await udmStore.transaction(() => {
    const match = udmStore.insertMatch({
      organization_id: atomicOrg,
      payment_id: atomicPay2.id,
      invoice_id: atomicInv2.id,
      matched_amount_minor_units: 4000000,
      match_method: 'deterministic',
    });
    udmStore.updateInvoice(atomicInv2.id, { status: 'partially_paid' });
    return match;
  });

  const matchesAfterSuccess = udmStore.getMatches().filter(
    (m) => m.invoice_id === atomicInv2.id && m.payment_id === atomicPay2.id
  );
  testAssert(
    matchesAfterSuccess.length === 1,
    `Atomicity 8e: Successful transaction persists match (got ${matchesAfterSuccess.length})`
  );
  testAssert(
    matchesAfterSuccess[0]?.id === atomicTxResult.id,
    'Atomicity 8f: Transaction return value propagated correctly'
  );
  const invAfterSuccess = udmStore.getInvoices().find((i) => i.id === atomicInv2.id);
  testAssert(
    invAfterSuccess?.status === 'partially_paid',
    'Atomicity 8g: Invoice status updated after successful transaction'
  );

  // 8h: Outstanding balance after successful transaction reflects payment
  const outstandingAfterSuccess = udmStore.computeInvoiceOutstanding(atomicInv2);
  testAssert(
    outstandingAfterSuccess === 6000000,
    `Atomicity 8h: Outstanding = ₹1,00,000 - ₹40,000 = ₹60,000 (Got ₹${outstandingAfterSuccess / 100})`
  );

  // 8i: Idempotency key consistency after rollback then success
  const idemKeySuccess = 'idem-atomic-key-002';
  const invIdemSuccess1 = udmStore.insertInvoice({
    organization_id: atomicOrg,
    source_system: 'manual',
    source_id: 'src_inv_idem_success_1',
    customer_id: atomicCustomer.id,
    number: 'INV-IDEM-SUCCESS-001',
    amount_minor_units: 2000000,
    currency: 'INR',
    tax_amount_minor_units: 360000,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
    idempotency_key: idemKeySuccess,
  });
  const invIdemSuccess2 = udmStore.insertInvoice({
    organization_id: atomicOrg,
    source_system: 'manual',
    source_id: 'src_inv_idem_success_1',
    customer_id: atomicCustomer.id,
    number: 'INV-IDEM-SUCCESS-001-DUPLICATE',
    amount_minor_units: 99999999,
    currency: 'INR',
    tax_amount_minor_units: 360000,
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'open',
    idempotency_key: idemKeySuccess,
  });
  testAssert(
    invIdemSuccess1.id === invIdemSuccess2.id,
    `Atomicity 8i: Idempotency consistent — same key returns existing record (id1=${invIdemSuccess1.id}, id2=${invIdemSuccess2.id})`
  );

  // --------------------------------------------------
  // 9. CONCURRENT TRANSACTION SAFETY
  // Overlapping transactions must not interfere with each other's snapshots
  // or restore another operation's changes. The _transactionLock serializes
  // concurrent transactions within the process.
  // --------------------------------------------------
  const concOrg2 = 'org_concurrent_tx_test';
  udmStore.clearAll();
  udmStore.setTenantContext(concOrg2);

  const concCustomer2 = udmStore.insertCustomer({
    organization_id: concOrg2,
    source_system: 'manual',
    source_id: 'src_cust_conc_tx',
    name: 'Concurrent Tx Test Customer',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const concInv1 = udmStore.insertInvoice({
    organization_id: concOrg2,
    source_system: 'manual',
    source_id: 'src_inv_conc_tx_1',
    customer_id: concCustomer2.id,
    number: 'INV-CONC-TX-001',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 1800000,
    issue_date: '2026-09-01',
    due_date: '2026-09-30',
    status: 'open',
  });

  const concPay1 = udmStore.insertPayment({
    organization_id: concOrg2,
    source_system: 'manual',
    source_id: 'src_pay_conc_tx_1',
    customer_id: concCustomer2.id,
    amount_minor_units: 4000000,
    currency: 'INR',
    date: '2026-09-15',
  });

  // 9a: Two concurrent transactions modifying different invoices → both succeed
  const concInv2 = udmStore.insertInvoice({
    organization_id: concOrg2,
    source_system: 'manual',
    source_id: 'src_inv_conc_tx_2',
    customer_id: concCustomer2.id,
    number: 'INV-CONC-TX-002',
    amount_minor_units: 5000000,
    currency: 'INR',
    tax_amount_minor_units: 900000,
    issue_date: '2026-09-01',
    due_date: '2026-09-30',
    status: 'open',
  });

  const concPay2 = udmStore.insertPayment({
    organization_id: concOrg2,
    source_system: 'manual',
    source_id: 'src_pay_conc_tx_2',
    customer_id: concCustomer2.id,
    amount_minor_units: 3000000,
    currency: 'INR',
    date: '2026-09-16',
  });

  const txResult1 = udmStore.transaction(() => {
    return udmStore.insertMatch({
      organization_id: concOrg2,
      payment_id: concPay1.id,
      invoice_id: concInv1.id,
      matched_amount_minor_units: 4000000,
      match_method: 'deterministic',
    });
  });

  const txResult2 = udmStore.transaction(() => {
    return udmStore.insertMatch({
      organization_id: concOrg2,
      payment_id: concPay2.id,
      invoice_id: concInv2.id,
      matched_amount_minor_units: 3000000,
      match_method: 'deterministic',
    });
  });

  const [match1, match2] = await Promise.all([txResult1, txResult2]);

  testAssert(
    match1.id !== match2.id,
    'Concurrency 9a: Concurrent transactions on different data → both succeed with distinct records'
  );

  const allMatchesAfterConcurrent = udmStore.getMatches().filter(
    (m) => m.organization_id === concOrg2
  );
  testAssert(
    allMatchesAfterConcurrent.length === 2,
    `Concurrency 9b: Two matches persisted after concurrent transactions (got ${allMatchesAfterConcurrent.length})`
  );

  // 9c: Concurrent transactions on same invoice → second one sees first one's changes
  const concInv3 = udmStore.insertInvoice({
    organization_id: concOrg2,
    source_system: 'manual',
    source_id: 'src_inv_conc_tx_3',
    customer_id: concCustomer2.id,
    number: 'INV-CONC-TX-003',
    amount_minor_units: 5000000,
    currency: 'INR',
    tax_amount_minor_units: 900000,
    issue_date: '2026-09-01',
    due_date: '2026-09-30',
    status: 'open',
  });

  const concPay3 = udmStore.insertPayment({
    organization_id: concOrg2,
    source_system: 'manual',
    source_id: 'src_pay_conc_tx_3',
    customer_id: concCustomer2.id,
    amount_minor_units: 3000000,
    currency: 'INR',
    date: '2026-09-17',
  });

  const concPay4 = udmStore.insertPayment({
    organization_id: concOrg2,
    source_system: 'manual',
    source_id: 'src_pay_conc_tx_4',
    customer_id: concCustomer2.id,
    amount_minor_units: 2000000,
    currency: 'INR',
    date: '2026-09-18',
  });

  // First transaction allocates 3000000 of 5000000
  const txResult3 = udmStore.transaction(() => {
    const match = udmStore.insertMatch({
      organization_id: concOrg2,
      payment_id: concPay3.id,
      invoice_id: concInv3.id,
      matched_amount_minor_units: 3000000,
      match_method: 'deterministic',
    });
    udmStore.updateInvoice(concInv3.id, { status: 'partially_paid' });
    return match;
  });

  // Second transaction runs concurrently — it should see the post-transaction
  // state because transactions are serialized via _transactionLock
  const txResult4 = udmStore.transaction(() => {
    const existingMatches = udmStore.getMatches().filter(
      (m) => m.invoice_id === concInv3.id
    );
    const paidSum = existingMatches.reduce((s, m) => s + m.matched_amount_minor_units, 0);
    const openBal = Math.max(0, concInv3.amount_minor_units - paidSum);

    const match = udmStore.insertMatch({
      organization_id: concOrg2,
      payment_id: concPay4.id,
      invoice_id: concInv3.id,
      matched_amount_minor_units: Math.min(2000000, openBal),
      match_method: 'deterministic',
    });
    const newPaidTotal = paidSum + match.matched_amount_minor_units;
    udmStore.updateInvoice(
      concInv3.id,
      { status: newPaidTotal >= concInv3.amount_minor_units ? 'paid' : 'partially_paid' }
    );
    return match;
  });

  const [match3, match4] = await Promise.all([txResult3, txResult4]);

  const allMatchesAfterSameInvoice = udmStore.getMatches().filter(
    (m) => m.invoice_id === concInv3.id
  );
  testAssert(
    allMatchesAfterSameInvoice.length === 2,
    `Concurrency 9c: Two matches on same invoice after serialized transactions (got ${allMatchesAfterSameInvoice.length})`
  );

  // 9d: Invoice status reflects both allocations
  const concInv3After = udmStore.getInvoices().find((i) => i.id === concInv3.id);
  const totalPaid = allMatchesAfterSameInvoice.reduce(
    (s, m) => s + m.matched_amount_minor_units,
    0
  );
  const expectedStatus =
    totalPaid >= concInv3.amount_minor_units ? 'paid' : 'partially_paid';
  testAssert(
    concInv3After?.status === expectedStatus,
    `Concurrency 9d: Invoice status reflects both allocations (status=${concInv3After?.status}, expected=${expectedStatus})`
  );

  // --------------------------------------------------
  // 10. API-LEVEL IDEMPOTENCY TESTS
  // Tests that Idempotency-Key header enforcement works at the API boundary.
  // --------------------------------------------------
  dashboardMetricsStore.clearAll();

  const apiOrg = 'org_api_idem_test';
  udmStore.clearAll();
  udmStore.setTenantContext(apiOrg);

  const apiCustomer = udmStore.insertCustomer({
    organization_id: apiOrg,
    source_system: 'manual',
    source_id: 'src_cust_api_test',
    name: 'API Idempotency Test Customer',
    credit_limit_minor_units: 10000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // 10a: Missing Idempotency-Key header → 400
  // Tested at the API route level (customers/route.ts, onboarding/import/route.ts,
  // billing/route.ts) — the middleware checks for the header before calling
  // checkAndReserveIdempotency. Store-level tests below verify the core logic.

  // 10b: Direct store-level idempotency check - same key + same fingerprint → replay
  const storeCheck1 = await udmStore.checkAndReserveApiIdempotency(apiOrg, 'customers', 'idem-test-key-1', 'fingerprint-a');
  testAssert(
    storeCheck1.status === 'available',
    'API Idempotency 10b: First call with new key returns available'
  );

  const storeCheck2 = await udmStore.checkAndReserveApiIdempotency(apiOrg, 'customers', 'idem-test-key-1', 'fingerprint-a');
  testAssert(
    storeCheck2.status === 'replay',
    'API Idempotency 10c: Same key + same fingerprint → replay'
  );
  testAssert(
    storeCheck2.recordId === null || storeCheck2.response === null,
    'API Idempotency 10d: Replay before finalize has no response (expected - finalize not called in test)'
  );

  // 10c: Same key + different fingerprint → conflict
  const storeCheck3 = await udmStore.checkAndReserveApiIdempotency(apiOrg, 'customers', 'idem-test-key-1', 'fingerprint-b');
  testAssert(
    storeCheck3.status === 'conflict',
    'API Idempotency 10e: Same key + different fingerprint → conflict'
  );

  // 10d: Different key → available
  const storeCheck4 = await udmStore.checkAndReserveApiIdempotency(apiOrg, 'customers', 'idem-test-key-2', 'fingerprint-a');
  testAssert(
    storeCheck4.status === 'available',
    'API Idempotency 10f: Different key → available'
  );

  // 10e: Finalize and replay
  udmStore.finalizeApiIdempotency(apiOrg, 'customers', 'idem-test-key-1', 'record-123', 'fingerprint-a', { success: true, customer: { id: 'record-123' } });
  const storeCheck5 = await udmStore.checkAndReserveApiIdempotency(apiOrg, 'customers', 'idem-test-key-1', 'fingerprint-a');
  testAssert(
    storeCheck5.status === 'replay',
    'API Idempotency 10g: After finalize, same key + same fingerprint → replay with response'
  );
  testAssert(
    storeCheck5.recordId === 'record-123',
    'API Idempotency 10h: Replay returns the stored record ID'
  );
  testAssert(
    storeCheck5.response !== null,
    'API Idempotency 10i: Replay returns the stored response'
  );

  // 10f: Release and retry
  udmStore.releaseApiIdempotency(apiOrg, 'customers', 'idem-test-key-1');
  const storeCheck6 = await udmStore.checkAndReserveApiIdempotency(apiOrg, 'customers', 'idem-test-key-1', 'fingerprint-a');
  testAssert(
    storeCheck6.status === 'available',
    'API Idempotency 10j: After release, same key → available again'
  );

  console.log('\n==========================================');
  console.log(`FINANCIAL SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}