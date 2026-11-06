import { TallyAdapter } from '../tally';
import { ZohoBooksAdapter } from '../zoho';
import { udmStore } from '../../udm/store';
import { integrationSyncEngine } from '../../integrations/sync-engine';

export async function runErpRemediationTestSuite() {
  console.log('================================================================');
  console.log('AIOSpark ERP Mock Fallback Remediation Test Suite');
  console.log('================================================================\n');

  const tallyAdapter = new TallyAdapter();
  const zohoAdapter = new ZohoBooksAdapter();
  const testOrgId = 'org_remediation_test_123';

  // TEST 1: Tally without credentials throws AUTHENTICATION_REQUIRED
  console.log('1. Testing Tally Adapter without credentials/bridge...');
  try {
    await tallyAdapter.fetchCustomers({ organizationId: testOrgId, adapterType: 'tally' });
    throw new Error('FAIL: Tally adapter returned data without connection configuration!');
  } catch (err: any) {
    if (err.message.includes('AUTHENTICATION_REQUIRED')) {
      console.log(`   ✓ PASS: Tally adapter strictly threw "${err.message}"`);
    } else {
      throw err;
    }
  }

  // TEST 2: Zoho without credentials throws AUTHENTICATION_REQUIRED
  console.log('\n2. Testing Zoho Books Adapter without credentials...');
  try {
    await zohoAdapter.fetchInvoices({ organizationId: testOrgId, adapterType: 'zoho' });
    throw new Error('FAIL: Zoho adapter returned data without connection credentials!');
  } catch (err: any) {
    if (err.message.includes('AUTHENTICATION_REQUIRED')) {
      console.log(`   ✓ PASS: Zoho adapter strictly threw "${err.message}"`);
    } else {
      throw err;
    }
  }

  // TEST 3: Unconfigured Sync Engine Execution (Zero Data Ingested)
  console.log('\n3. Testing Integration Sync Engine unconfigured execution...');
  udmStore.clearAll();
  udmStore.setTenantContext(testOrgId);

  const tallyJob = await integrationSyncEngine.executeSync(testOrgId, 'tally', 'user_admin');
  if (tallyJob.status !== 'FAILED' || !tallyJob.errorSummary?.includes('AUTHENTICATION_REQUIRED')) {
    throw new Error(`FAIL: Sync engine failed to mark unconfigured sync as FAILED. Status: ${tallyJob.status}`);
  }

  const customersCount = udmStore.getCustomers().length;
  const invoicesCount = udmStore.getInvoices().length;

  if (customersCount !== 0 || invoicesCount !== 0) {
    throw new Error(`FAIL: Synthetic business data leaked into UDM! Customers: ${customersCount}, Invoices: ${invoicesCount}`);
  }
  console.log('   ✓ PASS: Unconfigured ERP sync marked job as FAILED. 0 customers and 0 invoices ingested.');

  console.log('\n================================================================');
  console.log('ALL ERP REMEDIATION TESTS PASSED 100%');
  console.log('================================================================');
}
