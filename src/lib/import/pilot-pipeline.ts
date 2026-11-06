// AIOSpark Real CSV/Excel O2C Pilot Data Pipeline Engine (Step 09)
// Input adapter into existing Universal Data Model (UDM) without altering core financial architecture.

import * as XLSX from 'xlsx';
import { udmStore } from '../udm/store';
import { promiseStore } from '../promises/store';
import { Customer, Invoice, Payment, ExceptionRecord } from '../udm/types';
import { AuditService } from '../audit/service';

// --- PILOT DATA PIPELINE TYPINGS ---

export type DatasetType =
  | 'CUSTOMERS'
  | 'INVOICES'
  | 'PAYMENTS'
  | 'PURCHASE_ORDERS'
  | 'EXCEPTIONS'
  | 'PAYMENT_PROMISES'
  | 'UNKNOWN';

export interface ColumnMappingItem {
  sourceColumn: string;
  targetField: string; // Key in schema or 'IGNORE'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'MANUAL';
  isRequired: boolean;
  status: 'MAPPED' | 'UNMAPPED' | 'MISSING_REQUIRED';
}

export interface SheetPreviewInfo {
  sheetName: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  sampleRows: Record<string, any>[];
  detectedDataset: DatasetType;
  mappings: ColumnMappingItem[];
}

export interface FileValidationResult {
  isValid: boolean;
  fileName: string;
  fileSize: number;
  fileType: 'csv' | 'xlsx' | 'xls';
  sheetNames: string[];
  sheets: SheetPreviewInfo[];
  errors: string[];
  warnings: string[];
}

export interface PilotImportRecordError {
  rowNumber: number;
  sheetName: string;
  field?: string;
  reason: string;
  rawRow: Record<string, any>;
}

export interface PilotImportDuplicate {
  rowNumber: number;
  sheetName: string;
  entityType: 'customer' | 'invoice' | 'payment';
  identifier: string;
  existingId: string;
  reason: string;
}

export interface PilotImportPreviewResult {
  batchId: string;
  totalRowsDetected: number;
  validRowsCount: number;
  duplicateCount: number;
  errorCount: number;
  warningCount: number;
  breakdownByDataset: Record<DatasetType, number>;
  sampleValid: Record<string, any>[];
  errors: PilotImportRecordError[];
  duplicates: PilotImportDuplicate[];
  missingRequiredFields: string[];
}

export interface DataQualityReport {
  completenessPercentage: number;
  relationshipCoverage: {
    customerToInvoice: number;
    invoiceToPayment: number;
    poToInvoice: number;
    invoiceToException: number;
    invoiceToPromise: number;
  };
  orphanRecords: {
    invoicesWithoutCustomer: number;
    paymentsWithoutInvoice: number;
    exceptionsWithoutInvoice: number;
  };
  dataHealth: 'HEALTHY' | 'ATTENTION_REQUIRED' | 'DEGRADED';
  intelligenceLimitations: string[];
  firstInsight?: {
    headline: string;
    exposureMinorUnits: number;
    category: string;
    description: string;
  } | null;
}

export interface PilotImportExecutionResult {
  batchId: string;
  organizationId: string;
  status: 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
  importedAt: string;
  importedCounts: {
    customers: number;
    invoices: number;
    payments: number;
    exceptions: number;
    promises: number;
  };
  failedCount: number;
  duplicateCount: number;
  errors: PilotImportRecordError[];
  dataQualityReport: DataQualityReport;
}

