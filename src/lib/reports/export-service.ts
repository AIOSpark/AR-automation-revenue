// AIOSpark Shared Reporting & Multi-Format Export Engine (Layer 23)
// Common export pipeline supporting PDF, Excel (XLSX), and CSV with consistent branding.

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

export type ColumnFormat = 'currency' | 'date' | 'percent' | 'number' | 'text';

export interface ColumnDefinition {
  header: string;
  field: string;
  format?: ColumnFormat;
}

export interface ReportDefinition<T = Record<string, any>> {
  id: string;
  name: string;
  description: string;
  dsoFormulaNotice?: string; // Displayed directly on report if present (e.g. DSO report)
  columns: ColumnDefinition[];
  queryFn: (orgId: string, params?: Record<string, any>) => T[] | Promise<T[]>;
}

export interface GeneratedReportOutput {
  reportId: string;
  reportName: string;
  format: ExportFormat;
  fileName: string;
  mimeType: string;
  contentBuffer: Buffer;
  generatedAt: string;
  rowCount: number;
}

export class SharedReportingService {
  /**
   * Helper to format cell value according to ColumnFormat specification
   */
  public formatCellValue(value: any, format?: ColumnFormat): string {
    if (value === null || value === undefined) return '';

    switch (format) {
      case 'currency': {
        const val = typeof value === 'number' ? value / 100 : Number(value) / 100 || 0;
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 0,
        }).format(val);
      }
      case 'percent': {
        const val = typeof value === 'number' ? value : Number(value) || 0;
        return `${val.toFixed(1)}%`;
      }
      case 'number': {
        const val = typeof value === 'number' ? value : Number(value) || 0;
        return val.toLocaleString('en-IN');
      }
      case 'date': {
        return String(value);
      }
      case 'text':
      default:
        return String(value);
    }
  }

  /**
   * Generates CSV format with proper RFC 4180 escaping (quotes around strings containing commas, quotes, or newlines)
   */
  public generateCSV<T extends Record<string, any>>(
    reportDef: ReportDefinition<T>,
    rows: T[],
    orgId: string
  ): Buffer {
    const lines: string[] = [];

    // Header Metadata
    lines.push(`"# AIOSpark Executive Report - ${reportDef.name}"`);
    lines.push(`"# Organization ID: ${orgId}"`);
    lines.push(`"# Generated At: ${new Date().toISOString()}"`);
    if (reportDef.dsoFormulaNotice) {
      lines.push(`"# Formula Definition: ${reportDef.dsoFormulaNotice}"`);
    }
    lines.push('');

    // Column Headers
    const headers = reportDef.columns.map((c) => this.escapeCSVField(c.header));
    lines.push(headers.join(','));

    // Data Rows
    for (const row of rows) {
      const line = reportDef.columns.map((c) => {
        const rawVal = row[c.field];
        const formatted = this.formatCellValue(rawVal, c.format);
        return this.escapeCSVField(formatted);
      });
      lines.push(line.join(','));
    }

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  /**
   * Proper CSV Field Escaping according to RFC 4180 rules
   */
  private escapeCSVField(str: string): string {
    const mitigated = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
    if (mitigated.includes(',') || mitigated.includes('"') || mitigated.includes('\n')) {
      return `"${mitigated.replace(/"/g, '""')}"`;
    }
    return mitigated;
  }

  /**
   * Generates Excel (XLSX) format using xlsx library with typed cells
   */
  public generateXLSX<T extends Record<string, any>>(
    reportDef: ReportDefinition<T>,
    rows: T[],
    orgId: string
  ): Buffer {
    // Dynamic import xlsx
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx');

    const sheetData: any[][] = [];

    // Title & Metadata Header Rows
    sheetData.push([`AIOSpark Executive Report: ${reportDef.name}`]);
    sheetData.push([`Organization ID: ${orgId}`]);
    sheetData.push([`Generated At: ${new Date().toISOString()}`]);
    if (reportDef.dsoFormulaNotice) {
      sheetData.push([`Formula: ${reportDef.dsoFormulaNotice}`]);
    }
    sheetData.push([]); // blank line

    // Header Row
    sheetData.push(reportDef.columns.map((c) => c.header));

    // Data Rows (using proper typed values: numbers as numbers, text as text)
    for (const row of rows) {
      const rowData = reportDef.columns.map((c) => {
        const rawVal = row[c.field];
        if (rawVal === null || rawVal === undefined) return '';

        if (c.format === 'currency') {
          return typeof rawVal === 'number' ? rawVal / 100 : Number(rawVal) / 100 || 0;
        }
        if (c.format === 'number' || c.format === 'percent') {
          return typeof rawVal === 'number' ? rawVal : Number(rawVal) || 0;
        }
        return String(rawVal);
      });
      sheetData.push(rowData);
    }

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);

    // Set reasonable column widths
    worksheet['!cols'] = reportDef.columns.map(() => ({ wch: 22 }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Generates Printable PDF Layout with Consistent Branding & Headers
   */
  public generatePDF<T extends Record<string, any>>(
    reportDef: ReportDefinition<T>,
    rows: T[],
    orgId: string
  ): Buffer {
    const lines: string[] = [];

    lines.push(`================================================================================`);
    lines.push(`                         AIOSPARK EXECUTIVE REPORT                              `);
    lines.push(`================================================================================`);
    lines.push(`Report Name    : ${reportDef.name}`);
    lines.push(`Organization ID: ${orgId}`);
    lines.push(`Generated At   : ${new Date().toISOString()}`);
    if (reportDef.dsoFormulaNotice) {
      lines.push(`Formula        : ${reportDef.dsoFormulaNotice}`);
    }
    lines.push(`================================================================================\n`);

    // Column Header
    const colHeaderStr = reportDef.columns.map((c) => c.header.padEnd(20)).join(' | ');
    lines.push(colHeaderStr);
    lines.push('-'.repeat(colHeaderStr.length));

    // Data Rows
    for (const row of rows) {
      const rowStr = reportDef.columns
        .map((c) => {
          const rawVal = row[c.field];
          const formatted = this.formatCellValue(rawVal, c.format);
          return formatted.padEnd(20).substring(0, 20);
        })
        .join(' | ');
      lines.push(rowStr);
    }

    lines.push(`\n--------------------------------------------------------------------------------`);
    lines.push(`Page 1 of 1 | AIOSpark Finance Intelligence | Total Rows: ${rows.length}`);
    lines.push(`================================================================================`);

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  /**
   * Central generateReport entrypoint
   */
  public async generateReport<T extends Record<string, any>>(
    reportDef: ReportDefinition<T>,
    orgId: string,
    params: Record<string, any> = {},
    format: ExportFormat = 'csv'
  ): Promise<GeneratedReportOutput> {
    const rows = await reportDef.queryFn(orgId, params);
    const nowStr = new Date().toISOString();
    const safeReportName = reportDef.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const dateStamp = nowStr.split('T')[0];

    let contentBuffer: Buffer;
    let mimeType: string;
    let fileExt: string;

    switch (format) {
      case 'xlsx':
        contentBuffer = this.generateXLSX(reportDef, rows, orgId);
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        fileExt = 'xlsx';
        break;
      case 'pdf':
        contentBuffer = this.generatePDF(reportDef, rows, orgId);
        mimeType = 'application/pdf';
        fileExt = 'pdf';
        break;
      case 'csv':
      default:
        contentBuffer = this.generateCSV(reportDef, rows, orgId);
        mimeType = 'text/csv';
        fileExt = 'csv';
        break;
    }

    return {
      reportId: reportDef.id,
      reportName: reportDef.name,
      format,
      fileName: `aiospark_${safeReportName}_${dateStamp}.${fileExt}`,
      mimeType,
      contentBuffer,
      generatedAt: nowStr,
      rowCount: rows.length,
    };
  }
}

export const sharedReportingService = new SharedReportingService();
