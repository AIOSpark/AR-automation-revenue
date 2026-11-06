import { udmStore } from '../src/lib/udm/store';
import { cfoIntelligenceEngine } from '../src/lib/cfo/engine';
import { can } from '../src/lib/tenant/permissions';

async function runCFOMetricsForensicAudit() {
  console.log('============================================================');
  console.log('STARTING AIOSPARK — CFO METRICS FORENSIC AUDIT');
  console.log('============================================================\n');

  // PHASE 5: ZERO-DATA CONTROL TENANT TEST
  console.log('--- PHASE 5: ZERO-DATA CONTROL TENANT TEST ---');
  const cleanOrgId = 'org-cfo-clean-test';
  udmStore.setTenantContext(cleanOrgId);

  const cleanOverview = cfoIntelligenceEngine.getOverview(cleanOrgId, '2026-09-25');
  console.log(`Clean Receivables: ₹${cleanOverview.totalReceivablesMinorUnits / 100}`);
  console.log(`Clean Overdue: ₹${cleanOverview.overdueMinorUnits / 100}`);
  console.log(`Clean Cash Received: ₹${cleanOverview.cashReceivedMinorUnits / 100}`);
  console.log(`Clean Actionable Blockers: ₹${cleanOverview.actionableBlockersMinorUnits / 100}`);
  console.log(`Clean DSO: ${cleanOverview.dsoDays} days`);

  if (
    cleanOverview.totalReceivablesMinorUnits !== 0 ||
    cleanOverview.overdueMinorUnits !== 0 ||
    cleanOverview.cashReceivedMinorUnits !== 0 ||
    cleanOverview.actionableBlockersMinorUnits !== 0 ||
    cleanOverview.dsoDays !== 0
  ) {
    throw new Error('P0 DATA CONTAMINATION: Clean tenant initialized with non-zero CFO metrics!');
  }
  console.log('✅ PHASE 5 PASSED: Clean Tenant Zero-Data Verification\n');

  // PHASE 6, 7 & 8: CONTROLLED DATASET SETUP & INDEPENDENT FINANCIAL BASELINE
  console.log('--- PHASE 6, 7 & 8: CONTROLLED DATASET & INDEPENDENT BASELINE RECONCILIATION ---');
  const testOrgId = 'org-cfo-test-001';
  udmStore.setTenantContext(testOrgId);

  const custA = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'CUST-A-001',
    name: 'Customer A Pvt Ltd',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_by: 'system',
  });

  const custB = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'CUST-B-001',
    name: 'Customer B Pvt Ltd',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_by: 'system',
  });

  const custC = udmStore.insertCustomer({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'CUST-C-001',
    name: 'Customer C Pvt Ltd',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
    created_by: 'system',
  });

  // Invoice 1: Customer A ₹1,25,000 (Payment ₹25,000 matched -> Net ₹1,00,000, Overdue)
  const inv1 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'INV-1',
    number: 'CFO-TEST-INV-001',
    customer_id: custA.id,
    amount_minor_units: 12500000,
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'partially_paid',
    po_reference: 'PO-A-1',
    created_by: 'system',
  });

  udmStore.insertMatch({
    organization_id: testOrgId,
    payment_id: 'pay-1',
    invoice_id: inv1.id,
    matched_amount_minor_units: 2500000, // ₹25,000
    confidence: 1.0,
  });

  udmStore.insertException({
    organization_id: testOrgId,
    invoice_id: inv1.id,
    customer_id: custA.id,
    type: 'PO_MISMATCH',
    severity: 'high',
    status: 'recommended',
    evidence: { description: 'PO quantity mismatch' },
    recommended_action: 'Resolve PO mismatch with procurement',
  });

  // Invoice 2: Customer A ₹75,000 (Net ₹75,000, Overdue)
  const inv2 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'INV-2',
    number: 'CFO-TEST-INV-002',
    customer_id: custA.id,
    amount_minor_units: 7500000,
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-08-05',
    due_date: '2026-09-05',
    status: 'open',
    po_reference: 'PO-A-2',
    created_by: 'system',
  });

  udmStore.insertException({
    organization_id: testOrgId,
    invoice_id: inv2.id,
    customer_id: custA.id,
    type: 'CUSTOMER_DISPUTE',
    severity: 'medium',
    status: 'recommended',
    evidence: { description: 'Quality dispute open' },
    recommended_action: 'Review dispute terms with account manager',
  });

  // Invoice 3: Customer B ₹2,00,000 (Net ₹2,00,000, Overdue)
  const inv3 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'INV-3',
    number: 'CFO-TEST-INV-003',
    customer_id: custB.id,
    amount_minor_units: 20000000,
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-08-10',
    due_date: '2026-09-10',
    status: 'open',
    po_reference: 'PO-B-3',
    created_by: 'system',
  });

  // Invoice 4: Customer C ₹50,000 (Payment ₹50,000 matched -> Net ₹0, Paid)
  const inv4 = udmStore.insertInvoice({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'INV-4',
    number: 'CFO-TEST-INV-004',
    customer_id: custC.id,
    amount_minor_units: 5000000,
    tax_amount_minor_units: 0,
    currency: 'INR',
    issue_date: '2026-08-15',
    due_date: '2026-09-15',
    status: 'paid',
    po_reference: 'PO-C-4',
    created_by: 'system',
  });

  udmStore.insertMatch({
    organization_id: testOrgId,
    payment_id: 'pay-4',
    invoice_id: inv4.id,
    matched_amount_minor_units: 5000000, // ₹50,000
    confidence: 1.0,
  });

  // Payments received: ₹25,000 + ₹50,000 = ₹75,000
  udmStore.insertPayment({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'PAY-1',
    customer_id: custA.id,
    amount_minor_units: 2500000,
    currency: 'INR',
    date: '2026-09-02',
    reference: 'REF-1',
  });

  udmStore.insertPayment({
    organization_id: testOrgId,
    source_system: 'manual',
    source_id: 'PAY-4',
    customer_id: custC.id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-09-16',
    reference: 'REF-4',
  });

  // Run CFO Engine Overview
  const overview = cfoIntelligenceEngine.getOverview(testOrgId, '2026-09-25');

  console.log(`Total Receivables: ₹${overview.totalReceivablesMinorUnits / 100} (Expected: ₹3,75,000)`);
  console.log(`Cash Received: ₹${overview.cashReceivedMinorUnits / 100} (Expected: ₹75,000)`);
  console.log(`Actionable Blockers: ₹${overview.actionableBlockersMinorUnits / 100} (Expected: ₹1,75,000)`);
  console.log(`Overdue Amount: ₹${overview.overdueMinorUnits / 100} (Expected: ₹3,75,000)`);
  console.log(`Calculated DSO: ${overview.dsoDays} days`);

  if (
    overview.totalReceivablesMinorUnits !== 37500000 ||
    overview.cashReceivedMinorUnits !== 7500000 ||
    overview.actionableBlockersMinorUnits !== 17500000
  ) {
    throw new Error('CFO Financial calculation mismatch against independent baseline!');
  }
  console.log('✅ PHASE 6, 7 & 8 PASSED: Metric Formula Audit & Independent Baseline Reconciled\n');

  // PHASE 16: DSO FORMULA AUDIT
  console.log('--- PHASE 16: DSO FORMULA AUDIT ---');
  // Formula: Math.round((totalReceivables / (totalReceivables + cashReceived)) * 60) + 15
  // = Math.round((37,500,000 / (37,500,000 + 7,500,000)) * 60) + 15
  // = Math.round((37,500,000 / 45,000,000) * 60) + 15
  // = Math.round(50) + 15 = 65 days.
  const expectedDSO = Math.round((37500000 / 45000000) * 60) + 15;
  console.log(`Actual Engine DSO: ${overview.dsoDays} days`);
  console.log(`Independently Calculated DSO: ${expectedDSO} days`);

  if (overview.dsoDays !== expectedDSO) {
    throw new Error(`DSO Formula mismatch: Expected ${expectedDSO}, got ${overview.dsoDays}`);
  }
  console.log('✅ PHASE 16 PASSED: DSO Formula Audit Verified\n');

  // PHASE 29: MULTI-TENANT ISOLATION TEST
  console.log('--- PHASE 29: MULTI-TENANT ISOLATION TEST ---');
  const tenantBId = 'org-cfo-tenant-b-test';
  udmStore.setTenantContext(tenantBId);
  const tenantBOverview = cfoIntelligenceEngine.getOverview(tenantBId, '2026-09-25');

  if (
    tenantBOverview.totalReceivablesMinorUnits !== 0 ||
    tenantBOverview.cashReceivedMinorUnits !== 0 ||
    tenantBOverview.actionableBlockersMinorUnits !== 0
  ) {
    throw new Error('Multi-Tenant Leakage: Tenant B received Tenant A CFO financial metrics!');
  }
  console.log('✅ PHASE 29 PASSED: Multi-Tenant Isolation Verified\n');

  console.log('============================================================');
  console.log('ALL CFO METRICS FORENSIC AUDIT PHASES PASSED SUCCESSFULLY');
  console.log('============================================================');
}

runCFOMetricsForensicAudit().catch((err) => {
  console.error('❌ CFO METRICS FORENSIC AUDIT FAILED:', err);
  process.exit(1);
});
