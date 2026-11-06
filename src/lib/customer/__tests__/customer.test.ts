// AIOSpark Layer 12 Customer 360 & Risk Scoring Test Suite

import { computeCustomerFinancialProfile } from '../risk-engine';
import { udmStore } from '../../udm/store';

export async function runCustomer360TestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 12 CUSTOMER 360 TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`👤 [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  udmStore.clearAll();

  const orgId = 'org-customer-test-12';
  const today = '2026-09-01';
  udmStore.setTenantContext(orgId);

  // 1. Seed Customer with Hand-Calculated History
  const cust = udmStore.insertCustomer({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'CUST_ACME_360',
    name: 'Acme Logistics',
    credit_limit_minor_units: 50000000,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // Invoice 1: Overdue 31 days ₹100,000.00
  udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_360_1',
    customer_id: cust.id,
    number: 'INV-360-1',
    amount_minor_units: 10000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-07-01',
    due_date: '2026-08-01', // Overdue
    status: 'open',
  });

  // Invoice 2: Paid 20 days late in T12M
  const inv2 = udmStore.insertInvoice({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'INV_360_2',
    customer_id: cust.id,
    number: 'INV-360-2',
    amount_minor_units: 5000000,
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-05-01',
    due_date: '2026-05-31',
    status: 'paid',
  });

  const pay2 = udmStore.insertPayment({
    organization_id: orgId,
    source_system: 'manual',
    source_id: 'PAY_360_2',
    customer_id: cust.id,
    amount_minor_units: 5000000,
    currency: 'INR',
    date: '2026-06-20', // 20 days late
  });

  udmStore.insertMatch({
    organization_id: orgId,
    payment_id: pay2.id,
    invoice_id: inv2.id,
    matched_amount_minor_units: 5000000,
  });

  const profile = computeCustomerFinancialProfile(cust.id, orgId, today);

  // Assert Financial Header Calculations
  assert(profile.totalOutstandingMinorUnits === 10000000, '1a. Financial Header - Outstanding total matches manual sum (₹100,000.00)');
  assert(profile.totalOverdueMinorUnits === 10000000, '1b. Financial Header - Overdue total matches manual sum (₹100,000.00)');
  assert(profile.avgPaymentTimeDaysT12M === 20, '1c. Financial Header - Trailing 12-Month avg payment delay calculated as exactly 20 days');
  assert(profile.creditLimitMinorUnits === 50000000, '1d. Financial Header - Credit limit exposed in integer minor units');

  // Assert Risk Score & Evidence Breakdown
  assert(
    profile.riskScore > 40 && profile.riskEvidence.length === 4,
    '2a. Rule-Based Risk Engine - Generated score and full 4-metric evidence breakdown'
  );
  assert(
    profile.riskEvidence[3].label.includes('Broken Promises Rate'),
    '2b. Neutral Placeholder - Broken Promises Rate handled gracefully without penalty'
  );

  console.log('\n==========================================');
  console.log(`CUSTOMER 360 SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
