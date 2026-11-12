import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { udmStore } from "@/lib/udm/store";
import { importEngine } from "@/lib/import/engine";
import { validatePilotReadOnly } from "@/lib/auth/pilot";
import { extractIdempotencyKey, computeRequestFingerprint, checkAndReserveIdempotency, finalizeIdempotency, releaseIdempotency } from "@/lib/idempotency";
import { AuditService } from "@/lib/audit/service";
import { previewStore } from "@/lib/import/preview-store";
import crypto from "crypto";

const MAX_CONFIRM_ROWS = 10_000;

function computePayloadHash(rows: Record<string, unknown>[], columnMapping: Record<string, string>): string {
  const canonical = JSON.stringify({ rows, columnMapping });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export async function POST(request: NextRequest) {
  // --- Step 1: Resolve authenticated user through server-side auth ---
  const context = await resolveTenantContext(request);
  if (!context) {
    return NextResponse.json({ error: "Unauthenticated: invalid or missing session" }, { status: 401 });
  }

  // --- Step 2: Resolve organization membership ---
  const organizationId = context!.organization.id;
  const actorUserId = context!.user.id;
  const user = context!.user;

  // --- Step 3: Reject unverified users ---
  if (!user.email_verified) {
    return NextResponse.json(
      { error: "Email verification is required before importing data" },
      { status: 403 }
    );
  }

  // --- Step 4: Validate required import permission ---
  const permissionError = validatePermission(context, "create", "invoices");
  if (permissionError) return permissionError;

  // --- Step 5: Reject if pilot mode blocks customer record mutation ---
  const pilotError = validatePilotReadOnly(organizationId, "DATA_INGESTION");
  if (pilotError) return pilotError;

  // --- Step 6: Idempotency — require Idempotency-Key header ---
  const idempotencyKey = extractIdempotencyKey(request);
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "Idempotency-Key header is required for import confirmation" },
      { status: 400 }
    );
  }

  let previewId: string | undefined;
  try {
    const body = await request.json();
    const { rows, columnMapping, dateFormatConvention = "DD/MM/YYYY", confirmed } = body;

    // --- Step 7: Require explicit confirmation ---
    if (confirmed !== true) {
      return NextResponse.json(
        { error: "Explicit confirmation is required. Set 'confirmed' to true to commit the import." },
        { status: 400 }
      );
    }

    // --- Step 7b: Require server-validated preview identifier ---
    previewId = body.previewId;
    if (!previewId || typeof previewId !== "string") {
      return NextResponse.json(
        { error: "A valid preview identifier is required. Please generate a preview before confirming." },
        { status: 400 }
      );
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "A non-empty rows array is required" }, { status: 400 });
    }

    if (rows.length > MAX_CONFIRM_ROWS) {
      return NextResponse.json(
        { error: `Import exceeds the ${MAX_CONFIRM_ROWS} row limit` },
        { status: 413 }
      );
    }

    if (typeof columnMapping !== "object" || columnMapping === null) {
      return NextResponse.json({ error: "Column mapping is required" }, { status: 400 });
    }

    // --- Step 8: Idempotency check ---
    const fingerprint = computeRequestFingerprint(body);
    const idempotencyCheck = await checkAndReserveIdempotency(
      organizationId,
      "import/confirm",
      idempotencyKey,
      fingerprint
    );

    if (idempotencyCheck.status === "replay") {
      return NextResponse.json(idempotencyCheck.response, { status: 200 });
    }
    if (idempotencyCheck.status === "conflict") {
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Idempotency-Key already used with a different request body" },
        { status: 409 }
      );
    }
    // status === 'recoverable' or 'available': proceed with import.
    // 'recoverable' means a previous attempt crashed; the preview store's
    // crash recovery has already reconciled the preview state based on the
    // durable batch record.

    // --- Step 9: Look up server-validated preview record ---
    const preview = previewStore.findById(previewId);

    if (!preview) {
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Invalid preview identifier. No preview record found." },
        { status: 400 }
      );
    }

    // --- Step 9b: Check preview lifecycle status ---
    if (preview.status === 'COMMITTED') {
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Preview has already been committed. Please generate a new preview." },
        { status: 409 }
      );
    }
    if (preview.status === 'FAILED') {
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Preview import previously failed. Please generate a new preview." },
        { status: 409 }
      );
    }
    if (preview.status === 'EXPIRED') {
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Preview has expired. Please generate a new preview." },
        { status: 410 }
      );
    }
    if (preview.status === 'COMMITTING') {
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Preview is already being processed by another request. Please retry." },
        { status: 409 }
      );
    }
    // Status must be READY to proceed

    // --- Step 10: Atomically claim preview (READY → COMMITTING) ---
    const claim = previewStore.claim(previewId, user.id, organizationId);

    if (claim.reason) {
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      let error: string;
      let status: number;
      switch (claim.reason) {
        case 'not_found':
          error = "Invalid preview identifier. No preview record found.";
          status = 400;
          break;
        case 'wrong_user':
          error = "Preview identifier does not belong to the authenticated user.";
          status = 403;
          break;
        case 'wrong_org':
          error = "Preview identifier belongs to a different organization.";
          status = 403;
          break;
        case 'expired':
          error = "Preview has expired. Please generate a new preview.";
          status = 410;
          break;
        default:
          error = "Preview is already being processed. Please retry.";
          status = 409;
      }
      return NextResponse.json({ error }, { status });
    }

    // --- Step 11: Payload hash must match the previewed payload ---
    if (!claim.record) {
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Invalid preview state." },
        { status: 400 }
      );
    }
    const currentPayloadHash = computePayloadHash(rows, columnMapping as Record<string, string>);
    if (currentPayloadHash !== claim.record.payloadHash) {
      previewStore.fail(previewId);
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Payload has been modified since preview. Please re-preview and confirm." },
        { status: 409 }
      );
    }

    // --- Step 12: Re-establish tenant context at commit time (re-validation) ---
    udmStore.setTenantContext(organizationId);

    // Re-verify user still belongs to the organization
    const { tenantStore } = await import("@/lib/tenant/store");
    const member = tenantStore.getMember(user.id, organizationId);
    if (!member) {
      previewStore.fail(previewId);
      releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
      return NextResponse.json(
        { error: "Forbidden: You do not belong to the target organization" },
        { status: 403 }
      );
    }

    // --- Step 13: Create durable batch record ---
    const batch = importEngine.createBatch(
      { organizationId, sourceSystem: "csv", dateFormatConvention, columnMapping },
      rows
    );

    // Associate the batch with the preview for crash recovery
    previewStore.setBatchId(previewId, batch.id);

    // --- Step 14: Process batch (validate + commit to UDM within transaction) ---
    let result;
    try {
      result = importEngine.processBatch(batch.id, {
        organizationId,
        sourceSystem: "csv",
        dateFormatConvention,
        columnMapping,
      });
    } catch (importErr: any) {
      // Import failed — mark preview as FAILED (recoverable, not permanently consumed)
      previewStore.fail(previewId);
      throw importErr;
    }

    // --- Step 15: Mark preview as COMMITTED ---
    previewStore.commit(previewId);

    // --- Step 16: Audit the import (before idempotency finalization so that
    // audit evidence is never missing even if the process crashes before
    // the API response is sent) ---
    AuditService.record({
      organization_id: organizationId,
      actor_user_id: actorUserId,
      actor_type: "user",
      action_type: "import.confirmed",
      subject_type: "import_batch",
      subject_id: batch.id,
      after_state: {
        successCount: result.successCount,
        skippedCount: result.skippedCount,
        totalRows: rows.length,
        previewId,
      },
      result: "success",
    });

    // --- Step 17: Finalize idempotency ---
    const responseBody = {
      success: true,
      batchId: batch.id,
      previewId,
      batchResult: {
        summary: result.summary,
        successCount: result.successCount,
        skippedCount: result.skippedCount,
        totalRows: rows.length,
      },
      userFacingSummary: result.summary,
      committedBy: user.id,
      committedAt: new Date().toISOString(),
      organizationId,
    };

    finalizeIdempotency(organizationId, "import/confirm", idempotencyKey, batch.id, fingerprint, responseBody);

    return NextResponse.json(responseBody);
  } catch (err: any) {
    // Import failed or unexpected error — ensure preview is not left in COMMITTING
    // Try to transition COMMITTING → FAILED if still in that state
    try {
      const pid = previewId;
      if (pid) {
        const preview = previewStore.findById(pid);
        if (preview && preview.status === 'COMMITTING') {
          previewStore.fail(pid);
        }
      }
    } catch {
      // Ignore cleanup errors
    }
    releaseIdempotency(organizationId, "import/confirm", idempotencyKey);
    return NextResponse.json(
      { error: err?.message || "Import confirmation failed" },
      { status: 500 }
    );
  }
}