// Target schema field definitions per dataset type
export const DATASET_FIELD_DEFS: Record<DatasetType, Array<{ key: string; label: string; required: boolean; aliases: string[] }>> = {
  CUSTOMERS: [
    { key: 'customer_id', label: 'Customer Identifier', required: true, aliases: ['customer_id', 'cust_id', 'customer_code', 'cust_code', 'client_id', 'party_id'] },
    { key: 'customer_name', label: 'Customer Name', required: true, aliases: ['customer_name', 'customer', 'client_name', 'party_name', 'buyer_name', 'name'] },
    { key: 'credit_limit', label: 'Credit Limit', required: false, aliases: ['credit_limit', 'limit', 'credit_max'] },
    { key: 'payment_terms', label: 'Payment Terms (Days)', required: false, aliases: ['payment_terms', 'terms', 'terms_days', 'credit_period'] },
    { key: 'currency', label: 'Currency', required: false, aliases: ['currency', 'curr'] },
  ],
  INVOICES: [
    { key: 'invoice_id', label: 'Invoice Identifier / Number', required: true, aliases: ['invoice_id', 'invoice_number', 'invoice_no', 'inv_no', 'bill_no', 'invoice'] },
    { key: 'customer_id', label: 'Customer Identifier', required: true, aliases: ['customer_id', 'customer_code', 'cust_id', 'client_id'] },
    { key: 'customer_name', label: 'Customer Name', required: false, aliases: ['customer_name', 'customer', 'client_name'] },
    { key: 'invoice_date', label: 'Invoice Issue Date', required: true, aliases: ['invoice_date', 'issue_date', 'bill_date', 'date'] },
    { key: 'due_date', label: 'Payment Due Date', required: true, aliases: ['due_date', 'payment_due', 'expiry_date'] },
    { key: 'amount', label: 'Invoice Total Amount', required: true, aliases: ['amount', 'invoice_amount', 'total_amount', 'billed_amount', 'total', 'val'] },
    { key: 'outstanding_amount', label: 'Outstanding Amount', required: false, aliases: ['outstanding_amount', 'outstanding', 'balance', 'due_amount', 'pending_amount'] },
    { key: 'currency', label: 'Currency', required: false, aliases: ['currency', 'curr'] },
    { key: 'po_reference', label: 'PO / Order Reference', required: false, aliases: ['po_reference', 'po_number', 'po_no', 'purchase_order', 'order_no'] },
    { key: 'status', label: 'Status', required: false, aliases: ['status', 'state', 'invoice_status'] },
  ],
  PAYMENTS: [
    { key: 'payment_id', label: 'Payment Identifier / Ref', required: true, aliases: ['payment_id', 'payment_ref', 'ref_no', 'transaction_id', 'receipt_no', 'bank_ref'] },
    { key: 'customer_id', label: 'Customer Identifier', required: false, aliases: ['customer_id', 'cust_id', 'customer_code'] },
    { key: 'invoice_id', label: 'Linked Invoice Number', required: false, aliases: ['invoice_id', 'invoice_number', 'invoice_no', 'bill_no'] },
    { key: 'payment_date', label: 'Payment Date', required: true, aliases: ['payment_date', 'date', 'received_date', 'value_date'] },
    { key: 'amount', label: 'Payment Amount', required: true, aliases: ['amount', 'payment_amount', 'received_amount', 'paid_amount'] },
    { key: 'currency', label: 'Currency', required: false, aliases: ['currency', 'curr'] },
  ],
  PURCHASE_ORDERS: [
    { key: 'po_number', label: 'PO Identifier', required: true, aliases: ['po_number', 'po_id', 'po_no', 'purchase_order'] },
    { key: 'customer_id', label: 'Customer Identifier', required: true, aliases: ['customer_id', 'cust_id'] },
    { key: 'po_amount', label: 'PO Total Value', required: false, aliases: ['po_amount', 'amount', 'total_value'] },
  ],
  EXCEPTIONS: [
    { key: 'invoice_id', label: 'Invoice Identifier', required: true, aliases: ['invoice_id', 'invoice_number', 'invoice_no'] },
    { key: 'exception_type', label: 'Exception Category / Type', required: true, aliases: ['exception_type', 'type', 'blocker_type', 'dispute_reason', 'category'] },
    { key: 'severity', label: 'Severity Level', required: false, aliases: ['severity', 'priority', 'level'] },
    { key: 'description', label: 'Evidence / Notes', required: false, aliases: ['description', 'notes', 'evidence', 'remarks'] },
  ],
  PAYMENT_PROMISES: [
    { key: 'invoice_id', label: 'Invoice Identifier', required: true, aliases: ['invoice_id', 'invoice_number', 'invoice_no'] },
    { key: 'customer_id', label: 'Customer Identifier', required: false, aliases: ['customer_id', 'cust_id'] },
    { key: 'promised_date', label: 'Promised Payment Date', required: true, aliases: ['promised_date', 'promise_date', 'expected_date', 'commit_date'] },
    { key: 'promised_amount', label: 'Promised Amount', required: false, aliases: ['promised_amount', 'amount'] },
  ],
  UNKNOWN: [],
};

