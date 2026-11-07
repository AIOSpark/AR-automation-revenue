import { udmStore } from './src/lib/udm/store';
import type { Invoice } from './src/lib/udm/types';

udmStore.clearAll();
udmStore.setTenantContext('test-org');

const invoices = udmStore.getInvoices();
const found = invoices.find(i => i.id === 'some-id');
if (found) {
  console.log('Found id:', found.id);
}
