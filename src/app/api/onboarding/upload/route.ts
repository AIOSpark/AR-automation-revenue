import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext, validatePermission } from "@/lib/tenant/middleware";
import { onboardingStore, TARGET_FIELDS } from "@/lib/onboarding/store";

export async function POST(request: NextRequest) {
  const context = await resolveTenantContext(request);
  const permissionError = validatePermission(context, "create", "invoices");
  if (permissionError) return permissionError;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Please select a valid CSV or Excel file to upload" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds the 10 MB upload limit" }, { status: 413 });
    }

    const filename = file.name.toLowerCase();
    if (!filename.endsWith(".csv") && !filename.endsWith(".xlsx") && !filename.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Unsupported file format. Please upload a .csv, .xlsx, or .xls file" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { headers, rows } = onboardingStore.parseFileBuffer(buffer);

    if (headers.length === 0 || rows.length === 0) {
      return NextResponse.json({ error: "The uploaded file is empty or missing data rows" }, { status: 400 });
    }

    // Check if Organization has a saved mapping
    const savedMapping = onboardingStore.getOrgColumnMapping(context!.organization.id);
    const suggestedMapping = savedMapping || onboardingStore.autoSuggestMapping(headers);

    return NextResponse.json({
      filename: file.name,
      totalRows: rows.length,
      headers,
      sampleRows: rows.slice(0, 3),
      targetFields: TARGET_FIELDS,
      suggestedMapping,
      isSavedMapping: Boolean(savedMapping),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Failed to parse uploaded file. Please check file format and formatting." },
      { status: 500 }
    );
  }
}
