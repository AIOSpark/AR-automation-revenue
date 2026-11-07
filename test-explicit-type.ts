import { udmStore } from './src/lib/udm/store';
import type { Invoice } from './src/lib/udm/types';

udmStore.clearAll();
udmStore.setTenantContext('test-org');

const invoices = udmStore.getInvoices();
const found: Invoice | undefined = invoices.find(i => i.id === 'some-id');

// Type guard
function isInvoice(obj: any): obj is Invoice {
  return obj && typeof obj === 'object' && 'id' in obj && 'amount_minor_units' in obj;
}

if (isInvoice(found)) {
  console.log('Invoice id:', found.id);
  console.log('Invoice amount:', found.amount_minor_units);
}
