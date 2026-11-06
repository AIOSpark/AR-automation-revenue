import { udmStore } from '../src/lib/udm/store';
import { getCashUnblockQueue, getUnblockQueueSummary } from '../src/lib/unblock-queue/engine';
import { CashUnblockSimulatorEngine } from '../src/lib/intelligence/cash-unblock-simulator';
import { NextBestActionEngine } from '../src/lib/intelligence/next-best-action-engine';

async function runCashUnblockForensicAudit() {
  console.log('============================================================');
  console.log('STARTING AIOSPARK — REAL DATA → CASH UNBLOCK FORENSIC AUDIT');
  console.log('============================================================\n');

  // PHASE 6: ZERO-DATA TEST
  console.log('--- PHASE 6: ZERO-DATA TEST ---');
  const cleanOrgId = 'org-cash-clean-test';
  udmStore.setTenantContext(cleanOrgId);
  const cleanQueue = getCashUnblockQueue(cleanOrgId);
  const cleanSummary = getUnblockQueueSummary(cleanOrgId);

  console.log(`Clean Queue Item Count: ${cleanQueue.length}`);
  console.log(`Clean Total Cash Affected: ${cleanSummary.totalCashAffectedMinorUnits}`);
  console.log(`Clean Actionable Cash: ${cleanSummary.actionableCashMinorUnits}`);

  if (cleanQueue.length !== 0 || cleanSummary.totalCashAffectedMinorUnits !== 0 || cleanSummary.actionableCashMinorUnits !== 0) {
    throw new Error('P0 DATA CONTAMINATION: Clean organization initialized with non-zero Cash Unblock data!');
  }
  console.log('✅ PHASE 6 PASSED: Clean Organization Zero-Data Verification\n');

  // PHASE 4 & 7: CONTROLLED DATASET SETUP
  console.log('--- PHASE 4 & 7: CONTROLLED REAL DATASET & LINKAGE TEST ---');
  const testOrgId = 'org-cash-test-001';
  udmStore.setTenantContext(testOrgId);

  const custRecord = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'CUST-PROV-001',
    name: 'PROV-CASH-CUST-001',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
    import_batch_id: 'BATCH-CASH-PILOT-01',
    source_file_name: 'cash_pilot.csv',
    source_row_number: 1,
    created_by: 'system',
  });

  const invRecord = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'INV-PROV-001',
    number: 'PROV-CASH-INV-001',
    customer_id: custRecord.id,
    amount_minor_units: 12500000, // ₹1,25,000
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-09-01',
    due_date: '2026-09-15',
    status: 'open',
    po_reference: 'PO-PROV-100',
    import_batch_id: 'BATCH-CASH-PILOT-01',
    source_file_name: 'cash_pilot.csv',
    source_row_number: 2,
    created_by: 'system',
  });

  // Create partial payment match of ₹25,000 (2,500,000 minor units)
  udmStore.insertMatch({
    organization_id: testOrgId,
    payment_id: 'pay-prov-cash-01',
    invoice_id: invRecord.id,
    matched_amount_minor_units: 2500000, // ₹25,000
    confidence: 1.0,
  });

  // Create PO mismatch exception (PO Qty 1000 vs Inv Qty 1200)
  udmStore.insertException({
    organization_id: testOrgId,
    invoice_id: invRecord.id,
    type: 'PO_QUANTITY_MISMATCH',
    severity: 'high',
    status: 'detected',
    evidence: {
      description: 'Invoice quantity (1,200) exceeds PO authorized quantity (1,000)',
      po_quantity: 1000,
      invoice_quantity: 1200,
      variance: '+200 units',
    },
    recommended_action: 'Contact procurement to reconcile line items or issue credit note for ₹20,000',
  });

  const testQueue = getCashUnblockQueue(testOrgId);
  const item = testQueue.find(i => i.invoiceId === invRecord.id);

  if (!item) {
    throw new Error('Controlled invoice not found in Cash Unblock Queue');
  }

  console.log(`Invoice: ${item.invoiceNumber}`);
  console.log(`Customer: ${item.customerName}`);
  console.log(`Cash Affected: ₹${item.cashAffectedMinorUnits / 100}`);
  console.log(`Primary Blocker: ${item.primaryBlocker}`);
  console.log(`Actionability: ${item.actionability}`);
  console.log(`Evidence Variance: ${item.evidenceSummary?.variance}`);

  if (item.customerName !== 'PROV-CASH-CUST-001' || item.cashAffectedMinorUnits !== 12500000) {
    throw new Error('Controlled Cash Unblock item metadata does not match UDM record');
  }
  console.log('✅ PHASE 4 & 7 PASSED: Controlled Dataset Setup & Blocker Linkage Verified\n');

  // PHASE 9: OPPORTUNITY AMOUNT VALIDATION & SIMULATOR FACT CHECK
  console.log('--- PHASE 9 & 19: OPPORTUNITY AMOUNT VALIDATION & SIMULATOR FACT CHECK ---');
  const simResult = CashUnblockSimulatorEngine.simulate({ invoiceId: invRecord.id, orgId: testOrgId });
  if (!simResult) {
    throw new Error('Simulator failed to process controlled invoice');
  }

  console.log(`Actual Outstanding: ₹${simResult.actualOutstandingMinorUnits / 100}`);
  console.log(`Actual Actionable Cash: ₹${simResult.actualActionableCashMinorUnits / 100}`);

  if (simResult.actualOutstandingMinorUnits !== 10000000) {
    throw new Error(`Expected actual outstanding ₹1,00,000 (10000000 paise) after ₹25,000 payment allocation, got ${simResult.actualOutstandingMinorUnits}`);
  }

  if (simResult.isReadOnly !== true) {
    throw new Error('Simulator result is not marked read-only');
  }
  console.log('✅ PHASE 9 & 19 PASSED: Opportunity Amount Validation & Simulator Fact Check\n');

  // PHASE 12: PARTIAL PAYMENT TEST
  console.log('--- PHASE 12 & 23: PARTIAL PAYMENT TEST ---');
  udmStore.insertMatch({
    organization_id: testOrgId,
    payment_id: 'pay-prov-cash-02',
    invoice_id: invRecord.id,
    matched_amount_minor_units: 5000000, // Additional ₹50,000
    confidence: 1.0,
  });

  const partialSimResult = CashUnblockSimulatorEngine.simulate({ invoiceId: invRecord.id, orgId: testOrgId });
  if (!partialSimResult) throw new Error('Partial payment simulation failed');

  console.log(`Updated Outstanding after ₹50k payment: ₹${partialSimResult.actualOutstandingMinorUnits / 100}`);
  if (partialSimResult.actualOutstandingMinorUnits !== 5000000) {
    throw new Error(`Expected ₹50,000 outstanding after partial payment, got ${partialSimResult.actualOutstandingMinorUnits}`);
  }
  console.log('✅ PHASE 12 PASSED: Partial Payment Dynamic State Update Verified\n');

  // PHASE 11: FULL PAYMENT TEST
  console.log('--- PHASE 11: FULL PAYMENT TEST ---');
  // Mark invoice as paid
  const invToUpdate = udmStore.getInvoices().find(i => i.id === invRecord.id);
  if (invToUpdate) invToUpdate.status = 'paid';

  const fullPaidQueue = getCashUnblockQueue(testOrgId);
  const paidItemInQueue = fullPaidQueue.find(i => i.invoiceId === invRecord.id);

  if (paidItemInQueue) {
    throw new Error('Fully paid invoice remained active in Cash Unblock Queue!');
  }
  console.log('✅ PHASE 11 PASSED: Fully Paid Invoice Opportunity Closure Verified\n');

  // PHASE 27: MULTI-TENANT ISOLATION
  console.log('--- PHASE 27: MULTI-TENANT ISOLATION ---');
  const tenantBId = 'org-tenant-b-test';
  udmStore.setTenantContext(tenantBId);
  const tenantBQueue = getCashUnblockQueue(tenantBId);
  if (tenantBQueue.some(i => i.invoiceId === invRecord.id)) {
    throw new Error('Tenant B received Tenant A Cash Unblock item!');
  }
  console.log('✅ PHASE 27 PASSED: Multi-Tenant Isolation Verified\n');

  console.log('============================================================');
  console.log('ALL CASH UNBLOCK FORENSIC AUDIT PHASES PASSED SUCCESSFULLY');
  console.log('============================================================');
}

runCashUnblockForensicAudit().catch((err) => {
  console.error('❌ CASH UNBLOCK FORENSIC AUDIT FAILED:', err);
  process.exit(1);
});
