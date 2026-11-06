import { udmStore } from '../src/lib/udm/store';
import { reconciliationEngine } from '../src/lib/reconciliation/engine';
import { approvalStore } from '../src/lib/approvals/store';
import { queryPaymentsWorkspace } from '../src/lib/payments/query-engine';

async function runPaymentMatchingForensicAudit() {
  console.log('============================================================');
  console.log('STARTING AIOSPARK — PAYMENT → MATCHING FORENSIC AUDIT');
  console.log('============================================================\n');

  // PHASE 3: ZERO-DATA CONTROL TENANT
  console.log('--- PHASE 3: ZERO-DATA CONTROL TENANT ---');
  const cleanOrgId = 'org-pay-clean-test';
  udmStore.setTenantContext(cleanOrgId);

  const cleanTxs = udmStore.getBankTransactions();
  const cleanPayments = udmStore.getPayments();
  const cleanMatches = udmStore.getMatches();
  const cleanInvoices = udmStore.getInvoices();

  console.log(`Clean Bank Txs: ${cleanTxs.length}`);
  console.log(`Clean Payments: ${cleanPayments.length}`);
  console.log(`Clean Matches: ${cleanMatches.length}`);
  console.log(`Clean Invoices: ${cleanInvoices.length}`);

  if (cleanTxs.length !== 0 || cleanPayments.length !== 0 || cleanMatches.length !== 0 || cleanInvoices.length !== 0) {
    throw new Error('P0 DATA CONTAMINATION: Clean organization initialized with non-zero payment/matching data!');
  }
  console.log('✅ PHASE 3 PASSED: Zero-Data Control Tenant Verified\n');

  // PHASE 4 & 5: CONTROLLED REAL-DATA DATASET & PERSISTENCE
  console.log('--- PHASE 4 & 5: CONTROLLED DATASET & PERSISTENCE TEST ---');
  const testOrgId = 'org-pay-test-001';
  udmStore.setTenantContext(testOrgId);

  const customer = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'CUST-PMT-001',
    name: 'Payment Matching Test Customer Pvt Ltd',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_by: 'system',
  });

  const invoice = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'INV-PMT-001',
    number: 'PMT-MATCH-INV-001',
    customer_id: customer.id,
    amount_minor_units: 12500000, // ₹1,25,000
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-09-01',
    due_date: '2026-09-15',
    status: 'open',
    po_reference: 'PO-PMT-100',
    created_by: 'system',
  });

  const bankTx = udmStore.insertBankTransaction({
    organization_id: testOrgId,
    source_system: 'manual_upload',
    raw_reference: 'PMT-REF-001',
    amount_minor_units: 2500000, // ₹25,000
    currency: 'INR',
    date: '2026-09-10',
    narration_text: 'Payment received from Payment Matching Test Customer Pvt Ltd PMT-MATCH-INV-001',
    status: 'unmatched',
  });

  console.log(`Customer: ${customer.name}`);
  console.log(`Invoice: ${invoice.number} (Gross Amount: ₹${invoice.amount_minor_units / 100})`);
  console.log(`Bank Tx: ${bankTx.raw_reference} (Amount: ₹${bankTx.amount_minor_units / 100}, Minor Units: ${bankTx.amount_minor_units})`);

  if (bankTx.amount_minor_units !== 2500000 || bankTx.currency !== 'INR') {
    throw new Error('Bank transaction minor units or currency mismatch');
  }
  console.log('✅ PHASE 4 & 5 PASSED: Controlled Dataset Persisted in Minor Units\n');

  // PHASE 7 & 8: MATCH CANDIDATE GENERATION & EVIDENCE WEIGHTING
  console.log('--- PHASE 7 & 8: CANDIDATE GENERATION & EVIDENCE EVALUATION ---');
  const reconResult = await reconciliationEngine.reconcileTransactions(testOrgId);
  console.log(`Processed Txs: ${reconResult.processedCount}`);
  console.log(`Proposed Matches: ${reconResult.proposedCount}`);
  console.log(`Pending Approval Count: ${reconResult.pendingApprovalCount}`);

  const updatedTx = udmStore.getBankTransactions().find(t => t.id === bankTx.id);
  if (!updatedTx || updatedTx.status !== 'pending_approval') {
    throw new Error(`Expected transaction status 'pending_approval', got ${updatedTx?.status}`);
  }

  const appReqs = approvalStore.getRequests(testOrgId);
  const matchReq = appReqs.find(r => r.proposed_action?.bank_transaction_id === bankTx.id);

  if (!matchReq) {
    throw new Error('Reconciliation match proposal was not submitted to Approval Queue!');
  }

  console.log(`Proposed Match Request ID: ${matchReq.id}`);
  console.log(`Confidence: ${matchReq.confidence * 100}%`);
  console.log(`Matched Invoices: ${matchReq.proposed_action.matched_invoice_numbers.join(', ')}`);

  if (!matchReq.proposed_action.matched_invoice_ids.includes(invoice.id)) {
    throw new Error('Candidate matching engine failed to identify target invoice');
  }
  console.log('✅ PHASE 7 & 8 PASSED: Candidate Matching & Evidence Scoring Verified\n');

  // PHASE 9, 10 & 14: PARTIAL PAYMENT ALLOCATION & HUMAN CONFIRMATION
  console.log('--- PHASE 9, 10 & 14: PARTIAL PAYMENT ALLOCATION & OUTCOME EXECUTION ---');
  const execResult = await reconciliationEngine.executeApprovedMatch(matchReq.id, 'user_mgr_1');
  console.log(`Match Execution Success: ${execResult.success}`);
  console.log(`Created Payment ID: ${execResult.paymentId}`);
  console.log(`Match IDs: ${execResult.matchIds.join(', ')}`);

  const refreshedInvoice = udmStore.getInvoices().find(i => i.id === invoice.id);
  const existingMatches = udmStore.getMatches().filter(m => m.invoice_id === invoice.id);
  const totalPaidPaise = existingMatches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);
  const netOutstandingPaise = refreshedInvoice!.amount_minor_units - totalPaidPaise;

  console.log(`Invoice Status after ₹25k Allocation: ${refreshedInvoice?.status}`);
  console.log(`Total Paid: ₹${totalPaidPaise / 100}`);
  console.log(`Net Outstanding: ₹${netOutstandingPaise / 100}`);

  if (refreshedInvoice?.status !== 'partially_paid' || netOutstandingPaise !== 10000000) {
    throw new Error(`Expected status 'partially_paid' and outstanding ₹1,00,000 (10000000 paise), got ${refreshedInvoice?.status} / ${netOutstandingPaise}`);
  }
  console.log('✅ PHASE 9, 10 & 14 PASSED: Partial Payment Allocated & Outstanding Updated\n');

  // PHASE 13: OVER-ALLOCATION PREVENTION
  console.log('--- PHASE 13: OVER-ALLOCATION PREVENTION TEST ---');
  const overBankTx = udmStore.insertBankTransaction({
    organization_id: testOrgId,
    source_system: 'manual_upload',
    raw_reference: 'OVER-PMT-REF-001',
    amount_minor_units: 15000000, // ₹1,50,000 (Exceeds net outstanding of ₹1,00,000)
    currency: 'INR',
    date: '2026-09-12',
    narration_text: 'Excess payment PMT-MATCH-INV-001',
    status: 'unmatched',
  });

  await reconciliationEngine.reconcileTransactions(testOrgId);
  const overReqs = approvalStore.getRequests(testOrgId);
  const overMatchReq = overReqs.find(r => r.proposed_action?.bank_transaction_id === overBankTx.id);

  if (overMatchReq) {
    const overExecResult = await reconciliationEngine.executeApprovedMatch(overMatchReq.id, 'user_mgr_1');
    const overMatches = udmStore.getMatches().filter(m => m.payment_id === overExecResult.paymentId);
    const allocatedMinorUnits = overMatches.reduce((s, m) => s + m.matched_amount_minor_units, 0);
    console.log(`Attempted Allocation ₹1.5L -> Actual Allocated: ₹${allocatedMinorUnits / 100}`);

    if (allocatedMinorUnits > 10000000) {
      throw new Error(`P0 FINANCIAL CONTROLS DEFECT: Over-allocation occurred! Allocated ${allocatedMinorUnits} paise against open balance of 10000000 paise.`);
    }
  }
  console.log('✅ PHASE 13 PASSED: Over-Allocation Safeguard Enforced\n');

  // PHASE 11: WRONG MATCH / OTHER CUSTOMER SAFEGUARD TEST
  console.log('--- PHASE 11: WRONG-CUSTOMER MATCH SAFEGUARD TEST ---');
  const otherCustomer = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'CUST-OTHER-001',
    name: 'Unrelated Customer Pvt Ltd',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_by: 'system',
  });

  const otherInvoice = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'INV-OTHER-001',
    number: 'OTHER-INV-999',
    customer_id: otherCustomer.id,
    amount_minor_units: 2500000, // Same ₹25,000 amount
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-09-01',
    due_date: '2026-09-15',
    status: 'open',
    created_by: 'system',
  });

  const wrongBankTx = udmStore.insertBankTransaction({
    organization_id: testOrgId,
    source_system: 'manual_upload',
    raw_reference: 'WRONG-REF-001',
    amount_minor_units: 2500000, // Same ₹25,000 amount
    currency: 'INR',
    date: '2026-09-12',
    narration_text: 'Payment from Payment Matching Test Customer Pvt Ltd PMT-MATCH-INV-001',
    status: 'unmatched',
  });

  const wrongProp = reconciliationEngine.runDeterministicPass(wrongBankTx, [otherInvoice], testOrgId);
  console.log(`Wrong Customer Deterministic Match Result: ${wrongProp ? 'MATCHED (FAIL)' : 'NULL (PASS)'}`);

  if (wrongProp !== null) {
    throw new Error('SECURITY DEFECT: Engine matched bank transaction to wrong customer invoice based solely on amount!');
  }
  console.log('✅ PHASE 11 PASSED: Wrong-Customer Match Prevention Verified\n');

  // PHASE 29: MULTI-TENANT ISOLATION
  console.log('--- PHASE 29: MULTI-TENANT ISOLATION TEST ---');
  const tenantBId = 'org-tenant-b-pay-test';
  udmStore.setTenantContext(tenantBId);
  const tenantBTxs = udmStore.getBankTransactions();
  const tenantBMatches = udmStore.getMatches();

  if (tenantBTxs.some(t => t.id === bankTx.id) || tenantBMatches.some(m => m.invoice_id === invoice.id)) {
    throw new Error('Multi-Tenant Leakage: Tenant B accessed Tenant A bank transaction or match record!');
  }
  console.log('✅ PHASE 29 PASSED: Multi-Tenant Isolation Verified\n');

  console.log('============================================================');
  console.log('ALL PAYMENT → MATCHING FORENSIC AUDIT PHASES PASSED SUCCESSFULLY');
  console.log('============================================================');
}

runPaymentMatchingForensicAudit().catch((err) => {
  console.error('❌ PAYMENT → MATCHING FORENSIC AUDIT FAILED:', err);
  process.exit(1);
});
