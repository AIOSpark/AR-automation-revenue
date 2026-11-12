// AIOSpark UDM In-Memory Store & RLS Enforcer (Layer 6)

import { AuditService } from '../audit/service';
import { billingStore } from '../billing/store';
import { setRequestTenant, getRequestTenant } from '../tenant/request-context';
import {
  getDurableStatePath,
  readSnapshot,
  withWriteTransaction,
} from '../db/durable-repository';
import {
  backfillUdmFromSnapshot,
  readUdmRelationalState,
  writeUdmRelationalDelta,
  writeUdmRelationalInvoices,
  writeUdmRelationalState,
} from '../db/relational-repository';

import {
  Customer,
  CustomerContact,
  Invoice,
  Payment,
  PaymentInvoiceMatch,
  CreditNote,
  CreditNoteAllocation,
  CreditNoteBalance,
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
  creditAllocations: CreditNoteAllocation[];
  disputes: Dispute[];
  disputeEvidences: DisputeEvidence[];
  exceptions: ExceptionRecord[];
  bankTransactions: BankTransaction[];
  idempotencyKeys: Array<{ organization_id: string; key: string; record_id: string }>;
  apiIdempotencyKeys: Array<{
    organization_id: string;
    endpoint: string;
    key: string;
    record_id: string | null;
    fingerprint: string;
    response: unknown;
    status: 'reserved' | 'committed' | 'failed';
  }>;
};

class UniversalDataStore {
  private customers: Map<string, Customer> = new Map();
  private contacts: Map<string, CustomerContact> = new Map();
  private invoices: Map<string, Invoice> = new Map();
  private payments: Map<string, Payment> = new Map();
  private matches: Map<string, PaymentInvoiceMatch> = new Map();
  private creditNotes: Map<string, CreditNote> = new Map();
  private creditAllocations: Map<string, CreditNoteAllocation> = new Map();
  private disputes: Map<string, Dispute> = new Map();
  private disputeEvidences: Map<string, DisputeEvidence> = new Map();
  private exceptions: Map<string, ExceptionRecord> = new Map();
  private bankTransactions: Map<string, BankTransaction> = new Map();
  private idempotencyKeys: Map<string, string> = new Map(); // Keyed by orgId + ":" + key
  private idempotencyLocks: Map<string, Promise<unknown>> = new Map(); // In-flight key operations
  private _writeDepth = 0; // Nested durable write scope for this process
  private _suppressNotifications = false;
  private _pendingNotifications: Set<string> = new Set();
  private _transactionLock: Promise<unknown> = Promise.resolve(); // Serializes in-process transactions
  private apiIdempotencyKeys: Map<string, { recordId: string | null; fingerprint: string; response: unknown; status: 'reserved' | 'committed' | 'failed' }> = new Map(); // Keyed by orgId:endpoint:key
  private lastPersistedState: UDMState | null = null;
  private dirtyInvoices: Set<string> = new Set();
  private forceFullProjection = false;

  /** Callback invoked on any data mutation for cache invalidation (e.g. dashboard metrics). */
  private onDataChange: ((orgId: string) => void) | null = null;

  /** Register a callback to be invoked whenever UDM data is mutated for a given org. */
  public registerDataChangeHandler(handler: (orgId: string) => void): void {
    this.onDataChange = handler;
  }

  /** Notify registered handlers of a data change for an org. */
  private notifyDataChange(orgId: string): void {
    if (!this.onDataChange) return;
    if (this._suppressNotifications) {
      this._pendingNotifications.add(orgId);
      return;
    }
    this.onDataChange(orgId);
  }

  constructor() {
    this.reloadFromDurableState(true);
  }

  /**
   * Replace the per-process cache with the latest committed snapshot.
   *
   * The cache is only an execution view: SQLite (`repository_snapshots`) is
   * authoritative. Reads refresh before answering so another application
   * process's committed writes are visible here. Refreshes are skipped during
   * an active write scope so a transaction never discards its own changes.
   */
  private reloadFromDurableState(force = false): void {
    if (getDurableStatePath() === ':memory:') return;
    if (this._writeDepth > 0 && !force) return;

    // Migrate a legacy JSON snapshot once, then read the relational tables as
    // the authoritative representation.
    backfillUdmFromSnapshot();
    const relational = readUdmRelationalState();
    if (relational) {
      this.applyState(relational as unknown as UDMState);
      this.lastPersistedState = structuredClone(this.captureState());
      return;
    }

    // No relational rows yet: an absent snapshot means a genuinely empty DB.
    const state = readSnapshot<UDMState>('udm');
    this.applyState(state);
    this.lastPersistedState = state ? structuredClone(this.captureState()) : null;
  }

