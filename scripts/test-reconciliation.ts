import { udmStore } from '../src/lib/udm/store';
import { reconciliationEngine } from '../src/lib/reconciliation/engine';
import { approvalStore } from '../src/lib/approvals/store';

async function runReconciliationForensicAudit() {
  console.log('============================================================');
  console.log('STARTING AIOSPARK — RECONCILIATION FORENSIC AUDIT');
  console.log('============================================================\n');

  // PHASE 4: CLEAN TENANT ZERO-DATA CONTROL TEST
  console.log('--- PHASE 4: CLEAN TENANT ZERO-DATA CONTROL TEST ---');
  const cleanOrgId = 'org-recon-clean-test';
  udmStore.setTenantContext(cleanOrgId);

  const cleanBankTxs = udmStore.getBankTransactions();
  const cleanPayments = udmStore.getPayments();
  const cleanMatches = udmStore.getMatches();
  const cleanInvoices = udmStore.getInvoices();
  const cleanOutcomes = reconciliationEngine.getOutcomes(cleanOrgId);

  console.log(`Clean Bank Txs: ${cleanBankTxs.length}`);
  console.log(`Clean Payments: ${cleanPayments.length}`);
  console.log(`Clean Matches: ${cleanMatches.length}`);
  console.log(`Clean Invoices: ${cleanInvoices.length}`);
  console.log(`Clean Outcomes: ${cleanOutcomes.length}`);

  if (
    cleanBankTxs.length !== 0 ||
    cleanPayments.length !== 0 ||
    cleanMatches.length !== 0 ||
    cleanInvoices.length !== 0 ||
    cleanOutcomes.length !== 0
  ) {
    throw new Error('P0 DATA CONTAMINATION: Clean tenant initialized with non-zero reconciliation records!');
  }
  console.log('✅ PHASE 4 PASSED: Clean Tenant Zero-Data Verification\n');

  // PHASE 5 & 6: CONTROLLED REAL DATASET SETUP & DATA PROVENANCE
  console.log('--- PHASE 5 & 6: CONTROLLED DATASET SETUP & DATA PROVENANCE ---');
  const testOrgId = 'org-recon-test-001';
  udmStore.setTenantContext(testOrgId);

  const customer = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'CUST-RECON-001',
    name: 'Reconciliation Test Customer Pvt Ltd',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
    import_batch_id: 'BATCH-RECON-PILOT-01',
    source_file_name: 'recon_pilot.csv',
    source_row_number: 1,
    created_by: 'system',
  });

  const invoice = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'INV-RECON-001',
    number: 'RECON-INV-001',
    customer_id: customer.id,
    amount_minor_units: 12500000, // ₹1,25,000
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-09-01',
    due_date: '2026-09-15',
    status: 'open',
    po_reference: 'PO-RECON-100',
    import_batch_id: 'BATCH-RECON-PILOT-01',
    source_file_name: 'recon_pilot.csv',
    source_row_number: 2,
    created_by: 'system',
  });

  const bankTx = udmStore.insertBankTransaction({
    organization_id: testOrgId,
    source_system: 'manual_upload',
    raw_reference: 'RECON-UTR-001',
    amount_minor_units: 2500000, // ₹25,000
    currency: 'INR',
    date: '2026-09-10',
    narration_text: 'Payment credit from Reconciliation Test Customer Pvt Ltd RECON-INV-001',
    status: 'unmatched',
    import_batch_id: 'BATCH-RECON-PILOT-01',
    source_file_name: 'recon_pilot.csv',
  });

  console.log(`Customer: ${customer.name}`);
  console.log(`Invoice: ${invoice.number} (Gross Amount: ₹${invoice.amount_minor_units / 100})`);
  console.log(`Bank Tx: ${bankTx.raw_reference} (Amount: ₹${bankTx.amount_minor_units / 100}, Status: ${bankTx.status})`);

  if (bankTx.amount_minor_units !== 2500000 || bankTx.status !== 'unmatched') {
    throw new Error('Bank transaction initial state or minor units mismatch');
  }
  console.log('✅ PHASE 5 & 6 PASSED: Controlled Dataset Persisted with Data Provenance\n');

  // PHASE 9, 10 & 13: THREE-WAY RECONCILIATION & CANDIDATE MATCHING
  console.log('--- PHASE 9, 10 & 13: THREE-WAY RECONCILIATION & CANDIDATE MATCHING ---');
  const reconResult = await reconciliationEngine.reconcileTransactions(testOrgId);
  console.log(`Processed Txs: ${reconResult.processedCount}`);
  console.log(`Proposed Matches: ${reconResult.proposedCount}`);
  console.log(`Pending Approval Count: ${reconResult.pendingApprovalCount}`);

  const updatedTx = udmStore.getBankTransactions().find(t => t.id === bankTx.id);
  if (!updatedTx || updatedTx.status !== 'pending_approval') {
    throw new Error(`Expected bank transaction status 'pending_approval', got ${updatedTx?.status}`);
  }

  const appReqs = approvalStore.getRequests(testOrgId);
  const matchReq = appReqs.find(r => r.proposed_action?.bank_transaction_id === bankTx.id);

  if (!matchReq) {
    throw new Error('Reconciliation proposal was not submitted to Layer 18 Approval Queue!');
  }

  console.log(`Match Proposal ID: ${matchReq.id}`);
  console.log(`Confidence Score: ${matchReq.confidence * 100}%`);
  console.log(`Matched Invoices: ${matchReq.proposed_action.matched_invoice_numbers.join(', ')}`);

  if (!matchReq.proposed_action.matched_invoice_ids.includes(invoice.id)) {
    throw new Error('Reconciliation candidate search failed to identify target invoice');
  }
  console.log('✅ PHASE 9, 10 & 13 PASSED: Candidate Matching & Approval Interception Verified\n');

  // PHASE 11: PARTIAL RECONCILIATION & BALANCE RECALCULATION
  console.log('--- PHASE 11: PARTIAL RECONCILIATION & BALANCE RECALCULATION ---');
  const execResult = await reconciliationEngine.executeApprovedMatch(matchReq.id, 'user_mgr_1');
  console.log(`Reconciliation Execution Success: ${execResult.success}`);
  console.log(`Created Payment ID: ${execResult.paymentId}`);
  console.log(`Match IDs: ${execResult.matchIds.join(', ')}`);

  const refreshedInvoice = udmStore.getInvoices().find(i => i.id === invoice.id);
  const matches = udmStore.getMatches().filter(m => m.invoice_id === invoice.id);
  const paidSumPaise = matches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);
  const netOutstandingPaise = refreshedInvoice!.amount_minor_units - paidSumPaise;

  console.log(`Refreshed Invoice Status: ${refreshedInvoice?.status}`);
  console.log(`Total Paid: ₹${paidSumPaise / 100}`);
  console.log(`Net Outstanding: ₹${netOutstandingPaise / 100}`);

  if (refreshedInvoice?.status !== 'partially_paid' || netOutstandingPaise !== 10000000) {
    throw new Error(`Expected status 'partially_paid' and outstanding ₹1,00,000 (10000000 paise), got ${refreshedInvoice?.status} / ${netOutstandingPaise}`);
  }

  const finalTx = udmStore.getBankTransactions().find(t => t.id === bankTx.id);
  if (finalTx?.status !== 'matched' || finalTx?.matched_payment_id !== execResult.paymentId) {
    throw new Error(`Expected bank transaction status 'matched', got ${finalTx?.status}`);
  }
  console.log('✅ PHASE 11 PASSED: Partial Reconciliation Executed & Balance Correct\n');

  // PHASE 14: UNMATCHED BANK TRANSACTION SAFEGUARD
  console.log('--- PHASE 14: UNMATCHED BANK TRANSACTION SAFEGUARD ---');
  const unmatchedTx = udmStore.insertBankTransaction({
    organization_id: testOrgId,
    source_system: 'manual_upload',
    raw_reference: 'UNKNOWN-UTR-999',
    amount_minor_units: 3000000, // ₹30,000
    currency: 'INR',
    date: '2026-09-11',
    narration_text: 'Unknown wire transfer without invoice reference',
    status: 'unmatched',
  });

  await reconciliationEngine.reconcileTransactions(testOrgId);
  const currentUnmatchedTx = udmStore.getBankTransactions().find(t => t.id === unmatchedTx.id);
  console.log(`Unmatched Tx Final Status: ${currentUnmatchedTx?.status}`);

  if (currentUnmatchedTx?.status !== 'unmatched') {
    throw new Error(`Expected status 'unmatched' for unlinked bank transaction, got ${currentUnmatchedTx?.status}`);
  }
  console.log('✅ PHASE 14 PASSED: Unmatched Transaction Safeguard Verified\n');

  // PHASE 19: OVER-ALLOCATION PREVENTION
  console.log('--- PHASE 19: OVER-ALLOCATION SAFEGUARD TEST ---');
  const excessTx = udmStore.insertBankTransaction({
    organization_id: testOrgId,
    source_system: 'manual_upload',
    raw_reference: 'EXCESS-UTR-002',
    amount_minor_units: 15000000, // ₹1,50,000 (exceeds net outstanding ₹1,00,000)
    currency: 'INR',
    date: '2026-09-12',
    narration_text: 'Excess credit RECON-INV-001',
    status: 'unmatched',
  });

  await reconciliationEngine.reconcileTransactions(testOrgId);
  const excessReq = approvalStore.getRequests(testOrgId).find(r => r.proposed_action?.bank_transaction_id === excessTx.id);

  if (excessReq) {
    const excessExec = await reconciliationEngine.executeApprovedMatch(excessReq.id, 'user_mgr_1');
    const excessMatches = udmStore.getMatches().filter(m => m.payment_id === excessExec.paymentId);
    const allocatedPaise = excessMatches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);

    console.log(`Attempted Allocation ₹1.5L -> Actual Allocated: ₹${allocatedPaise / 100}`);

    if (allocatedPaise > 10000000) {
      throw new Error(`P0 OVER-ALLOCATION DEFECT: Allocated ${allocatedPaise} paise against open balance of 10000000 paise!`);
    }
  }
  console.log('✅ PHASE 19 PASSED: Over-Allocation Safeguard Enforced\n');

  // PHASE 43: MULTI-TENANT ISOLATION
  console.log('--- PHASE 43: MULTI-TENANT ISOLATION TEST ---');
  const tenantBId = 'org-tenant-b-recon-test';
  udmStore.setTenantContext(tenantBId);

  const tenantBTxs = udmStore.getBankTransactions();
  const tenantBOutcomes = reconciliationEngine.getOutcomes(tenantBId);

  if (tenantBTxs.some(t => t.id === bankTx.id) || tenantBOutcomes.some(o => o.bankTransactionId === bankTx.id)) {
    throw new Error('Multi-Tenant Leakage: Tenant B accessed Tenant A bank transaction or outcome record!');
  }
  console.log('✅ PHASE 43 PASSED: Multi-Tenant Isolation Verified\n');

  console.log('============================================================');
  console.log('ALL RECONCILIATION FORENSIC AUDIT PHASES PASSED SUCCESSFULLY');
  console.log('============================================================');
}

runReconciliationForensicAudit().catch((err) => {
  console.error('❌ RECONCILIATION FORENSIC AUDIT FAILED:', err);
  process.exit(1);
});
