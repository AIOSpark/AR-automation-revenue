import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { udmStore } from "@/lib/udm/store";
import { validatePilotReadOnly } from "@/lib/auth/pilot";
import { parseFinancialAmount } from "@/lib/import/pilot-pipeline";
import { normalizeDate } from "@/lib/import/pilot-pipeline";
import { previewStore } from "@/lib/import/preview-store";
import crypto from "crypto";

const MAX_PREVIEW_ROWS = 10_000;

function computePayloadHash(rows: Record<string, unknown>[], columnMapping: Record<string, string>): string {
  const canonical = JSON.stringify({ rows, columnMapping });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function getDateFormatConvention(headers: string[]): 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' {
  const hasSlash = headers.some((h) => h.includes('/'));
  if (!hasSlash) return 'YYYY-MM-DD';
  return 'DD/MM/YYYY';
}

interface PreviewRowResult {
  rowNumber: number;
  rawRow: Record<string, unknown>;
  valid: boolean;
  errors: Array<{ field: string; reason: string }>;
  mappedData?: {
    customerName: string;
    invoiceNumber: string;
    amountMinorUnits: number;
    issueDate: string;
    dueDate: string;
    status: string;
    poReference: string | null;
    currency: string;
  };
  isDuplicate: boolean;
  duplicateOf?: string;
}

