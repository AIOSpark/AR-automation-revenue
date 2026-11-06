// AIOSpark Layer 9 Core Dashboard Test Suite & Synthetic Load Verification

import {
  computeTotalReceivables,
  computeOverdueReceivables,
  computeAtRiskReceivables,
  computeCashUnblockedOpportunity,
  dashboardMetricsStore,
} from '../engine';
import { udmStore } from '../../udm/store';

export async function runDashboardTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 9 DASHBOARD TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`📊 [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  udmStore.clearAll();
  dashboardMetricsStore.clearAll();

  const orgId = 'org-dashboard-test-99';
  const today = '2026-09-01';
  udmStore.setTenantContext(orgId);

  // 1. Seed Known Hand-Calculated Customer & Invoice Mix
  const custA = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'CUST_A',
    name: 'Alpha Ltd',
    credit_limit_minor_units: 0,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const custB = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'CUST_B',
    name: 'Beta Corp',
    credit_limit_minor_units: 0,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // Invoice 1: Overdue ₹10,000.00 (1000000 paise), Clean, No Dispute -> Overdue & Cash Unblocked
  const inv1 = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_1',
    customer_id: custA.id,
    number: 'INV-1',
    amount_minor_units: 1000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-07-01',
    due_date: '2026-08-01', // Overdue relative to 2026-09-01
    status: 'open',
  });

  // Invoice 2: Overdue ₹20,000.00 (2000000 paise), DISPUTED -> Overdue, BUT Excluded from Cash Unblocked
  const inv2 = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_2',
    customer_id: custA.id, // custA now has 2 overdue invoices -> high risk customer
    number: 'INV-2',
    amount_minor_units: 2000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-07-05',
    due_date: '2026-08-05', // Overdue
    status: 'disputed',
  });

  udmStore.insertDispute({
    organization_id: orgId,
    invoice_id: inv2.id,
    reason: 'Billing price discrepancy',
    status: 'open',
  });

  // Invoice 3: Partially Paid ₹50,000.00 (5000000 paise), Paid ₹20,000.00 (2000000 paise) -> Outstanding ₹30,000.00 (3000000 paise)
  // Due in 5 days (2026-09-06), belonging to custA (2 overdue invoices) -> At Risk
  const inv3 = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_3',
    customer_id: custA.id,
    number: 'INV-3',
    amount_minor_units: 5000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-10',
    due_date: '2026-09-06',
    status: 'partially_paid',
  });

  const pay1 = udmStore.insertPayment({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'PAY_1',
    customer_id: custA.id,
    amount_minor_units: 2000000,
    currency: 'INR',
    date: '2026-08-20',
  });

  udmStore.insertMatch({
    organization_id: orgId,
    payment_id: pay1.id,
    invoice_id: inv3.id,
    matched_amount_minor_units: 2000000,
  });

  udmStore.insertException({
    organization_id: orgId,
    customer_id: custA.id,
    invoice_id: inv1.id,
    type: 'INVOICE_ERROR',
    severity: 'high',
    status: 'pending_approval',
    recommended_action: 'Re-issue invoice with correct rate',
  });

  // EXPECTED FORMULA TOTALS:
  // Total Receivables = 1000000 (inv1) + 2000000 (inv2) + 3000000 (inv3 outstanding) = 6000000 paise (₹60,000.00)
  // Overdue = 1000000 (inv1) + 2000000 (inv2) = 3000000 paise (₹30,000.00)
  // At Risk = 3000000 paise (inv3 due in 5 days for custA with 2 overdue invoices)
  // Cash Unblocked = 1000000 paise (inv1 with active actionable exception)

  const invoices = udmStore.getInvoices();

  const calcTotal = computeTotalReceivables(invoices, orgId);
  assert(calcTotal === 6000000, '1a. Total Receivables - Correctly computed net outstanding after partial payments (₹60,000.00)');

  const calcOverdue = computeOverdueReceivables(invoices, orgId, today);
  assert(calcOverdue === 3000000, '1b. Overdue Receivables - Correctly computed overdue total (₹30,000.00)');

  const calcAtRisk = computeAtRiskReceivables(invoices, orgId, today);
  assert(calcAtRisk === 3000000, '1c. At Risk Receivables - Correctly identified near-due invoices for high-delay customers (₹30,000.00)');

  const calcUnblocked = computeCashUnblockedOpportunity(invoices, orgId, today);
  assert(calcUnblocked === 1000000, '1d. Cash Unblocked Opportunity - Correctly computed sum of actionable exception invoices (₹10,000.00)');

  // 2. Test Cache Store Execution & Immediate Refresh
  const cachedResult = dashboardMetricsStore.refreshMetrics(orgId, today);
  assert(
    cachedResult.totalReceivablesMinorUnits === 6000000 &&
      cachedResult.overdueMinorUnits === 3000000 &&
      cachedResult.cashUnblockedOpportunityMinorUnits === 1000000,
    '2a. Metrics Cache Store - Precomputed cache written & retrieved successfully'
  );

  // 3. Performance Stress Test against 10,000 Synthetic Invoices
  for (let i = 1; i <= 10000; i++) {
    udmStore.insertInvoice({
      organization_id: orgId,
      source_system: 'stress',
      source_id: `STRESS_${i}`,
      customer_id: custB.id,
      number: `STRESS-INV-${i}`,
      amount_minor_units: 100000,
      currency: 'INR',
      tax_amount_minor_units: 0,
      issue_date: '2026-08-01',
      due_date: '2026-08-30',
      status: 'open',
    });
  }

  const startTime = Date.now();
  dashboardMetricsStore.refreshMetrics(orgId, today); // Re-aggregate & cache
  const cachedFetchStart = Date.now();
  const fastCachedResult = dashboardMetricsStore.getCachedMetrics(orgId); // Page load fetch
  const durationMs = Date.now() - cachedFetchStart;

  assert(durationMs < 50, `3a. Dashboard Cached Read Speed - Rendered page metrics in ${durationMs}ms (<50ms target)`);

  console.log('\n==========================================');
  console.log(`DASHBOARD SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
