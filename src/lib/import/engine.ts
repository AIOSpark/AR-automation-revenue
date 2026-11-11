// AIOSpark Data Import Pipeline Engine (Layer 7)

import { udmStore } from '../udm/store';
import { Customer, Invoice } from '../udm/types';
import {
  backfillOperationalFromSnapshots,
  clearImportState,
  insertImportBatch,
  insertImportDuplicate,
  insertImportError,
  readImportState,
  updateImportBatch,
} from '../db/operational-repository';
import { withWriteTransaction } from '../db/durable-repository';

export interface ImportBatchRecord {
  id: string;
  organization_id: string;
  source_system: string;
  status: 'processing' | 'completed' | 'failed';
  raw_payload: any[];
  date_format_convention: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  total_rows: number;
  success_count: number;
  skipped_count: number;
  started_at: string;
  completed_at?: string | null;
}

export interface ImportErrorRecord {
  id: string;
  organization_id: string;
  import_batch_id: string;
  raw_row_reference: Record<string, unknown>;
  reason: string;
  field?: string;
  created_at: string;
}

export interface PossibleDuplicateRecord {
  id: string;
  organization_id: string;
  import_batch_id: string;
  incoming_record_json: Record<string, unknown>;
  existing_record_id: string;
  confidence: number;
  status: 'pending' | 'merged' | 'rejected';
  created_at: string;
}

export interface ImportPipelineConfig {
  organizationId: string;
  sourceSystem: string;
  dateFormatConvention?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  columnMapping?: Record<string, string>; // Maps target field -> source column name
  currency?: string;
}

class ImportPipelineEngine {
  private batches: Map<string, ImportBatchRecord> = new Map();
  private errors: Map<string, ImportErrorRecord> = new Map();
  private duplicates: Map<string, PossibleDuplicateRecord> = new Map();

  constructor() {
    backfillOperationalFromSnapshots();
    this.reloadFromDurableState();
  }

  private reloadFromDurableState(): void {
    backfillOperationalFromSnapshots();
    const state = readImportState();
    this.batches = new Map((state.batches as ImportBatchRecord[]).map((b) => [b.id, b]));
    this.errors = new Map((state.errors as ImportErrorRecord[]).map((e) => [e.id, e]));
    this.duplicates = new Map((state.duplicates as PossibleDuplicateRecord[]).map((d) => [d.id, d]));
  }

  // STAGE 1: UPLOAD (Durable Raw Input Persistence)
  public createBatch(config: ImportPipelineConfig, rawRows: any[]): ImportBatchRecord {
    const id = `batch_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const now = new Date().toISOString();
    const batch: ImportBatchRecord = {
      id,
      organization_id: config.organizationId,
      source_system: config.sourceSystem,
      status: 'processing',
      raw_payload: rawRows,
      date_format_convention: config.dateFormatConvention || 'DD/MM/YYYY',
      total_rows: rawRows.length,
      success_count: 0,
      skipped_count: 0,
      started_at: now,
    };
    withWriteTransaction(() => {
      insertImportBatch(batch);
      this.batches.set(id, batch);
    });
    return batch;
  }

  // STAGE 2: VALIDATE (Per-record schema validation)
  public validateRow(
    row: Record<string, any>,
    mapping: Record<string, string>
  ): { valid: boolean; reason?: string; field?: string } {
    const getVal = (targetField: string) => {
      const mappedCol = mapping[targetField] || targetField;
      return row[mappedCol] ?? row[targetField];
    };

    const customerRef = getVal('customer_name') || getVal('customer_id');
    if (!customerRef || String(customerRef).trim() === '') {
      return { valid: false, reason: 'Missing customer name or reference', field: 'customer_name' };
    }

    const rawAmount = getVal('amount');
    if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === '') {
      return { valid: false, reason: 'Amount is required and cannot be empty', field: 'amount' };
    }

    const cleanAmtStr = String(rawAmount).replace(/[^0-9.-]/g, '');
    const numAmount = parseFloat(cleanAmtStr);
    if (isNaN(numAmount) || numAmount < 0) {
      return { valid: false, reason: 'Amount is not a valid non-negative number', field: 'amount' };
    }

    const dueDate = getVal('due_date');
    if (!dueDate || String(dueDate).trim() === '') {
      return { valid: false, reason: 'Missing due date', field: 'due_date' };
    }

    return { valid: true };
  }

  // STAGE 3: NORMALIZE (Currency & Date Resolution)
  public parseDate(rawDateStr: string, format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'): string | null {
    if (!rawDateStr) return null;
    const str = String(rawDateStr).trim();
    if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str;

    const parts = str.split(/[/.-]/);
    if (parts.length !== 3) return null;

    let day = parts[0], month = parts[1], year = parts[2];
    if (format === 'MM/DD/YYYY') {
      month = parts[0];
      day = parts[1];
    }
    if (year.length === 2) year = `20${year}`;

    const pad = (n: string) => n.padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  // STAGE 4 & 6: DEDUPLICATE & STORE
  public processBatch(batchId: string, config: ImportPipelineConfig): {
    summary: string;
    successCount: number;
    skippedCount: number;
  } {
    const batch = this.batches.get(batchId);
    if (!batch) throw new Error(`Batch not found: ${batchId}`);

    udmStore.setTenantContext(config.organizationId);
    const mapping = config.columnMapping || {
      customer_name: 'customer_name',
      invoice_number: 'invoice_number',
      amount: 'amount',
      due_date: 'due_date',
      issue_date: 'issue_date',
    };

    let successCount = 0;
    let skippedCount = 0;

    for (const rawRow of batch.raw_payload) {
      const validation = this.validateRow(rawRow, mapping);
      if (!validation.valid) {
        skippedCount++;
        const errId = `err_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
        const errorRecord: ImportErrorRecord = {
          id: errId,
          organization_id: config.organizationId,
          import_batch_id: batchId,
          raw_row_reference: rawRow,
          reason: validation.reason!,
          field: validation.field,
          created_at: new Date().toISOString(),
        };
        insertImportError(errorRecord);
        this.errors.set(errId, errorRecord);
        continue;
      }