// --- DATASET DETECTION HELPERS ---
function detectDatasetType(headers: string[], sheetName?: string): DatasetType {
  if (sheetName) {
    const cleanSheet = sheetName.trim().toUpperCase().replace(/\.[^/.]+$/, "");
    if (cleanSheet.includes('CUSTOMER')) return 'CUSTOMERS';
    if (cleanSheet.includes('INVOICE')) return 'INVOICES';
    if (cleanSheet.includes('PAYMENT') && !cleanSheet.includes('PROMISE')) return 'PAYMENTS';
    if (cleanSheet.includes('PURCHASE_ORDER') || cleanSheet.includes('ORDER')) return 'PURCHASE_ORDERS';
    if (cleanSheet.includes('EXCEPTION') || cleanSheet.includes('DISPUTE')) return 'EXCEPTIONS';
    if (cleanSheet.includes('PROMISE')) return 'PAYMENT_PROMISES';
  }

  const lowerHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '_'));
  
  const hasInv = lowerHeaders.some(h => h.includes('inv') || h.includes('bill'));
  const hasDue = lowerHeaders.some(h => h.includes('due') || h.includes('expiry'));
  const hasPay = lowerHeaders.some(h => (h.includes('pay') && !h.includes('payment_terms')) || h.includes('receipt') || h.includes('tran'));
  const hasCust = lowerHeaders.some(h => h.includes('cust') || h.includes('client') || h.includes('party'));
  const hasPo = lowerHeaders.some(h => h.includes('po_') || h.includes('purchase_order'));
  const hasExc = lowerHeaders.some(h => h.includes('exception') || h.includes('blocker') || h.includes('dispute'));
  const hasProm = lowerHeaders.some(h => h.includes('promise') || h.includes('commit'));

  if (hasProm) return 'PAYMENT_PROMISES';
  if (hasExc) return 'EXCEPTIONS';
  if (hasPo && !hasInv) return 'PURCHASE_ORDERS';
  if (hasPay && !hasDue && !hasInv) return 'PAYMENTS';
  if (hasInv || hasDue) return 'INVOICES';
  if (hasCust && !hasInv && !hasPay) return 'CUSTOMERS';

  return 'UNKNOWN';
}

function autoSuggestMappings(headers: string[], datasetType: DatasetType): ColumnMappingItem[] {
  const defs = DATASET_FIELD_DEFS[datasetType] || [];
  return headers.map(header => {
    const cleanHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let matchedField = 'IGNORE';
    let confidence: ColumnMappingItem['confidence'] = 'LOW';
    let isReq = false;

    // 1. Try exact match first
    for (const def of defs) {
      if (def.aliases.some(alias => cleanHeader === alias)) {
        matchedField = def.key;
        confidence = 'HIGH';
        isReq = def.required;
        break;
      }
    }

    // 2. Try prefix/contains match if no exact match found
    if (matchedField === 'IGNORE') {
      for (const def of defs) {
        if (def.aliases.some(alias => cleanHeader.includes(alias))) {
          matchedField = def.key;
          confidence = 'MEDIUM';
          isReq = def.required;
          break;
        }
      }
    }

    return {
      sourceColumn: header,
      targetField: matchedField,
      confidence: matchedField !== 'IGNORE' ? confidence : 'LOW',
      isRequired: isReq,
      status: matchedField !== 'IGNORE' ? 'MAPPED' : 'UNMAPPED',
    };
  });
}

// Sanitizes CSV string cells to prevent formula injection when opening in Excel
export function sanitizeSpreadsheetCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Neutralize formula trigger characters (=, +, -, @)
  if (/^[=\+\-@\t\r]/.test(str.trim())) {
    return `'${str}`;
  }
  return str;
}

// Parse monetary values cleanly without crashing on currency symbols (e.g. ₹18.4L, $1,500.00)
export function parseFinancialAmount(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;

  const str = String(val).trim();
  if (!str) return null;

  // Handle Lakh / Cr Indian notation
  let multiplier = 1;
  let cleanStr = str.replace(/[₹$€£,]/g, '');

  if (/lakh/i.test(cleanStr) || /l$/i.test(cleanStr)) {
    multiplier = 100000;
    cleanStr = cleanStr.replace(/lakh/i, '').replace(/l$/i, '');
  } else if (/cr/i.test(cleanStr) || /crore/i.test(cleanStr)) {
    multiplier = 10000000;
    cleanStr = cleanStr.replace(/crore/i, '').replace(/cr/i, '');
  } else if (/k$/i.test(cleanStr)) {
    multiplier = 1000;
    cleanStr = cleanStr.replace(/k$/i, '');
  } else if (/m$/i.test(cleanStr)) {
    multiplier = 1000000;
    cleanStr = cleanStr.replace(/m$/i, '');
  }

  const parsed = parseFloat(cleanStr.trim());
  if (isNaN(parsed)) return null;

  return Math.round((parsed * multiplier) * 100) / 100;
}

