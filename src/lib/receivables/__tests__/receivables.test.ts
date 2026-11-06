// AIOSpark Layer 10 Receivables Intelligence Test Suite

import { queryReceivablesTable, savedFilterStore } from '../engine';
import { udmStore } from '../../udm/store';

export async function runReceivablesTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK LAYER 10 RECEIVABLES TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`📋 [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  udmStore.clearAll();
  savedFilterStore.clearAll();

  const orgIdA = 'org-receivables-test-A';
  const orgIdB = 'org-receivables-test-B';
  const today = '2026-09-01';

  // Seed Customer & Invoices in Org A
  udmStore.setTenantContext(orgIdA);
  const custA = udmStore.insertCustomer({
    organization_id: orgIdA,
    source_system: 'manual',
    source_id: 'CUST_A',
    name: 'Apex Solutions',
    industry: 'Technology',
    credit_limit_minor_units: 0,
    currency: 'INR',
    payment_terms_days: 30,
  });

  const inv1 = udmStore.insertInvoice({
    organization_id: orgIdA,
    source_system: 'manual',
    source_id: 'INV_101',
    customer_id: custA.id,
    number: 'INV-101',
    amount_minor_units: 5000000, // ₹50,000.00
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-07-01',
    due_date: '2026-08-01', // Overdue 31 days
    status: 'open',
  });

  const inv2 = udmStore.insertInvoice({
    organization_id: orgIdA,
    source_system: 'manual',
    source_id: 'INV_102',
    customer_id: custA.id,
    number: 'INV-102',
    amount_minor_units: 12000000, // ₹120,000.00
    currency: 'INR',
    tax_amount_minor_units: 0,
    issue_date: '2026-08-15',
    due_date: '2026-09-15', // Non-overdue
    status: 'open',
  });

  // Seed Org B invoice for tenant leak checks
  udmStore.setTenantContext(orgIdB);
  udmStore.insertCustomer({
    organization_id: orgIdB,
    source_system: 'manual',
    source_id: 'CUST_B',
    name: 'Secret Org B Corp',
    credit_limit_minor_units: 0,
    currency: 'INR',
    payment_terms_days: 30,
  });

  // 1. Status Filter Test
  const openResult = queryReceivablesTable(orgIdA, { statuses: ['open'] }, today);
  assert(openResult.totalCount === 2 && openResult.items.length === 2, '1a. Status Filter - Retrieved matching open status invoices');

  // 2. Age Bucket Filter Test
  const overdueResult = queryReceivablesTable(orgIdA, { ageBucket: '31-60' }, today);
  assert(overdueResult.totalCount === 1 && overdueResult.items[0].invoiceNumber === 'INV-101', '2a. Age Bucket Filter - Retrieved 31-60 days overdue invoice correctly');

  // 3. Server-Side Pagination Test
  const page1Result = queryReceivablesTable(orgIdA, { page: 1, pageSize: 1 }, today);
  const page2Result = queryReceivablesTable(orgIdA, { page: 2, pageSize: 1 }, today);

  assert(
    page1Result.items.length === 1 &&
      page2Result.items.length === 1 &&
      page1Result.items[0].id !== page2Result.items[0].id,
    '3a. Server-Side Pagination - Returned distinct non-overlapping records across pages'
  );

  // 4. Saved View Test
  const savedView = savedFilterStore.saveView(orgIdA, 'user-1', 'High Overdue Accounts', { ageBucket: 'overdue' });
  const fetchedViews = savedFilterStore.getViews(orgIdA, 'user-1');
  assert(fetchedViews.length === 1 && fetchedViews[0].name === 'High Overdue Accounts', '4a. Saved Views - Persisted and retrieved saved filter configuration');

  // 5. Tenant RLS Boundary Isolation Test
  const orgBResult = queryReceivablesTable(orgIdB, {}, today);
  const leakedOrgARecords = orgBResult.items.filter((i) => i.customerName === 'Apex Solutions');
  assert(leakedOrgARecords.length === 0, '5a. Multi-Tenant RLS Boundary - Org B queries return ZERO Org A records');

  // 6. Synthetic Load Benchmark against 10,000 Records
  udmStore.setTenantContext(orgIdA);
  for (let i = 1; i <= 10000; i++) {
    udmStore.insertInvoice({
      organization_id: orgIdA,
      source_system: 'stress',
      source_id: `STRESS_${i}`,
      customer_id: custA.id,
      number: `STRESS-INV-${i}`,
      amount_minor_units: 1000000,
      currency: 'INR',
      tax_amount_minor_units: 0,
      issue_date: '2026-08-01',
      due_date: '2026-08-30',
      status: 'open',
    });
  }

  const startTime = Date.now();
  const stressQueryResult = queryReceivablesTable(
    orgIdA,
    { ageBucket: 'overdue', sortBy: 'amount', sortOrder: 'desc', page: 1, pageSize: 20 },
    today
  );
  const durationMs = Date.now() - startTime;

  assert(
    stressQueryResult.totalCount > 10000 && durationMs < 500,
    `6a. Server-Side Performance Benchmark - Queried, filtered, sorted & paginated 10,000 records in ${durationMs}ms (<500ms SLA)`
  );

  console.log('\n==========================================');
  console.log(`RECEIVABLES SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