      const getVal = (targetField: string) => {
        const mappedCol = mapping[targetField] || targetField;
        return rawRow[mappedCol] ?? rawRow[targetField];
      };

      const custName = String(getVal('customer_name')).trim();
      const rawAmt = parseFloat(String(getVal('amount')).replace(/[^0-9.-]/g, ''));
      const amountMinorUnits = Math.round(rawAmt * 100);
      const invNumber = String(getVal('invoice_number') || `INV-${Date.now()}`).trim();
      const parsedDueDate = this.parseDate(String(getVal('due_date')), batch.date_format_convention);

      if (!parsedDueDate) {
        skippedCount++;
        const errId = `err_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
        const errorRecord: ImportErrorRecord = {
          id: errId,
          organization_id: config.organizationId,
          import_batch_id: batchId,
          raw_row_reference: rawRow,
          reason: `Unparseable date '${getVal('due_date')}' according to ${batch.date_format_convention} format`,
          field: 'due_date',
          created_at: new Date().toISOString(),
        };
        insertImportError(errorRecord);
        this.errors.set(errId, errorRecord);
        continue;
      }

      // Customer Resolution & Deduplication
      const existingCustomers = udmStore.getCustomers();
      let customer = existingCustomers.find(
        (c) => c.name.toLowerCase() === custName.toLowerCase()
      );

      if (!customer) {
        customer = udmStore.insertCustomer({
          organization_id: config.organizationId,
          source_system: config.sourceSystem,
          source_id: `CUST_${custName.toUpperCase().replace(/\s+/g, '_')}`,
          name: custName,
          credit_limit_minor_units: 0,
          currency: 'INR',
          payment_terms_days: 30,
        });
      }

      // Invoice Exact/Fuzzy Deduplication Pass
      const existingInvoices = udmStore.getInvoices();
      const exactMatch = existingInvoices.find(
        (i) => i.source_system === config.sourceSystem && (i.source_id === invNumber || i.number === invNumber)
      );

      if (exactMatch) {
        // Upsert update existing invoice
        exactMatch.amount_minor_units = amountMinorUnits;
        exactMatch.due_date = parsedDueDate;
        exactMatch.updated_at = new Date().toISOString();
        successCount++;
        continue;
      }

      // Fuzzy Match Check (similarly-spelled invoice or customer name with exact amount)
      const fuzzyMatch = existingInvoices.find(
        (i) => i.customer_id === customer!.id && i.amount_minor_units === amountMinorUnits
      );

      if (fuzzyMatch && fuzzyMatch.number !== invNumber) {
        const dupId = `dup_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
        const duplicate: PossibleDuplicateRecord = {
          id: dupId,
          organization_id: config.organizationId,
          import_batch_id: batchId,
          incoming_record_json: rawRow,
          existing_record_id: fuzzyMatch.id,
          confidence: 0.85, // Review threshold match
          status: 'pending',
          created_at: new Date().toISOString(),
        };
        insertImportDuplicate(duplicate);
        this.duplicates.set(dupId, duplicate);
      }

      // Store New Invoice Record into UDM
      udmStore.insertInvoice({
        organization_id: config.organizationId,
        source_system: config.sourceSystem,
        source_id: invNumber,
        customer_id: customer.id,
        number: invNumber,
        amount_minor_units: amountMinorUnits,
        currency: 'INR',
        tax_amount_minor_units: Math.round(amountMinorUnits * 0.18),
        issue_date: new Date().toISOString().split('T')[0],
        due_date: parsedDueDate,
        status: 'open',
      });

      successCount++;
    }

    // STAGE 8: READY FOR AI
    batch.status = 'completed';
    batch.success_count = successCount;
    batch.skipped_count = skippedCount;
    batch.completed_at = new Date().toISOString();

    updateImportBatch(batch);

    const summaryStr = `${successCount.toLocaleString()} invoices imported successfully, ${skippedCount} skipped — view details.`;

    return {
      summary: summaryStr,
      successCount,
      skippedCount,
    };
  }

  public getBatchErrors(batchId: string): ImportErrorRecord[] {
    this.reloadFromDurableState();
    return Array.from(this.errors.values()).filter((e) => e.import_batch_id === batchId);
  }

  public getDuplicates(orgId: string): PossibleDuplicateRecord[] {
    this.reloadFromDurableState();
    return Array.from(this.duplicates.values()).filter((d) => d.organization_id === orgId && d.status === 'pending');
  }

  public clearAll(): void {
    withWriteTransaction(() => {
      clearImportState();
      this.batches.clear();
      this.errors.clear();
      this.duplicates.clear();
    });
  }
}

export const importEngine = new ImportPipelineEngine();