  private applyState(state: UDMState | null): void {
    if (!state) {
      this.customers.clear();
      this.contacts.clear();
      this.invoices.clear();
      this.payments.clear();
      this.matches.clear();
      this.creditNotes.clear();
      this.creditAllocations.clear();
      this.disputes.clear();
      this.disputeEvidences.clear();
      this.exceptions.clear();
      this.bankTransactions.clear();
      this.idempotencyKeys.clear();
      this.apiIdempotencyKeys.clear();
      return;
    }
    // Tolerate snapshots written before newer collections were introduced.
    // Missing collections are treated as empty rather than failing startup.
    this.customers = new Map((state.customers || []).map((item) => [item.id, item]));
    this.contacts = new Map((state.contacts || []).map((item) => [item.id, item]));
    this.invoices = new Map((state.invoices || []).map((item) => [item.id, item]));
    this.payments = new Map((state.payments || []).map((item) => [item.id, item]));
    this.matches = new Map((state.matches || []).map((item) => [item.id, item]));
    this.creditNotes = new Map((state.creditNotes || []).map((item) => [item.id, item]));
    this.creditAllocations = new Map((state.creditAllocations || []).map((item) => [item.id, item]));
    this.disputes = new Map((state.disputes || []).map((item) => [item.id, item]));
    this.disputeEvidences = new Map((state.disputeEvidences || []).map((item) => [item.id, item]));
    this.exceptions = new Map((state.exceptions || []).map((item) => [item.id, item]));
    this.bankTransactions = new Map((state.bankTransactions || []).map((item) => [item.id, item]));
    this.idempotencyKeys = new Map((state.idempotencyKeys || []).map((entry) => [`${entry.organization_id}:${entry.key}`, entry.record_id]));
    this.apiIdempotencyKeys = new Map((state.apiIdempotencyKeys || []).map((entry) => [
      `${entry.organization_id}:${entry.endpoint}:${entry.key}`,
      { recordId: entry.record_id, fingerprint: entry.fingerprint, response: entry.response, status: entry.status || 'reserved' },
    ]));
  }

  private captureState(): UDMState {
    return {
      customers: Array.from(this.customers.values()),
      contacts: Array.from(this.contacts.values()),
      invoices: Array.from(this.invoices.values()),
      payments: Array.from(this.payments.values()),
      matches: Array.from(this.matches.values()),
      creditNotes: Array.from(this.creditNotes.values()),
      creditAllocations: Array.from(this.creditAllocations.values()),
      disputes: Array.from(this.disputes.values()),
      disputeEvidences: Array.from(this.disputeEvidences.values()),
      exceptions: Array.from(this.exceptions.values()),
      bankTransactions: Array.from(this.bankTransactions.values()),
      idempotencyKeys: Array.from(this.idempotencyKeys.entries()).map(([key, recordId]) => {
        const separator = key.indexOf(':');
        return {
          organization_id: key.slice(0, separator),
          key: key.slice(separator + 1),
          record_id: recordId,
        };
      }),
      apiIdempotencyKeys: Array.from(this.apiIdempotencyKeys.entries()).map(([key, value]) => {
        const [organizationId, endpoint, ...rest] = key.split(':');
        return {
          organization_id: organizationId,
          endpoint,
          key: rest.join(':'),
          record_id: value.recordId,
          fingerprint: value.fingerprint,
          response: value.response,
          status: value.status,
        };
      }),
    };
  }

  /**
   * Run a mutation under a durable write scope. SQLite takes BEGIN IMMEDIATE,
   * the cache reloads the latest committed state, then the mutation is applied
   * and persisted. A crash before COMMIT leaves no partial financial record.
   */
  private runWrite<T>(callback: () => T): T {
    if (this._writeDepth > 0) {
      this._writeDepth++;
      try {
        return callback();
      } finally {
        this._writeDepth--;
      }
    }

    return withWriteTransaction(() => {
      this.reloadFromDurableState(true);
      const before = this.captureState();
      this._writeDepth = 1;
      try {
        return callback();
      } catch (error) {
        this.applyState(before);
        this.lastPersistedState = structuredClone(before);
        this.dirtyInvoices.clear();
        this.forceFullProjection = false;
        throw error;
      } finally {
        this._writeDepth = 0;
      }
    });
  }

