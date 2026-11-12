import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { readImportState } from "@/lib/db/operational-repository";

export async function GET(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "view", "invoices");
  if (permissionError) return permissionError;

  const organizationId = context!.organization.id;

  try {
    const state = readImportState();

    const batches = state.batches
      .filter((batch: any) => batch.organization_id === organizationId)
      .map((batch: any) => ({
        importId: batch.id,
        originalFileName: batch.raw_payload?.[0]?._sourceFileName || "unknown.csv",
        organizationId: batch.organization_id,
        importTimestamp: batch.started_at,
        completedAt: batch.completed_at || null,
        status: batch.status,
        totalRows: batch.total_rows,
        successCount: batch.success_count,
        rejectedCount: batch.skipped_count,
        duplicateCount: 0, // tracked separately in possible_duplicates
      }))
      .sort((a: any, b: any) => (b.importTimestamp || "").localeCompare(a.importTimestamp || ""));

    return NextResponse.json({
      organizationId,
      totalImports: batches.length,
      imports: batches,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load import history" },
      { status: 500 }
    );
  }
}
