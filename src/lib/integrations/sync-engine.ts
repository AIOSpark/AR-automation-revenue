// AIOSpark Data Integration Sync Engine & Job Store (PROMPT 12)
// Enterprise synchronization lifecycle: QUEUED -> RUNNING -> VALIDATING -> PROCESSING -> VERIFYING -> COMPLETED / PARTIALLY_COMPLETED / FAILED
// Features: Tenant-isolated job tracking, exponential backoff retries for transient errors, idempotent deduplication, & detailed per-record validation logs.

import { udmStore } from '../udm/store';
import { integrationsStore, IntegrationRecord } from '../adapters/store';
import { adapterRegistry } from '../adapters/registry';
import { OrgConnectionConfig, DataAdapter } from '../adapters/types';
import { AuditService } from '../audit/service';
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

export type SyncJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'VALIDATING'
  | 'PROCESSING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type FailureCategory = 'TRANSIENT' | 'PERMANENT_VALIDATION' | 'AUTHENTICATION' | 'RATE_LIMIT';

export interface SyncRecordError {
  id: string;
  jobId: string;
  organizationId: string;
  adapterType: string;
  entityType: 'customer' | 'invoice' | 'payment' | 'credit_note' | 'bank_transaction';
  externalId?: string;
  recordIdentifier?: string;
  failureCategory: FailureCategory;
  reason: string;
  suggestedAction: string;
  canRetry: boolean;
  status: 'NEEDS_ATTENTION' | 'RETRY_SCHEDULED' | 'RESOLVED' | 'SKIPPED';
  timestamp: string;
}

export interface SyncJobRecord {
  id: string;
  organizationId: string;
  adapterType: string;
  status: SyncJobStatus;
  triggeredBy: string;
  startTime: string;
  completionTime: string | null;
  recordsDiscovered: number;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsFailed: number;
  retryAttempt: number;
  maxRetries: number;
  lastErrorCategory: FailureCategory | null;
  errorSummary: string | null;
  errors: SyncRecordError[];
}

export interface DataHealthSummary {
  organizationId: string;
  trustStatus: 'HEALTHY' | 'ATTENTION_REQUIRED' | 'STALE' | 'SYNC_FAILED' | 'VALIDATION_ISSUES';
  connectedSystemsCount: number;
  healthyConnectionsCount: number;
  syncingCount: number;
  syncFailuresCount: number;
  lastSuccessfulSyncAt: string | null;
  totalRecordsProcessed: number;
  totalFailedRecords: number;
  unmappedRecordsCount: number;
  duplicateCandidatesCount: number;
  missingRequiredFieldsCount: number;
  freshnessStatus: string;
  aiInsight: {
    summary: string;
    verifiedFailedCount: number;
    topReason: string;
    recommendedNextStep: string;
  };
}

class IntegrationSyncEngine {
  private syncJobs: Map<string, SyncJobRecord> = new Map();
  private recordErrors: Map<string, SyncRecordError> = new Map();

  constructor() {
    const state = readSnapshot<{ jobs: SyncJobRecord[]; errors: SyncRecordError[] }>('integration_sync');
    for (const job of state?.jobs || []) this.syncJobs.set(job.id, job);
    for (const error of state?.errors || []) this.recordErrors.set(error.id, error);
  }

  private persistState(): void {
    writeSnapshot('integration_sync', {
      jobs: Array.from(this.syncJobs.values()),
      errors: Array.from(this.recordErrors.values()),
    });
  }

  private finishJob(job: SyncJobRecord): SyncJobRecord {
    this.persistState();
    return job;
  }

  /**
   * Retrieves active or historical sync jobs for an organization
   */
  public getJobsForOrg(orgId: string): SyncJobRecord[] {
    const list: SyncJobRecord[] = [];
    for (const job of this.syncJobs.values()) {
      if (job.organizationId === orgId) {
        list.push(job);
      }
    }
    return list.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }

  public getJobById(jobId: string, orgId: string): SyncJobRecord | null {
    const job = this.syncJobs.get(jobId);
    if (!job || job.organizationId !== orgId) return null;
    return job;
  }

