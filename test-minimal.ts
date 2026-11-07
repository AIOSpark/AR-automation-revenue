import { udmStore } from './src/lib/udm/store';

udmStore.clearAll();
udmStore.setTenantContext('test-org');

const invoices = udmStore.getInvoices();
const found = invoices.find(i => i.id === 'some-id');
if (found) {
  console.log('Found id:', found.id);
  console.log('Found amount:', found.amount_minor_units);
}
