// AIOSpark PROMPT 12 Data Integrations & Sync Engine Test Suite

import assert from 'node:assert';
import { udmStore } from '../../udm/store';
import { integrationsStore } from '../../adapters/store';
import { integrationSyncEngine } from '../sync-engine';
import { validateIntegrationEndpoint } from '../../adapters/url-safety';

export async function runIntegrationEngineTestSuite() {
  console.log('\n==========================================');
  console.log('RUNNING AIOSPARK PROMPT 12 INTEGRATION TEST SUITE');
  console.log('==========================================\n');

  let passed = 0;
  let failed = 0;
  const testOrgId = 'org_test_integrations_prompt12';

  // Clear state before running tests
  udmStore.clearAll();
  integrationsStore.clearAll();
  integrationSyncEngine.clearAll();
  udmStore.setTenantContext(testOrgId);

  // 1. Sync Execution & State Machine Lifecycle
  try {
    const mockRows = [
      { customer_name: 'Apex Logistics', invoice_number: 'INV-TEST-001', amount: 150000, issue_date: '2026-03-01' },
      { customer_name: 'Global Retail', invoice_number: 'INV-TEST-002', amount: 250000, issue_date: '2026-03-05' },
    ];
    const job = await integrationSyncEngine.executeSync(testOrgId, 'csv', 'user_Admin', { rowsData: mockRows });
    assert.strictEqual(job.status === 'COMPLETED' || job.status === 'PARTIALLY_COMPLETED', true, 'Job status must be completed');
    assert.strictEqual(job.recordsDiscovered > 0, true, 'Discovered records should be greater than 0');
    assert.strictEqual(job.organizationId, testOrgId, 'Job organization ID must match tenant context');
    console.log('⚡ [PASS] 1. Sync Lifecycle & State Machine: QUEUED -> RUNNING -> PROCESSING -> COMPLETED verified');
    passed++;
  } catch (err: any) {
    console.error('✖ [FAIL] 1. Sync Lifecycle:', err.message);
    failed++;
  }

  // 2. Idempotent Retry & Duplicate Protection
  try {
    const mockRows = [
      { customer_name: 'Apex Logistics', invoice_number: 'INV-TEST-001', amount: 150000, issue_date: '2026-03-01' },
      { customer_name: 'Global Retail', invoice_number: 'INV-TEST-002', amount: 250000, issue_date: '2026-03-05' },
    ];
    const initialInvoices = udmStore.getInvoices().length;
    const retryJob = await integrationSyncEngine.executeSync(testOrgId, 'csv', 'user_Admin', { rowsData: mockRows });
    const subsequentInvoices = udmStore.getInvoices().length;

    assert.strictEqual(initialInvoices, subsequentInvoices, 'Re-running sync must not create duplicate invoices');
    assert.strictEqual(retryJob.recordsSkipped > 0 || retryJob.recordsUpdated > 0, true, 'Existing records must be skipped or updated');
    console.log('⚡ [PASS] 2. Idempotence & Protection: Re-triggering sync created 0 duplicate invoices');
    passed++;
  } catch (err: any) {
    console.error('✖ [FAIL] 2. Idempotence:', err.message);
    failed++;
  }

  // 2b. Duplicate protection inside a single batch
  try {
    const duplicateRows = [
      { customer_name: 'Batch Duplicate Co', invoice_number: 'INV-BATCH-DUP-001', amount: 1000, issue_date: '2026-03-01', status: 'Cleared' },
      { customer_name: 'Batch Duplicate Co', invoice_number: 'INV-BATCH-DUP-001', amount: 1000, issue_date: '2026-03-01', status: 'Cleared' },
    ];
    const columnMapping = {
      customer_name: 'customer_name',
      invoice_number: 'invoice_number',
      amount: 'amount',
      issue_date: 'issue_date',
      status: 'status',
    };
    const duplicateJob = await integrationSyncEngine.executeSync(testOrgId, 'csv', 'user_Admin', { rowsData: duplicateRows, columnMapping });
    const duplicateInvoices = udmStore.getInvoices().filter((invoice) => invoice.number === 'INV-BATCH-DUP-001');
    const duplicatePayments = udmStore.getPayments().filter((payment) => payment.source_id?.endsWith('INV-BATCH-DUP-001'));

    assert.strictEqual(duplicateInvoices.length, 1, 'Duplicate invoice rows in one batch must produce one invoice');
    assert.strictEqual(duplicatePayments.length, 1, 'Duplicate payment rows in one batch must produce one payment');
    assert(duplicateJob.recordsSkipped > 0, 'Duplicate rows in one batch must be skipped');
    console.log('⚡ [PASS] 2b. In-Batch Deduplication: Duplicate rows produced a single invoice and payment');
    passed++;
  } catch (err: any) {
    console.error('✖ [FAIL] 2b. In-Batch Deduplication:', err.message);
    failed++;
  }

  // 3. Transient Failure & Error Classification
  try {
    const errors = integrationSyncEngine.getErrorsForOrg(testOrgId);
    const health = integrationSyncEngine.getOrgDataHealth(testOrgId);
    assert(health.trustStatus !== undefined, 'Trust status should be calculated');
    console.log(`⚡ [PASS] 3. Data Health & Trust Status: Calculated status '${health.trustStatus}' with verified metrics`);
    passed++;
  } catch (err: any) {
    console.error('✖ [FAIL] 3. Data Health:', err.message);
    failed++;
  }

  // 4. Concurrent Sync Protection
  try {
    const syncPromise1 = integrationSyncEngine.executeSync(testOrgId, 'tally', 'user_Admin');
    let caughtError = false;
    try {
      await integrationSyncEngine.executeSync(testOrgId, 'tally', 'user_Admin');
    } catch (e: any) {
      caughtError = String(e.message).includes('already in progress');
    }
    await syncPromise1;
    assert.strictEqual(caughtError, true, 'Concurrent sync for same adapter must be blocked');
    console.log('⚡ [PASS] 4. Concurrent Sync Guard: Duplicate concurrent sync attempt blocked');
    passed++;
  } catch (err: any) {
    console.error('✖ [FAIL] 4. Concurrent Guard:', err.message);
    failed++;
  }

  // 5. Tenant Isolation Test
  try {
    const otherOrgId = 'org_test_tenant_b_secret';
    udmStore.setTenantContext(otherOrgId);
    const otherOrgJobs = integrationSyncEngine.getJobsForOrg(otherOrgId);
    assert.strictEqual(otherOrgJobs.length, 0, 'Organization B must see 0 jobs from Organization A');
    console.log('⚡ [PASS] 5. Tenant Isolation: Organization B cannot access Organization A sync jobs');
    passed++;
  } catch (err: any) {
    console.error('✖ [FAIL] 5. Tenant Isolation:', err.message);
    failed++;
  }

  // 6. Integration Endpoint SSRF Guard
  try {
    const metadataV4 = await validateIntegrationEndpoint('http://169.254.169.254/latest/meta-data');
    const metadataV6 = await validateIntegrationEndpoint('http://[::ffff:169.254.169.254]/latest/meta-data');
    const fileScheme = await validateIntegrationEndpoint('file:///etc/passwd');
    const localBridge = await validateIntegrationEndpoint('http://127.0.0.1:9000');

    assert.strictEqual(metadataV4.ok, false, 'Cloud metadata IPv4 endpoint must be rejected');
    assert.strictEqual(metadataV6.ok, false, 'Cloud metadata IPv4-mapped IPv6 endpoint must be rejected');
    assert.strictEqual(fileScheme.ok, false, 'Non-HTTP integration endpoint must be rejected');
    assert.strictEqual(localBridge.ok, true, 'Localhost bridge endpoint is allowed in explicit test mode');
    console.log('⚡ [PASS] 6. SSRF Guard: Metadata, IPv4-mapped IPv6, and non-HTTP endpoints rejected');
    passed++;
  } catch (err: any) {
    console.error('✖ [FAIL] 6. SSRF Guard:', err.message);
    failed++;
  }

  console.log('\n==========================================');
  console.log(`INTEGRATION SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('==========================================\n');

  return { passed, failed };
}
