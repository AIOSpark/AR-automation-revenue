// AIOSpark TestERP Toy DataAdapter Implementation (Layer 35 Demonstration)
// Proves that adding a new ERP adapter requires ZERO code changes outside the /adapters/ module.

import {
  DataAdapter,
  OrgConnectionConfig,
  UniversalCustomer,
  UniversalInvoice,
  UniversalPayment,
  UniversalCreditNote,
  ActionResult,
  ConnectionHealth,
} from './types';

export class TestERPAdapter implements DataAdapter {
  public readonly adapterType = 'test_erp';

  public async fetchCustomers(config: OrgConnectionConfig): Promise<UniversalCustomer[]> {
    return [
      {
        sourceId: 'src_terp_cust_101',
        sourceSystem: 'test_erp',
        name: 'TestERP Enterprise Ltd',
        contacts: [{ name: 'Contact Test', email: 'test@testerp.com' }],
        creditTermsDays: 45,
      },
    ];
  }

  public async fetchInvoices(config: OrgConnectionConfig): Promise<UniversalInvoice[]> {
    return [
      {
        sourceId: 'src_terp_inv_201',
        sourceSystem: 'test_erp',
        customerSourceId: 'src_terp_cust_101',
        number: 'INV-TERP-999',
        amountMinorUnits: 35000000, // ₹3,50,000
        currency: 'INR',
        taxAmountMinorUnits: 6300000,
        issueDate: '2026-03-01',
        dueDate: '2026-04-15',
        status: 'Action Required',
      },
    ];
  }

  public async fetchPayments(config: OrgConnectionConfig): Promise<UniversalPayment[]> {
    return [
      {
        sourceId: 'src_terp_pay_301',
        sourceSystem: 'test_erp',
        customerSourceId: 'src_terp_cust_101',
        amountMinorUnits: 35000000,
        currency: 'INR',
        date: '2026-03-10',
      },
    ];
  }

  public async fetchCreditNotes(config: OrgConnectionConfig): Promise<UniversalCreditNote[]> {
    return [];
  }

  public async pushAction(config: OrgConnectionConfig, action: Record<string, unknown>): Promise<ActionResult> {
    return { success: true, actionId: `act_terp_${Date.now()}` };
  }

  public async getConnectionHealth(config: OrgConnectionConfig): Promise<ConnectionHealth> {
    return { status: 'connected', lastSyncAt: new Date().toISOString(), lastError: null };
  }
}
