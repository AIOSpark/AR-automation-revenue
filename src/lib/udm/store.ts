// AIOSpark UDM In-Memory Store & RLS Enforcer (Layer 6)

import { AuditService } from '../audit/service';
import { billingStore } from '../billing/store';
import { setRequestTenant, getRequestTenant } from '../tenant/request-context';
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

import {
  Customer,
  CustomerContact,
  Invoice,
  Payment,
  PaymentInvoiceMatch,
  CreditNote,
  Dispute,
  DisputeEvidence,
  ExceptionRecord,
  BankTransaction,
} from './types';

type UDMState = {
  customers: Customer[];
  contacts: CustomerContact[];
  invoices: Invoice[];
  payments: Payment[];
  matches: PaymentInvoiceMatch[];
  creditNotes: CreditNote[];
  disputes: Dispute[];
  disputeEvidences: DisputeEvidence[];
  exceptions: ExceptionRecord[];
  bankTransactions: BankTransaction[];
};

class UniversalDataStore {
  private customers: Map<string, Customer> = new Map();
  private contacts: Map<string, CustomerContact> = new Map();
  private invoices: Map<string, Invoice> = new Map();
  private payments: Map<string, Payment> = new Map();
  private matches: Map<string, PaymentInvoiceMatch> = new Map();
  private creditNotes: Map<string, CreditNote> = new Map();
  private disputes: Map<string, Dispute> = new Map();
  private disputeEvidences: Map<string, DisputeEvidence> = new Map();
  private exceptions: Map<string, ExceptionRecord> = new Map();
  private bankTransactions: Map<string, BankTransaction> = new Map();

  /** Callback invoked on any data mutation for cache invalidation (e.g. dashboard metrics). */
  private onDataChange: ((orgId: string) => void) | null = null;

  /** Register a callback to be invoked whenever UDM data is mutated for a given org. */
  public registerDataChangeHandler(handler: (orgId: string) => void): void {
    this.onDataChange = handler;
  }

  /** Notify registered handlers of a data change for an org. */
  private notifyDataChange(orgId: string): void {
    if (this.onDataChange) {
      this.onDataChange(orgId);
    }
  }

  constructor() {
    const state = readSnapshot<UDMState>('udm');
    if (!state) return;
    this.customers = new Map(state.customers.map((item) => [item.id, item]));
    this.contacts = new Map(state.contacts.map((item) => [item.id, item]));
    this.invoices = new Map(state.invoices.map((item) => [item.id, item]));
    this.payments = new Map(state.payments.map((item) => [item.id, item]));
    this.matches = new Map(state.matches.map((item) => [item.id, item]));
    this.creditNotes = new Map(state.creditNotes.map((item) => [item.id, item]));
    this.disputes = new Map(state.disputes.map((item) => [item.id, item]));
    this.disputeEvidences = new Map(state.disputeEvidences.map((item) => [item.id, item]));
    this.exceptions = new Map(state.exceptions.map((item) => [item.id, item]));
    this.bankTransactions = new Map(state.bankTransactions.map((item) => [item.id, item]));
  }

  private persist(): void {
    writeSnapshot<UDMState>('udm', {
      customers: Array.from(this.customers.values()),
      contacts: Array.from(this.contacts.values()),
      invoices: Array.from(this.invoices.values()),
      payments: Array.from(this.payments.values()),
      matches: Array.from(this.matches.values()),
      creditNotes: Array.from(this.creditNotes.values()),
      disputes: Array.from(this.disputes.values()),
      disputeEvidences: Array.from(this.disputeEvidences.values()),
      exceptions: Array.from(this.exceptions.values()),
      bankTransactions: Array.from(this.bankTransactions.values()),
    });
  }

  /** Sets the tenant context from the active request using AsyncLocalStorage. */
  public setTenantContext(orgId: string | null): void {
    setRequestTenant(orgId);
  }

  /** Derives orgId from the active AsyncLocalStorage request context. */
  public getRequestTenant(): string | null {
    return getRequestTenant();
  }

  /** Alias for setTenantContext maintained for backward compatibility. */
  public setRequestTenant(orgId: string | null): void {
    this.setTenantContext(orgId);
  }

  private assertWriteTenant(organizationId: string): void {
    const activeTenant = getRequestTenant();
    if (!activeTenant || activeTenant !== organizationId) {
      throw new Error('UDM write denied outside the active organization context');
    }
  }

  // --- CUSTOMERS ---

