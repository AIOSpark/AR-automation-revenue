import { NextRequest, NextResponse } from "next/server";
import { resolveTenantContext } from "@/lib/tenant/middleware";
import { tenantStore } from "@/lib/tenant/store";

export async function POST(request: NextRequest) {
  const context = await resolveTenantContext(request);
  if (!context) {
    return NextResponse.json({ error: "Unauthorized session" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { organization_id } = body;

    if (!organization_id) {
      return NextResponse.json({ error: "Target organization_id is required" }, { status: 400 });
    }

    // Verify User Belongs to Target Organization
    const member = tenantStore.getMember(context.user.id, organization_id);
    if (!member) {
      return NextResponse.json(
        { error: "Forbidden: You do not belong to the requested organization" },
        { status: 403 }
      );
    }

    const response = NextResponse.json({
      message: `Active organization context switched to ${organization_id}`,
      activeOrganizationId: organization_id,
      role: member.role,
    });

    response.cookies.set({
      name: "aiospark_active_org",
      value: organization_id,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