  /**
   * Serializes access to an idempotency key so that concurrent requests with
   * the same key cannot both pass the existence check and create duplicates.
   * Within a single Node.js process the event loop already serializes
   * synchronous work; this lock adds protection against future async work
   * interleaving between the idempotency check and the record write.
   */
  private async withIdempotencyLock<T>(orgId: string, key: string, operation: () => T): Promise<T> {
    const lockKey = `${orgId}:${key}`;

    // Wait for any in-flight operation on this key to complete
    const inFlight = this.idempotencyLocks.get(lockKey);
    if (inFlight) {
      await inFlight;
    }

    // After waiting, check whether the key was already resolved by the
    // in-flight operation
    const existingRecordId = this.idempotencyKeys.get(lockKey);
    if (existingRecordId) {
      return existingRecordId as unknown as T;
    }

    const promise = Promise.resolve().then(operation);
    this.idempotencyLocks.set(lockKey, promise);
    try {
      return await promise;
    } finally {
      this.idempotencyLocks.delete(lockKey);
    }
  }

  /**
   * Atomically check and reserve an API-level idempotency key under the key lock.
   *
   * Returns:
   *   { status: 'available', recordId: null } — key not seen before, reserved for this request
   *   { status: 'recoverable', recordId: null } — key reserved but operation never completed (crash recovery)
   *   { status: 'replay', recordId, response } — same key + same fingerprint, return cached response
   *   { status: 'conflict', recordId } — same key + different fingerprint (HTTP 409)
   */
  public async checkAndReserveApiIdempotency(
    orgId: string,
    endpoint: string,
    key: string,
    fingerprint: string
  ): Promise<{ status: 'available' | 'recoverable' | 'replay' | 'conflict'; recordId: string | null; response: unknown | null }> {
    return this.withIdempotencyLock<{ status: 'available' | 'recoverable' | 'replay' | 'conflict'; recordId: string | null; response: unknown | null }>(orgId, key, () => {
      return this.runWrite(() => {
        const lockKey = `${orgId}:${endpoint}:${key}`;
        const existing = this.apiIdempotencyKeys.get(lockKey);
        if (!existing) {
          // Reserve the key as pending (no response yet) to prevent concurrent duplicates
          this.apiIdempotencyKeys.set(lockKey, { recordId: null, fingerprint, response: null, status: 'reserved' });
          this.persist();
          return { status: 'available' as const, recordId: null, response: null };
        }
        if (existing.status === 'reserved') {
          // Previous attempt reserved the key but never finalized — possible crash.
          // Return 'recoverable' so the caller can retry. The caller must verify
          // whether the financial transaction actually completed before retrying.
          return { status: 'recoverable' as const, recordId: null, response: null };
        }
        if (existing.status === 'committed') {
          if (existing.fingerprint !== fingerprint) {
            return { status: 'conflict' as const, recordId: existing.recordId, response: null };
          }
          return { status: 'replay' as const, recordId: existing.recordId, response: existing.response };
        }
        // existing.status === 'failed' — treat as available for retry
        this.apiIdempotencyKeys.set(lockKey, { recordId: null, fingerprint, response: null, status: 'reserved' });
        this.persist();
        return { status: 'available' as const, recordId: null, response: null };
      });
    });
  }

  /**
   * Finalize an idempotency key after a successful mutation, storing the record ID
   * and response for replay on duplicate requests.
   */
  public finalizeApiIdempotency(
    orgId: string,
    endpoint: string,
    key: string,
    recordId: string,
    fingerprint: string,
    response: unknown
  ): void {
    this.runWrite(() => {
      const lockKey = `${orgId}:${endpoint}:${key}`;
      this.apiIdempotencyKeys.set(lockKey, { recordId, fingerprint, response, status: 'committed' });
      this.persist();
    });
  }

  /**
   * Release an idempotency key after a failed mutation, allowing retries.
   */
  public releaseApiIdempotency(orgId: string, endpoint: string, key: string): void {
    this.runWrite(() => {
      const lockKey = `${orgId}:${endpoint}:${key}`;
      this.apiIdempotencyKeys.set(lockKey, { recordId: null, fingerprint: '', response: null, status: 'failed' });
      this.persist();
    });
  }

