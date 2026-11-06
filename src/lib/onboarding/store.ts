// AIOSpark Onboarding Data Store & Ingestion Pipeline

import * as XLSX from "xlsx";
import { authStore, OrganizationRecord } from "../auth/store";
import { tenantStore } from "../tenant/store";
import { TARGET_FIELDS } from './fields';
export { TARGET_FIELDS } from './fields';
export type { TargetFieldDef } from './fields';
import { deleteSnapshot, readSnapshot, writeSnapshot } from '../db/durable-repository';

export interface CompanySetupInput {
  organization_id: string;
  industry: string;
  annual_revenue_range: string;
  currency: string;
  fy_start_month: string;
  default_payment_terms: string;
  timezone: string;
  country: string;
}

export interface ImportRowError {
  rowNumber: number;
  rawRow: Record<string, unknown>;
  reason: string;
}

export interface ImportBatchResult {
  batchId: string;
  organizationId: string;
  totalRows: number;
  successCount: number;
  skippedCount: number;
  errors: ImportRowError[];
  importedInvoices: any[];
}

class OnboardingStore {
  // Saved Column Mappings per Organization ID
  private savedMappings: Map<string, Record<string, string>> = new Map();
  private importBatches: Map<string, ImportBatchResult> = new Map();

  constructor() {
    const state = readSnapshot<{ savedMappings: Array<[string, Record<string, string>]>; importBatches: ImportBatchResult[] }>('onboarding');
    this.savedMappings = new Map(state?.savedMappings || []);
    this.importBatches = new Map((state?.importBatches || []).map((batch) => [batch.batchId, batch]));
  }

  private persist(): void {
    writeSnapshot('onboarding', {
      savedMappings: Array.from(this.savedMappings.entries()),
      importBatches: Array.from(this.importBatches.values()),
    });
  }

  /**
   * Extends organization record with onboarding financial parameters
   */
  public saveCompanySetup(input: CompanySetupInput): OrganizationRecord | null {
    const org = (authStore as any).organizations.get(input.organization_id) as OrganizationRecord;
    if (org) {
      Object.assign(org, {
        industry: input.industry,
        annual_revenue_range: input.annual_revenue_range,
        currency: input.currency,
        fy_start_month: input.fy_start_month,
        default_payment_terms: input.default_payment_terms,
        timezone: input.timezone,
        country: input.country,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });
      authStore.persistState();
      return org;
    }
    return null;
  }

  /**
   * Saves confirmed column mapping per organization so future imports require no re-mapping
   */
  public saveOrgColumnMapping(orgId: string, mapping: Record<string, string>): void {
    this.savedMappings.set(orgId, mapping);
    this.persist();
  }

  public getOrgColumnMapping(orgId: string): Record<string, string> | null {
    return this.savedMappings.get(orgId) || null;
  }

  /**
   * Auto-suggests target field mappings for uploaded column headers
   */
  /**
   * Auto-suggests target field mappings for uploaded column headers
   */
  public autoSuggestMapping(uploadedHeaders: string[]): Record<string, string> {
    const mapping: Record<string, string> = {};
    const usedHeaders = new Set<string>();

    // Pass 1: Exact matches or exact alias matches
    for (const field of TARGET_FIELDS) {
      for (const header of uploadedHeaders) {
        if (usedHeaders.has(header)) continue;
        const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "_");
        if (field.aliases.some((alias) => cleanHeader === alias || cleanHeader === field.key)) {
          mapping[field.key] = header;
          usedHeaders.add(header);
          break;
        }
      }
    }

    // Pass 2: Fuzzy / prefix containment matches for remaining unmapped fields
    for (const field of TARGET_FIELDS) {
      if (mapping[field.key]) continue;
      for (const header of uploadedHeaders) {
        if (usedHeaders.has(header)) continue;
        const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, "_");
        if (field.aliases.some((alias) => cleanHeader.startsWith(alias) || cleanHeader.endsWith(alias))) {
          mapping[field.key] = header;
          usedHeaders.add(header);
          break;
        }
      }
    }

    return mapping;
  }

  /**
   * Parses uploaded CSV or Excel Buffer (.csv, .xlsx, .xls) into header list & raw data rows
   */
  public parseFileBuffer(buffer: Buffer): { headers: string[]; rows: Record<string, unknown>[] } {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
    if (rawRows.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = Object.keys(rawRows[0]);
    return { headers, rows: rawRows };
  }

  /**
   * Fault-tolerant Ingestion Pipeline
   * Validates rows, imports valid records into tenant ledgers, and logs per-row errors.
   */
  public processFileImport(
    orgId: string,
    rows: Record<string, unknown>[],
    columnMapping: Record<string, string>
  ): ImportBatchResult {
    // Save confirmed column mapping for future imports
    this.saveOrgColumnMapping(orgId, columnMapping);

    const batchId = `batch_${Math.random().toString(36).substring(2, 11)}_${Date.now()}`;
    const errors: ImportRowError[] = [];
    const importedInvoices: any[] = [];

    // Ensure session context is set for tenant storage
    tenantStore.setSessionTenantContext(orgId);

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // Excel row indexing (1-based header = row 1)

      const customerName = String(row[columnMapping.customer_name] || "").trim();
      const invoiceNumber = String(row[columnMapping.invoice_number] || "").trim();
      const rawAmount = row[columnMapping.amount];
      const issueDateStr = String(row[columnMapping.issue_date] || "").trim();

      // Required Field Validations
      if (!customerName) {
        errors.push({ rowNumber, rawRow: row, reason: "Missing required field: Customer Name" });
        return;
      }
      if (!invoiceNumber) {
        errors.push({ rowNumber, rawRow: row, reason: "Missing required field: Invoice Number" });
        return;
      }

      const amount = Number(String(rawAmount).replace(/[^0-9.-]+/g, ""));
      if (isNaN(amount) || amount <= 0) {
        errors.push({ rowNumber, rawRow: row, reason: `Invalid numeric amount: '${rawAmount}'` });
        return;
      }

      if (!issueDateStr) {
        errors.push({ rowNumber, rawRow: row, reason: "Missing required field: Issue Date" });
        return;
      }

      // Valid Row! Insert into tenant-scoped tables
      const newCustomer = tenantStore.insertTenantRecord("customers", {
        organization_id: orgId,
        name: customerName,
      });

      const newInvoice = tenantStore.insertTenantRecord("invoices", {
        organization_id: orgId,
        customer_id: newCustomer.id,
        invoice_number: invoiceNumber,
        amount,
        status: String(row[columnMapping.status] || "Payment Blocked").trim(),
        po_number: String(row[columnMapping.po_number] || "").trim(),
        issue_date: issueDateStr,
        source_system: "csv",
        source_id: `hash_${orgId}_${invoiceNumber}_${index}`,
      });

      importedInvoices.push(newInvoice);
    });

    const result: ImportBatchResult = {
      batchId,
      organizationId: orgId,
      totalRows: rows.length,
      successCount: importedInvoices.length,
      skippedCount: errors.length,
      errors,
      importedInvoices,
    };

    this.importBatches.set(batchId, result);
    this.persist();
    return result;
  }

  public getBatchResult(batchId: string): ImportBatchResult | null {
    return this.importBatches.get(batchId) || null;
  }

  public clearAll(): void {
    this.savedMappings.clear();
    this.importBatches.clear();
    deleteSnapshot('onboarding');
  }
}

export const onboardingStore = new OnboardingStore();
