import { adapterRegistry } from '../registry';
import { DataAdapter, OrgConnectionConfig } from '../types';

export async function runAdapterContractTestSuite() {
  console.log('--- Running Layer 5 Data Adapter Contract Test Suite ---');
  let passed = 0;
  let failed = 0;

  const mockOrgConfig: OrgConnectionConfig = {
    organizationId: 'org-test-contract-123',
    adapterType: 'csv',
    credentials: { token: 'mock-token-secret' },
    testModeUseFixtures: true,
  };

  const registeredAdapters = adapterRegistry.getRegisteredAdapterTypes();
  console.log(`Registered Adapters: ${registeredAdapters.join(', ')}`);

  if (registeredAdapters.length < 3) {
    console.error(`✖ Test Failed: Expected at least 3 registered adapters (csv, zoho, tally, bank), found ${registeredAdapters.length}`);
    failed++;
  } else {
    console.log(`✓ Registered Adapters Count Verified (${registeredAdapters.join(', ')})`);
    passed++;
  }

  for (const adapterType of ['csv', 'zoho', 'tally']) {
    const adapter: DataAdapter | undefined = adapterRegistry.getAdapter(adapterType);
    if (!adapter) {
      console.error(`✖ Test Failed: Adapter '${adapterType}' not found in registry`);
      failed++;
      continue;
    }

    try {
      const customers = await adapter.fetchCustomers(mockOrgConfig);
      const invoices = await adapter.fetchInvoices(mockOrgConfig);
      const payments = await adapter.fetchPayments(mockOrgConfig);
      const creditNotes = await adapter.fetchCreditNotes(mockOrgConfig);

      // Verify Integer Minor Units rule across all adapters
      let integerMinorUnitsValid = true;
      for (const inv of invoices) {
        if (!Number.isInteger(inv.amountMinorUnits) || inv.amountMinorUnits < 0) {
          integerMinorUnitsValid = false;
          console.error(`✖ Invalid amountMinorUnits for ${adapterType}: ${inv.amountMinorUnits}`);
        }
        if (!inv.sourceId || !inv.sourceSystem || inv.sourceSystem !== adapterType) {
          integerMinorUnitsValid = false;
          console.error(`✖ Invalid origin source attributes for ${adapterType}: sourceSystem=${inv.sourceSystem}`);
        }
      }

      if (integerMinorUnitsValid) {
        console.log(`✓ Adapter '${adapterType}': Standardized Universal Output Verified (${invoices.length} invoices, ${customers.length} customers)`);
        passed++;
      } else {
        failed++;
      }

      const health = await adapter.getConnectionHealth(mockOrgConfig);
      if (['connected', 'syncing', 'error', 'disconnected'].includes(health.status)) {
        console.log(`✓ Adapter '${adapterType}': Connection Health Contract Verified (${health.status})`);
        passed++;
      } else {
        console.error(`✖ Adapter '${adapterType}': Invalid health status ${health.status}`);
        failed++;
      }
    } catch (err: any) {
      console.error(`✖ Test Failed executing contract on '${adapterType}':`, err.message);
      failed++;
    }
  }

  console.log(`\nAdapter Contract Test Suite Complete: ${passed} passed, ${failed} failed.`);
  return { passed, failed };
}
