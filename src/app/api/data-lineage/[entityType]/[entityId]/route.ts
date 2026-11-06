import { NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { udmStore } from "@/lib/udm/store";

type LineageParams = {
  params: Promise<{ entityType: string; entityId: string }>;
};

type LineageRecord = {
  id: string;
  entityType: string;
  organizationId: string;
  sourceSystem?: string | null;
  sourceId?: string | null;
  importBatchId?: string | null;
  sourceFileName?: string | null;
  sourceSheetName?: string | null;
  sourceRowNumber?: number | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

function normalizeEntityType(value: string): string {
  return value.toLowerCase().replace(/[-\s]/g, "_");
}

function getRecord(entityType: string, entityId: string): LineageRecord | null {
  const findById = <T extends { id: string }>(records: T[]): T | null => records.find((record) => record.id === entityId) || null;

  switch (normalizeEntityType(entityType)) {
    case "customer": {
      const record = findById(udmStore.getCustomers());
      return record ? {
        id: record.id,
        entityType: "customer",
        organizationId: record.organization_id,
        sourceSystem: record.source_system,
        sourceId: record.source_id,
        importBatchId: record.import_batch_id,
        sourceFileName: record.source_file_name,
        sourceSheetName: record.source_sheet_name,
        sourceRowNumber: record.source_row_number,
        createdBy: record.created_by,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      } : null;
    }
    case "invoice": {
      const record = findById(udmStore.getInvoices());
      return record ? {
        id: record.id,
        entityType: "invoice",
        organizationId: record.organization_id,
        sourceSystem: record.source_system,
        sourceId: record.source_id,
        importBatchId: record.import_batch_id,
        sourceFileName: record.source_file_name,
        sourceSheetName: record.source_sheet_name,
        sourceRowNumber: record.source_row_number,
        createdBy: record.created_by,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      } : null;
    }
    case "payment": {
      const record = findById(udmStore.getPayments());
      return record ? {
        id: record.id,
        entityType: "payment",
        organizationId: record.organization_id,
        sourceSystem: record.source_system,
        sourceId: record.source_id,
        importBatchId: record.import_batch_id,
        sourceFileName: record.source_file_name,
        sourceSheetName: record.source_sheet_name,
        sourceRowNumber: record.source_row_number,
        createdBy: record.created_by,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      } : null;
    }
    case "credit_note": {
      const record = findById(udmStore.getCreditNotes());
      return record ? {
        id: record.id,
        entityType: "credit_note",
        organizationId: record.organization_id,
        sourceSystem: record.source_system,
        sourceId: record.source_id,
        importBatchId: record.import_batch_id,
        sourceFileName: record.source_file_name,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      } : null;
    }
    case "bank_transaction": {
      const record = findById(udmStore.getBankTransactions());
      return record ? {
        id: record.id,
        entityType: "bank_transaction",
        organizationId: record.organization_id,
        sourceSystem: record.source_system,
        sourceId: record.raw_reference,
        importBatchId: record.import_batch_id,
        sourceFileName: record.source_file_name,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      } : null;
    }
    case "exception": {
      const record = findById(udmStore.getExceptions());
      return record ? {
        id: record.id,
        entityType: "exception",
        organizationId: record.organization_id,
        sourceSystem: "udm_detector",
        sourceId: record.id,
        importBatchId: record.import_batch_id,
        sourceFileName: record.source_file_name,
        sourceSheetName: record.source_sheet_name,
        sourceRowNumber: record.source_row_number,
        createdBy: record.created_by,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
      } : null;
    }
    default:
      return null;
  }
}

export async function GET(request: Request, { params }: LineageParams) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "view", "invoices");
  if (permissionError) return permissionError;

  const { entityType, entityId } = await params;
  const normalizedType = normalizeEntityType(entityType);
  const supportedTypes = new Set(["customer", "invoice", "payment", "credit_note", "bank_transaction", "exception"]);
  if (!supportedTypes.has(normalizedType)) {
    return NextResponse.json({ error: "Unsupported lineage entity type." }, { status: 400 });
  }

  const orgId = context!.organization.id;
  udmStore.setTenantContext(orgId);

  const lineage = getRecord(normalizedType, entityId);
  if (!lineage || lineage.organizationId !== orgId) {
    return NextResponse.json({ error: "Lineage record not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: lineage });
}
