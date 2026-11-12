import { NextRequest, NextResponse } from "next/server";

/**
 * DEPRECATED: This endpoint has been replaced by the secure two-step import flow:
 *   POST /api/import/preview  → validate without committing
 *   POST /api/import/confirm  → explicit confirmation with server-validated preview
 *
 * Direct invocation is no longer supported. Returns HTTP 410 Gone.
 */
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    {
      error: "This endpoint has been deprecated. Use /api/import/preview followed by /api/import/confirm instead.",
      code: "ENDPOINT_DEPRECATED",
    },
    { status: 410 }
  );
}