  public async transaction<T>(callback: () => T): Promise<T> {
    // Queue in-process transactions; SQLite's BEGIN IMMEDIATE serializes
    // application processes. A failed transaction does not poison the queue.
    const run = async (): Promise<T> => {
      this._suppressNotifications = true;
      this._pendingNotifications.clear();
      try {
        const result = this.runWrite(callback);
        this._suppressNotifications = false;
        const orgs = this._pendingNotifications;
        this._pendingNotifications = new Set();
        for (const orgId of orgs) this.onDataChange?.(orgId);
        return result;
      } catch (error) {
        this._suppressNotifications = false;
        this._pendingNotifications.clear();
        throw error;
      }
    };

    const previous = this._transactionLock;
    const next = previous.then(run, run);
    this._transactionLock = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private persist(): void {
    const state = this.captureState();
    this.validateState(state);
    const invoiceFastPath = !this.forceFullProjection && this.dirtyInvoices.size > 0;

    // Relational tables are the authoritative store. Invoice-only mutations
    // use a focused upsert so large imports do not rewrite unrelated rows.
    withWriteTransaction(() => {
      if (invoiceFastPath) {
        writeUdmRelationalInvoices(
          state.invoices.filter((invoice) => this.dirtyInvoices.has(invoice.id)),
        );
      } else {
        writeUdmRelationalDelta(state, this.lastPersistedState);
      }
    });
    this.dirtyInvoices.clear();
    this.forceFullProjection = false;
    if (!invoiceFastPath) this.lastPersistedState = structuredClone(state);
  }

  /**
   * Enforce financial invariants before any snapshot reaches SQLite. These
   * checks run inside the write transaction, so a violation rolls back the
   * entire mutation and no half-written state can be committed.
   */
  private validateState(state: UDMState): void {
    const assertTenant = (record: { id: string; organization_id: string }, label: string) => {
      if (!record.id) throw new Error(`Integrity violation: ${label} is missing an id`);
      if (!record.organization_id) throw new Error(`Integrity violation: ${label} ${record.id} is missing organization_id`);
    };
    const assertAmount = (amount: number, label: string) => {
      if (!Number.isInteger(amount)) throw new Error(`Integrity violation: ${label} amount must be integer minor units`);
    };
    const assertRef = (collection: Map<string, { organization_id: string }>, id: string, organizationId: string, label: string) => {
      const target = collection.get(id);
      if (!target) throw new Error(`Integrity violation: ${label} references missing record ${id}`);
      if (target.organization_id !== organizationId) throw new Error(`Integrity violation: ${label} crosses tenant boundary`);
    };

    const uniqueIds = (records: Array<{ id: string }>, label: string) => {
      const seen = new Set<string>();
      for (const record of records) {
        if (seen.has(record.id)) throw new Error(`Integrity violation: duplicate ${label} id ${record.id}`);
        seen.add(record.id);
      }
    };

    uniqueIds(state.customers, 'customer');
    uniqueIds(state.contacts, 'contact');
    uniqueIds(state.invoices, 'invoice');
    uniqueIds(state.payments, 'payment');
    uniqueIds(state.matches, 'payment match');
    uniqueIds(state.creditNotes, 'credit note');
    uniqueIds(state.creditAllocations, 'credit allocation');
    uniqueIds(state.disputes, 'dispute');
    uniqueIds(state.disputeEvidences, 'dispute evidence');
    uniqueIds(state.exceptions, 'exception');
    uniqueIds(state.bankTransactions, 'bank transaction');

    const customers = new Map(state.customers.map((record) => [record.id, record]));
    const invoices = new Map(state.invoices.map((record) => [record.id, record]));
    const payments = new Map(state.payments.map((record) => [record.id, record]));
    const creditNotes = new Map(state.creditNotes.map((record) => [record.id, record]));
    const disputes = new Map(state.disputes.map((record) => [record.id, record]));

    for (const record of state.invoices) {
      assertTenant(record, 'invoice');
      assertAmount(record.amount_minor_units, `invoice ${record.id}`);
      assertRef(customers, record.customer_id, record.organization_id, `invoice ${record.id}`);
    }
    for (const record of state.payments) {
      assertTenant(record, 'payment');
      assertAmount(record.amount_minor_units, `payment ${record.id}`);
      assertRef(customers, record.customer_id, record.organization_id, `payment ${record.id}`);
    }
    for (const record of state.matches) {
      assertTenant(record, 'payment match');
      assertAmount(record.matched_amount_minor_units, `payment match ${record.id}`);
      assertRef(payments, record.payment_id, record.organization_id, `payment match ${record.id}`);
      assertRef(invoices, record.invoice_id, record.organization_id, `payment match ${record.id}`);
    }
    for (const record of state.creditNotes) {
      assertTenant(record, 'credit note');
      assertAmount(record.amount_minor_units, `credit note ${record.id}`);
      assertRef(customers, record.customer_id, record.organization_id, `credit note ${record.id}`);
      if (record.invoice_id) assertRef(invoices, record.invoice_id, record.organization_id, `credit note ${record.id}`);
    }
    for (const record of state.creditAllocations) {
      assertTenant(record, 'credit allocation');
      assertAmount(record.allocated_amount_minor_units, `credit allocation ${record.id}`);
      assertRef(creditNotes, record.credit_note_id, record.organization_id, `credit allocation ${record.id}`);
      assertRef(invoices, record.invoice_id, record.organization_id, `credit allocation ${record.id}`);
    }
    for (const record of state.contacts) {
      assertTenant(record, 'contact');
      assertRef(customers, record.customer_id, record.organization_id, `contact ${record.id}`);
    }
    for (const record of state.disputes) {
      assertTenant(record, 'dispute');
      assertRef(invoices, record.invoice_id, record.organization_id, `dispute ${record.id}`);
    }
    for (const record of state.disputeEvidences) {
      assertTenant(record, 'dispute evidence');
      assertRef(disputes, record.dispute_id, record.organization_id, `dispute evidence ${record.id}`);
    }
    for (const record of state.exceptions) {
      assertTenant(record, 'exception');
      if (record.customer_id) assertRef(customers, record.customer_id, record.organization_id, `exception ${record.id}`);
      if (record.invoice_id) assertRef(invoices, record.invoice_id, record.organization_id, `exception ${record.id}`);
    }
    for (const record of state.bankTransactions) {
      assertTenant(record, 'bank transaction');
      assertAmount(record.amount_minor_units, `bank transaction ${record.id}`);
      if (record.matched_payment_id) assertRef(payments, record.matched_payment_id, record.organization_id, `bank transaction ${record.id}`);
    }

    const knownIds = new Set<string>([
      ...customers.keys(), ...invoices.keys(), ...payments.keys(), ...creditNotes.keys(),
      ...state.matches.map((record) => record.id), ...state.creditAllocations.map((record) => record.id),
    ]);
    for (const entry of state.idempotencyKeys) {
      if (!entry.organization_id || !entry.key) {
        throw new Error('Integrity violation: idempotency key is missing organization_id or key');
      }
      if (!knownIds.has(entry.record_id)) {
        throw new Error(`Integrity violation: idempotency key '${entry.key}' references missing record ${entry.record_id}`);
      }
    }
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
    return this.runWrite(() => this.insertCustomerInternal(data));
  }

  private insertCustomerInternal(data: Omit<Customer, 'id' | 'created_at' | 'updated_at'>): Customer {
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
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.customers.values()).filter((c) => c.organization_id === orgId);
  }

