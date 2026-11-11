import { udmStore, insertCustomer, setTestMode, setTenantContext } from './src/lib/udm/store.js';

setTestMode(true);
setTenantContext('org_123');
const customer = await udmStore.insertCustomer({
  organization_id: 'org_123',
  name: 'Test Customer',
  source_system: 'test',
  source_id: 'test_001',
  tax_id: 'TEST001',
});
console.log('Customer inserted:', customer.name);
console.log('Customer ID:', customer.id);