  public getErrorsForOrg(orgId: string): SyncRecordError[] {
    const list: SyncRecordError[] = [];
    for (const err of this.recordErrors.values()) {
      if (err.organizationId === orgId) {
        list.push(err);
      }
    }
    return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Main Sync Trigger & Orchestrator with Idempotency, Retry Backoff & Validation Engine
   */
  public async executeSync(
    orgId: string,
    adapterType: string,
    triggeredBy = 'system_manual',
    customConfig?: Record<string, unknown>
  ): Promise<SyncJobRecord> {
    udmStore.setTenantContext(orgId);
    const adapter = adapterRegistry.getAdapter(adapterType);

    // Concurrent Sync Guard
    const activeJobs = this.getJobsForOrg(orgId).filter(
      (j) => j.adapterType === adapterType && (j.status === 'QUEUED' || j.status === 'RUNNING' || j.status === 'VALIDATING' || j.status === 'PROCESSING')
    );
    if (activeJobs.length > 0) {
      throw new Error(`Synchronization for '${adapterType}' is already in progress for this organization.`);
    }

    const jobId = `job_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const startTime = new Date().toISOString();

    const jobRecord: SyncJobRecord = {
      id: jobId,
      organizationId: orgId,
      adapterType,
      status: 'QUEUED',
      triggeredBy,
      startTime,
      completionTime: null,
      recordsDiscovered: 0,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      recordsFailed: 0,
      retryAttempt: 0,
      maxRetries: 3,
      lastErrorCategory: null,
      errorSummary: null,
      errors: [],
    };

    this.syncJobs.set(jobId, jobRecord);
    this.persistState();

    // Get Adapter & DB connection record
    const {
      organizationId: _ignoredOrganizationId,
      adapterType: _ignoredAdapterType,
      credentials: _ignoredCredentials,
      credentialsEncrypted: _ignoredCredentialsEncrypted,
      testModeUseFixtures: _ignoredTestMode,
      rawFileBuffer: _ignoredRawFileBuffer,
      ...safeCustomConfig
    } = customConfig || {};
    const integrationRecord = integrationsStore.getIntegrationByOrgAndAdapter(orgId, adapterType);
    const decryptedConfig = integrationRecord
      ? integrationsStore.getDecryptedConfig(integrationRecord)
      : safeCustomConfig;

    // Save integration status as syncing
    integrationsStore.saveIntegration({
      organization_id: orgId,
      adapter_type: adapterType as any,
      rawConfig: { ...decryptedConfig, ...safeCustomConfig },
      status: 'syncing',
    });

    jobRecord.status = 'RUNNING';

    try {
      const config: OrgConnectionConfig = {
        ...decryptedConfig,
        ...safeCustomConfig,
        // Caller-provided connection data must never be able to redirect a
        // sync into another tenant or adapter.
        organizationId: orgId,
        adapterType,
      };

      // Step 1: FETCH
      jobRecord.status = 'VALIDATING';
      let customers: any[] = [];
      let invoices: any[] = [];
      let payments: any[] = [];
      let creditNotes: any[] = [];

      const fetchWithRetry = async () => {
        let lastError: any;
        for (let attempt = 0; attempt <= jobRecord.maxRetries; attempt += 1) {
          try {
            const result = await Promise.all([
              adapter.fetchCustomers(config),
              adapter.fetchInvoices(config),
              adapter.fetchPayments(config),
              adapter.fetchCreditNotes(config),
            ]);
            jobRecord.retryAttempt = attempt;
            return result;
          } catch (error: any) {
            lastError = error;
            const message = String(error?.message || error).toLowerCase();
            const transient = error?.status === 429 || [408, 425, 500, 502, 503, 504].includes(error?.status) || /timeout|network|econnreset|temporarily unavailable|rate limit/.test(message);
            if (!transient || attempt >= jobRecord.maxRetries) throw error;
            jobRecord.retryAttempt = attempt + 1;
            this.persistState();
            await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 500 * 2 ** attempt)));
          }
        }
        throw lastError || new Error('Integration fetch failed');
      };

      try {
        [customers, invoices, payments, creditNotes] = await fetchWithRetry();
      } catch (fetchErr: any) {
        // Classify transient vs permanent error
        const isRateLimit = fetchErr?.status === 429 || String(fetchErr).includes('429') || String(fetchErr).includes('Rate Limit');
        const isTransient = isRateLimit || String(fetchErr).includes('timeout') || String(fetchErr).includes('network') || String(fetchErr).includes('ECONNRESET');

        const failureCat: FailureCategory = isRateLimit
          ? 'RATE_LIMIT'
          : isTransient
          ? 'TRANSIENT'
          : 'AUTHENTICATION';

        jobRecord.status = 'FAILED';
        jobRecord.lastErrorCategory = failureCat;
        jobRecord.errorSummary = fetchErr.message || 'Adapter connection error';
        jobRecord.completionTime = new Date().toISOString();

        integrationsStore.saveIntegration({
          organization_id: orgId,
          adapter_type: adapterType as any,
          rawConfig: decryptedConfig,
          status: 'error',
          last_error: jobRecord.errorSummary || 'Fetch failed',
        });

        // Record error for Error Center
        const errObj: SyncRecordError = {
          id: `err_${Math.random().toString(36).substring(2, 9)}`,
          jobId,
          organizationId: orgId,
          adapterType,
          entityType: 'invoice',
          failureCategory: failureCat,
          reason: jobRecord.errorSummary || 'Connection failed',
          suggestedAction: isTransient ? 'Automatic retry scheduled' : 'Re-authenticate adapter connection credentials',
          canRetry: isTransient,
          status: isTransient ? 'RETRY_SCHEDULED' : 'NEEDS_ATTENTION',
          timestamp: new Date().toISOString(),
        };
        this.recordErrors.set(errObj.id, errObj);
        jobRecord.errors.push(errObj);

        return this.finishJob(jobRecord);
      }

      jobRecord.recordsDiscovered = customers.length + invoices.length + payments.length + creditNotes.length;
      jobRecord.status = 'PROCESSING';

      // Load existing UDM entities for deduplication
      const existingCustomers = udmStore.getCustomers();
      const existingInvoices = udmStore.getInvoices();
      const existingPayments = udmStore.getPayments();
      const existingCreditNotes = udmStore.getCreditNotes();

      const custIdMap = new Map<string, string>(); // sourceId -> udmId
      const invoiceKeys = new Map<string, { id: string; amountMinorUnits: number }>();
      const paymentSourceIds = new Set<string>();
      const creditNoteSourceIds = new Set<string>();

      for (const c of existingCustomers) {
        if (c.source_id) custIdMap.set(c.source_id, c.id);
        custIdMap.set(c.name.toLowerCase().trim(), c.id);
      }
      for (const i of existingInvoices) {
        const invoiceKey = { id: i.id, amountMinorUnits: i.amount_minor_units };
        invoiceKeys.set(`number:${i.number}`, invoiceKey);
        if (i.source_id) invoiceKeys.set(`source:${i.source_id}`, invoiceKey);
      }
      for (const p of existingPayments) {
        if (p.source_id) paymentSourceIds.add(p.source_id);
      }
      for (const c of existingCreditNotes) {
        if (c.source_id) creditNoteSourceIds.add(c.source_id);
      }

      // 1. Process Customers
      for (const c of customers) {
        if (!c.name || !c.name.trim()) {
          this.addRecordError(jobRecord, orgId, adapterType, 'customer', c.sourceId, 'Missing customer name', 'Provide valid customer name in source system', false);
          continue;
        }

        const matchKey = c.sourceId || c.name.toLowerCase().trim();
        const existingId = custIdMap.get(matchKey);

        let customerId = existingId;
        if (existingId) {
          jobRecord.recordsUpdated++;
          jobRecord.recordsProcessed++;
        } else {
          const created = udmStore.insertCustomer({
            organization_id: orgId,
            name: c.name,
            tax_id: c.taxId,
            credit_limit_minor_units: 50000000,
            currency: 'INR',
            payment_terms_days: c.creditTermsDays || 30,
            source_system: adapterType,
            source_id: c.sourceId || `cust_${c.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          });
          customerId = created.id;
          custIdMap.set(c.sourceId || created.source_id, created.id);
          custIdMap.set(c.name.toLowerCase().trim(), created.id);
          jobRecord.recordsCreated++;
          jobRecord.recordsProcessed++;
        }

