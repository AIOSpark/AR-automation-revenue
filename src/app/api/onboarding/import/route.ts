import { NextRequest, NextResponse } from 'next/server';
import { importEngine } from '@/lib/import/engine';
import { resolveTenantContext, validatePermission } from '@/lib/tenant/middleware';
import { validatePilotReadOnly } from '@/lib/auth/pilot';
import { extractIdempotencyKey, computeRequestFingerprint, checkAndReserveIdempotency, finalizeIdempotency, releaseIdempotency } from '@/lib/idempotency';

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10_000;

export async function POST(req: Request) {
  try {
    const context = await resolveTenantContext(req);
    const permissionError = validatePermission(context, 'create', 'invoices');
    if (permissionError) return permissionError;

    // Idempotency: require Idempotency-Key header for financial creation
    const idempotencyKey = extractIdempotencyKey(req);
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is required for import creation' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const fingerprint = computeRequestFingerprint(body);

    // Atomically check and reserve the idempotency key under lock
    const idempotencyCheck = await checkAndReserveIdempotency(context!.organization.id, 'onboarding/import', idempotencyKey, fingerprint);
    if (idempotencyCheck.status === 'replay') {
      return NextResponse.json(idempotencyCheck.response, { status: 200 });
    }
    if (idempotencyCheck.status === 'conflict') {
      return NextResponse.json(
        { error: 'Idempotency-Key already used with a different request body' },
        { status: 409 }
      );
    }

    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMPORT_BYTES) {
      releaseIdempotency(context!.organization.id, 'onboarding/import', idempotencyKey);
      return NextResponse.json({ error: 'Import payload exceeds the 5 MB limit' }, { status: 413 });
    }

    const { sourceSystem = 'csv', rows, dateFormatConvention, columnMapping } = body;
    const organizationId = context!.organization.id;

    const pilotError = validatePilotReadOnly(organizationId, 'CUSTOMER_RECORD_MUTATION');
    if (pilotError) {
      releaseIdempotency(organizationId, 'onboarding/import', idempotencyKey);
      return pilotError;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      releaseIdempotency(organizationId, 'onboarding/import', idempotencyKey);
      return NextResponse.json({ error: 'A non-empty rows array is required' }, { status: 400 });
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      releaseIdempotency(organizationId, 'onboarding/import', idempotencyKey);
      return NextResponse.json({ error: 'Import exceeds the 10,000 row limit' }, { status: 413 });
    }
    if (typeof sourceSystem !== 'string' || !['csv', 'tally', 'zoho', 'bank'].includes(sourceSystem)) {
      releaseIdempotency(organizationId, 'onboarding/import', idempotencyKey);
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

    const response = {
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
    };

    // Finalize idempotency key after successful creation
    finalizeIdempotency(organizationId, 'onboarding/import', idempotencyKey, batch.id, fingerprint, response);

    return NextResponse.json(response);
  } catch (err: any) {
    // Key is automatically released by the transaction lock on error
    return NextResponse.json({ error: err.message || 'Import pipeline execution encountered an error' }, { status: 500 });
  }
}
