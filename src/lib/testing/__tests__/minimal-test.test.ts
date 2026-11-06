import { udmStore } from '../../udm/store';
import { getInvoiceOutstandingBalance } from '../../dashboard/engine';
import type { Invoice } from '../../udm/types';

export async function minimalTest() {
  udmStore.clearAll();
  udmStore.setTenantContext('org_test');

  function createInvoice(orgId: string, amount: number = 10000000): string {
    const invoice = udmStore.insertInvoice({
      organization_id: orgId,
      number: 'TEST-INV',
      customer_id: 'stress_cust',
      amount_minor_units: amount,
      currency: 'INR',
      tax_amount_minor_units: 0,
      issue_date: new Date().toISOString().split('T')[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'open' as const,
      source_system: 'manual',
      source_id: 'test_inv',
    });
    return invoice.id;
  }

  const invId = createInvoice('org_test');
  // Use typed variable from getInvoices() like financial.test.ts
  const invoices: Invoice[] = udmStore.getInvoices();
  const inv = invoices.find((i) => i.id === invId);
  const balance = getInvoiceOutstandingBalance(inv!);
  return balance;
}