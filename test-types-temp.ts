import { udmStore } from './src/lib/udm/store';

udmStore.clearAll();
udmStore.setTenantContext('test-org');

const inv = udmStore.insertInvoice({
  organization_id: 'test-org',
  number: 'TEST-001',
  customer_id: 'cust-1',
  amount_minor_units: 10000000,
  currency: 'INR',
  tax_amount_minor_units: 0,
  issue_date: '2026-01-01',
  due_date: '2026-01-31',
  status: 'open',
  source_system: 'manual',
  source_id: 'test_inv',
});

console.log('Invoice inserted:', inv.id);

const invoices = udmStore.getInvoices();
console.log('Invoices count:', invoices.length);

const found = invoices.find(i => i.id === inv.id);
console.log('Found invoice:', found);

// Try accessing properties
if (found) {
  console.log('Invoice id:', found.id);
  console.log('Invoice amount:', found.amount_minor_units);
}
