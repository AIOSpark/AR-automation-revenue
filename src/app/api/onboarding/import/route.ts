import { NextRequest, NextResponse } from 'next/server';
import { importEngine } from '@/lib/import/engine';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { validatePilotReadOnly } from '@/lib/auth/pilot';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;

export async function POST(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'create', 'invoices');
    if (permissionError) return permissionError;

    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES) {
      return NextResponse.json({ error: 'Import payload exceeds the 5 MB limit' }, { status: 413 });
    }

    const body = await req.json();
    const { sourceSystem = 'csv', rows, dateFormatConvention, columnMapping } = body;
    const organizationId = context!.organization.id;

    const pilotError = validatePilotReadOnly(organizationId, 'CUSTOMER_RECORD_MUTATION');
    if (pilotError) return pilotError;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'A non-empty rows array is required' }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({ error: 'Import exceeds the 10,000 row limit' }, { status: 413 });
    }
    if (typeof sourceSystem !== 'string' || !['csv', 'tally', 'zoho', 'bank'].includes(sourceSystem)) {
      return NextResponse.json({ error: 'Unsupported source system' }, { status: 400 });
    }

    const batch = importEngine.createBatch(
      { organizationId, sourceSystem: sourceSystem || 'csv', dateFormatConvention, columnMapping },
      rows
    );

    const result = importEngine.processBatch(batch.id, {
      organizationId,
      sourceSystem: sourceSystem || 'csv',
      dateFormatConvention,
      columnMapping,
    });

    const errors = importEngine.getBatchErrors(batch.id);

    return NextResponse.json({
      success: true,
      batchId: batch.id,
      batchResult: {
        summary: result.summary,
        successCount: result.successCount,
        skippedCount: result.skippedCount,
      },
      userFacingSummary: result.summary,
      successCount: result.successCount,
      skippedCount: result.skippedCount,
      skippedDetails: errors.map((e) => ({ field: e.field, reason: e.reason })),
    });
  } catch (err: any) {
    // Return human readable error string, never expose raw tech stack trace
    return NextResponse.json({ error: err.message || 'Import pipeline execution encountered an error' }, { status: 500 });
  }
}
