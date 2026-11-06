// AIOSpark Universal Data Model & DataAdapter Interface Contract (Layer 5)

// 1. Universal Data Model Entities (Integer Minor Units for Money, e.g. Paise/Cents)

export interface UniversalCustomer {
  sourceId: string;
  sourceSystem: string; // 'csv' | 'zoho' | 'tally'
  name: string;
  taxId?: string;
  contacts: Array<{ name: string; email: string; phone?: string }>;
  creditTermsDays: number;
}

export interface UniversalInvoice {
  sourceId: string;
  sourceSystem: string;
  customerSourceId: string;
  number: string;
  amountMinorUnits: number; // e.g. ₹18,00,000.00 = 180000000 paise (integer minor units)
  currency: string; // 'INR', 'USD', etc.
  taxAmountMinorUnits: number;
  issueDate: string;
  dueDate: string;
  status: "Payment Blocked" | "Action Required" | "Escalated" | "Cleared" | "Pending";
  poNumber?: string;
}

export interface UniversalPayment {
  sourceId: string;
  sourceSystem: string;
  customerSourceId: string;
  amountMinorUnits: number;
  currency: string;
  date: string;
  reference?: string;
}

export interface UniversalCreditNote {
  sourceId: string;
  sourceSystem: string;
  customerSourceId: string;
  amountMinorUnits: number;
  currency: string;
  date: string;
  reason?: string;
}

export interface OrgConnectionConfig {
  organizationId: string;
  adapterType: string;
  credentialsEncrypted?: string;
  columnMapping?: Record<string, string>;
  rawFileBuffer?: Buffer;
  rowsData?: Record<string, unknown>[];
  testModeUseFixtures?: boolean;
  [key: string]: unknown;
}

export interface ConnectionHealth {
  status: "connected" | "syncing" | "error" | "disconnected";
  lastSyncAt: string | null;
  lastError: string | null;
}

export interface ActionResult {
  success: boolean;
  actionId?: string;
  error?: string;
}

// 2. The DataAdapter Interface Contract
export interface DataAdapter {
  adapterType: string;
  fetchCustomers(config: OrgConnectionConfig): Promise<UniversalCustomer[]>;
  fetchInvoices(config: OrgConnectionConfig): Promise<UniversalInvoice[]>;
  fetchPayments(config: OrgConnectionConfig): Promise<UniversalPayment[]>;
  fetchCreditNotes(config: OrgConnectionConfig): Promise<UniversalCreditNote[]>;
  pushAction(config: OrgConnectionConfig, action: Record<string, unknown>): Promise<ActionResult>;
  getConnectionHealth(config: OrgConnectionConfig): Promise<ConnectionHealth>;
}