        // Preserve ERP contacts in UDM so outbound communication can only use
        // verified source-system recipients.
        if (customerId && Array.isArray(c.contacts)) {
          const existingContacts = udmStore.getContacts(customerId);
          const seenEmails = new Set(existingContacts.map((item) => item.email.toLowerCase()));
          for (const contact of c.contacts) {
            const email = String(contact?.email || '').toLowerCase();
            if (!email || seenEmails.has(email)) continue;
            udmStore.insertContact({
              organization_id: orgId,
              customer_id: customerId,
              name: contact.name || 'ERP Contact',
              email: contact.email,
              phone: contact.phone || null,
              is_primary: existingContacts.length === 0,
            });
            seenEmails.add(email);
          }
        }
      }

      // 2. Process Invoices
      for (const inv of invoices) {
        if (!inv.number || !inv.number.trim()) {
          this.addRecordError(jobRecord, orgId, adapterType, 'invoice', inv.sourceId, 'Invoice number missing', 'Provide invoice number in source system', false);
          continue;
        }
        if (!inv.amountMinorUnits || isNaN(inv.amountMinorUnits) || inv.amountMinorUnits <= 0) {
          this.addRecordError(jobRecord, orgId, adapterType, 'invoice', inv.number, `Invalid invoice amount: ${inv.amountMinorUnits}`, 'Ensure invoice amount is positive integer minor units', false);
          continue;
        }
        if (!inv.customerSourceId || !inv.customerSourceId.trim()) {
          this.addRecordError(jobRecord, orgId, adapterType, 'invoice', inv.number, 'Customer reference missing', 'Map the invoice to a source customer before syncing', false);
          continue;
        }

        // Deduplication Check
        const existingInv =
          (inv.sourceId ? invoiceKeys.get(`source:${inv.sourceId}`) : undefined) ||
          invoiceKeys.get(`number:${inv.number}`);

        if (existingInv) {
          // Check financial collision
          if (existingInv.amountMinorUnits !== inv.amountMinorUnits) {
            this.addRecordError(
              jobRecord,
              orgId,
              adapterType,
              'invoice',
              inv.number,
              `Source amount (₹${(inv.amountMinorUnits / 100).toLocaleString()}) conflicts with existing invoice amount (₹${(existingInv.amountMinorUnits / 100).toLocaleString()})`,
              'Review financial discrepancy before overwriting balance',
              false
            );
            continue;
          }
          jobRecord.recordsSkipped++;
          jobRecord.recordsProcessed++;
        } else {
          // Resolve customer ID
          let custId = custIdMap.get(inv.customerSourceId);
          if (!custId) {
            // Try fallback customer search
            const foundCust = existingCustomers.find((c) => c.source_id === inv.customerSourceId);
            if (foundCust) custId = foundCust.id;
          }

          if (!custId) {
            // Never create an anonymous financial counterparty. A source
            // reference is required so invoices remain attributable and safe
            // to reconcile later.
            const createdCust = udmStore.insertCustomer({
              organization_id: orgId,
              name: `Customer (${inv.customerSourceId})`,
              credit_limit_minor_units: 50000000,
              currency: 'INR',
              payment_terms_days: 30,
              source_system: adapterType,
              source_id: inv.customerSourceId || `cust_${Date.now()}`,
            });
            custId = createdCust.id;
            custIdMap.set(inv.customerSourceId, custId);
          }

          const newInv = udmStore.insertInvoice({
            organization_id: orgId,
            customer_id: custId,
            number: inv.number,
            amount_minor_units: inv.amountMinorUnits,
            currency: inv.currency || 'INR',
            tax_amount_minor_units: inv.taxAmountMinorUnits || 0,
            issue_date: inv.issueDate || new Date().toISOString().split('T')[0],
            due_date: inv.dueDate || new Date().toISOString().split('T')[0],
            status: (inv.status === 'Payment Blocked' ? 'blocked' : 'open') as any,
            po_reference: inv.poNumber || null,
            source_system: adapterType,
            source_id: inv.sourceId || `inv_${inv.number}`,
          });

          const invoiceKey = { id: newInv.id, amountMinorUnits: newInv.amount_minor_units };
          invoiceKeys.set(`number:${newInv.number}`, invoiceKey);
          if (newInv.source_id) invoiceKeys.set(`source:${newInv.source_id}`, invoiceKey);
          jobRecord.recordsCreated++;
          jobRecord.recordsProcessed++;
        }
      }

      // 3. Process Payments
      for (const pay of payments) {
        if (!pay.customerSourceId || !pay.customerSourceId.trim()) {
          this.addRecordError(jobRecord, orgId, adapterType, 'payment', pay.sourceId, 'Customer reference missing', 'Map the payment to a source customer before syncing', false);
          continue;
        }
        if (!Number.isInteger(pay.amountMinorUnits) || pay.amountMinorUnits <= 0) {
          this.addRecordError(jobRecord, orgId, adapterType, 'payment', pay.sourceId, `Invalid payment amount: ${pay.amountMinorUnits}`, 'Provide a positive integer minor-unit amount', false);
          continue;
        }
        const existingPay = Boolean(pay.sourceId && paymentSourceIds.has(pay.sourceId));
        if (existingPay) {
          jobRecord.recordsSkipped++;
          jobRecord.recordsProcessed++;
        } else {
          const custId = custIdMap.get(pay.customerSourceId);
          if (!custId) {
            this.addRecordError(jobRecord, orgId, adapterType, 'payment', pay.sourceId, `Customer not found: ${pay.customerSourceId}`, 'Sync the customer record before the payment', false);
            continue;
          }
          const newPayment = udmStore.insertPayment({
            organization_id: orgId,
            customer_id: custId,
            amount_minor_units: pay.amountMinorUnits,
            currency: pay.currency || 'INR',
            date: pay.date || new Date().toISOString().split('T')[0],
            reference: pay.reference || null,
            source_system: adapterType,
            source_id: pay.sourceId || `pay_${Date.now()}`,
          });
          if (newPayment.source_id) paymentSourceIds.add(newPayment.source_id);
          jobRecord.recordsCreated++;
          jobRecord.recordsProcessed++;
        }
      }

      // 4. Process Credit Notes
      for (const cn of creditNotes) {
        if (!cn.customerSourceId || !cn.customerSourceId.trim()) {
          this.addRecordError(jobRecord, orgId, adapterType, 'credit_note', cn.sourceId, 'Customer reference missing', 'Map the credit note to a source customer before syncing', false);
          continue;
        }
        if (!Number.isInteger(cn.amountMinorUnits) || cn.amountMinorUnits <= 0) {
          this.addRecordError(jobRecord, orgId, adapterType, 'credit_note', cn.sourceId, `Invalid credit note amount: ${cn.amountMinorUnits}`, 'Provide a positive integer minor-unit amount', false);
          continue;
        }
        const existingCn = Boolean(cn.sourceId && creditNoteSourceIds.has(cn.sourceId));
        if (existingCn) {
          jobRecord.recordsSkipped++;
          jobRecord.recordsProcessed++;
        } else {
          const custId = custIdMap.get(cn.customerSourceId);
          if (!custId) {
            this.addRecordError(jobRecord, orgId, adapterType, 'credit_note', cn.sourceId, `Customer not found: ${cn.customerSourceId}`, 'Sync the customer record before the credit note', false);
            continue;
          }
          const newCreditNote = udmStore.insertCreditNote({
            organization_id: orgId,
            customer_id: custId,
            amount_minor_units: cn.amountMinorUnits,
            currency: cn.currency || 'INR',
            date: cn.date || new Date().toISOString().split('T')[0],
            reason: cn.reason || 'Source Credit Note',
            source_system: adapterType,
            source_id: cn.sourceId || `cn_${Date.now()}`,
          });
          if (newCreditNote.source_id) creditNoteSourceIds.add(newCreditNote.source_id);
          jobRecord.recordsCreated++;
          jobRecord.recordsProcessed++;
        }
      }

      jobRecord.status = 'VERIFYING';
      jobRecord.completionTime = new Date().toISOString();

      if (jobRecord.recordsFailed > 0 && jobRecord.recordsProcessed > 0) {
        jobRecord.status = 'PARTIALLY_COMPLETED';
      } else if (jobRecord.recordsFailed > 0 && jobRecord.recordsProcessed === 0) {
        jobRecord.status = 'FAILED';
      } else {
        jobRecord.status = 'COMPLETED';
      }

      integrationsStore.saveIntegration({
        organization_id: orgId,
        adapter_type: adapterType as any,
        rawConfig: decryptedConfig,
        status: jobRecord.status === 'FAILED' ? 'error' : 'connected',
        last_error: jobRecord.recordsFailed > 0 ? `${jobRecord.recordsFailed} records failed validation during sync.` : null,
      });

      AuditService.record({
        organization_id: orgId,
        actor_user_id: null,
        actor_type: 'system',
        action_type: 'integration.synced',
        subject_type: 'integration',
        subject_id: adapterType,
        before_state: null,
        after_state: {
          jobId,
          status: jobRecord.status,
          created: jobRecord.recordsCreated,
          updated: jobRecord.recordsUpdated,
          failed: jobRecord.recordsFailed,
        },
        result: jobRecord.status === 'FAILED' ? 'failure' : 'success',
      });

      return this.finishJob(jobRecord);
    } catch (err: any) {
      jobRecord.status = 'FAILED';
      jobRecord.completionTime = new Date().toISOString();
      jobRecord.errorSummary = err.message || 'Sync execution internal error';

      integrationsStore.saveIntegration({
        organization_id: orgId,
        adapter_type: adapterType as any,
        rawConfig: decryptedConfig,
        status: 'error',
        last_error: jobRecord.errorSummary,
      });

      return this.finishJob(jobRecord);
    }
  }

  private addRecordError(
    job: SyncJobRecord,
    orgId: string,
    adapterType: string,
    entityType: SyncRecordError['entityType'],
    identifier: string | undefined,
    reason: string,
    suggestedAction: string,
    canRetry: boolean
  ) {
    job.recordsFailed++;
    const errObj: SyncRecordError = {
      id: `err_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`,
      jobId: job.id,
      organizationId: orgId,
      adapterType,
      entityType,
      externalId: identifier,
      recordIdentifier: identifier,
      failureCategory: 'PERMANENT_VALIDATION',
      reason,
      suggestedAction,
      canRetry,
      status: 'NEEDS_ATTENTION',
      timestamp: new Date().toISOString(),
    };

    job.errors.push(errObj);
    this.recordErrors.set(errObj.id, errObj);
    this.persistState();
  }

  /**
   * Computes holistic Data Health & Trust Status for an Organization
   */
  public getOrgDataHealth(orgId: string): DataHealthSummary {
    udmStore.setTenantContext(orgId);
    const integrations = integrationsStore.getOrgIntegrations(orgId);
    const jobs = this.getJobsForOrg(orgId);
    const errors = this.getErrorsForOrg(orgId);

    const connected = integrations.filter((i) => i.status === 'connected');
    const syncing = integrations.filter((i) => i.status === 'syncing');
    const failures = integrations.filter((i) => i.status === 'error');

    const lastSuccessfulJob = jobs.find((j) => j.status === 'COMPLETED' || j.status === 'PARTIALLY_COMPLETED');
    const lastSuccessfulSyncAt = lastSuccessfulJob ? lastSuccessfulJob.completionTime : null;

    let trustStatus: DataHealthSummary['trustStatus'] = 'HEALTHY';
    if (failures.length > 0 || jobs[0]?.status === 'FAILED') {
      trustStatus = 'SYNC_FAILED';
    } else if (errors.filter((e) => e.status === 'NEEDS_ATTENTION').length > 5) {
      trustStatus = 'VALIDATION_ISSUES';
    } else if (errors.filter((e) => e.status === 'NEEDS_ATTENTION').length > 0) {
      trustStatus = 'ATTENTION_REQUIRED';
    } else if (!lastSuccessfulSyncAt) {
      trustStatus = 'STALE';
    }

    const totalProcessed = jobs.reduce((acc, j) => acc + j.recordsProcessed, 0);
    const totalFailed = errors.filter((e) => e.status === 'NEEDS_ATTENTION').length;

    // AI Insight summary generator
    const topReason = errors.length > 0 ? errors[0].reason : 'None';
    const aiInsight = {
      summary: errors.length > 0
        ? `Most failed integration records (${errors.length}) are caused by ${errors[0].reason.toLowerCase()}.`
        : 'All integrated financial data streams are synchronized and fully mapped to UDM schemas.',
      verifiedFailedCount: errors.length,
      topReason,
      recommendedNextStep: errors.length > 0
        ? 'Review open records in the Integration Error Center and correct missing field references.'
        : 'Maintain automated sync schedules to keep financial metrics up to date.',
    };

    return {
      organizationId: orgId,
      trustStatus,
      connectedSystemsCount: integrations.length,
      healthyConnectionsCount: connected.length,
      syncingCount: syncing.length,
      syncFailuresCount: failures.length,
      lastSuccessfulSyncAt,
      totalRecordsProcessed: totalProcessed,
      totalFailedRecords: totalFailed,
      unmappedRecordsCount: errors.filter((e) => e.reason.includes('mapping')).length,
      duplicateCandidatesCount: 0,
      missingRequiredFieldsCount: errors.filter((e) => e.reason.includes('Missing')).length,
      freshnessStatus: lastSuccessfulSyncAt ? `Last synced ${new Date(lastSuccessfulSyncAt).toLocaleTimeString()}` : 'Data may be outdated',
      aiInsight,
    };
  }

  public clearAll(): void {
    this.syncJobs.clear();
    this.recordErrors.clear();
    deleteSnapshot('integration_sync');
  }
}

export const integrationSyncEngine = new IntegrationSyncEngine();