// Flexible Date Normalization safely supporting DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD
export function normalizeDate(val: any, preferredFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' = 'YYYY-MM-DD'): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val.toISOString().split('T')[0];
  }

  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const parts = str.split(/[/.-]/);
  if (parts.length !== 3) return null;

  let year: string, month: string, day: string;

  if (parts[0].length === 4) {
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else if (parts[2].length === 4 || parts[2].length === 2) {
    year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    if (preferredFormat === 'MM/DD/YYYY') {
      month = parts[0];
      day = parts[1];
    } else {
      day = parts[0];
      month = parts[1];
    }
  } else {
    return null;
  }

  const mNum = parseInt(month, 10);
  const dNum = parseInt(day, 10);
  if (isNaN(mNum) || isNaN(dNum) || mNum < 1 || mNum > 12 || dNum < 1 || dNum > 31) {
    return null;
  }

  return `${year}-${String(mNum).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`;
}

// --- MAIN ENGINE CLASS ---

export class RealPilotPipelineEngine {
  private activeUploads: Map<string, FileValidationResult> = new Map();
  private importHistories: Map<string, PilotImportExecutionResult[]> = new Map();

  /**
   * STAGE 1 & 2: Upload File & Perform Multi-sheet Validation + Column Detection
   */
  public parseAndValidateFile(buffer: Buffer, fileName: string, fileSize: number): FileValidationResult {
    const lowerName = fileName.toLowerCase();
    let fileType: 'csv' | 'xlsx' | 'xls' = 'csv';
    if (lowerName.endsWith('.xlsx')) fileType = 'xlsx';
    else if (lowerName.endsWith('.xls')) fileType = 'xls';

    const errors: string[] = [];
    const warnings: string[] = [];

    if (fileSize > 50 * 1024 * 1024) {
      errors.push('FILE TOO LARGE: File exceeds maximum pilot limit of 50MB. Please split file or upload in batches.');
    }

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
      const sheetNames = workbook.SheetNames;

      if (!sheetNames || sheetNames.length === 0) {
        return {
          isValid: false,
          fileName,
          fileSize,
          fileType,
          sheetNames: [],
          sheets: [],
          errors: ['File contains zero readable sheets.'],
          warnings: [],
        };
      }

      const sheetsInfo: SheetPreviewInfo[] = [];

      for (const sheetName of sheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

        if (rawRows.length === 0) {
          warnings.push(`Sheet '${sheetName}' is empty and will be skipped.`);
          continue;
        }

        const headers = Object.keys(rawRows[0] || {});
        const detectedDataset = detectDatasetType(headers, sheetName);
        const mappings = autoSuggestMappings(headers, detectedDataset);

        sheetsInfo.push({
          sheetName,
          rowCount: rawRows.length,
          columnCount: headers.length,
          headers,
          sampleRows: rawRows.slice(0, 15),
          detectedDataset,
          mappings,
        });
      }

      return {
        isValid: errors.length === 0,
        fileName,
        fileSize,
        fileType,
        sheetNames,
        sheets: sheetsInfo,
        errors,
        warnings,
      };
    } catch (err: any) {
      return {
        isValid: false,
        fileName,
        fileSize,
        fileType,
        sheetNames: [],
        sheets: [],
        errors: [`Failed to parse file structure: ${err.message}`],
        warnings: [],
      };
    }
  }

  /**
   * STAGE 3 & 4: Preview Data & Check Quality across all configured sheets
   */
  public generateImportPreview(
    orgId: string,
    fileBuffer: Buffer,
    sheetConfigurations: Array<{ sheetName: string; datasetType: DatasetType; columnMapping: Record<string, string> }>
  ): PilotImportPreviewResult {
    udmStore.setTenantContext(orgId);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

    const batchId = `pilot_batch_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    let totalRows = 0;
    let validRows = 0;
    const errors: PilotImportRecordError[] = [];
    const duplicates: PilotImportDuplicate[] = [];
    const breakdown: Record<DatasetType, number> = {
      CUSTOMERS: 0,
      INVOICES: 0,
      PAYMENTS: 0,
      PURCHASE_ORDERS: 0,
      EXCEPTIONS: 0,
      PAYMENT_PROMISES: 0,
      UNKNOWN: 0,
    };
    const sampleValid: Record<string, any>[] = [];
    const missingRequiredFields: Set<string> = new Set();

    const existingCustomers = udmStore.getCustomers();
    const existingInvoices = udmStore.getInvoices();
    const existingPayments = udmStore.getPayments();

    for (const config of sheetConfigurations) {
      const worksheet = workbook.Sheets[config.sheetName];
      if (!worksheet) continue;

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
      const datasetType = config.datasetType;
      const mapping = config.columnMapping;

      rawRows.forEach((row, idx) => {
        const rowNumber = idx + 2;
        totalRows++;

        const getVal = (targetField: string) => {
          const srcCol = mapping[targetField];
          return srcCol ? row[srcCol] : row[targetField];
        };

        // VALIDATION CHECK BASED ON DATASET
        if (datasetType === 'INVOICES') {
          const invId = String(getVal('invoice_id') || '').trim();
          const custId = String(getVal('customer_id') || '').trim();
          const amountRaw = getVal('amount');
          const issueDateRaw = getVal('invoice_date');
          const dueDateRaw = getVal('due_date');

          if (!invId) {
            errors.push({ rowNumber, sheetName: config.sheetName, field: 'invoice_id', reason: 'Missing required Invoice Number', rawRow: row });
            missingRequiredFields.add('Invoice Identifier');
            return;
          }
          if (!custId && !getVal('customer_name')) {
            errors.push({ rowNumber, sheetName: config.sheetName, field: 'customer_id', reason: 'Missing required Customer Identifier or Name', rawRow: row });
            missingRequiredFields.add('Customer Identifier');
            return;
          }

          const parsedAmt = parseFinancialAmount(amountRaw);
          if (parsedAmt === null) {
            errors.push({ rowNumber, sheetName: config.sheetName, field: 'amount', reason: `Invalid invoice amount: '${amountRaw}'`, rawRow: row });
            return;
          }

          const normIssue = normalizeDate(issueDateRaw);
          const normDue = normalizeDate(dueDateRaw);
          if (!normDue) {
            errors.push({ rowNumber, sheetName: config.sheetName, field: 'due_date', reason: `Unparseable due date: '${dueDateRaw}'`, rawRow: row });
            return;
          }

          // Duplicate check
          const dup = existingInvoices.find(i => i.number === invId || i.source_id === invId);
          if (dup) {
            duplicates.push({ rowNumber, sheetName: config.sheetName, entityType: 'invoice', identifier: invId, existingId: dup.id, reason: 'Duplicate invoice number found in ledgers' });
          }

          validRows++;
          breakdown.INVOICES++;
          if (sampleValid.length < 10) {
            sampleValid.push({
              Dataset: 'Invoice',
              InvoiceNo: invId,
              Customer: custId || getVal('customer_name'),
              Amount: `₹${parsedAmt.toLocaleString('en-IN')}`,
              DueDate: normDue,
            });
          }
        } else if (datasetType === 'CUSTOMERS') {
          const custId = String(getVal('customer_id') || '').trim();
          const custName = String(getVal('customer_name') || '').trim();

          if (!custId && !custName) {
            errors.push({ rowNumber, sheetName: config.sheetName, field: 'customer_name', reason: 'Missing required Customer Name or Identifier', rawRow: row });
            return;
          }

          const dup = existingCustomers.find(c => c.source_id === custId || c.name.toLowerCase() === custName.toLowerCase());
          if (dup) {
            duplicates.push({ rowNumber, sheetName: config.sheetName, entityType: 'customer', identifier: custId || custName, existingId: dup.id, reason: 'Customer record already exists' });
          }

          validRows++;
          breakdown.CUSTOMERS++;
        } else if (datasetType === 'PAYMENTS') {
          const payRef = String(getVal('payment_id') || '').trim();
          const amtRaw = getVal('amount');
          const payDateRaw = getVal('payment_date');

          if (!payRef && !getVal('invoice_id')) {
            errors.push({ rowNumber, sheetName: config.sheetName, field: 'payment_id', reason: 'Missing Payment Reference', rawRow: row });
            return;
          }
          const parsedAmt = parseFinancialAmount(amtRaw);
          if (parsedAmt === null || parsedAmt <= 0) {
            errors.push({ rowNumber, sheetName: config.sheetName, field: 'amount', reason: `Invalid payment amount: '${amtRaw}'`, rawRow: row });
            return;
          }

          validRows++;
          breakdown.PAYMENTS++;
        } else {
          validRows++;
          breakdown[datasetType]++;
        }
      });
    }

    return {
      batchId,
      totalRowsDetected: totalRows,
      validRowsCount: validRows,
      duplicateCount: duplicates.length,
      errorCount: errors.length,
      warningCount: 0,
      breakdownByDataset: breakdown,
      sampleValid,
      errors,
      duplicates,
      missingRequiredFields: Array.from(missingRequiredFields),
    };
  }

  /**
   * STAGE 5: Final Import Execution into UDM Stores with Authoritative Validation
   */
  public commitPilotImport(
    orgId: string,
    fileBuffer: Buffer,
    sheetConfigurations: Array<{ sheetName: string; datasetType: DatasetType; columnMapping: Record<string, string> }>,
    actorUserId?: string
  ): PilotImportExecutionResult {
    udmStore.setTenantContext(orgId);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
    const batchId = `import_commit_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
    const importedAt = new Date().toISOString();

    const counts = { customers: 0, invoices: 0, payments: 0, exceptions: 0, promises: 0 };
    const errors: PilotImportRecordError[] = [];
    const duplicates: PilotImportDuplicate[] = [];

    // Helper map for customer resolution
    const customerMapByName = new Map<string, Customer>();
    const customerMapById = new Map<string, Customer>();
    udmStore.getCustomers().forEach(c => {
      customerMapByName.set(c.name.toLowerCase(), c);
      customerMapById.set(c.source_id, c);
    });

    for (const config of sheetConfigurations) {
      const worksheet = workbook.Sheets[config.sheetName];
      if (!worksheet) continue;

      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
      const mapping = config.columnMapping;
      const datasetType = config.datasetType;

      rawRows.forEach((row, idx) => {
        const rowNumber = idx + 2;

        const getVal = (targetField: string) => {
          const srcCol = mapping[targetField];
          return srcCol ? row[srcCol] : row[targetField];
        };

        try {
          if (datasetType === 'CUSTOMERS') {
            const custId = String(getVal('customer_id') || `CUST_${Date.now()}_${idx}`).trim();
            const custName = String(getVal('customer_name') || getVal('customer_id') || 'Unknown Customer').trim();
            const terms = parseInt(String(getVal('payment_terms') || '30'), 10) || 30;
            const credAmt = parseFinancialAmount(getVal('credit_limit')) || 0;

            const existing = customerMapById.get(custId) || customerMapByName.get(custName.toLowerCase());
            if (existing) {
              counts.customers++;
              return;
            }

            const newCust = udmStore.insertCustomer({
              organization_id: orgId,
              source_system: 'csv_excel_pilot',
              source_id: custId,
              name: custName,
              credit_limit_minor_units: Math.round(credAmt * 100),
              currency: String(getVal('currency') || 'INR').toUpperCase(),
              payment_terms_days: terms,
              import_batch_id: batchId,
              source_file_name: config.sheetName,
              source_sheet_name: config.sheetName,
              source_row_number: rowNumber,
              created_by: actorUserId || 'system',
            });
            customerMapById.set(custId, newCust);
            customerMapByName.set(custName.toLowerCase(), newCust);
            counts.customers++;
          } else if (datasetType === 'INVOICES') {
            const invNo = String(getVal('invoice_id') || '').trim();
            const custRef = String(getVal('customer_id') || getVal('customer_name') || '').trim();
            const amount = parseFinancialAmount(getVal('amount'));
            const issueDate = normalizeDate(getVal('invoice_date'));
            const dueDate = normalizeDate(getVal('due_date'));
            const poRef = getVal('po_reference') ? String(getVal('po_reference')).trim() : null;

            if (!invNo || amount === null || !dueDate) {
              errors.push({ rowNumber, sheetName: config.sheetName, reason: 'Invalid required invoice fields', rawRow: row });
              return;
            }

            // Customer resolution
            let customer = customerMapById.get(custRef) || customerMapByName.get(custRef.toLowerCase());
            if (!customer) {
              const fallbackName = String(getVal('customer_name') || custRef || 'Unmapped Pilot Customer').trim();
              customer = udmStore.insertCustomer({
                organization_id: orgId,
                source_system: 'csv_excel_pilot',
                source_id: `CUST_${fallbackName.toUpperCase().replace(/\s+/g, '_')}`,
                name: fallbackName,
                credit_limit_minor_units: 0,
                currency: 'INR',
                payment_terms_days: 30,
                import_batch_id: batchId,
                source_file_name: config.sheetName,
                source_sheet_name: config.sheetName,
                source_row_number: rowNumber,
                created_by: actorUserId || 'system',
              });
              customerMapById.set(customer.source_id, customer);
              customerMapByName.set(fallbackName.toLowerCase(), customer);
              counts.customers++;
            }

            const existingInvoices = udmStore.getInvoices();
            const existingInv = existingInvoices.find(i => i.number === invNo);

            if (existingInv) {
              // Safe Upsert
              udmStore.updateInvoice(existingInv.id, {
                amount_minor_units: Math.round(amount * 100),
                due_date: dueDate,
                po_reference: poRef || existingInv.po_reference,
                import_batch_id: batchId,
                source_sheet_name: config.sheetName,
                source_row_number: rowNumber,
              }, actorUserId);
              counts.invoices++;
            } else {
              udmStore.insertInvoice({
                organization_id: orgId,
                source_system: 'csv_excel_pilot',
                source_id: invNo,
                customer_id: customer.id,
                number: invNo,
                amount_minor_units: Math.round(amount * 100),
                currency: String(getVal('currency') || 'INR').toUpperCase(),
                tax_amount_minor_units: 0,
                issue_date: issueDate || new Date().toISOString().split('T')[0],
                due_date: dueDate,
                status: 'open',
                po_reference: poRef,
                import_batch_id: batchId,
                source_file_name: config.sheetName,
                source_sheet_name: config.sheetName,
                source_row_number: rowNumber,
                created_by: actorUserId || 'system',
              });
              counts.invoices++;
            }
          } else if (datasetType === 'PAYMENTS') {
            const payRef = String(getVal('payment_id') || `PAY_${Date.now()}_${idx}`).trim();
            const invNo = String(getVal('invoice_id') || '').trim();
            const amount = parseFinancialAmount(getVal('amount'));
            const payDate = normalizeDate(getVal('payment_date')) || new Date().toISOString().split('T')[0];

            if (amount === null || amount <= 0) {
              errors.push({ rowNumber, sheetName: config.sheetName, reason: 'Invalid payment amount', rawRow: row });
              return;
            }

            const inv = udmStore.getInvoices().find(i => i.number === invNo);
            const rawCustRef = String(getVal('customer_id') || '').trim();
            const matchedCust = customerMapById.get(rawCustRef) || customerMapByName.get(rawCustRef.toLowerCase());
            const custId = inv ? inv.customer_id : (matchedCust ? matchedCust.id : 'unmapped_cust');

            const newPay = udmStore.insertPayment({
              organization_id: orgId,
              source_system: 'csv_excel_pilot',
              source_id: payRef,
              customer_id: custId,
              amount_minor_units: Math.round(amount * 100),
              currency: 'INR',
              date: payDate,
              reference: invNo || payRef,
              import_batch_id: batchId,
              source_file_name: config.sheetName,
              source_sheet_name: config.sheetName,
              source_row_number: rowNumber,
              created_by: actorUserId || 'system',
            });

            // Match allocation if exact invoice link is present
            if (inv) {
              udmStore.insertMatch({
                organization_id: orgId,
                payment_id: newPay.id,
                invoice_id: inv.id,
                matched_amount_minor_units: Math.round(amount * 100),
                confidence: 1.0,
                match_method: 'deterministic',
              });
            }
            counts.payments++;
          } else if (datasetType === 'EXCEPTIONS') {
            const invNo = String(getVal('invoice_id') || '').trim();
            const excType = String(getVal('exception_type') || 'OPERATIONAL_VARIANCE').trim().toUpperCase().replace(/\s+/g, '_');
            const inv = udmStore.getInvoices().find(i => i.number === invNo);

            if (inv) {
              udmStore.insertException({
                organization_id: orgId,
                invoice_id: inv.id,
                customer_id: inv.customer_id,
                type: excType,
                severity: 'high',
                status: 'detected',
                evidence: { description: sanitizeSpreadsheetCell(getVal('description') || 'Imported via CSV/Excel pilot') },
                import_batch_id: batchId,
                source_file_name: config.sheetName,
                source_sheet_name: config.sheetName,
                source_row_number: rowNumber,
                created_by: actorUserId || 'system',
              });
              counts.exceptions++;
            }
          } else if (datasetType === 'PAYMENT_PROMISES') {
            const invNo = String(getVal('invoice_id') || '').trim();
            const pDate = normalizeDate(getVal('promised_date'));
            const inv = udmStore.getInvoices().find(i => i.number === invNo);

            if (inv && pDate) {
              promiseStore.createPromise({
                organization_id: orgId,
                customer_id: inv.customer_id,
                invoice_id: inv.id,
                promised_amount_minor_units: inv.amount_minor_units,
                expected_date: pDate,
                recorded_via: 'manual_note',
                recorded_by_user_id: actorUserId || 'user_pilot_import',
              });
              counts.promises++;
            }
          }
        } catch (err: any) {
          errors.push({ rowNumber, sheetName: config.sheetName, reason: err.message, rawRow: row });
        }
      });
    }

    // AUDIT LOGGING
    AuditService.record({
      organization_id: orgId,
      actor_user_id: actorUserId || null,
      actor_type: actorUserId ? 'user' : 'system',
      action_type: 'data_import.completed',
      subject_type: 'import_batch',
      subject_id: batchId,
      after_state: counts,
      result: errors.length > 0 ? 'failure' : 'success',
    });

    // GENERATE DATA QUALITY & HEALTH REPORT
    const allCustomers = udmStore.getCustomers();
    const allInvoices = udmStore.getInvoices();
    const allPayments = udmStore.getPayments();
    const allExceptions = udmStore.getExceptions();

    const invoicesWithCust = allInvoices.filter(i => allCustomers.some(c => c.id === i.customer_id)).length;
    const invCustCoverage = allInvoices.length > 0 ? Math.round((invoicesWithCust / allInvoices.length) * 100) : 100;

    const invoicesWithPayment = allInvoices.filter(i => udmStore.getMatches().some(m => m.invoice_id === i.id)).length;
    const invPayCoverage = allInvoices.length > 0 ? Math.round((invoicesWithPayment / allInvoices.length) * 100) : 0;

    const poCoverage = allInvoices.length > 0 ? Math.round((allInvoices.filter(i => Boolean(i.po_reference)).length / allInvoices.length) * 100) : 0;

    // Check for first insight
    const poBlockerInv = allInvoices.find(i => allExceptions.some(e => e.invoice_id === i.id && e.type.includes('PO')));
    let firstInsight = null;
    if (poBlockerInv) {
      firstInsight = {
        headline: 'PO Quantity / Price Mismatch Identified',
        exposureMinorUnits: poBlockerInv.amount_minor_units,
        category: 'Purchase Order Variance',
        description: `Invoice ${poBlockerInv.number} has a verified PO exception preventing payment release.`,
      };
    }

    const dataQualityReport: DataQualityReport = {
      completenessPercentage: Math.min(100, Math.round(((counts.invoices + counts.customers + counts.payments) / Math.max(1, counts.invoices + counts.customers)) * 100)),
      relationshipCoverage: {
        customerToInvoice: invCustCoverage,
        invoiceToPayment: invPayCoverage,
        poToInvoice: poCoverage,
        invoiceToException: allInvoices.length > 0 ? Math.round((allExceptions.length / allInvoices.length) * 100) : 0,
        invoiceToPromise: 0,
      },
      orphanRecords: {
        invoicesWithoutCustomer: allInvoices.length - invoicesWithCust,
        paymentsWithoutInvoice: allPayments.length - udmStore.getMatches().length,
        exceptionsWithoutInvoice: 0,
      },
      dataHealth: invCustCoverage > 90 ? 'HEALTHY' : 'ATTENTION_REQUIRED',
      intelligenceLimitations: [
        poCoverage < 50 ? 'PO coverage is below 50%; PO-related root cause analysis will be restricted to provided lines.' : '',
        invPayCoverage === 0 ? 'No payment allocations linked; reconciliation metrics will show 100% outstanding balance.' : '',
      ].filter(Boolean),
      firstInsight,
    };

    const status = errors.length === 0 ? 'COMPLETED' : 'PARTIALLY_COMPLETED';
    const executionResult: PilotImportExecutionResult = {
      batchId,
      organizationId: orgId,
      status,
      importedAt,
      importedCounts: counts,
      failedCount: errors.length,
      duplicateCount: duplicates.length,
      errors,
      dataQualityReport,
    };

    const orgHistory = this.importHistories.get(orgId) || [];
    orgHistory.unshift(executionResult);
    this.importHistories.set(orgId, orgHistory);

    return executionResult;
  }

  public getImportHistory(orgId: string): PilotImportExecutionResult[] {
    return this.importHistories.get(orgId) || [];
  }

  public clearAll(): void {
    this.activeUploads.clear();
    this.importHistories.clear();
  }
}

export const realPilotPipelineEngine = new RealPilotPipelineEngine();