  public insertCustomer(data: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Customer {
    this.assertWriteTenant(data.organization_id);
    const id = `cust_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: Customer = { ...data, id, created_at: now, updated_at: now };
    this.customers.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);

    // Wire Layer 27 Usage Tracking Event
    billingStore.recordEvent({
      organization_id: data.organization_id,
      event_type: 'customer.tracked',
      quantity: 1,
      metadata: { customer_name: data.name },
    });

    return record;
  }

  public getCustomers(): Customer[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.customers.values()).filter((c) => c.organization_id === orgId);
  }

  // --- CONTACTS ---

  public insertContact(data: Omit<CustomerContact, 'id' | 'created_at' | 'updated_at'>): CustomerContact {
    this.assertWriteTenant(data.organization_id);
    const parentCustomer = this.customers.get(data.customer_id);
    if (!parentCustomer || parentCustomer.organization_id !== data.organization_id) {
      throw new Error('Contact customer must belong to the active organization context');
    }
    const id = `cnt_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: CustomerContact = { ...data, id, created_at: now, updated_at: now };
    this.contacts.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getContacts(customerId?: string): CustomerContact[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.contacts.values()).filter(
      (c) => c.organization_id === orgId && (!customerId || c.customer_id === customerId)
    );
  }

  // --- INVOICES ---

  public insertInvoice(data: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>): Invoice {
    this.assertWriteTenant(data.organization_id);
    if (!Number.isInteger(data.amount_minor_units)) {
      throw new Error(`Invoice amount_minor_units must be an integer: ${data.amount_minor_units}`);
    }
    const id = `inv_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: Invoice = { ...data, id, created_at: now, updated_at: now };
    this.invoices.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);

    // Wire Layer 27 Usage Tracking Event
    billingStore.recordEvent({
      organization_id: data.organization_id,
      event_type: 'invoice.processed',
      quantity: 1,
      metadata: { invoice_number: data.number, amount: data.amount_minor_units },
    });

    return record;
  }

  public getInvoices(): Invoice[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.invoices.values()).filter((i) => i.organization_id === orgId);
  }

  public updateInvoice(id: string, updates: Partial<Invoice>, actorUserId?: string): Invoice {
    const existing = this.invoices.get(id);
    if (!existing) throw new Error(`Invoice not found: ${id}`);
    const tenantId = getRequestTenant();
    if (!tenantId || existing.organization_id !== tenantId) {
      throw new Error('Invoice update denied outside the active organization context');
    }
    if (updates.organization_id !== undefined && updates.organization_id !== existing.organization_id) {
      throw new Error('Invoice organization ownership cannot be changed');
    }
    const beforeState = { status: existing.status, amount_minor_units: existing.amount_minor_units, due_date: existing.due_date };
    const updated: Invoice = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.invoices.set(id, updated);
    this.persist();
    this.notifyDataChange(existing.organization_id);

    AuditService.record({
      organization_id: existing.organization_id,
      actor_user_id: actorUserId || null,
      actor_type: actorUserId ? 'user' : 'system',
      action_type: 'invoice.updated',
      subject_type: 'invoice',
      subject_id: id,
      before_state: beforeState,
      after_state: { status: updated.status, amount_minor_units: updated.amount_minor_units, due_date: updated.due_date },
      result: 'success',
    });

    return updated;
  }

  public updateCustomer(id: string, updates: Partial<Customer>, actorUserId?: string): Customer {
    const existing = this.customers.get(id);
    if (!existing) throw new Error(`Customer not found: ${id}`);
    const tenantId = getRequestTenant();
    if (!tenantId || existing.organization_id !== tenantId) {
      throw new Error('Customer update denied outside the active organization context');
    }
    if (updates.organization_id !== undefined && updates.organization_id !== existing.organization_id) {
      throw new Error('Customer organization ownership cannot be changed');
    }
    const beforeState = { name: existing.name, credit_limit_minor_units: existing.credit_limit_minor_units, payment_terms_days: existing.payment_terms_days };
    const updated: Customer = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.customers.set(id, updated);
    this.persist();
    this.notifyDataChange(existing.organization_id);

    AuditService.record({
      organization_id: existing.organization_id,
      actor_user_id: actorUserId || null,
      actor_type: actorUserId ? 'user' : 'system',
      action_type: 'customer.updated',
      subject_type: 'customer',
      subject_id: id,
      before_state: beforeState,
      after_state: { name: updated.name, credit_limit_minor_units: updated.credit_limit_minor_units, payment_terms_days: updated.payment_terms_days },
      result: 'success',
    });

    return updated;
  }

  // --- PAYMENTS ---

  public insertPayment(data: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Payment {
    this.assertWriteTenant(data.organization_id);
    if (!Number.isInteger(data.amount_minor_units)) {
      throw new Error(`Payment amount_minor_units must be an integer: ${data.amount_minor_units}`);
    }
    const id = `pay_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: Payment = { ...data, id, created_at: now, updated_at: now };
    this.payments.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getPayments(): Payment[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.payments.values()).filter((p) => p.organization_id === orgId);
  }

  // --- MATCHES ---

  public insertMatch(data: Omit<PaymentInvoiceMatch, 'id' | 'created_at'>): PaymentInvoiceMatch {
    this.assertWriteTenant(data.organization_id);
    const payment = this.payments.get(data.payment_id);
    const invoice = this.invoices.get(data.invoice_id);
    if (!payment || !invoice || payment.organization_id !== data.organization_id || invoice.organization_id !== data.organization_id) {
      throw new Error('Payment match entities must belong to the active organization context');
    }
    // Duplicate prevention: same payment cannot be matched to the same invoice twice
    const existingMatch = Array.from(this.matches.values()).find(
      (m) => m.payment_id === data.payment_id && m.invoice_id === data.invoice_id
    );
    if (existingMatch) {
      throw new Error(`Duplicate payment match: payment ${data.payment_id} is already matched to invoice ${data.invoice_id}`);
    }
    const id = `match_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: PaymentInvoiceMatch = { ...data, id, created_at: now };
    this.matches.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getMatches(): PaymentInvoiceMatch[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.matches.values()).filter((m) => m.organization_id === orgId);
  }

  // --- CREDIT NOTES ---

  public insertCreditNote(data: Omit<CreditNote, 'id' | 'created_at' | 'updated_at'>): CreditNote {
    this.assertWriteTenant(data.organization_id);
    const id = `cn_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: CreditNote = { ...data, id, created_at: now, updated_at: now };
    this.creditNotes.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getCreditNotes(): CreditNote[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.creditNotes.values()).filter((cn) => cn.organization_id === orgId);
  }

  // --- DISPUTES ---

  public insertDispute(data: Omit<Dispute, 'id' | 'created_at' | 'updated_at'>): Dispute {
    this.assertWriteTenant(data.organization_id);
    const id = `disp_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: Dispute = { ...data, id, created_at: now, updated_at: now };
    this.disputes.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getDisputes(): Dispute[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.disputes.values()).filter((d) => d.organization_id === orgId);
  }

  // --- DISPUTE EVIDENCE ---

  public insertDisputeEvidence(data: Omit<DisputeEvidence, 'id' | 'created_at'>): DisputeEvidence {
    this.assertWriteTenant(data.organization_id);
    const parentDispute = this.disputes.get(data.dispute_id);
    if (!parentDispute || parentDispute.organization_id !== data.organization_id) {
      throw new Error('Dispute evidence parent must belong to the active organization context');
    }
    const id = `evid_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: DisputeEvidence = { ...data, id, created_at: now };
    this.disputeEvidences.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getDisputeEvidences(disputeId?: string): DisputeEvidence[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.disputeEvidences.values()).filter(
      (e) => e.organization_id === orgId && (!disputeId || e.dispute_id === disputeId)
    );
  }

  // --- EXCEPTIONS ---

  public insertException(data: Omit<ExceptionRecord, 'id' | 'created_at' | 'updated_at'>): ExceptionRecord {
    this.assertWriteTenant(data.organization_id);
    const id = `exc_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: ExceptionRecord = { ...data, id, created_at: now, updated_at: now };
    this.exceptions.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getExceptions(): ExceptionRecord[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.exceptions.values()).filter((ex) => ex.organization_id === orgId);
  }

  public updateException(id: string, updates: Partial<ExceptionRecord>): ExceptionRecord {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error(`Exception not found: ${id}`);
    const tenantId = getRequestTenant();
    if (!tenantId || existing.organization_id !== tenantId) {
      throw new Error('Exception update denied outside the active organization context');
    }
    if (updates.organization_id !== undefined && updates.organization_id !== existing.organization_id) {
      throw new Error('Exception organization ownership cannot be changed');
    }
    const updated: ExceptionRecord = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.exceptions.set(id, updated);
    this.persist();
    this.notifyDataChange(existing.organization_id);
    return updated;
  }

  // --- BANK TRANSACTIONS ---

  public insertBankTransaction(data: Omit<BankTransaction, 'id' | 'created_at' | 'updated_at'>): BankTransaction {
    this.assertWriteTenant(data.organization_id);
    const id = `tx_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: BankTransaction = { ...data, id, created_at: now, updated_at: now };
    this.bankTransactions.set(id, record);
    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getBankTransactions(): BankTransaction[] {
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.bankTransactions.values()).filter((bt) => bt.organization_id === orgId);
  }

  public updateBankTransaction(id: string, updates: Partial<BankTransaction>): BankTransaction {
    const existing = this.bankTransactions.get(id);
    if (!existing) {
      throw new Error(`Bank transaction not found: ${id}`);
    }
    const tenantId = getRequestTenant();
    if (!tenantId || existing.organization_id !== tenantId) {
      throw new Error('Bank transaction update denied outside the active organization context');
    }
    if (updates.organization_id !== undefined && updates.organization_id !== existing.organization_id) {
      throw new Error('Bank transaction organization ownership cannot be changed');
    }
    const updated: BankTransaction = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.bankTransactions.set(id, updated);
    this.persist();
    this.notifyDataChange(existing.organization_id);
    return updated;
  }

  public clearAll(): void {
    this.customers.clear();
    this.contacts.clear();
    this.invoices.clear();
    this.payments.clear();
    this.matches.clear();
    this.creditNotes.clear();
    this.disputes.clear();
    this.disputeEvidences.clear();
    this.exceptions.clear();
    this.bankTransactions.clear();
    deleteSnapshot('udm');
  }
}

export const udmStore = new UniversalDataStore();