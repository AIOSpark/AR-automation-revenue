import { udmStore } from './src/lib/udm/store';

udmStore.clearAll();
udmStore.setTenantContext('test-org');

const invoices = udmStore.getInvoices();
const found = invoices.find(i => i.id === 'some-id');

// Simpler type guard without index signature
function isInvoice(obj: any): obj is { id: string; amount_minor_units: number } {
  return obj && typeof obj === 'object' && 'id' in obj && 'amount_minor_units' in obj;
}

if (isInvoice(found)) {
  console.log('Invoice id:', found.id);
  console.log('Invoice amount:', found.amount_minor_units);
}
