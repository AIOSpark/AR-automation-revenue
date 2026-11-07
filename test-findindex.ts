import { udmStore } from './src/lib/udm/store';

udmStore.clearAll();
udmStore.setTenantContext('test-org');

const invoices = udmStore.getInvoices();
const index = invoices.findIndex(i => i.id === 'some-invoice-id');

// Use index to access
const found = invoices[index];

console.log('Found invoice:', found?.id);
