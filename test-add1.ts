import { udmStore } from './src/lib/udm/store';
import type { Invoice } from './src/lib/udm/types';
import { getInvoiceOutstandingBalance } from '@/dashboard/engine';

udmStore.clearAll();
udmStore.setTenantContext('test-org');

const invoices = udmStore.getInvoices();
const found = invoices.find(i => i.id === 'some-id');
if (found) {
  const balance = getInvoiceOutstandingBalance(found);
  console.log('Balance:', balance);
}