  // --- CONTACTS ---

  public insertContact(data: Omit<CustomerContact, 'id' | 'created_at' | 'updated_at'>): CustomerContact {
    return this.runWrite(() => this.insertContactInternal(data));
  }

  private insertContactInternal(data: Omit<CustomerContact, 'id' | 'created_at' | 'updated_at'>): CustomerContact {
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
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.contacts.values()).filter(
      (c) => c.organization_id === orgId && (!customerId || c.customer_id === customerId)
    );
  }

  // --- INVOICES ---

  public insertInvoice(data: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>): Invoice {
    return this.runWrite(() => this.insertInvoiceInternal(data));
  }

  private insertInvoiceInternal(data: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>): Invoice {
    this.assertWriteTenant(data.organization_id);
    if (!Number.isInteger(data.amount_minor_units)) {
      throw new Error(`Invoice amount_minor_units must be an integer: ${data.amount_minor_units}`);
    }

    // Idempotency: return existing record if this key was already used for this org
    if (data.idempotency_key) {
      const idempotencyKey = `${data.organization_id}:${data.idempotency_key}`;
      const existingRecordId = this.idempotencyKeys.get(idempotencyKey);
      if (existingRecordId) {
        const existing = this.invoices.get(existingRecordId);
        if (existing) {
          return existing;
        }
      }
    }

    const id = `inv_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: Invoice = { ...data, id, created_at: now, updated_at: now };
    this.invoices.set(id, record);
    this.dirtyInvoices.add(id);

    if (data.idempotency_key) {
      this.idempotencyKeys.set(`${data.organization_id}:${data.idempotency_key}`, id);
      this.forceFullProjection = true;
    }

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
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.invoices.values()).filter((i) => i.organization_id === orgId);
  }

  public updateInvoice(id: string, updates: Partial<Invoice>, actorUserId?: string): Invoice {
    return this.runWrite(() => this.updateInvoiceInternal(id, updates, actorUserId));
  }

  private updateInvoiceInternal(id: string, updates: Partial<Invoice>, actorUserId?: string): Invoice {
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
    this.dirtyInvoices.add(id);
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
    return this.runWrite(() => this.updateCustomerInternal(id, updates, actorUserId));
  }

  private updateCustomerInternal(id: string, updates: Partial<Customer>, actorUserId?: string): Customer {
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
    return this.runWrite(() => this.insertPaymentInternal(data));
  }

  private insertPaymentInternal(data: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Payment {
    this.assertWriteTenant(data.organization_id);
    if (!Number.isInteger(data.amount_minor_units)) {
      throw new Error(`Payment amount_minor_units must be an integer: ${data.amount_minor_units}`);
    }

    // Idempotency: return existing record if this key was already used for this org
    if (data.idempotency_key) {
      const idempotencyKey = `${data.organization_id}:${data.idempotency_key}`;
      const existingRecordId = this.idempotencyKeys.get(idempotencyKey);
      if (existingRecordId) {
        const existing = this.payments.get(existingRecordId);
        if (existing) {
          return existing;
        }
      }
    }

    const id = `pay_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: Payment = { ...data, id, created_at: now, updated_at: now };
    this.payments.set(id, record);

    if (data.idempotency_key) {
      this.idempotencyKeys.set(`${data.organization_id}:${data.idempotency_key}`, id);
    }

    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getPayments(): Payment[] {
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.payments.values()).filter((p) => p.organization_id === orgId);
  }

  // --- MATCHES ---

  public insertMatch(data: Omit<PaymentInvoiceMatch, 'id' | 'created_at'>): PaymentInvoiceMatch {
    return this.runWrite(() => this.insertMatchInternal(data));
  }

  private insertMatchInternal(data: Omit<PaymentInvoiceMatch, 'id' | 'created_at'>): PaymentInvoiceMatch {
    this.assertWriteTenant(data.organization_id);
    const payment = this.payments.get(data.payment_id);
    const invoice = this.invoices.get(data.invoice_id);
    if (!payment || !invoice || payment.organization_id !== data.organization_id || invoice.organization_id !== data.organization_id) {
      throw new Error('Payment match entities must belong to the active organization context');
    }

    // Idempotency: return existing record if this key was already used for this org
    if (data.idempotency_key) {
      const idempotencyKey = `${data.organization_id}:${data.idempotency_key}`;
      const existingRecordId = this.idempotencyKeys.get(idempotencyKey);
      if (existingRecordId) {
        const existing = this.matches.get(existingRecordId);
        if (existing) {
          return existing;
        }
      }
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

    if (data.idempotency_key) {
      this.idempotencyKeys.set(`${data.organization_id}:${data.idempotency_key}`, id);
    }

    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getMatches(): PaymentInvoiceMatch[] {
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.matches.values()).filter((m) => m.organization_id === orgId);
  }

  // --- CREDIT NOTES ---

  public insertCreditNote(data: Omit<CreditNote, 'id' | 'created_at' | 'updated_at'>): CreditNote {
    return this.runWrite(() => this.insertCreditNoteInternal(data));
  }

  private insertCreditNoteInternal(data: Omit<CreditNote, 'id' | 'created_at' | 'updated_at'>): CreditNote {
    this.assertWriteTenant(data.organization_id);

    // Idempotency: return existing record if this key was already used for this org
    if (data.idempotency_key) {
      const idempotencyKey = `${data.organization_id}:${data.idempotency_key}`;
      const existingRecordId = this.idempotencyKeys.get(idempotencyKey);
      if (existingRecordId) {
        const existing = this.creditNotes.get(existingRecordId);
        if (existing) {
          return existing;
        }
      }
    }

    const id = `cn_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: CreditNote = { ...data, id, created_at: now, updated_at: now };
    this.creditNotes.set(id, record);

    if (data.idempotency_key) {
      this.idempotencyKeys.set(`${data.organization_id}:${data.idempotency_key}`, id);
    }

    this.persist();
    this.notifyDataChange(data.organization_id);
    return record;
  }

  public getCreditNotes(): CreditNote[] {
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.creditNotes.values()).filter((cn) => cn.organization_id === orgId);
  }

  public getCreditNoteBalance(creditNoteId: string): CreditNoteBalance {
    this.reloadFromDurableState();
    const cn = this.creditNotes.get(creditNoteId);
    if (!cn) {
      return { availableMinorUnits: 0, allocatedMinorUnits: 0 };
    }
    const allocations = Array.from(this.creditAllocations.values()).filter(
      (a) => a.credit_note_id === creditNoteId && a.status === 'allocated',
    );
    const allocatedMinorUnits = allocations.reduce((sum, a) => sum + a.allocated_amount_minor_units, 0);
    return {
      availableMinorUnits: Math.max(0, cn.amount_minor_units - allocatedMinorUnits),
      allocatedMinorUnits,
    };
  }

  public getCreditAllocations(): CreditNoteAllocation[] {
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.creditAllocations.values()).filter((a) => a.organization_id === orgId);
  }

  public insertCreditAllocation(data: Omit<CreditNoteAllocation, 'id' | 'created_at' | 'updated_at' | 'status'>): CreditNoteAllocation {
    return this.runWrite(() => this.insertCreditAllocationInternal(data));
  }

  private insertCreditAllocationInternal(data: Omit<CreditNoteAllocation, 'id' | 'created_at' | 'updated_at' | 'status'>): CreditNoteAllocation {
    this.assertWriteTenant(data.organization_id);

    // Idempotency: return existing record if this key was already used for this org
    if (data.idempotency_key) {
      const idempotencyKey = `${data.organization_id}:${data.idempotency_key}`;
      const existingRecordId = this.idempotencyKeys.get(idempotencyKey);
      if (existingRecordId) {
        const existing = this.creditAllocations.get(existingRecordId);
        if (existing) {
          return existing;
        }
      }
    }

    const creditNote = this.creditNotes.get(data.credit_note_id);
    if (!creditNote || creditNote.organization_id !== data.organization_id) {
      throw new Error('Credit note not found or does not belong to the active organization');
    }
    const invoice = this.invoices.get(data.invoice_id);
    if (!invoice || invoice.organization_id !== data.organization_id) {
      throw new Error('Invoice not found or does not belong to the active organization');
    }

    const balance = this.getCreditNoteBalance(data.credit_note_id);
    if (data.allocated_amount_minor_units > balance.availableMinorUnits) {
      throw new Error(`Allocation exceeds available credit note balance`);
    }

    const existingAllocations = Array.from(this.creditAllocations.values()).filter(
      (a) => a.invoice_id === data.invoice_id && a.status === 'allocated' && a.organization_id === data.organization_id,
    );
    const invoiceCreditAllocatedSum = existingAllocations.reduce((sum, a) => sum + a.allocated_amount_minor_units, 0);

    const invoiceMatches = udmStore.getMatches().filter(
      (m) => m.invoice_id === data.invoice_id && m.organization_id === data.organization_id,
    );
    const invoicePaidSum = invoiceMatches.reduce((sum, m) => sum + m.matched_amount_minor_units, 0);

    const invoiceOutstanding = invoice.amount_minor_units - invoicePaidSum - invoiceCreditAllocatedSum;
    if (invoiceOutstanding <= 0) {
      throw new Error(`Invoice ${data.invoice_id} is already fully settled`);
    }
    if (data.allocated_amount_minor_units > invoiceOutstanding) {
      throw new Error(`Allocation exceeds invoice outstanding balance`);
    }

    const id = `ca_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const record: CreditNoteAllocation = { ...data, id, status: 'allocated', created_at: now, updated_at: now };
    this.creditAllocations.set(id, record);

    if (data.idempotency_key) {
      this.idempotencyKeys.set(`${data.organization_id}:${data.idempotency_key}`, id);
    }

    this.persist();
    this.notifyDataChange(data.organization_id);

    AuditService.record({
      organization_id: data.organization_id,
      actor_user_id: data.allocated_by || null,
      actor_type: data.allocated_by ? 'user' : 'system',
      action_type: 'credit_note.allocation_created',
      subject_type: 'credit_note_allocation',
      subject_id: id,
      after_state: {
        credit_note_id: data.credit_note_id,
        invoice_id: data.invoice_id,
        allocated_amount_minor_units: data.allocated_amount_minor_units,
      },
      result: 'success',
    });

    return record;
  }

  public reverseCreditAllocation(allocationId: string, reason: string, reversedBy?: string): CreditNoteAllocation {
    return this.runWrite(() => this.reverseCreditAllocationInternal(allocationId, reason, reversedBy));
  }

  private reverseCreditAllocationInternal(allocationId: string, reason: string, reversedBy?: string): CreditNoteAllocation {
    const existing = this.creditAllocations.get(allocationId);
    if (!existing) {
      throw new Error(`Credit allocation not found: ${allocationId}`);
    }
    const tenantId = getRequestTenant();
    if (!tenantId || existing.organization_id !== tenantId) {
      throw new Error('Credit allocation reversal denied outside the active organization context');
    }
    if (existing.status !== 'allocated') {
      throw new Error(`Credit allocation ${allocationId} is already ${existing.status}`);
    }

    const now = new Date().toISOString();
    const reversed: CreditNoteAllocation = {
      ...existing,
      status: 'reversed',
      reversal_reason: reason,
      reversed_by: reversedBy || null,
      reversed_at: now,
      updated_at: now,
    };
    this.creditAllocations.set(allocationId, reversed);
    this.persist();
    this.notifyDataChange(existing.organization_id);

    AuditService.record({
      organization_id: existing.organization_id,
      actor_user_id: reversedBy || null,
      actor_type: reversedBy ? 'user' : 'system',
      action_type: 'credit_note.allocation_reversed',
      subject_type: 'credit_note_allocation',
      subject_id: allocationId,
      after_state: {
        credit_note_id: existing.credit_note_id,
        invoice_id: existing.invoice_id,
        reversed_amount_minor_units: existing.allocated_amount_minor_units,
        reversal_reason: reason,
      },
      result: 'success',
    });

    return reversed;
  }

  public computeInvoiceOutstanding(invoice: Invoice): number {
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) {
      throw new Error('Missing tenant context: orgId not available in current request context');
    }
    const matches = udmStore.getMatches().filter((m) => m.invoice_id === invoice.id && m.organization_id === orgId);
    const paidMatchedSum = matches.reduce((acc, m) => acc + m.matched_amount_minor_units, 0);
    const allocations = Array.from(this.creditAllocations.values()).filter(
      (a) => a.invoice_id === invoice.id && a.status === 'allocated' && a.organization_id === orgId,
    );
    const creditAllocatedSum = allocations.reduce((acc, a) => acc + a.allocated_amount_minor_units, 0);
    const outstanding = invoice.amount_minor_units - paidMatchedSum - creditAllocatedSum;
    return Math.max(0, outstanding);
  }

  // --- DISPUTES ---

  public insertDispute(data: Omit<Dispute, 'id' | 'created_at' | 'updated_at'>): Dispute {
    return this.runWrite(() => this.insertDisputeInternal(data));
  }

  private insertDisputeInternal(data: Omit<Dispute, 'id' | 'created_at' | 'updated_at'>): Dispute {
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
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.disputes.values()).filter((d) => d.organization_id === orgId);
  }

  // --- DISPUTE EVIDENCE ---

  public insertDisputeEvidence(data: Omit<DisputeEvidence, 'id' | 'created_at'>): DisputeEvidence {
    return this.runWrite(() => this.insertDisputeEvidenceInternal(data));
  }

  private insertDisputeEvidenceInternal(data: Omit<DisputeEvidence, 'id' | 'created_at'>): DisputeEvidence {
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
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.disputeEvidences.values()).filter(
      (e) => e.organization_id === orgId && (!disputeId || e.dispute_id === disputeId)
    );
  }

  // --- EXCEPTIONS ---

  public insertException(data: Omit<ExceptionRecord, 'id' | 'created_at' | 'updated_at'>): ExceptionRecord {
    return this.runWrite(() => this.insertExceptionInternal(data));
  }

  private insertExceptionInternal(data: Omit<ExceptionRecord, 'id' | 'created_at' | 'updated_at'>): ExceptionRecord {
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
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.exceptions.values()).filter((ex) => ex.organization_id === orgId);
  }

  public updateException(id: string, updates: Partial<ExceptionRecord>): ExceptionRecord {
    return this.runWrite(() => this.updateExceptionInternal(id, updates));
  }

  private updateExceptionInternal(id: string, updates: Partial<ExceptionRecord>): ExceptionRecord {
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
    return this.runWrite(() => this.insertBankTransactionInternal(data));
  }

  private insertBankTransactionInternal(data: Omit<BankTransaction, 'id' | 'created_at' | 'updated_at'>): BankTransaction {
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
    this.reloadFromDurableState();
    const orgId = getRequestTenant();
    if (!orgId) return [];
    return Array.from(this.bankTransactions.values()).filter((bt) => bt.organization_id === orgId);
  }

  public updateBankTransaction(id: string, updates: Partial<BankTransaction>): BankTransaction {
    return this.runWrite(() => this.updateBankTransactionInternal(id, updates));
  }

  private updateBankTransactionInternal(id: string, updates: Partial<BankTransaction>): BankTransaction {
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
    this.runWrite(() => this.clearAllInternal());
  }

  private clearAllInternal(): void {
    this.forceFullProjection = true;
    this.dirtyInvoices.clear();
    this.customers.clear();
    this.contacts.clear();
    this.invoices.clear();
    this.payments.clear();
    this.matches.clear();
    this.creditNotes.clear();
    this.creditAllocations.clear();
    this.disputes.clear();
    this.disputeEvidences.clear();
    this.exceptions.clear();
    this.bankTransactions.clear();
    this.idempotencyKeys.clear();
    this.apiIdempotencyKeys.clear();
    this.persist();
  }
}

export const udmStore = new UniversalDataStore();