export async function POST(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "create", "invoices");
  if (permissionError) return permissionError;

  const organizationId = context!.organization.id;
  const actorUserId = context!.user.id;

  // Reject unverified users
  if (!context!.user.email_verified) {
    return NextResponse.json(
      { error: "Email verification is required before importing data" },
      { status: 403 }
    );
  }

  const pilotError = validatePilotReadOnly(organizationId, "DATA_INGESTION");
  if (pilotError) return pilotError;

  try {
    const body = await request.json();
    const { rows, columnMapping, dateFormatConvention = "DD/MM/YYYY" } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "A non-empty rows array is required" }, { status: 400 });
    }

    if (rows.length > MAX_PREVIEW_ROWS) {
      return NextResponse.json(
        { error: `Preview exceeds the ${MAX_PREVIEW_ROWS} row limit` },
        { status: 413 }
      );
    }

    if (typeof columnMapping !== "object" || columnMapping === null) {
      return NextResponse.json({ error: "Column mapping is required" }, { status: 400 });
    }

    // Establish tenant context for UDM read operations
    udmStore.setTenantContext(organizationId);

    // Load existing records for duplicate detection (same org only)
    const existingCustomers = udmStore.getCustomers();
    const existingInvoices = udmStore.getInvoices();

    const previewResults: PreviewRowResult[] = [];
    let validCount = 0;
    let invalidCount = 0;
    let duplicateCount = 0;
    let warningCount = 0;
    let totalAmountMinorUnits = 0;

    const seenInvoiceNumbersInFile = new Set<string>();
    const seenCustomerNamesInFile = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i];
      const rowNumber = i + 2;
      const errors: Array<{ field: string; reason: string }> = [];

      const getVal = (targetField: string) => {
        const mappedCol = (columnMapping as Record<string, string>)[targetField];
        return mappedCol ? rawRow[mappedCol] : rawRow[targetField];
      };

      const customerName = String(getVal("customer_name") || "").trim();
      if (!customerName) {
        errors.push({ field: "customer_name", reason: "Missing required field: Customer Name" });
      }

      const invoiceNumber = String(getVal("invoice_number") || "").trim();
      if (!invoiceNumber) {
        errors.push({ field: "invoice_number", reason: "Missing required field: Invoice Number" });
      }

      const rawAmount = getVal("amount");
      let amountMinorUnits = 0;
      if (rawAmount === undefined || rawAmount === null || String(rawAmount).trim() === "") {
        errors.push({ field: "amount", reason: "Amount is required and cannot be empty" });
      } else {
        const parsed = parseFinancialAmount(rawAmount);
        if (parsed === null) {
          errors.push({ field: "amount", reason: `Invalid amount value: '${rawAmount}'` });
        } else if (parsed < 0) {
          errors.push({ field: "amount", reason: "Amount cannot be negative" });
        } else {
          amountMinorUnits = Math.round(parsed * 100);
        }
      }

      const issueDateRaw = getVal("issue_date");
      const issueDate = issueDateRaw ? normalizeDate(issueDateRaw, dateFormatConvention) : null;
      if (!issueDateRaw || !issueDate) {
        errors.push({ field: "issue_date", reason: `Invalid or missing issue date: '${issueDateRaw}'` });
      }

      const dueDateRaw = getVal("due_date");
      const dueDate = dueDateRaw ? normalizeDate(dueDateRaw, dateFormatConvention) : null;
      if (!dueDateRaw || !dueDate) {
        errors.push({ field: "due_date", reason: `Invalid or missing due date: '${dueDateRaw}'` });
      }

      const status = String(getVal("status") || "open").trim();
      const validStatuses = ["open", "partially_paid", "paid", "disputed", "written_off", "blocked"];
      if (!validStatuses.includes(status)) {
        errors.push({ field: "status", reason: `Invalid status: '${status}'. Must be one of: ${validStatuses.join(", ")}` });
      }

      const currency = String(getVal("currency") || "INR").trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        errors.push({ field: "currency", reason: `Invalid currency code: '${currency}'. Must be a 3-letter ISO code.` });
      }

      const poReference = getVal("po_number");
      const poRefStr = poReference === undefined || poReference === null ? null : String(poReference).trim() || null;

      let isDuplicate = false;
      let duplicateOf: string | undefined;

      if (invoiceNumber) {
        if (seenInvoiceNumbersInFile.has(invoiceNumber)) {
          isDuplicate = true;
          duplicateOf = `Earlier row in this file (invoice ${invoiceNumber})`;
          duplicateCount++;
        } else {
          seenInvoiceNumbersInFile.add(invoiceNumber);
        }

        if (!isDuplicate) {
          const existingInv = existingInvoices.find(
            (inv) => inv.number === invoiceNumber || inv.source_id === invoiceNumber
          );
          if (existingInv) {
            isDuplicate = true;
            duplicateOf = `Existing invoice ${existingInv.number} (ID: ${existingInv.id})`;
            duplicateCount++;
          }
        }
      }

      if (customerName && !isDuplicate) {
        const lowerName = customerName.toLowerCase();
        if (seenCustomerNamesInFile.has(lowerName)) {
          warningCount++;
        } else {
          seenCustomerNamesInFile.add(lowerName);
        }
      }

      if (customerName) {
        const existingCust = existingCustomers.find(
          (c) => c.name.toLowerCase() === customerName.toLowerCase()
        );
        if (existingCust && !isDuplicate) {
          warningCount++;
        }
      }

      const valid = errors.length === 0 && !isDuplicate;
      if (valid) validCount++;
      if (!valid && !isDuplicate) invalidCount++;

      if (valid && amountMinorUnits > 0) {
        totalAmountMinorUnits += amountMinorUnits;
      }

      previewResults.push({
        rowNumber,
        rawRow,
        valid,
        errors,
        mappedData: valid
          ? {
              customerName,
              invoiceNumber,
              amountMinorUnits,
              issueDate: issueDate || "",
              dueDate: dueDate || "",
              status,
              poReference,
              currency,
            }
          : undefined,
        isDuplicate,
        duplicateOf,
      });
    }

    // --- Store server-validated preview record ---
    const payloadHash = computePayloadHash(rows, columnMapping as Record<string, string>);
    const previewRecord = previewStore.create({
      userId: actorUserId,
      organizationId,
      payloadHash,
      columnMapping: columnMapping as Record<string, string>,
      rows,
    });

    return NextResponse.json({
      previewId: previewRecord.id,
      organizationId,
      totalRows: rows.length,
      validCount,
      invalidCount,
      duplicateCount,
      warningCount,
      totalAmountMinorUnits,
      previewResults,
      sampleValid: previewResults
        .filter((r) => r.valid)
        .slice(0, 5)
        .map((r) => r.mappedData),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to generate import preview" },
      { status: 500 }
    );
  }
}
